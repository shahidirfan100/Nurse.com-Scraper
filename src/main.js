import { Actor, log } from 'apify';
import { Impit } from 'impit';

import {
    buildFilter,
    buildJobQuery,
    cleanString,
    DEFAULT_SORT_DIRECTION,
    DEFAULT_SORT_PROPERTY,
    mapJob,
    normalizeJobPage,
    normalizeStartUrl,
    parsePositiveInt,
    pruneSelection,
    readKey,
    resolveSearch,
    resolveSortProperty,
} from './parse.js';

const TARGET_ORIGIN = 'https://www.nurse.com';
const GRAPHQL_URL = 'https://super-api.nurse.com/graphql';
const LEGACY_URL = 'https://www.nurse.com/jobs/api/jobs/job-detail';
const BROWSE_URL = 'https://www.nurse.com/jobs/browse/';
const PAGE_SIZE = 25;
const MAX_ATTEMPTS = 3;
const MAX_SCHEMA_PRUNES = 5;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRY_DELAY_MS = 15000;
const TRANSPORT_COOLDOWN_MS = 60000;
const FIRST_PAGE_BUDGET_MS = 3 * 60000;
const PAGE_BUDGET_MS = 90000;
const RUN_BUDGET_MS = 15 * 60000;
const PAGE_GAP_MS = 300;

const RETRYABLE_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const PROFILE_ORDER = ['chrome', 'chrome151', 'chrome142', 'firefox', 'firefox158', 'ios18'];

const JOB_SELECTION = {
    id: true,
    title: true,
    slug: true,
    status: true,
    employmentType: true,
    shiftType: true,
    payLow: true,
    payHigh: true,
    payType: true,
    postedAt: true,
    updatedAt: true,
    createdAt: true,
    expiresAt: true,
    hasExternalApplicationUrl: true,
    displayCompanyName: true,
    minYearsExp: true,
    description: true,
    address: { city: true, state: true, zipCode: true, location: { lat: true, lon: true } },
    organization: { id: true, name: true, premium: true },
    qualifications: { name: true, details: true, type: { name: true } },
};

const PAGE_SELECTION = {
    number: true,
    size: true,
    totalElements: true,
    totalPages: true,
    first: true,
    last: true,
};

const jobSelection = structuredClone(JOB_SELECTION);

const clients = new Map();
let proxyUrl;
let profileIndex = 0;

function activeProfile() {
    return PROFILE_ORDER[profileIndex % PROFILE_ORDER.length];
}

function getClient() {
    const profile = activeProfile();
    if (!clients.has(profile)) {
        clients.set(
            profile,
            new Impit({
                browser: profile,
                timeout: REQUEST_TIMEOUT_MS,
                ...(proxyUrl && { proxyUrl }),
            }),
        );
    }
    return clients.get(profile);
}

function rotateProfile(reason) {
    if (PROFILE_ORDER.length < 2) return;
    profileIndex += 1;
    log.warning(`Switching the browser profile to "${activeProfile()}" after ${reason}.`);
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function remainingMs(deadline) {
    return Math.max(0, deadline - Date.now());
}

function retryDelayMs(attempt, retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
    }

    return Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS) + Math.floor(Math.random() * 400);
}

async function readResponse(response) {
    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = undefined;
    }

    return {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        json,
        textPreview: text.slice(0, 200).replace(/\s+/g, ' '),
    };
}

function validJobs(jobs) {
    const valid = [];
    let skipped = 0;

    for (const job of jobs) {
        if (job && typeof job === 'object' && readKey(job, ['id', 'jobId', 'slug', 'title'])) valid.push(job);
        else skipped += 1;
    }

    if (skipped > 0) log.warning(`Ignored ${skipped} job entries without an id, slug, or title.`);
    return valid;
}

async function fetchGraphqlPage(pageNumber, filter, property, deadline) {
    let lastReason = 'unknown error';
    let attempts = 0;
    let prunes = 0;

    while (attempts < MAX_ATTEMPTS) {
        if (Date.now() >= deadline) return { ok: false, reason: 'time budget exhausted' };

        attempts += 1;
        const body = {
            query: buildJobQuery(jobSelection, PAGE_SELECTION),
            variables: {
                filter,
                pageRequest: {
                    page: pageNumber,
                    size: PAGE_SIZE,
                    sort: { property, direction: DEFAULT_SORT_DIRECTION },
                },
            },
        };

        let result;
        try {
            const response = await getClient().fetch(GRAPHQL_URL, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    origin: TARGET_ORIGIN,
                    referer: BROWSE_URL,
                },
                body: JSON.stringify(body),
            });
            result = await readResponse(response);
        } catch (error) {
            lastReason = `request error (${error.name})`;
            rotateProfile(lastReason);
            if (attempts >= MAX_ATTEMPTS || Date.now() >= deadline) break;
            await delay(Math.min(retryDelayMs(attempts), remainingMs(deadline)));
            continue;
        }

        if (!result.json) {
            lastReason =
                result.status === 403 || /access denied|request unsuccessful/i.test(result.textPreview)
                    ? 'edge block'
                    : `non-JSON response (HTTP ${result.status})`;
            rotateProfile(lastReason);
        } else if (Array.isArray(result.json.errors) && result.json.errors.length > 0) {
            const missingFields = result.json.errors.filter((error) =>
                /FieldUndefined/.test(String(error.message)),
            );

            if (missingFields.length > 0 && prunes < MAX_SCHEMA_PRUNES) {
                let changed = false;
                for (const error of missingFields) {
                    const path = String(error.message).match(/@\[([^\]]+)\]/)?.[1];
                    if (path && pruneSelection(jobSelection, path)) changed = true;
                }
                if (changed) {
                    prunes += 1;
                    attempts -= 1;
                    continue;
                }
            }

            lastReason = cleanString(result.json.errors[0]?.message) || 'GraphQL error';
        } else {
            const page = normalizeJobPage(result.json);
            if (!page) {
                lastReason = `unexpected JSON shape (keys: ${Object.keys(result.json).join(', ') || 'none'})`;
                break;
            }
            return { ok: true, jobs: validJobs(page.jobs), pageInfo: page.pageInfo };
        }

        const retryable = !result.json || RETRYABLE_STATUS.has(result.status);
        if (!retryable || attempts >= MAX_ATTEMPTS || Date.now() >= deadline) break;

        const waitMs = retryDelayMs(attempts, result.retryAfter);
        log.warning(`GraphQL page ${pageNumber}: ${lastReason}. Retrying in ${Math.round(waitMs / 1000)}s.`);
        await delay(Math.min(waitMs, remainingMs(deadline)));
    }

    return { ok: false, reason: lastReason };
}

async function fetchLegacyPage(pageNumber, filter, property, deadline) {
    let lastReason = 'unknown error';
    const variables = {
        direction: DEFAULT_SORT_DIRECTION,
        size: PAGE_SIZE,
        page: pageNumber,
        property,
        params: filter,
        loggedIn: false,
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (Date.now() >= deadline) return { ok: false, reason: 'time budget exhausted' };

        let result;
        try {
            const response = await getClient().fetch(LEGACY_URL, {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: 'Bearer undefined',
                    origin: TARGET_ORIGIN,
                    referer: BROWSE_URL,
                },
                body: JSON.stringify({ variables }),
            });
            result = await readResponse(response);
        } catch (error) {
            lastReason = `request error (${error.name})`;
            rotateProfile(lastReason);
            if (attempt >= MAX_ATTEMPTS || Date.now() >= deadline) break;
            await delay(Math.min(retryDelayMs(attempt), remainingMs(deadline)));
            continue;
        }

        if (result.json) {
            const page = normalizeJobPage(result.json);
            if (page) return { ok: true, jobs: validJobs(page.jobs), pageInfo: page.pageInfo };

            lastReason = `unexpected JSON shape (keys: ${Object.keys(result.json).join(', ') || 'none'})`;
            break;
        }

        lastReason =
            result.status === 403 || /access denied|request unsuccessful/i.test(result.textPreview)
                ? 'edge block'
                : `non-JSON response (HTTP ${result.status})`;
        if (result.status === 403) rotateProfile(lastReason);

        if (!RETRYABLE_STATUS.has(result.status) || attempt >= MAX_ATTEMPTS || Date.now() >= deadline) break;

        const waitMs = retryDelayMs(attempt, result.retryAfter);
        log.warning(`Legacy page ${pageNumber}: ${lastReason}. Retrying in ${Math.round(waitMs / 1000)}s.`);
        await delay(Math.min(waitMs, remainingMs(deadline)));
    }

    return { ok: false, reason: lastReason };
}

const transports = [
    {
        name: 'GraphQL feed',
        run: fetchGraphqlPage,
        failures: 0,
        disabledUntil: 0,
    },
    {
        name: 'Legacy feed',
        run: fetchLegacyPage,
        failures: 0,
        disabledUntil: 0,
    },
];

async function fetchPage(pageNumber, filter, property, deadline) {
    let lastReason = 'unknown error';

    for (const transport of transports) {
        if (Date.now() >= deadline) break;
        if (Date.now() < transport.disabledUntil) continue;

        const result = await transport.run(pageNumber, filter, property, deadline);
        if (result.ok) {
            transport.failures = 0;
            return result;
        }

        lastReason = result.reason;
        transport.failures += 1;
        log.warning(`Page ${pageNumber}: ${transport.name} failed (${result.reason}).`);

        if (transport.failures >= 2) {
            transport.disabledUntil = Date.now() + TRANSPORT_COOLDOWN_MS;
            transport.failures = 0;
            log.warning(`${transport.name} failed twice. Cooling down for ${TRANSPORT_COOLDOWN_MS / 1000}s.`);
        }
    }

    return { ok: false, reason: lastReason };
}

async function collectJobs({ search, filter, property, resultsWanted, maxPages }) {
    const seenIds = new Set();
    const runDeadline = Date.now() + RUN_BUDGET_MS;
    let activeProperty = property;
    let totalSaved = 0;
    let pagesFetched = 0;
    let pageNumber = search.startUrlConfig.page;
    let stopReason = 'page_limit';

    while (pagesFetched < maxPages && totalSaved < resultsWanted) {
        const budget = pagesFetched === 0 ? FIRST_PAGE_BUDGET_MS : PAGE_BUDGET_MS;
        let pageResult = await fetchPage(
            pageNumber,
            filter,
            activeProperty,
            Math.min(runDeadline, Date.now() + budget),
        );

        if (!pageResult.ok && pagesFetched === 0) {
            const alternate = activeProperty === 'createdAt' ? DEFAULT_SORT_PROPERTY : 'createdAt';
            log.warning(`Page ${pageNumber} failed with "${activeProperty}". Trying "${alternate}".`);
            pageResult = await fetchPage(
                pageNumber,
                filter,
                alternate,
                Math.min(runDeadline, Date.now() + PAGE_BUDGET_MS),
            );
            if (pageResult.ok) activeProperty = alternate;
        }

        if (!pageResult.ok) {
            stopReason = totalSaved > 0 ? 'page_error' : 'source_unavailable';
            const outcome =
                totalSaved > 0
                    ? `Finishing with the ${totalSaved} jobs collected so far.`
                    : 'No jobs were collected.';
            log.warning(`Page ${pageNumber} could not be retrieved (${pageResult.reason}). ${outcome}`);
            break;
        }

        if (pageResult.jobs.length === 0) {
            stopReason = 'empty_page';
            break;
        }

        const items = [];
        for (const job of pageResult.jobs) {
            const id = readKey(job, ['id', 'jobId', 'uuid']);
            if (!id || seenIds.has(id)) continue;

            const mapped = mapJob(job, {
                keyword: filter.searchText || null,
                location: filter.locationText || null,
                page: pageNumber,
            });
            if (!mapped) continue;

            seenIds.add(id);
            items.push(mapped);
            totalSaved += 1;
            if (totalSaved >= resultsWanted) break;
        }

        if (items.length > 0) await Actor.pushData(items);

        pagesFetched += 1;
        log.info(`Page ${pageNumber}: saved ${items.length} jobs. Total ${totalSaved}/${resultsWanted}.`);

        if (totalSaved >= resultsWanted) {
            stopReason = 'results_wanted';
            break;
        }

        if (items.length === 0) {
            stopReason = 'no_new_jobs';
            break;
        }

        const { last, totalPages } = pageResult.pageInfo;
        if (last === true || (Number.isInteger(totalPages) && pageNumber >= totalPages - 1)) {
            stopReason = 'last_page';
            break;
        }

        pageNumber += 1;

        if (Date.now() >= runDeadline) {
            stopReason = 'time_budget';
            log.warning(`Time budget reached after ${totalSaved} jobs.`);
            break;
        }

        await delay(PAGE_GAP_MS + Math.floor(Math.random() * 200));
    }

    return { totalSaved, pagesFetched, stopReason };
}

async function setStatusMessage(message) {
    try {
        await Actor.setStatusMessage(message);
    } catch {
        // Status messages are best-effort and unavailable outside the Apify platform.
    }
}

await Actor.init();

let exitCode = 0;

try {
    const input = (await Actor.getInput()) || {};
    const search = resolveSearch(input);
    const filter = buildFilter(search);
    const resultsWanted = parsePositiveInt(input.results_wanted, 20);
    const maxPages = parsePositiveInt(input.max_pages, 20);
    const property = resolveSortProperty(search.startUrlConfig.property);
    const requestedUrl = cleanString(input.startUrl);
    if (requestedUrl && !normalizeStartUrl(requestedUrl) && search.mode === 'startUrl') {
        log.warning(`startUrl "${requestedUrl}" is not a Nurse.com URL. Using ${BROWSE_URL}.`);
    }

    if (input.proxyConfiguration) {
        const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);
        if (proxyConfiguration) proxyUrl = await proxyConfiguration.newUrl();
    }

    log.info(
        `Starting collection | mode=${search.mode} | target=${resultsWanted} | pages<=${maxPages} | profile=${activeProfile()}`,
    );

    const summary = await collectJobs({ search, filter, property, resultsWanted, maxPages });

    if (summary.totalSaved === 0) {
        const message =
            summary.stopReason === 'source_unavailable'
                ? 'Nurse.com did not return job data after retries. The run finished without saving items; try again later.'
                : 'No jobs matched the supplied search. The dataset is empty because the source returned no results.';
        log.warning(message);
        await setStatusMessage(message);
    } else if (summary.stopReason === 'page_error' || summary.stopReason === 'time_budget') {
        const message = `Finished with partial results: ${summary.totalSaved} jobs from ${summary.pagesFetched} pages.`;
        log.warning(message);
        await setStatusMessage(message);
    } else {
        await setStatusMessage(`Saved ${summary.totalSaved} jobs from ${summary.pagesFetched} pages.`);
    }

    log.info(
        `Done | saved=${summary.totalSaved} | pages=${summary.pagesFetched} | stop=${summary.stopReason}`,
    );
} catch (error) {
    log.error(`Run failed: ${error.stack || error.message}`);
    exitCode = 1;
}

await Actor.exit({ exitCode });
