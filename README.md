## What does Nurse.com Jobs Scraper do?

Nurse.com Jobs Scraper collects nursing job listings from Nurse.com and saves one dataset item per job. Start with a keyword such as `icu`, add a city or state, or point the Actor at a Nurse.com jobs browse URL. The dataset includes the job title, employer, location, pay values, employment type, shift, qualifications, description, and public listing URL.

The Actor is built for recruiting research, healthcare workforce analysis, salary review, and scheduled job monitoring. Run it from the Apify Console with the form inputs, or send the same fields through the Apify API, CLI, or a schedule.

## Why use Nurse.com Jobs Scraper?

- **Nursing labor market research** - Compare open roles by specialty, employer, city, state, and shift.
- **Recruiting intelligence** - Build a structured view of nursing demand for a region or a single search term.
- **Compensation review** - Keep the source pay range and pay type next to each job without conversion.
- **Job board monitoring** - Schedule repeat runs to find new listings and track when existing listings change.
- **Export-ready output** - Download the dataset as JSON, CSV, Excel, or XML, or connect it to another Apify integration.

The Actor keeps the values returned by Nurse.com. It does not rewrite titles, convert pay amounts, or fill fields the source leaves empty.

## What data can you extract from Nurse.com?

Each dataset item is one job listing. Fields appear only when Nurse.com provides a value.

| Field                       | Type    | Description                                             |
| --------------------------- | ------- | ------------------------------------------------------- |
| `id`                        | String  | Nurse.com job identifier.                               |
| `slug`                      | String  | Job slug used in the public listing URL.                |
| `url`                       | String  | Public Nurse.com URL for the job.                       |
| `title`                     | String  | Job title.                                              |
| `description_html`          | String  | Job description in the source HTML format.              |
| `description_text`          | String  | Description with markup removed and line breaks kept.   |
| `status`                    | String  | Listing status, such as `ACTIVE`.                       |
| `employmentType`            | String  | Employment type, such as `FULL_TIME`.                   |
| `shiftType`                 | String  | Shift value, such as `DAY`.                             |
| `minYearsExp`               | Number  | Minimum experience value from the listing.              |
| `hasExternalApplicationUrl` | Boolean | Whether the listing uses an external application URL.   |
| `displayCompanyName`        | String  | Company name displayed by the listing, when present.    |
| `payLow`                    | Number  | Lower pay value exactly as returned by Nurse.com.       |
| `payHigh`                   | Number  | Upper pay value exactly as returned by Nurse.com.       |
| `payType`                   | String  | Pay period or type, such as `HOURLY` or `ANNUAL`.       |
| `postedAt`                  | String  | Original posting timestamp.                             |
| `updatedAt`                 | String  | Last update timestamp.                                  |
| `createdAt`                 | String  | Creation timestamp.                                     |
| `expiresAt`                 | String  | Expiration timestamp.                                   |
| `locationCity`              | String  | Listing city.                                           |
| `locationState`             | String  | Listing state.                                          |
| `organizationName`          | String  | Employer or organization name.                          |
| `location`                  | Object  | Nested city, state, ZIP code, latitude, and longitude.  |
| `organization`              | Object  | Nested organization ID, name, and premium flag.         |
| `qualifications`            | Array   | Qualification entries with name, details, and type.     |
| `query`                     | Object  | Search context with keyword, location, and page number. |
| `source`                    | String  | Source identifier, currently `nurse.com`.               |
| `crawledAt`                 | String  | ISO timestamp for when the item was collected.          |

Pay values stay as numeric values. Use `payType` to interpret the period, and check the original listing before reporting a salary range publicly.

## How to use Nurse.com Jobs Scraper

1. Open the Actor in Apify Console.
2. Enter a keyword, a location, or a Nurse.com jobs browse URL.
3. Set `results_wanted` and `max_pages` for the run size.
4. Start the Actor and open the dataset preview.
5. Export the dataset or connect it to your reporting workflow.

The Actor requests 25 jobs per page. It stops when it reaches `results_wanted`, reaches `max_pages`, reaches the last available page, or receives an empty page.

## Supported input methods

You can provide input in two ways:

- **Apify Console form** - Fill in the fields on the Actor page and start the run.
- **JSON input** - Send the same fields through an Apify API call, CLI command, schedule, or another Apify integration.

`keyword` and `location` take precedence over `startUrl`. If either one is present, the Actor searches with those values and ignores the URL. If both are empty, the Actor uses `startUrl`, which defaults to the Nurse.com browse page.

## Input Parameters

| Parameter            | Type    | Required | Default                              | Description                                                                                                                                                |
| -------------------- | ------- | -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startUrl`           | String  | No       | `https://www.nurse.com/jobs/browse/` | Nurse.com jobs browse URL. A path such as `/page-2/` starts from that page. A `q` query value is read as a JSON filter, and `s` selects the sort property. |
| `keyword`            | String  | No       | -                                    | Job title, nursing specialty, or search phrase. Overrides `startUrl`.                                                                                      |
| `location`           | String  | No       | -                                    | City, state, or ZIP code. Overrides `startUrl`. Combine with `keyword` to narrow the search.                                                               |
| `results_wanted`     | Integer | No       | `20`                                 | Maximum number of unique jobs to save. Must be at least 1.                                                                                                 |
| `max_pages`          | Integer | No       | `20`                                 | Maximum number of result pages to request. Must be at least 1.                                                                                             |
| `proxyConfiguration` | Object  | No       | `{"useApifyProxy": false}`           | Optional Apify proxy settings for request routing.                                                                                                         |

## Output Data

| Field                       | Type    | Description                  |
| --------------------------- | ------- | ---------------------------- |
| `id`                        | String  | Job identifier.              |
| `slug`                      | String  | Job slug.                    |
| `url`                       | String  | Public listing URL.          |
| `title`                     | String  | Job title.                   |
| `description_html`          | String  | Source description HTML.     |
| `description_text`          | String  | Plain-text description.      |
| `status`                    | String  | Listing status.              |
| `employmentType`            | String  | Employment type.             |
| `shiftType`                 | String  | Shift type.                  |
| `minYearsExp`               | Number  | Minimum years of experience. |
| `hasExternalApplicationUrl` | Boolean | External application flag.   |
| `displayCompanyName`        | String  | Displayed company name.      |
| `payLow`                    | Number  | Lower pay value.             |
| `payHigh`                   | Number  | Upper pay value.             |
| `payType`                   | String  | Pay period or type.          |
| `postedAt`                  | String  | Posting timestamp.           |
| `updatedAt`                 | String  | Update timestamp.            |
| `createdAt`                 | String  | Creation timestamp.          |
| `expiresAt`                 | String  | Expiration timestamp.        |
| `locationCity`              | String  | City.                        |
| `locationState`             | String  | State.                       |
| `organizationName`          | String  | Employer name.               |
| `location`                  | Object  | Nested location values.      |
| `organization`              | Object  | Nested organization values.  |
| `qualifications`            | Array   | Qualification entries.       |
| `query`                     | Object  | Search context for the item. |
| `source`                    | String  | Source name.                 |
| `crawledAt`                 | String  | Collection timestamp.        |

## Usage Examples

### Collect jobs by keyword

Collect up to 20 ICU jobs from anywhere on Nurse.com.

```json
{
    "keyword": "icu",
    "results_wanted": 20,
    "max_pages": 1
}
```

### Collect jobs by keyword and location

Narrow the search to a city and request more results across several pages.

```json
{
    "keyword": "registered nurse",
    "location": "Texas",
    "results_wanted": 100,
    "max_pages": 5
}
```

### Start from a browse URL

Use a saved browse URL with a page, a sort property, and a JSON filter. The Actor reads those values when `keyword` and `location` are empty.

```json
{
    "startUrl": "https://www.nurse.com/jobs/browse/page-2/?s=updatedAt&q=%7B%22searchText%22%3A%22rn%22%7D",
    "results_wanted": 40,
    "max_pages": 4
}
```

## Sample Output

```json
{
    "id": "8a032086-d7d5-44e3-9262-cff31a01b051",
    "slug": "rn---emergency-services---located-in-klamath-falls-or",
    "url": "https://www.nurse.com/jobs/rn---emergency-services---located-in-klamath-falls-or/8a032086-d7d5-44e3-9262-cff31a01b051/",
    "title": "RN - Emergency Services",
    "description_html": "<p>Provides competent clinical nursing care...</p>",
    "description_text": "Provides competent clinical nursing care...",
    "status": "ACTIVE",
    "employmentType": "FULL_TIME",
    "shiftType": "DAY",
    "minYearsExp": 0,
    "hasExternalApplicationUrl": true,
    "payType": "HOURLY",
    "postedAt": "2026-10-27T10:21:25.887495Z",
    "updatedAt": "2026-10-30T10:29:15.010675947Z",
    "createdAt": "2026-10-27T10:21:25.857572Z",
    "expiresAt": "2026-11-26T10:21:25.889286Z",
    "locationCity": "Klamath Falls",
    "locationState": "OR",
    "organizationName": "Global Medical Response",
    "location": {
        "city": "Klamath Falls",
        "state": "OR",
        "lat": 42.224867,
        "lon": -121.7816704
    },
    "organization": {
        "id": "70987480-d225-47a5-b773-337506311d86",
        "name": "Global Medical Response",
        "premium": false
    },
    "qualifications": [
        {
            "name": "Critical Care",
            "type": "specialty"
        },
        {
            "name": "Registered Nurse (RN)",
            "type": "license"
        }
    ],
    "query": {
        "keyword": "icu",
        "page": 0
    },
    "source": "nurse.com",
    "crawledAt": "2026-10-31T09:11:21.504Z"
}
```

## Tips for Best Results

- Start with one keyword, one location, and a small `results_wanted` value before expanding the run.
- Set `max_pages` high enough for the result count. At 25 jobs per page, 100 results need four pages.
- Use a saved browse URL when you want to repeat a search with the same sort order and filter.
- Review optional fields before analysis. Pay, qualifications, organization details, and timestamps are not present on every listing.
- Schedule the Actor for recurring runs when you need to detect new postings or changed listings.

## Data-quality behavior and limitations

- Empty strings, null values, empty arrays, and empty nested objects are removed from each item.
- Duplicate job IDs are skipped across all pages in a run.
- `description_text` is derived from `description_html` with markup removed. The original HTML stays in a separate field.
- The Actor stops at the requested result count, the page limit, the last page, or an empty page.
- If Nurse.com is temporarily unavailable, the Actor retries both request paths and finishes with the jobs collected so far instead of failing the run. A run that collects nothing ends with a warning and a status message.
- Nurse.com controls which jobs and fields are available. A listing may omit pay, organization, qualification, date, or address values.
- The Actor is intended for Nurse.com jobs pages. It does not expose separate inputs for employment type, shift, pay range, or license filters.
- Public sites change over time. If a run returns fewer jobs than expected, check the dataset preview and the run log before starting a larger run.

## Integrations and exports

- **Google Sheets** - Send job records to a spreadsheet for review.
- **Webhooks** - Start a downstream process when a run finishes.
- **Make or Zapier** - Connect the dataset to a no-code workflow.
- **Apify API** - Read dataset items from your own application.
- **CSV, Excel, JSON, and XML** - Export the dataset in the format your tools accept.

## Frequently Asked Questions

### Can I search by nursing specialty or job title?

Yes. Set `keyword` to a term such as `icu`, `registered nurse`, or `emergency department`.

### Can I filter by location?

Yes. Set `location` to a city, state, or ZIP code. When you provide both `keyword` and `location`, the Actor applies both filters.

### Can I use a custom Nurse.com browse URL?

Yes. Set `startUrl` to a Nurse.com jobs browse URL. The Actor reads a page path such as `/page-2/`, a sort property in `s`, and a JSON filter in `q`. A `keyword` or `location` input overrides the URL search.

### How many jobs can one run collect?

A run is limited by both `results_wanted` and `max_pages`. The Actor also stops at the last page Nurse.com reports.

### Why are some output fields missing?

A field is missing when the source listing does not provide it. Empty values are removed so each record contains only available data.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded as CSV, Excel, JSON, XML, or another supported format.

### Can I run the Actor on a schedule?

Yes. Create a schedule in Apify Console and choose how often the Actor should start. Each run adds a new dataset that you can compare with earlier runs.

### Is it legal to collect Nurse.com job data?

You are responsible for complying with Nurse.com terms, privacy rules, and the laws that apply to your use of public job data. Use the Actor for legitimate research, recruiting, and analysis.

## Related Actors

- [USA Jobs Scraper](https://apify.com/shahidirfan/usa-jobs-scraper) - Collect federal job listings and related employment data from USAJobs.gov.
- [BuiltIn Jobs Scraper](https://apify.com/shahidirfan/builtin-jobs-scraper) - Collect technology job listings for hiring and labor market research.
- [APEC Jobs Scraper](https://apify.com/shahidirfan/apec-jobs-scraper) - Collect professional and executive job listings from APEC.fr.

## Support

For issues or feature requests, use the Issues tab on the Actor page and include the input you used, the run ID, and an example of the unexpected output.

## Legal Notice

This Actor is intended for lawful collection and analysis of publicly available job information. You are responsible for complying with Nurse.com terms of use, privacy requirements, copyright rules, and other applicable regulations.
