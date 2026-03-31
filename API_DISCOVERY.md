# API Discovery - Nurse.com

## Selected API
- Endpoint: `https://www.nurse.com/jobs/api/jobs/job-detail`
- Method: `POST`
- Auth: Sends `Authorization: Bearer undefined` from browser context
- Pagination: `variables.page` (0-based), `variables.size`
- Sort: `variables.property`, `variables.direction`
- Filters: `variables.params` (for example `searchText`, `locationText`, `licenses`, `specialties`, `employmentTypes`, `shiftTypes`, `payLow`, `favorited`)

## Verified Request Body Shape
```json
{
  "variables": {
    "direction": "DESC",
    "size": 25,
    "page": 1,
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

## Verified Response Shape
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
      "postedAt": "2026-01-29T11:48:38.236063Z",
      "updatedAt": "2026-03-31T00:33:02.352023Z",
      "createdAt": "2026-01-29T11:48:38.216478Z",
      "expiresAt": "2026-04-29T13:01:00.066788Z",
      "hasExternalApplicationUrl": true,
      "displayCompanyName": null,
      "minYearsExp": 0,
      "address": {
        "city": "Chapel Hill",
        "state": "NC",
        "zipCode": "",
        "location": {
          "lat": 35.9131996,
          "lon": -79.0558445
        }
      },
      "organization": {
        "id": "uuid",
        "name": "UNC Health",
        "premium": true
      },
      "qualifications": [
        {
          "name": "ICU",
          "details": null,
          "type": {
            "name": "specialty"
          }
        }
      ],
      "personalization": {
        "application": null,
        "favorited": null
      }
    }
  ],
  "page": {
    "first": false,
    "last": false,
    "number": 1,
    "size": 25,
    "totalElements": 3104,
    "totalPages": 621
  }
}
```

## Field Coverage vs Previous Actor
- Previous actor fields: title, company, category, location, date_posted, description, url.
- New actor fields: id, slug, url, title, description, status, employmentType, shiftType, minYearsExp, hasExternalApplicationUrl, payLow, payHigh, payType, postedAt, updatedAt, createdAt, expiresAt, location object, organization object, qualifications array, plus query metadata and crawl timestamp.

## Notes
- Direct HTTP to `www.nurse.com` is Cloudflare-protected (403) in non-browser mode.
- Browser-based API calls succeed and return structured JSON without HTML parsing.
