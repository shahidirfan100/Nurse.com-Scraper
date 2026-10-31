# API Discovery - Nurse.com Jobs

Last verified: 2026-10-31

## Current site shape

- Nuxt 3 server-rendered application. The browse page carries hydration data in
  `<script id="__NUXT_DATA__">` as a devalue payload.
- The public site is fronted by Akamai. Requests without a real browser TLS
  fingerprint receive `403 Access Denied` with a short Akamai error page.
- The previous note describing Cloudflare protection was outdated. The previous
  feed endpoint below is still live.

## Selected API (primary)

- Endpoint: `https://www.nurse.com/jobs/api/jobs/job-detail`
- Method: `POST`
- Auth: none for anonymous search. The browser sends
  `Authorization: Bearer <sharedAccessToken>` where the value is `undefined`
  for anonymous visitors. Requests succeed without the header.
- Required headers: `content-type: application/json`. The route is a Nuxt server
  handler, so a body without JSON content type falls through to a 404 page.
  `accept`, `origin`, and `referer` are sent for context.
- Pagination: `variables.page` (zero-based), `variables.size` (verified working
  range 1 to 100; `size >= 150` returns HTTP 500). The actor uses 25 to stay
  aligned with the rendered page pagination.
- Sort: `variables.property`, `variables.direction`.
- Filters: `variables.params` (`searchText`, `locationText`, `licenses`,
  `specialties`, `employmentTypes`, `shiftTypes`, `payLow`, `favorited`).

### Verified request body

```json
{
    "variables": {
        "direction": "DESC",
        "size": 25,
        "page": 0,
        "property": "updatedAt",
        "params": {
            "favorited": false,
            "searchText": "icu",
            "locationText": null
        },
        "loggedIn": false
    }
}
```

### Verified response shape

```json
{
    "jobs": [
        {
            "id": "uuid",
            "title": "string",
            "slug": "string",
            "description": "html",
            "employmentType": "FULL_TIME",
            "shiftType": "DAY",
            "status": "ACTIVE",
            "payLow": 123456,
            "payHigh": 234567,
            "payType": "ANNUAL",
            "postedAt": "2026-10-27T10:21:25.887495Z",
            "updatedAt": "2026-10-30T10:29:15.010675947Z",
            "createdAt": "2026-10-27T10:21:25.857572Z",
            "expiresAt": "2026-11-26T10:21:25.889286Z",
            "hasExternalApplicationUrl": true,
            "displayCompanyName": null,
            "minYearsExp": 0,
            "address": {
                "city": "Klamath Falls",
                "state": "OR",
                "zipCode": "",
                "location": { "lat": 42.224867, "lon": -121.7816704 }
            },
            "organization": {
                "id": "uuid",
                "name": "Global Medical Response",
                "premium": false
            },
            "qualifications": [{ "name": "Critical Care", "details": null, "type": { "name": "specialty" } }]
        }
    ],
    "page": {
        "first": true,
        "last": false,
        "number": 0,
        "size": 25,
        "totalElements": 836,
        "totalPages": 34
    }
}
```

## Verified behavior

| Check                                      | Result                              |
| ------------------------------------------ | ----------------------------------- |
| `page=0`, `1`, `2`, `5`                    | 200, 25 jobs each, no overlap       |
| `page=100` beyond range                    | 200, empty `jobs`, `page.last=true` |
| `searchText=icu`                           | 200, 581 total elements             |
| `locationText=New York`                    | 200, 23 total elements              |
| `searchText=icu` + `locationText=New York` | 200, 4 total elements               |
| `size=1`, `50`, `100`                      | 200, honored                        |
| `size>=150`                                | 500 JSON error                      |
| `GET`                                      | 404 HTML page                       |
| `POST` with `{}`                           | 404 HTML page                       |
| `POST` without content type                | 404 HTML page                       |

## Browser profile matrix (impit 0.14.8, same request)

| Profile                                                                                                                                    | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| no profile                                                                                                                                 | 403    |
| chrome, chrome100, chrome101, chrome104, chrome107, chrome110, chrome116, chrome124, chrome125, chrome131, chrome136, chrome142, chrome151 | 200    |
| firefox, firefox128, firefox133, firefox135, firefox144, firefox158                                                                        | 200    |
| ios18                                                                                                                                      | 200    |
| okhttp, okhttp3, okhttp4, okhttp5                                                                                                          | 403    |

The working pool used by the actor is `chrome`, `chrome151`, `chrome142`,
`firefox`, `firefox144`, `ios18`. The pool rotates only after a failed request.

## Secondary transport (rendered page)

The server-rendered browse page embeds the same job list and page metadata, so
it works as a fallback when the feed route changes or is blocked.

- URL: `https://www.nurse.com/jobs/browse/` for page 0, then
  `https://www.nurse.com/jobs/browse/page-{n}/`.
- Filters: `?q=<url-encoded JSON>` and `?s=<sort property>`.
- Data: `__NUXT_DATA__` script, parsed with devalue plus Nuxt revivers
  (`ShallowReactive`, `ShallowRef`, `EmptyRef`, and similar).
- The jobs container is located recursively by looking for an object with a
  non-empty `jobs` array.

Verified parity with the feed:

| Page           | API first id   | Rendered page first id | Meta                |
| -------------- | -------------- | ---------------------- | ------------------- |
| 0              | `8a032086-...` | `8a032086-...`         | total 836, pages 34 |
| 1              | `72670e29-...` | matching page 1        | total 836, pages 34 |
| 2              | -              | matching page 2        | total 836, pages 34 |
| filtered `icu` | -              | same list              | total 581, pages 24 |

The rendered page path uses the same zero-based page index as the feed. Page
sizes differ internally (25 per rendered page), which is why the actor requests
25 items per feed page.

## External cross-check

A public Apify actor at `https://apify.com/alexist/nurse-jobs-search-scraper`
lists the same browse-page URLs (`/jobs/browse/page-1/`, `/jobs/browse/page-2/`)
and publishes records with the same keys found in the hydration payload
(`address.location`, `pay_type`, `min_years_exp`, `qualifications[].type.name`).
That confirms the rendered page carries the full job list and that a browser is
not required to obtain it.

## Failure classification used by the actor

- `403`, `408`, `425`, `429`, `500`, `502`, `503`, `504`: retry with another
  browser profile, bounded exponential backoff, `Retry-After` when present.
- `400`, `404`, `405`: permanent for that transport, switch to the rendered page.
- Non-JSON body or missing job collection: treat as a shape change, log the
  actual top-level keys, switch to the rendered page.
- Empty `jobs` array: valid empty result, stop pagination without error.
- Both transports exhausted: fail the run with a non-zero exit code.

Akamai sets an `AKA_A2` cookie on rendered-page responses. Each impit client
keeps its own cookie jar so a session stays coherent if the edge starts requiring
that cookie on feed requests. A profile rotation creates a fresh cookie jar.

## Why the old notes were replaced

- `Cloudflare` no longer describes the edge. Akamai returns the block page.
- The old actor required a browser (Playwright Firefox) to call the feed. A
  browser profile in impit is sufficient, so the browser dependency is gone.
- The old schema prefilled every field, which fails the Apify Store health-test
  convention and mixes search modes. The new schema keeps one prefill and one
  matching default on `startUrl` only.

## Acceptance checks

- `npm start` with keyword `icu`: non-empty dataset, no browser process.
- Forced feed failure: rendered page returns the same jobs and pagination.
- Forced total failure: exit code 1 with a clear error message.
- `npm run lint`: zero errors.
