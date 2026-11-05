# API Discovery: Nurse.com Jobs

Last verified: 2026-11-05

This file is the first stop when the actor fails. It records the request that
currently returns job data, the fallback route, and the checks that separate a
source outage from an actor bug.

## Current site shape

- Nurse.com is a Nuxt 3 application served through Akamai.
- The browse page (`https://www.nurse.com/jobs/browse/`) is client rendered for
  job results. Its `__NUXT_DATA__` payload now carries navigation, filter
  options, and page errors, but no job list.
- The Nuxt server route `POST /jobs/api/jobs/job-detail` proxies the search to
  `https://production.nurse.com`. During verification it returned HTTP 500
  (`[POST] "/jobs/api/jobs/job-detail": 500 Error Encountered`).
- The public GraphQL service behind that route answers directly:
  `https://super-api.nurse.com/graphql`.

## Selected API (primary)

- Endpoint: `https://super-api.nurse.com/graphql`
- Method: `POST`
- Auth: none for anonymous search.
- Content type: `application/json`.
- Introspection: disabled. Field discovery below was done through validation
  errors returned by the service.
- Transport: direct HTTP with impit. No cookies or browser session required.
- Profile compatibility: `chrome`, `chrome151`, `chrome142`, `chrome136`,
  `firefox`, `firefox158`, and `ios18` all returned HTTP 200 with job data.
  `okhttp5` and `okhttp4` were rejected with an Akamai `403 Access Denied`.

### Verified query

```graphql
query JobSearch($filter: JobSearchInput, $pageRequest: PageRequest) {
  jobSearch(filter: $filter, pageRequest: $pageRequest) {
    content {
      id title slug status employmentType shiftType payLow payHigh payType
      postedAt updatedAt createdAt expiresAt hasExternalApplicationUrl
      displayCompanyName minYearsExp description
      address { city state zipCode location { lat lon } }
      organization { id name premium }
      qualifications { name details type { name } }
    }
    page { number size totalElements totalPages first last }
  }
}
```

### Verified variables

```json
{
  "filter": { "searchText": "icu" },
  "pageRequest": {
    "page": 0,
    "size": 25,
    "sort": { "property": "updatedAt", "direction": "DESC" }
  }
}
```

- `pageRequest.page` is zero based.
- `pageRequest.size` accepts 1 to 100. `size: 150` returned an internal error.
- `pageRequest.sort` is a `SortInput` object with `property` and `direction`.
  A flat string sort is rejected.
- Out of range pages return HTTP 200 with an empty `content` array.

### JobSearchInput fields verified by the service

`searchText`, `locationText`, `licenses`, `specialties`, `employmentTypes`,
`shiftTypes`, `payLow`, `payHigh`, `favorited`, `location`, `radius`.

`licenses` and `specialties` take integer ids. Passing strings returns a type
conversion error. Pagination and sorting are not part of `JobSearchInput`.

### Sort properties

`createdAt`, `updatedAt`, `payHigh`, `name`, `title`, `status`,
`organization.name`, `relevance`, `expiresAt`.

### Verified behavior

| Check | Result |
| --- | --- |
| No filter, size 25 | HTTP 200, 25 jobs, 877 total, 36 pages |
| `searchText=icu` | HTTP 200, 25 jobs, 624 total, 25 pages |
| `locationText=New York` | HTTP 200, 23 jobs, 1 page |
| `searchText=icu` + `locationText=New York` | HTTP 200, matching subset |
| `pageRequest.page=1` | HTTP 200, different first job than page 0 |
| `pageRequest.page=50` | HTTP 200, empty content |
| `pageRequest.size=100` | HTTP 200, 100 jobs |
| `pageRequest.size=150` | HTTP 200 with an internal error message |
| `sort.payHigh DESC` | HTTP 200, highest pay first |
| `sort.updatedAt DESC` | HTTP 200 |
| `okhttp5` profile | HTTP 403 Access Denied |

### Job page URL

`https://www.nurse.com/jobs/{slug}/{id}/` returned HTTP 200 and the same job
title.

## Secondary transport (legacy route)

- Endpoint: `https://www.nurse.com/jobs/api/jobs/job-detail`
- Method: `POST`
- Body: `{ "variables": { direction, size, page, property, params, loggedIn } }`
- Headers seen in the browser: `content-type: application/json`,
  `accept: application/json`, `authorization: Bearer undefined`.
- Response shape: `{ "jobs": [...], "page": {...} }`.
- During verification this route returned HTTP 500 because its upstream proxy
  failed while the direct GraphQL endpoint stayed healthy. The actor keeps it as
  a fallback for the case where the public GraphQL host disappears or changes.

## Failure classification used by the actor

- `403`, `408`, `425`, `429`, `500`, `502`, `503`, `504`, timeouts, and network
  errors: retry with bounded exponential backoff and `Retry-After` when present.
- `403` or an Akamai `Access Denied` page: rotate to the next impit profile
  (`chrome`, `chrome151`, `chrome142`, `firefox`, `firefox158`, `ios18`).
- GraphQL validation error naming an undefined field: remove that field from the
  selection set and retry, up to five fields per run.
- Any other GraphQL error, null body, or unexpected JSON shape: mark the
  transport as failed and try the legacy route.
- Two consecutive failures of a transport: cool that transport down for 60
  seconds instead of retrying it on every page.
- Both transports exhausted: finish with the jobs collected so far. If nothing
  was collected, the run completes with a warning and a status message.
- Unexpected internal errors: fail the run with a non-zero exit code.

## Resilience behavior

- No hardcoded tokens or cookies. The actor only sends endpoint headers the
  service expects and lets impit generate browser-consistent headers.
- One impit client per browser profile, reused across pages.
- Profiles rotate only after a block, timeout, or transport error, so a healthy
  run stays on one coherent fingerprint.
- Response parsing is shape tolerant for `content` and `jobs` collections and
  for `page`, `pagination`, and `pageInfo` metadata.
- Pages are spaced with a short jittered delay.
- The first page has a 3 minute budget, later pages 90 seconds, and the run has
  a 15 minute collection budget.
- If the first page fails with the configured sort, the actor retries once with
  `createdAt` (or `updatedAt` when `createdAt` was already in use).

## Troubleshooting checklist

1. Read this file first.
2. Run the actor with `keyword: "icu"`, `results_wanted: 1` and check the log.
3. If the log says `GraphQL feed failed`, test the endpoint with the query and
   variables above. A `400` with a validation message means the schema changed.
4. A `403 Access Denied` body means the edge rejected the fingerprint. Check the
   profile list against the installed impit version and add the current profiles.
5. A `500` or internal error with `size` above 100 means the page size cap
   changed. Keep the actor at 25.
6. If `jobSearch` is gone or renamed, the legacy route may still work. If both
   are gone, the site moved its search again and this file needs a new discovery
   pass.
7. Never hardcode a token or a captured cookie as a fix. Replay the request that
   the site itself makes.

## Acceptance checks

- `npm start` with keyword `icu`: non-empty dataset, one job per listing.
- Default input (browse URL only): non-empty dataset within five minutes.
- Pagination: `results_wanted: 30`, `max_pages: 2` saves 30 unique jobs.
- Filters: keyword, location, and combined searches return different totals.
- `npm run lint` and `npm test`: zero errors.
