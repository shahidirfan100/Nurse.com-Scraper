# Nurse.com Jobs Scraper

Extract Nurse.com job listings for recruiting research, market analysis, and nursing job monitoring. Collect structured records with compensation, organization, location, and normalized description fields. The actor supports reliable pagination and clean dataset output.

## Features

- **Nurse.com jobs extraction** - Collect active nursing job records.
- **Keyword and location filtering** - Focus results by specialty or geography.
- **Automatic pagination** - Fetch multiple pages until limits are reached.
- **Clean descriptions** - Returns both `description_html` and `description_text`.
- **Null-free output** - Empty values are removed from dataset items.

## Use Cases

### Hiring Intelligence
Track demand by role, region, and employer to support recruiting strategy.

### Compensation Monitoring
Analyze pay range trends across nursing specialties and locations.

### Workforce Analytics
Build datasets for dashboards, forecasting, and operational reporting.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | `https://www.nurse.com/jobs/browse/` | Start browse URL. |
| `keyword` | String | No | `icu` | Keyword or job title filter. |
| `location` | String | No | `New York` | City, state, or zip filter. |
| `results_wanted` | Integer | No | `20` | Maximum number of jobs to save. |
| `max_pages` | Integer | No | `20` | Maximum pages to request. |
| `proxyConfiguration` | Object | No | — | Optional proxy settings. |

---

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique job ID. |
| `slug` | String | Job slug. |
| `url` | String | Public Nurse.com job URL. |
| `title` | String | Job title. |
| `description_html` | String | Original HTML description. |
| `description_text` | String | Clean plain-text description. |
| `status` | String | Job status. |
| `employmentType` | String | Employment type. |
| `shiftType` | String | Shift type. |
| `minYearsExp` | Number | Minimum years of experience. |
| `hasExternalApplicationUrl` | Boolean | External application flag. |
| `displayCompanyName` | String | Display company name. |
| `payLow` | Number | Lower pay bound (cents). |
| `payHigh` | Number | Upper pay bound (cents). |
| `payType` | String | Pay period type. |
| `postedAt` | String | Posted timestamp (ISO). |
| `updatedAt` | String | Updated timestamp (ISO). |
| `createdAt` | String | Created timestamp (ISO). |
| `expiresAt` | String | Expiration timestamp (ISO). |
| `locationCity` | String | City. |
| `locationState` | String | State. |
| `organizationName` | String | Organization name. |
| `location` | Object | Nested location details. |
| `organization` | Object | Nested organization details. |
| `qualifications` | Array | Qualification entries. |
| `query` | Object | Query context used for the record. |
| `source` | String | Source site identifier. |
| `crawledAt` | String | Extraction timestamp (ISO). |

---

## Usage Examples

### Basic Extraction

```json
{
  "startUrl": "https://www.nurse.com/jobs/browse/",
  "results_wanted": 20
}
```

### Keyword and Location

```json
{
  "keyword": "icu",
  "location": "Texas",
  "results_wanted": 50,
  "max_pages": 5
}
```

### URL-Driven Start

```json
{
  "startUrl": "https://www.nurse.com/jobs/browse/?q={\"searchText\":\"rn\"}",
  "results_wanted": 40,
  "max_pages": 4
}
```

---

## Sample Output

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
  "payType": "ANNUAL",
  "locationCity": "Chapel Hill",
  "locationState": "NC",
  "organizationName": "UNC Health",
  "source": "nurse.com",
  "crawledAt": "2026-03-31T14:50:00.000Z"
}
```

---

## Tips for Best Results

### Start with Small Runs
- Use `results_wanted: 20` for quick validation.

### Increase Volume Gradually
- Raise `results_wanted` and `max_pages` together for larger collection.

### Keep Filters Focused
- Combine `keyword` and `location` to improve relevancy.

---

## Integrations

- **Google Sheets** - Reporting and analysis
- **Airtable** - Searchable data tables
- **Slack** - Alerts and notifications
- **Webhooks** - Pipeline ingestion
- **Make** - Workflow automation
- **Zapier** - No-code integrations

### Export Formats

- **JSON** - API and code workflows
- **CSV** - Spreadsheet analysis
- **Excel** - Business reporting
- **XML** - System integrations

---

## Frequently Asked Questions

### Does this actor support pagination?
Yes. It requests multiple pages until `results_wanted` or `max_pages` is reached.

### Can I filter by keyword and location?
Yes. Use `keyword` and `location` together for targeted results.

### Why do some records have fewer fields?
Some listings do not provide all attributes. Empty values are removed automatically.

### What is the difference between `description_html` and `description_text`?
`description_html` is the original markup, while `description_text` is clean readable text.

### Can I start from a custom browse URL?
Yes. Set `startUrl` to any supported Nurse.com browse URL.

---

## Support

For issues or feature requests, use support channels in the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Schedules](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for lawful data collection. You are responsible for complying with website terms, privacy requirements, and applicable regulations.
