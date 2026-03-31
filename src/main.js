import { Actor, log } from 'apify';
import { Dataset, PlaywrightCrawler } from 'crawlee';
import { load } from 'cheerio';
import { firefox } from 'playwright';

const DEFAULT_START_URL = 'https://www.nurse.com/jobs/browse/';
const API_PATH = '/jobs/api/jobs/job-detail';
const DEFAULT_SORT_PROPERTY = 'updatedAt';
const DEFAULT_SORT_DIRECTION = 'DESC';
const DEFAULT_PAGE_SIZE = 25;

function parsePositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseNonNegativeInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function getStartUrlFromInput(input) {
    const { startUrl } = input;
    if (typeof startUrl === 'string' && startUrl.trim()) return startUrl.trim();
    return DEFAULT_START_URL;
}

function parseStartUrlConfig(startUrl) {
    const out = {
        page: 0,
        property: DEFAULT_SORT_PROPERTY,
        filter: {},
    };

    try {
        const url = new URL(startUrl);
        const pageMatch = url.pathname.match(/\/page-(\d+)\/?$/i);
        if (pageMatch) out.page = parseNonNegativeInt(pageMatch[1], 0);

        const property = url.searchParams.get('s');
        if (property) out.property = property;

        const q = url.searchParams.get('q');
        if (q) {
            const parsed = JSON.parse(q);
            if (parsed && typeof parsed === 'object') out.filter = parsed;
        }
    } catch {
        // Ignore malformed URL and keep defaults.
    }

    return out;
}

function htmlToCleanText(html) {
    if (typeof html !== 'string') return undefined;

    const raw = html.trim();
    if (!raw) return undefined;

    const $ = load(`<div id="root">${raw}</div>`);
    $('#root script, #root style, #root noscript').remove();
    $('#root br').replaceWith('\n');
    $('#root p, #root div, #root li, #root ul, #root ol, #root h1, #root h2, #root h3, #root h4, #root h5, #root h6, #root section, #root article, #root tr')
        .append('\n');

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
    const descriptionHtml = job?.description;
    const descriptionText = htmlToCleanText(descriptionHtml);

    const location = {
        city: job?.address?.city,
        state: job?.address?.state,
        zipCode: job?.address?.zipCode,
        lat: job?.address?.location?.lat,
        lon: job?.address?.location?.lon,
    };

    const item = {
        id: job?.id,
        slug: job?.slug,
        url: job?.slug && job?.id ? `https://www.nurse.com/jobs/${job.slug}/${job.id}/` : undefined,
        title: job?.title,
        description_html: descriptionHtml,
        description_text: descriptionText,
        status: job?.status,
        employmentType: job?.employmentType,
        shiftType: job?.shiftType,
        minYearsExp: job?.minYearsExp,
        hasExternalApplicationUrl: job?.hasExternalApplicationUrl,
        displayCompanyName: job?.displayCompanyName,
        payLow: job?.payLow,
        payHigh: job?.payHigh,
        payType: job?.payType,
        postedAt: job?.postedAt,
        updatedAt: job?.updatedAt,
        createdAt: job?.createdAt,
        expiresAt: job?.expiresAt,
        locationCity: job?.address?.city,
        locationState: job?.address?.state,
        organizationName: job?.organization?.name,
        location,
        organization: {
            id: job?.organization?.id,
            name: job?.organization?.name,
            premium: job?.organization?.premium,
        },
        qualifications: Array.isArray(job?.qualifications)
            ? job.qualifications.map((q) => ({
                name: q?.name,
                details: q?.details,
                type: q?.type?.name,
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

async function fetchJobPage(page, variables, attemptCount = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= attemptCount; attempt++) {
        const result = await page.evaluate(async ({ apiPath, variables }) => {
            try {
                const response = await fetch(apiPath, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        accept: 'application/json',
                        'content-type': 'application/json',
                        authorization: 'Bearer undefined',
                    },
                    body: JSON.stringify({ variables }),
                });

                const text = await response.text();
                let json = null;
                try {
                    json = JSON.parse(text);
                } catch {
                    // Non-JSON response.
                }

                return {
                    ok: response.ok,
                    status: response.status,
                    json,
                    textPreview: text.slice(0, 400),
                };
            } catch (error) {
                return {
                    ok: false,
                    status: -1,
                    json: null,
                    textPreview: String(error),
                };
            }
        }, { apiPath: API_PATH, variables });

        if (result.ok && result.json && Array.isArray(result.json.jobs)) {
            return result.json;
        }

        lastError = new Error(`Job API request failed (status: ${result.status}, attempt: ${attempt}). Preview: ${result.textPreview}`);
        await page.waitForTimeout(500 * attempt);
    }

    throw lastError || new Error('Job API request failed with unknown error');
}

await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const startUrl = getStartUrlFromInput(input);
    const startUrlConfig = parseStartUrlConfig(startUrl);

    const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
    const location = typeof input.location === 'string' ? input.location.trim() : '';

    const resultsWanted = parsePositiveInt(input.results_wanted, 20);
    const maxPages = parsePositiveInt(input.max_pages, 20);
    const pageSize = DEFAULT_PAGE_SIZE;

    const property = startUrlConfig.property || DEFAULT_SORT_PROPERTY;
    const direction = DEFAULT_SORT_DIRECTION;
    const initialPage = Math.max(0, parseNonNegativeInt(startUrlConfig.page, 0));

    const mergedFilter = {
        ...startUrlConfig.filter,
        favorited: false,
    };

    if (keyword) mergedFilter.searchText = keyword;
    if (location) mergedFilter.locationText = location;
    if (!location && !('locationText' in mergedFilter)) mergedFilter.locationText = null;

    const proxyConfiguration = input.proxyConfiguration
        ? await Actor.createProxyConfiguration(input.proxyConfiguration)
        : undefined;

    const seenIds = new Set();
    let totalSaved = 0;
    let pagesFetched = 0;

    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxConcurrency: 1,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 300,
        navigationTimeoutSecs: 90,
        launchContext: {
            launcher: firefox,
            launchOptions: {
                headless: true,
            },
        },
        preNavigationHooks: [
            async ({ page }) => {
                await page.route('**/*', (route) => {
                    const type = route.request().resourceType();
                    const url = route.request().url();
                    if (
                        ['image', 'font', 'media', 'stylesheet'].includes(type)
                        || url.includes('google-analytics')
                        || url.includes('googletagmanager')
                        || url.includes('doubleclick')
                        || url.includes('facebook')
                    ) {
                        return route.abort();
                    }
                    return route.continue();
                });
            },
        ],
        async requestHandler({ page, log: crawlerLog }) {
            let pageNumber = initialPage;

            while (pagesFetched < maxPages && totalSaved < resultsWanted) {
                const variables = {
                    direction,
                    size: pageSize,
                    page: pageNumber,
                    property,
                    params: mergedFilter,
                    loggedIn: false,
                };

                const apiData = await fetchJobPage(page, variables);
                const jobs = Array.isArray(apiData.jobs) ? apiData.jobs : [];
                const pageInfo = apiData.page || {};

                if (!jobs.length) {
                    crawlerLog.info(`No jobs found for page ${pageNumber}. Stopping pagination.`);
                    break;
                }

                const items = [];
                for (const job of jobs) {
                    const id = job?.id;
                    if (!id || seenIds.has(id)) continue;

                    const mapped = mapJob(job, {
                        keyword: mergedFilter.searchText || null,
                        location: mergedFilter.locationText || null,
                        property,
                        direction,
                        page: pageNumber,
                    });

                    if (!mapped) continue;

                    seenIds.add(id);
                    items.push(mapped);
                    totalSaved++;

                    if (totalSaved >= resultsWanted) break;
                }

                if (items.length) {
                    await Dataset.pushData(items);
                }

                pagesFetched++;
                crawlerLog.info(`Page ${pageNumber} fetched. Saved ${totalSaved}/${resultsWanted} items.`);

                const isLastPage = pageInfo.last === true
                    || (Number.isInteger(pageInfo.totalPages) && pageNumber >= pageInfo.totalPages - 1);

                if (isLastPage || totalSaved >= resultsWanted) break;
                pageNumber++;
            }
        },
    });

    await crawler.run([{ url: startUrl }]);

    log.info(`Finished. Saved ${totalSaved} jobs from ${pagesFetched} page(s).`);
} finally {
    await Actor.exit();
}
