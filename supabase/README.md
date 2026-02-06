# Supabase MVP Setup

This folder contains a minimal Supabase backend plan for the institutional portfolio dashboard.

## Files
- `supabase/schema.sql` Core tables and indexes
- `supabase/seed.sql` Sample institutions list
- `supabase/cron.sql` Daily schedule (KST 06:00)
- `supabase/functions/refresh-portfolio/index.ts` Edge Function skeleton

## Step 1. Create Supabase Project
- Use the Supabase dashboard to create a new project (Free plan is fine for MVP).

## Step 2. Run SQL in Supabase SQL Editor
Run these in order:
1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/cron.sql`

## Step 2.1 Create Storage Bucket
Create a bucket named `raw-filings` for SEC/DART raw files.

## Step 3. Add Secrets
In Supabase project settings, add the following secrets in Vault:
- `project_url`
- `service_role_key`

And in Edge Function secrets (Environment Variables):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DART_API_KEY`
- `FIGI_API_KEY` (optional)
- `SEC_USER_AGENT` (required for SEC downloads)
- `SEC_13F_DOWNLOAD` (optional, set to `1` to download + parse datasets)

Never paste or store `service_role_key` in any public place. Rotate keys if exposed.
Set `SEC_USER_AGENT` to a string that identifies your app and contact email.

## Notes on 13F Parsing
- 13F data sets are large; parsing inside Edge Functions may hit memory/time limits on Free plan.
- If parsing fails, keep `SEC_13F_DOWNLOAD=1` to store ZIPs only, and parse later in a bigger environment.

## API (Supabase REST)
Supabase exposes views as REST endpoints:
- `/rest/v1/v_institutions`
- `/rest/v1/v_institution_summary`
- `/rest/v1/v_institution_holdings_latest`
- `/rest/v1/v_institution_holdings_latest_enriched`
- `/rest/v1/v_institution_sector_latest`
- `/rest/v1/v_institution_timeseries`

Examples:
```
GET /rest/v1/v_institutions?select=id,name,country_code
GET /rest/v1/v_institution_summary?institution_id=eq.1
GET /rest/v1/v_institution_holdings_latest_enriched?institution_id=eq.1&order=value.desc&limit=20
GET /rest/v1/v_institution_sector_latest?institution_id=eq.1
GET /rest/v1/v_institution_timeseries?institution_id=eq.1&order=as_of_date.asc
```

## Step 4. Deploy Edge Function
Use the Supabase CLI to deploy `refresh-portfolio`.

## Notes
- The cron schedule uses UTC 21:00 to target KST 06:00. Verify timezone behavior in your project settings.
- SEC 13F data updates quarterly. Daily runs will only update when a new dataset is released.
- Open DART API key is required for domestic filings.
