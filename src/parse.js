import { load } from 'cheerio';

export const DEFAULT_SORT_PROPERTY = 'updatedAt';
export const DEFAULT_SORT_DIRECTION = 'DESC';

export const SORT_PROPERTIES = new Set([
    'createdAt',
    'updatedAt',
    'payHigh',
    'name',
    'title',
    'status',
    'organization.name',
    'relevance',
    'expiresAt',
]);

const FILTER_KEYS = [
    'searchText',
    'locationText',
    'licenses',
    'specialties',
    'employmentTypes',
    'shiftTypes',
    'payLow',
    'payHigh',
    'favorited',
    'location',
    'radius',
];

const JOB_COLLECTION_KEYS = ['content', 'jobs', 'results', 'items', 'listings', 'records'];
const JOB_CONTAINER_KEYS = ['data', 'result', 'payload', 'response', 'jobSearch'];

export function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function parsePositiveInt(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

export function parseNonNegativeInt(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

export function readKey(source, names) {
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

export function parseStartUrlConfig(startUrl) {
    const config = { page: 0, property: DEFAULT_SORT_PROPERTY, filter: {} };

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

        const keyword = url.searchParams.get('jq');
        const location = url.searchParams.get('jl');
        if (keyword && !config.filter.searchText) config.filter.searchText = keyword;
        if (location && !config.filter.locationText) config.filter.locationText = location;
    } catch {
        config.filter = {};
    }

    return config;
}

export function normalizeStartUrl(value) {
    try {
        const url = new URL(value);
        if (url.hostname !== 'www.nurse.com' && url.hostname !== 'nurse.com') return undefined;
        return url.toString();
    } catch {
        return undefined;
    }
}

export function resolveSearch(input) {
    const keyword = cleanString(input.keyword);
    const location = cleanString(input.location);

    if (keyword || location) {
        let mode = 'location';
        if (keyword && location) mode = 'keyword+location';
        else if (keyword) mode = 'keyword';

        return {
            mode,
            keyword,
            location,
            startUrl: 'https://www.nurse.com/jobs/browse/',
            startUrlConfig: { page: 0, property: DEFAULT_SORT_PROPERTY, filter: {} },
        };
    }

    const startUrl = normalizeStartUrl(cleanString(input.startUrl)) || 'https://www.nurse.com/jobs/browse/';
    const startUrlConfig = parseStartUrlConfig(startUrl);

    return {
        mode: 'startUrl',
        keyword: cleanString(startUrlConfig.filter.searchText),
        location: cleanString(startUrlConfig.filter.locationText),
        startUrl,
        startUrlConfig,
    };
}

function toIntegerList(value) {
    if (!Array.isArray(value)) return value;
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item));
}

export function buildFilter(search) {
    const filter = { ...search.startUrlConfig.filter };

    if (search.keyword) filter.searchText = search.keyword;
    if (search.location) filter.locationText = search.location;

    for (const key of Object.keys(filter)) {
        if (!FILTER_KEYS.includes(key)) delete filter[key];
    }

    for (const key of ['licenses', 'specialties']) {
        if (key in filter) filter[key] = toIntegerList(filter[key]);
    }

    if (typeof filter.favorited === 'string') filter.favorited = filter.favorited === 'true';

    for (const key of ['payLow', 'payHigh', 'radius']) {
        if (!(key in filter)) continue;
        const number = Number(filter[key]);
        if (Number.isInteger(number)) filter[key] = number;
        else delete filter[key];
    }

    for (const [key, value] of Object.entries(filter)) {
        if (value === undefined || value === null || value === '') delete filter[key];
        if (Array.isArray(value) && value.length === 0) delete filter[key];
    }

    return filter;
}

export function resolveSortProperty(property) {
    if (!property) return DEFAULT_SORT_PROPERTY;
    return SORT_PROPERTIES.has(property) ? property : DEFAULT_SORT_PROPERTY;
}

export function renderSelection(selection) {
    return Object.entries(selection)
        .map(([key, value]) =>
            value && typeof value === 'object' ? `${key} { ${renderSelection(value)} }` : key,
        )
        .join(' ');
}

export function buildJobQuery(jobSelection, pageSelection) {
    return `query JobSearch($filter: JobSearchInput, $pageRequest: PageRequest) {
  jobSearch(filter: $filter, pageRequest: $pageRequest) {
    content { ${renderSelection(jobSelection)} }
    page { ${renderSelection(pageSelection)} }
  }
}`;
}

export function pruneSelection(selection, path) {
    const segments = path.split('/');
    const contentIndex = segments.indexOf('content');
    if (contentIndex < 0 || contentIndex === segments.length - 1) return false;

    const field = segments.pop();
    let node = selection;
    for (const segment of segments.slice(contentIndex + 1)) {
        if (!node[segment] || typeof node[segment] !== 'object') return false;
        node = node[segment];
    }

    if (!(field in node)) return false;
    delete node[field];
    return true;
}

function looksLikeJobs(array) {
    const first = array.find((item) => item && typeof item === 'object');
    if (!first) return false;
    return Boolean(readKey(first, ['id', 'jobId', 'slug', 'title']));
}

function findJobContainer(node, depth = 0, seen = new WeakSet()) {
    if (!node || typeof node !== 'object' || depth > 8) return undefined;
    if (seen.has(node)) return undefined;
    seen.add(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findJobContainer(item, depth + 1, seen);
            if (found) return found;
        }
        return undefined;
    }

    const jobs = readKey(node, JOB_COLLECTION_KEYS);
    if (Array.isArray(jobs)) {
        const hasPage = Boolean(readKey(node, ['page', 'pagination', 'pageInfo']));
        if (looksLikeJobs(jobs) || (jobs.length === 0 && hasPage)) return node;
    }

    for (const name of JOB_CONTAINER_KEYS) {
        const container = readKey(node, [name]);
        if (!container || typeof container !== 'object') continue;
        const found = findJobContainer(container, depth + 1, seen);
        if (found) return found;
    }

    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') continue;
        const found = findJobContainer(value, depth + 1, seen);
        if (found) return found;
    }

    return undefined;
}

export function normalizePageInfo(source) {
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

export function normalizeJobPage(json) {
    if (Array.isArray(json) && looksLikeJobs(json)) return { jobs: json, pageInfo: {} };
    if (!json || typeof json !== 'object') return null;

    const container = findJobContainer(json);
    if (!container) return null;

    const jobs = readKey(container, JOB_COLLECTION_KEYS);
    if (!Array.isArray(jobs)) return null;

    const pageSource = readKey(container, ['page', 'pagination', 'pageInfo']);
    return { jobs, pageInfo: normalizePageInfo(pageSource || {}) };
}

export function htmlToCleanText(html) {
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

export function mapJob(job, context) {
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
