## What does Nurse.com Jobs Scraper do?

Nurse.com Jobs Scraper collects structured nursing job listings from Nurse.com for recruiting research, healthcare workforce analysis, salary comparisons, and job monitoring. Provide a Nurse.com jobs browse URL, optionally add a keyword and location, and receive one dataset item per job with title, description, employer, location, pay values, employment details, qualifications, timestamps, and a public job URL.

You can run it from the Apify Console with form inputs or send the same fields as JSON through an Apify API or CLI workflow. Results are stored in an Apify dataset and can be downloaded or passed to downstream tools.

## Why use Nurse.com Jobs Scraper?

- **Nursing labor market research** - Compare the roles, locations, employers, shifts, and requirements appearing on Nurse.com.
- **Recruiting intelligence** - Build a structured view of nursing demand by keyword, city, state, or ZIP code.
- **Compensation analysis** - Review the numeric pay range fields together with the source `payType` value.
- **Job aggregation** - Use public job URLs, descriptions, organization data, and timestamps in an internal job dataset.
- **Repeatable collection** - Control the result count and page limit for small checks or scheduled monitoring runs.
- **Export-ready data** - Download the dataset as JSON, CSV, Excel, XML, or another format supported by Apify.

The Actor does not convert pay values, rewrite job titles, or fill missing listing information. It preserves the values returned by Nurse.com and records the search context used for each item.

## What data can you extract from Nurse.com?

Each saved dataset item represents one Nurse.com job listing. Fields are included only when a value is available.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Nurse.com job identifier. |
| `slug` | String | Job slug used to build the public listing URL. |
| `url` | String | Public Nurse.com URL for the job. |
| `title` | String | Job title. |
| `description_html` | String | Job description in the source HTML format. |
| `description_text` | String | Clean text version of the description, with markup removed. |
| `status` | String | Status value returned by Nurse.com. |
| `employmentType` | String | Employment type, such as `FULL_TIME`, when provided. |
| `shiftType` | String | Shift type, such as `DAY`, when provided. |
| `minYearsExp` | Number | Minimum experience value returned by the listing. |
| `hasExternalApplicationUrl` | Boolean | Indicates whether the listing has an external application URL. |
| `displayCompanyName` | String | Company name displayed by the listing, when available. |
| `payLow` | Number | Lower numeric pay value returned by Nurse.com. |
| `payHigh` | Number | Upper numeric pay value returned by Nurse.com. |
| `payType` | String | Pay period or type returned by Nurse.com, such as `ANNUAL`. |
| `postedAt` | String | Original posting timestamp, when available. |
| `updatedAt` | String | Last update timestamp, when available. |
| `createdAt` | String | Creation timestamp, when available. |
| `expiresAt` | String | Expiration timestamp, when available. |
| `locationCity` | String | Listing city. |
| `locationState` | String | Listing state. |
| `organizationName` | String | Employer or organization name. |
| `location` | Object | Nested location data: `city`, `state`, `zipCode`, `lat`, and `lon`. |
| `organization` | Object | Nested organization data: `id`, `name`, and `premium`. |
| `qualifications` | Array | Qualification entries with `name`, `details`, and `type`. |
| `query` | Object | Collection context with `keyword`, `location`, and zero-based `page`. |
| `source` | String | Source identifier, currently `nurse.com`. |
| `crawledAt` | String | ISO timestamp for when the item was collected. |

Pay fields are kept as numeric values exactly as returned by Nurse.com. Use `payType` and the original listing to interpret the unit or period; the Actor does not perform currency conversion or normalize the numeric amount.

## How to use Nurse.com Jobs Scraper

1. Open the Actor in Apify Console.
2. Enter a Nurse.com jobs browse URL, or keep the default browse URL.
3. Optionally enter a keyword such as `icu` and a location such as `New York`.
4. Set `results_wanted` and `max_pages` for the size of the run.
5. Run the Actor and open the dataset preview.
6. Export the results or connect the dataset to your recruiting, research, or reporting workflow.

The default collection page contains up to 25 jobs. The Actor continues through subsequent pages until it reaches `results_wanted`, reaches `max_pages`, or Nurse.com returns no more jobs. The page size is fixed by the Actor and is not an input option.

## Supported input methods

You can provide inputs in either of these ways:

- **Apify Console form** - Enter the fields in the Actor's input form.
- **JSON input** - Send the same fields when starting the Actor through an Apify API, CLI, schedule, or another Apify integration.

The main search can be expressed through `keyword` and `location`, or through a Nurse.com browse URL in `startUrl`. If the URL contains supported browse state, the Actor reads the page number, sort property, and JSON filter in the URL. Explicit `keyword` and `location` values take precedence over the corresponding search and location values from that URL.

## Input Parameters

| Parameter | Type | Required | Default or prefill | Description |
|-----------|------|----------|--------------------|-------------|
| `startUrl` | String | No | `https://www.nurse.com/jobs/browse/` | Nurse.com jobs browse URL. A page path such as `/page-2/` can start collection from that zero-based page number. |
| `keyword` | String | No | Prefill: `icu` | Search keyword, nursing specialty, or job title. Empty at runtime if not supplied. |
| `location` | String | No | Prefill: `New York` | City, state, or ZIP code filter. Empty at runtime if not supplied. |
| `results_wanted` | Integer | No | `20` | Maximum number of unique job items to save. Must be at least 1. |
| `max_pages` | Integer | No | `20` | Maximum number of result pages to request. Must be at least 1. |
| `proxyConfiguration` | Object | No | `{"useApifyProxy": false}` | Optional Apify proxy settings for request routing. |

The keyword and location values shown in the schema are Console prefills, not runtime defaults. If you submit an empty input, the Actor uses the default browse URL, no keyword filter, no location filter, a result limit of 20, and a page limit of 20.

## Usage Examples

### Basic Nurse.com job collection

Collect up to 20 jobs from the default Nurse.com browse page.

```json
{
  "startUrl": "https://www.nurse.com/jobs/browse/",
  "results_wanted": 20,
  "max_pages": 1
}
```

### Keyword and location search

Collect ICU-related jobs for a specific location, with a larger result and page limit.

```json
{
  "keyword": "icu",
  "location": "Texas",
  "results_wanted": 50,
  "max_pages": 5
}
```

### Start from a specific browse page and URL filter

Start at a later browse page and carry a Nurse.com JSON search filter in the URL. The URL filter is decoded by the Actor; `keyword` or `location` inputs would override matching values.

```json
{
  "startUrl": "https://www.nurse.com/jobs/browse/page-2/?s=updatedAt&q=%7B%22searchText%22%3A%22rn%22%7D",
  "results_wanted": 40,
  "max_pages": 4
}
```

## Sample Output

The following is one representative dataset item. Optional fields are absent when Nurse.com does not provide a value.

```json
{
  "id": "c307cfb1-faf2-4cbc-a6ea-de71cbd05c1a",
  "slug": "rn-clinical-nurse-ii-lactation-consultant-nicu-and-pediatric-cardiac-icu",
  "url": "https://www.nurse.com/jobs/rn-clinical-nurse-ii-lactation-consultant-nicu-and-pediatric-cardiac-icu/c307cfb1-faf2-4cbc-a6ea-de71cbd05c1a/",
  "title": "RN Clinical Nurse II Lactation Consultant NICU and Pediatric Cardiac ICU",
  "description_html": "<p>Provides competent clinical nursing care...</p>",
  "description_text": "Provides competent clinical nursing care...",
  "status": "ACTIVE",
  "employmentType": "FULL_TIME",
  "shiftType": "DAY",
  "minYearsExp": 0,
  "hasExternalApplicationUrl": true,
  "organizationName": "UNC Health",
  "locationCity": "Chapel Hill",
  "locationState": "NC",
  "location": {
    "city": "Chapel Hill",
    "state": "NC",
    "lat": 35.9131996,
    "lon": -79.0558445
  },
  "organization": {
    "name": "UNC Health",
    "premium": true
  },
  "qualifications": [
    {
      "name": "ICU",
      "type": "specialty"
    }
  ],
  "query": {
    "keyword": "icu",
    "location": "New York",
    "page": 0
  },
  "source": "nurse.com",
  "crawledAt": "2026-03-31T14:50:00.000Z"
}
```

## Tips for Best Results

- **Test focused searches first** - Start with one keyword, one location, and a small `results_wanted` value before expanding the run.
- **Match the page limit to the result limit** - Increase `max_pages` when you request more jobs, while keeping both limits appropriate for the search.
- **Use a saved browse URL for repeatable searches** - A Nurse.com browse URL can preserve a page, sort value, and JSON filter that you want to reuse.
- **Review optional fields before analysis** - Pay, qualifications, organization details, and dates may be absent from individual listings.
- **Check the dataset preview** - Confirm titles, locations, descriptions, and URLs before scheduling larger runs or exporting the data.

## Data-quality behavior and limitations

- Empty strings, null values, empty arrays, and empty nested objects are removed from each dataset item.
- `description_text` is derived from `description_html` by removing markup and preserving readable line breaks. The original HTML is retained separately when available.
- Duplicate job IDs are skipped during a run, including duplicates encountered across pages.
- The Actor stops when it reaches the requested result count, reaches the page limit, reaches the last available page, or receives an empty page.
- Nurse.com controls which jobs and fields are available. A listing may omit pay, organization, qualification, date, address, or application information.
- Pay values are not converted, rounded, or assigned a currency by the Actor.
- The Actor is intended for Nurse.com jobs browse URLs and does not expose separate inputs for employment type, shift type, pay range, specialty, or license filters. Such filters are not documented as standalone Actor options.
- The public source can change. A changed page, unavailable listing, or temporary access issue can reduce the number of returned items or require a later retry.

## Integrations and exports

Apify datasets can be used with common research and hiring workflows:

- **JSON, CSV, Excel, and XML** - Download the collected jobs in formats suited to code, spreadsheets, or system imports.
- **Apify API** - Read dataset items programmatically after a run.
- **Google Sheets** - Move job records into a spreadsheet for review and analysis.
- **Webhooks** - Trigger a downstream workflow when a run finishes.
- **Make or Zapier** - Connect the dataset to no-code automation where supported by your Apify setup.

## Frequently Asked Questions

### Can I search by nursing specialty or job title?

Yes. Set `keyword` to a term such as `icu`, `registered nurse`, or another search phrase accepted by Nurse.com.

### Can I filter by location?

Yes. Set `location` to a city, state, or ZIP code. When both `keyword` and `location` are provided, both values are applied to the collection filter.

### Can I use a custom Nurse.com browse URL?

Yes. Set `startUrl` to a Nurse.com jobs browse URL. The Actor also reads a page number, sort property, and JSON filter when they are present in the URL.

### How many jobs can one run collect?

The run is limited by both `results_wanted` and `max_pages`. The Actor also stops when Nurse.com returns no more jobs or reports the last page.

### Why are some output fields missing?

Fields are missing when the source listing does not provide them. Empty values are removed from the output so records contain only available data.

### Can I export Nurse.com jobs to CSV or Excel?

Yes. Download the Apify dataset as CSV, Excel, JSON, XML, or another supported dataset format.

### Is it legal to collect Nurse.com job data?

You are responsible for complying with Nurse.com's terms, applicable privacy requirements, and all laws that apply to your intended use of public job data. Use the Actor for legitimate research, recruiting, and analysis workflows.

## Related Actors

- [USA Jobs Scraper](https://apify.com/shahidirfan/usa-jobs-scraper) - Collect federal job listings and related employment data from USAJobs.gov.
- [BuiltIn Jobs Scraper](https://apify.com/shahidirfan/builtin-jobs-scraper) - Collect technology job listings for hiring and labor market research.
- [APEC Jobs Scraper](https://apify.com/shahidirfan/apec-jobs-scraper) - Collect professional and executive job listings from APEC.fr.

## Support

For issues or feature requests, use the Issues tab on the Actor page and include the input used, the run ID, and an example of the unexpected output when possible.

## Legal Notice

This Actor is intended for lawful collection and analysis of publicly available job information. You are responsible for complying with Nurse.com's terms of use, privacy requirements, copyright rules, and other applicable regulations.
