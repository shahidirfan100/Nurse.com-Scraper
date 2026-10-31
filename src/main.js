import { Actor, log } from 'apify';
import { load } from 'cheerio';
import { parse as parseDevalue } from 'devalue';
import { Impit } from 'impit';
import { CookieJar } from 'tough-cookie';

const TARGET_ORIGIN = 'https://www.nurse.com';
const DEFAULT_START_URL = 'https://www.nurse.com/jobs/browse/';
const BROWSE_PATH = '/jobs/browse/';
const API_PATH = '/jobs/api/jobs/job-detail';
const DEFAULT_SORT_PROPERTY = 'updatedAt';
const DEFAULT_SORT_DIRECTION = 'DESC';
const PAGE_SIZE = 25;
const MAX_ATTEMPTS = 4;
const MAX_PAGE_ROUNDS = 2;
const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRY_DELAY_MS = 15000;

const PROFILE_POOL = ['chrome', 'chrome151', 'chrome142', 'firefox', 'firefox144', 'ios18'];
const RETRYABLE_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const JOB_COLLECTION_KEYS = ['jobs', 'results', 'items', 'listings', 'records', 'content', 'data'];
const JOB_CONTAINER_KEYS = ['data', 'result', 'payload', 'response'];

const NUXT_PAYLOAD_RE = /<script[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
const NUXT_REVIVERS = {
    ShallowReactive: (value) => value,
    ShallowRef: (value) => ({ value }),
    ShallowReactiveRef: (value) => value,
    EmptyRef: () => ({ value: undefined }),
    EmptyShallowRef: () => ({ value: undefined }),
    Ref: (value) => ({ value }),
    Reactive: (value) => value,
    Set: (value) => new Set(value),
    Map: (value) => new Map(value),
    Date: (value) => new Date(value),
    BigInt: (value) => BigInt(value),
    RegExp: (value) => new RegExp(value),
    URL: (value) => new URL(value),
    Error: (value) => Object.assign(new Error(value?.message), value),
};

let profileIndex = 0;
let proxyConfiguration;
let proxyUrl;
let proxySessions = 0;

const clients = new Map();

function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function parsePositiveInt(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function parseNonNegativeInt(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function currentProfile() {
    return PROFILE_POOL[profileIndex];
}

function rotateProfile() {
    profileIndex = (profileIndex + 1) % PROFILE_POOL.length;
    return currentProfile();
}

function getClient() {
    const profile = currentProfile();
    const key = `${profile}::${proxyUrl || ''}`;
    let client = clients.get(key);

    if (!client) {
        client = new Impit({
            browser: profile,
            timeout: REQUEST_TIMEOUT_MS,
            cookieJar: new CookieJar(),
            ...(proxyUrl ? { proxyUrl } : {}),
        });
        clients.set(key, client);
    }

    return client;
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function retryDelayMs(attempt, retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.min(retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
    }

    const exponential = Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
    return exponential + Math.floor(Math.random() * 400);
}

function readKey(source, names) {
    if (!source || typeof source !== 'object') return undefined;

    for (const name of names) {
        const value = source[name];
        if (value !== undefined && value !== null) return value;
    }

    const lowerCaseKeys = new Map(Object.keys(source).map((key) => [key.toLowerCase(), key]));
    for (const name of names) {
        const key = lowerCaseKeys.get(name.toLowerCase());
        if (key === undefined) continue;

        const value = source[key];
        if (value !== undefined && value !== null) return value;
    }

    return undefined;
}

function parseJson(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function extractJobs(json) {
    if (!json || typeof json !== 'object') return null;
    if (Array.isArray(json)) return json;

    const direct = readKey(json, JOB_COLLECTION_KEYS);
    if (Array.isArray(direct)) return direct;

    for (const name of JOB_CONTAINER_KEYS) {
        const container = readKey(json, [name]);
        if (!container || typeof container !== 'object') continue;

        const nested = readKey(container, JOB_COLLECTION_KEYS);
        if (Array.isArray(nested)) return nested;
    }

    return null;
}

function extractPageInfo(json) {
    const source = readKey(json, ['page', 'pagination', 'pageInfo', 'meta']);
    if (!source || typeof source !== 'object') return {};

    const info = {
        last: readKey(source, ['last']) === true,
        number: readKey(source, ['number', 'pageNumber']),
        totalPages: readKey(source, ['totalPages', 'pages']),
    };

    if (Number.isInteger(Number(info.number))) info.number = Number(info.number);
    else delete info.number;

    if (Number.isInteger(Number(info.totalPages))) info.totalPages = Number(info.totalPages);
    else delete info.totalPages;

    return info;
}

function filterValidJobs(jobs) {
    const valid = [];
    let skipped = 0;

    for (const job of jobs) {
        const hasIdentity = job && typeof job === 'object' && (job.id || job.jobId || job.slug || job.title);

        if (hasIdentity) valid.push(job);
        else skipped += 1;
    }

    if (skipped > 0) {
        log.warning(`Ignored ${skipped} job entries without an id, slug, or title.`);
    }

    return valid;
}

function parseStartUrlConfig(startUrl) {
    const config = {
        page: 0,
        property: DEFAULT_SORT_PROPERTY,
        filter: {},
    };

    try {
        const url = new URL(startUrl);
        const pageMatch = url.pathname.match(/\/page-(\d+)\/?$/i);
        if (pageMatch) config.page = parseNonNegativeInt(pageMatch[1], 0);

        const property = url.searchParams.get('s');
        if (property) config.property = property;

        const encodedFilter = url.searchParams.get('q');
        if (encodedFilter) {
            const parsed = JSON.parse(encodedFilter);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config.filter = parsed;
        }
    } catch {
        log.warning('startUrl could not be parsed. Using the default browse page settings.');
    }

    return config;
}

function normalizeStartUrl(value) {
    try {
        const url = new URL(value);
        const isSupportedHost = url.hostname === 'www.nurse.com' || url.hostname === 'nurse.com';

        if (!isSupportedHost) {
            log.warning(`startUrl host "${url.hostname}" is not a Nurse.com host. Using the default page.`);
            return undefined;
        }

        return url.toString();
    } catch {
        log.warning('startUrl is not a valid URL. Using the default nurse.com page.');
        return undefined;
    }
}

function describeSearchMode(keyword, location) {
    if (keyword && location) return 'keyword+location';
    return keyword ? 'keyword' : 'location';
}

function resolveSearch(input) {
    const keyword = cleanString(input.keyword);
    const location = cleanString(input.location);

    if (keyword || location) {
        return {
            mode: describeSearchMode(keyword, location),
            keyword,
            location,
            startUrlConfig: { page: 0, property: DEFAULT_SORT_PROPERTY, filter: {} },
        };
    }

    const requestedUrl = cleanString(input.startUrl) || DEFAULT_START_URL;
    const startUrlConfig = parseStartUrlConfig(normalizeStartUrl(requestedUrl) || DEFAULT_START_URL);

    return {
        mode: 'startUrl',
        keyword: cleanString(startUrlConfig.filter.searchText),
        location: cleanString(startUrlConfig.filter.locationText),
        startUrlConfig,
    };
}

function buildFilter(search) {
    const filter = { ...search.startUrlConfig.filter, favorited: false };

    if (search.keyword) filter.searchText = search.keyword;
    if (search.location) filter.locationText = search.location;
    if (!('searchText' in filter)) filter.searchText = null;
    if (!('locationText' in filter)) filter.locationText = null;

    for (const [key, value] of Object.entries(filter)) {
        if (value === '') delete filter[key];
    }

    return filter;
}

function buildBrowseUrl(pageNumber, filter, property) {
    const path = pageNumber > 0 ? `${BROWSE_PATH}page-${pageNumber}/` : BROWSE_PATH;
    const url = new URL(path, TARGET_ORIGIN);
    const query = {};

    for (const [key, value] of Object.entries(filter)) {
        if (key === 'favorited' || value === undefined || value === null || value === '') continue;
        query[key] = value;
    }

    if (Object.keys(query).length > 0) url.searchParams.set('q', JSON.stringify(query));
    if (property) url.searchParams.set('s', property);

    return url.toString();
}

function findJobsContainer(node, depth = 0, seen = new WeakSet()) {
    if (!node || typeof node !== 'object' || depth > 12) return undefined;
    if (seen.has(node)) return undefined;
    seen.add(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findJobsContainer(item, depth + 1, seen);
            if (found) return found;
        }
        return undefined;
    }

    const jobs = readKey(node, ['jobs']);
    if (Array.isArray(jobs) && jobs.length > 0) return node;

    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') continue;

        const found = findJobsContainer(value, depth + 1, seen);
        if (found) return found;
    }

    return undefined;
}

function extractJobsFromHtml(html) {
    const match = html.match(NUXT_PAYLOAD_RE);
    if (!match) return undefined;

    let payload;
    try {
        payload = parseDevalue(match[1], NUXT_REVIVERS);
    } catch (error) {
        log.warning(`Page payload could not be decoded: ${error.message}`);
        return undefined;
    }

    return findJobsContainer(payload);
}

function buildApiHeaders() {
    return {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: TARGET_ORIGIN,
        referer: `${TARGET_ORIGIN}${BROWSE_PATH}`,
    };
}

async function fetchApiPage(pageNumber, filter, property) {
    let lastReason = 'unknown error';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let response;

        try {
            response = await getClient().fetch(`${TARGET_ORIGIN}${API_PATH}`, {
                method: 'POST',
                headers: buildApiHeaders(),
                body: JSON.stringify({
                    variables: {
                        direction: DEFAULT_SORT_DIRECTION,
                        size: PAGE_SIZE,
                        page: pageNumber,
                        property,
                        params: filter,
                        loggedIn: false,
                    },
                }),
                timeout: REQUEST_TIMEOUT_MS,
            });
        } catch (error) {
            lastReason = `network error (${error.name})`;

            if (attempt === MAX_ATTEMPTS) break;
            log.warning(`Page ${pageNumber}: ${lastReason}. Retrying.`);
            rotateProfile();
            await delay(retryDelayMs(attempt));
            continue;
        }

        try {
            const text = await response.text();

            if (response.ok) {
                const json = parseJson(text);
                if (!json) {
                    lastReason = 'non-JSON response';
                    log.warning(`Page ${pageNumber}: ${lastReason}.`);
                    if (attempt === MAX_ATTEMPTS) break;
                    rotateProfile();
                    await delay(retryDelayMs(attempt));
                    continue;
                }

                const jobs = extractJobs(json);
                if (!jobs) {
                    const keys = json && typeof json === 'object' ? Object.keys(json).join(', ') : 'none';
                    lastReason = `unexpected JSON shape (keys: ${keys})`;
                    log.warning(`Page ${pageNumber}: ${lastReason}.`);
                    break;
                }

                return {
                    ok: true,
                    jobs: filterValidJobs(jobs),
                    pageInfo: extractPageInfo(json),
                };
            }
        } catch (error) {
            lastReason = `response read error (${error.name})`;
            if (attempt === MAX_ATTEMPTS) break;
            rotateProfile();
            await delay(retryDelayMs(attempt));
            continue;
        }

        lastReason = `HTTP ${response.status}`;

        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) break;

        rotateProfile();
        const waitMs = retryDelayMs(attempt, response.headers.get('retry-after'));
        log.warning(`Page ${pageNumber}: ${lastReason}. Retrying in ${Math.round(waitMs / 1000)}s.`);
        await delay(waitMs);
    }

    return { ok: false, reason: lastReason };
}

async function fetchHtmlPage(pageNumber, filter, property) {
    const url = buildBrowseUrl(pageNumber, filter, property);
    let lastReason = 'unknown error';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let response;

        try {
            response = await getClient().fetch(url, { timeout: REQUEST_TIMEOUT_MS });
        } catch (error) {
            lastReason = `network error (${error.name})`;
            if (attempt === MAX_ATTEMPTS) break;
            rotateProfile();
            await delay(retryDelayMs(attempt));
            continue;
        }

        if (!response.ok) {
            lastReason = `HTTP ${response.status}`;
            if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) break;
            rotateProfile();
            await delay(retryDelayMs(attempt, response.headers.get('retry-after')));
            continue;
        }

        let html;
        try {
            html = await response.text();
        } catch (error) {
            lastReason = `response read error (${error.name})`;
            if (attempt === MAX_ATTEMPTS) break;
            rotateProfile();
            await delay(retryDelayMs(attempt));
            continue;
        }

        const container = extractJobsFromHtml(html);

        if (!container) {
            lastReason = 'job data missing from the rendered page';
            if (attempt === MAX_ATTEMPTS) break;
            rotateProfile();
            await delay(retryDelayMs(attempt));
            continue;
        }

        return {
            ok: true,
            jobs: filterValidJobs(container.jobs),
            pageInfo: extractPageInfo(container),
        };
    }

    return { ok: false, reason: lastReason };
}

async function refreshProxySession() {
    if (!proxyConfiguration) return false;

    proxySessions += 1;
    proxyUrl = await proxyConfiguration.newUrl(`nurse-${Date.now()}-${proxySessions}`);
    log.warning('Retrying with a fresh connection.');

    return true;
}

async function fetchPage(pageNumber, filter, property) {
    let lastResult = { ok: false, reason: 'unknown error' };

    for (let round = 1; round <= MAX_PAGE_ROUNDS; round += 1) {
        const apiResult = await fetchApiPage(pageNumber, filter, property);
        if (apiResult.ok) return apiResult;

        log.warning(`Page ${pageNumber}: ${apiResult.reason}. Retrying.`);

        const htmlResult = await fetchHtmlPage(pageNumber, filter, property);
        if (htmlResult.ok) return htmlResult;

        lastResult = { ok: false, reason: `${apiResult.reason}; ${htmlResult.reason}` };

        const proxyRefreshed = await refreshProxySession();
        if (!proxyRefreshed) break;
    }

    return lastResult;
}

function htmlToCleanText(html) {
    if (typeof html !== 'string') return undefined;

    const raw = html.trim();
    if (!raw) return undefined;

    const $ = load(`<div id="root">${raw}</div>`);
    $('#root script, #root style, #root noscript').remove();
    $('#root br').replaceWith('\n');
    $(
        '#root p, #root div, #root li, #root ul, #root ol, #root h1, #root h2, #root h3, #root h4, #root h5, #root h6, #root section, #root article, #root tr',
    ).append('\n');

    const text = $('#root')
        .text()
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');

    return text || undefined;
}

function pruneEmpty(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;

    if (Array.isArray(value)) {
        const cleanArray = value.map(pruneEmpty).filter((item) => item !== undefined);
        return cleanArray.length ? cleanArray : undefined;
    }

    if (typeof value === 'object') {
        const cleanObject = {};
        for (const [key, val] of Object.entries(value)) {
            const cleanVal = pruneEmpty(val);
            if (cleanVal !== undefined) cleanObject[key] = cleanVal;
        }
        return Object.keys(cleanObject).length ? cleanObject : undefined;
    }

    return value;
}

function mapJob(job, context) {
    const address = readKey(job, ['address']) || {};
    const geo = readKey(address, ['location', 'geo', 'coordinates']) || {};
    const organization = readKey(job, ['organization', 'company', 'employer']) || {};
    const qualifications = readKey(job, ['qualifications', 'requirements']);
    const id = readKey(job, ['id', 'jobId', 'uuid']);
    const slug = readKey(job, ['slug']);
    const descriptionHtml = readKey(job, ['description', 'descriptionHtml', 'content', 'body']);

    const item = {
        id,
        slug,
        url: slug && id ? `https://www.nurse.com/jobs/${slug}/${id}/` : undefined,
        title: readKey(job, ['title', 'jobTitle', 'name']),
        description_html: descriptionHtml,
        description_text: htmlToCleanText(descriptionHtml),
        status: readKey(job, ['status']),
        employmentType: readKey(job, ['employmentType', 'employment_type']),
        shiftType: readKey(job, ['shiftType', 'shift_type']),
        minYearsExp: readKey(job, ['minYearsExp', 'minYearsExperience']),
        hasExternalApplicationUrl: readKey(job, ['hasExternalApplicationUrl']),
        displayCompanyName: readKey(job, ['displayCompanyName']),
        payLow: readKey(job, ['payLow', 'salaryLow']),
        payHigh: readKey(job, ['payHigh', 'salaryHigh']),
        payType: readKey(job, ['payType', 'salaryType']),
        postedAt: readKey(job, ['postedAt', 'postedDate']),
        updatedAt: readKey(job, ['updatedAt']),
        createdAt: readKey(job, ['createdAt']),
        expiresAt: readKey(job, ['expiresAt']),
        locationCity: readKey(address, ['city']),
        locationState: readKey(address, ['state', 'region']),
        organizationName: readKey(organization, ['name', 'companyName']),
        location: {
            city: readKey(address, ['city']),
            state: readKey(address, ['state', 'region']),
            zipCode: readKey(address, ['zipCode', 'zip', 'postalCode']),
            lat: readKey(geo, ['lat', 'latitude']),
            lon: readKey(geo, ['lon', 'lng', 'longitude']),
        },
        organization: {
            id: readKey(organization, ['id']),
            name: readKey(organization, ['name', 'companyName']),
            premium: readKey(organization, ['premium']),
        },
        qualifications: Array.isArray(qualifications)
            ? qualifications.map((qualification) => ({
                  name: readKey(qualification, ['name']),
                  details: readKey(qualification, ['details']),
                  type: readKey(readKey(qualification, ['type']) || {}, ['name']),
              }))
            : undefined,
        query: {
            keyword: context.keyword,
            location: context.location,
            page: context.page,
        },
        source: 'nurse.com',
        crawledAt: new Date().toISOString(),
    };

    return pruneEmpty(item);
}

async function collectJobs({ search, filter, property, resultsWanted, maxPages }) {
    const seenIds = new Set();
    let totalSaved = 0;
    let pagesFetched = 0;
    let pageNumber = search.startUrlConfig.page;
    let stopReason = 'page_limit';

    while (pagesFetched < maxPages && totalSaved < resultsWanted) {
        const pageResult = await fetchPage(pageNumber, filter, property);

        if (!pageResult.ok) {
            throw new Error(`Page ${pageNumber} could not be retrieved (${pageResult.reason}).`);
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

        if (items.length > 0) {
            await Actor.pushData(items);
        }

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
    }

    return { totalSaved, pagesFetched, stopReason };
}

await Actor.init();

let exitCode = 0;

try {
    const input = (await Actor.getInput()) || {};
    const search = resolveSearch(input);
    const filter = buildFilter(search);
    const resultsWanted = parsePositiveInt(input.results_wanted, 20);
    const maxPages = parsePositiveInt(input.max_pages, 20);
    const property = search.startUrlConfig.property || DEFAULT_SORT_PROPERTY;

    proxyConfiguration = input.proxyConfiguration
        ? await Actor.createProxyConfiguration(input.proxyConfiguration)
        : undefined;

    if (proxyConfiguration) {
        proxyUrl = await proxyConfiguration.newUrl();
    }

    log.info(`Starting collection | mode=${search.mode} | target=${resultsWanted} | pages<=${maxPages}`);

    const summary = await collectJobs({ search, filter, property, resultsWanted, maxPages });

    if (summary.totalSaved === 0) {
        log.warning(
            'No jobs matched the supplied search. The dataset is empty because the source returned no results.',
        );
    }

    log.info(`Done | saved=${summary.totalSaved} | pages=${summary.pagesFetched} | stop=${summary.stopReason}`);
} catch (error) {
    log.error(`Run failed: ${error.message}`);
    exitCode = 1;
}

await Actor.exit({ exitCode });
