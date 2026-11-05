import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildFilter,
    buildJobQuery,
    mapJob,
    normalizeJobPage,
    parseStartUrlConfig,
    pruneSelection,
    resolveSearch,
    resolveSortProperty,
} from '../src/parse.js';

const JOB = {
    id: '8a032086-d7d5-44e3-9262-cff31a01b051',
    title: 'RN - Emergency Services',
    slug: 'rn-emergency-services',
    description: '<p>Line one</p><p>Line two</p>',
    address: { city: 'Klamath Falls', state: 'OR', location: { lat: 42.2, lon: -121.7 } },
    organization: { id: 'org-1', name: 'Global Medical Response', premium: false },
    qualifications: [{ name: 'Critical Care', details: null, type: { name: 'specialty' } }],
};

test('normalizes the GraphQL job page shape', () => {
    const page = normalizeJobPage({
        data: { jobSearch: { content: [JOB], page: { number: 0, totalPages: 34, last: false } } },
    });
    assert.equal(page.jobs.length, 1);
    assert.equal(page.pageInfo.totalPages, 34);
    assert.equal(page.pageInfo.last, false);
});

test('normalizes the legacy jobs page shape', () => {
    const page = normalizeJobPage({ jobs: [JOB], page: { number: 1, totalPages: 5, last: true } });
    assert.equal(page.jobs.length, 1);
    assert.equal(page.pageInfo.number, 1);
    assert.equal(page.pageInfo.last, true);
});

test('accepts an empty page that carries pagination metadata', () => {
    const page = normalizeJobPage({ data: { jobSearch: { content: [], page: { totalPages: 0, last: true } } } });
    assert.equal(page.jobs.length, 0);
    assert.equal(page.pageInfo.last, true);
});

test('rejects payloads without a job collection', () => {
    assert.equal(normalizeJobPage({ data: { nav: [] } }), null);
    assert.equal(normalizeJobPage(null), null);
});

test('prunes a missing nested field from the query selection', () => {
    const selection = { id: true, address: { city: true, state: true } };
    assert.equal(pruneSelection(selection, 'jobSearch/content/address/state'), true);
    assert.deepEqual(selection, { id: true, address: { city: true } });
    assert.equal(pruneSelection(selection, 'jobSearch/content/address/state'), false);
});

test('renders nested selections as GraphQL', () => {
    const query = buildJobQuery({ id: true, address: { city: true } }, { number: true });
    assert.match(query, /content \{ id address \{ city \} \}/);
    assert.match(query, /page \{ number \}/);
});

test('keeps supported filters and drops unknown or empty values', () => {
    const filter = buildFilter({
        keyword: 'icu',
        location: 'New York',
        startUrlConfig: {
            filter: { licenses: [1], bogus: 'x', specialties: [], favorited: 'false', payLow: '30' },
        },
    });
    assert.deepEqual(filter, {
        licenses: [1],
        favorited: false,
        payLow: 30,
        searchText: 'icu',
        locationText: 'New York',
    });
});

test('converts URL filter ids to integers', () => {
    const filter = buildFilter({
        keyword: '',
        location: '',
        startUrlConfig: { filter: { licenses: ['2', '3'], specialties: ['bad'], payLow: 'nope' } },
    });
    assert.deepEqual(filter, { licenses: [2, 3] });
});

test('reads page, sort, and filters from a browse URL', () => {
    const config = parseStartUrlConfig(
        'https://www.nurse.com/jobs/browse/page-2/?s=createdAt&q=%7B%22searchText%22%3A%22rn%22%7D',
    );
    assert.equal(config.page, 2);
    assert.equal(config.property, 'createdAt');
    assert.equal(config.filter.searchText, 'rn');
});

test('keyword mode ignores the start URL filter', () => {
    const search = resolveSearch({
        keyword: 'icu',
        startUrl: 'https://www.nurse.com/jobs/browse/page-3/?q=%7B%22locationText%22%3A%22Texas%22%7D',
    });
    assert.equal(search.mode, 'keyword');
    assert.equal(search.startUrlConfig.page, 0);
    assert.deepEqual(search.startUrlConfig.filter, {});
});

test('falls back to a supported sort property', () => {
    assert.equal(resolveSortProperty('payHigh'), 'payHigh');
    assert.equal(resolveSortProperty('bogus'), 'updatedAt');
});

test('maps a job to the documented dataset shape', () => {
    const item = mapJob(JOB, { keyword: 'icu', location: null, page: 0 });
    assert.equal(item.url, `https://www.nurse.com/jobs/${JOB.slug}/${JOB.id}/`);
    assert.equal(item.description_text, 'Line one\nLine two');
    assert.equal(item.location.lat, 42.2);
    assert.equal(item.qualifications[0].type, 'specialty');
    assert.equal(item.organization.name, 'Global Medical Response');
});
