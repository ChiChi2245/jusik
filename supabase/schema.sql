-- Core tables for the institutional portfolio dashboard MVP

create table if not exists institutions (
  id bigserial primary key,
  name text not null,
  country_code char(2),
  institution_type text, -- e.g. pension, asset_manager
  source text, -- DART, SEC_13F
  external_id text, -- DART corp_code or SEC CIK
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists institutions_source_external_id_uidx
  on institutions (source, external_id)
  where external_id is not null;

create index if not exists institutions_name_idx on institutions (name);

create table if not exists institutions_aliases (
  id bigserial primary key,
  institution_id bigint not null references institutions(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists institutions_aliases_uidx
  on institutions_aliases (institution_id, alias);

create table if not exists filings (
  id bigserial primary key,
  institution_id bigint references institutions(id),
  source text not null, -- DART, SEC_13F
  filing_type text not null, -- DART_SHAREHOLDING, DART_ANNUAL, SEC_13F
  filing_date date not null,
  report_period date,
  external_id text, -- filing id from source
  raw_url text,
  raw_storage_path text,
  ingested_at timestamptz not null default now()
);

create unique index if not exists filings_source_external_id_uidx
  on filings (source, external_id)
  where external_id is not null;

create index if not exists filings_institution_date_idx
  on filings (institution_id, filing_date);

create table if not exists holdings_raw (
  id bigserial primary key,
  filing_id bigint not null references filings(id),
  payload jsonb not null,
  inserted_at timestamptz not null default now()
);

create table if not exists securities_master (
  id bigserial primary key,
  name text,
  ticker text,
  isin text,
  cusip text,
  figi text,
  exchange text,
  country_code char(2),
  sector text,
  created_at timestamptz not null default now()
);

create unique index if not exists securities_master_figi_uidx
  on securities_master (figi)
  where figi is not null;

create index if not exists securities_master_ticker_idx on securities_master (ticker);

create table if not exists holdings_normalized (
  id bigserial primary key,
  filing_id bigint not null references filings(id),
  institution_id bigint not null references institutions(id),
  security_id bigint references securities_master(id),
  target_corp_code text,
  target_corp_name text,
  reporter_name text,
  report_type text,
  issuer_name text,
  title_of_class text,
  cusip text,
  put_call text,
  investment_discretion text,
  voting_auth_sole numeric,
  voting_auth_shared numeric,
  voting_auth_none numeric,
  reported_currency text,
  value numeric,
  shares numeric,
  weight numeric,
  rank integer,
  as_of_date date,
  created_at timestamptz not null default now()
);

create unique index if not exists holdings_norm_filing_security_uidx
  on holdings_normalized (filing_id, security_id)
  where security_id is not null;

create index if not exists holdings_norm_institution_date_idx
  on holdings_normalized (institution_id, as_of_date);

create index if not exists holdings_norm_security_idx
  on holdings_normalized (security_id);

create index if not exists holdings_norm_target_corp_idx
  on holdings_normalized (target_corp_code);

create table if not exists etl_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  message text
);

create table if not exists etl_state (
  id bigserial primary key,
  key text not null unique,
  value text,
  updated_at timestamptz not null default now()
);


create or replace view v_institutions as
select
  id,
  name,
  country_code,
  institution_type,
  source,
  external_id,
  active
from institutions
where active = true;

create or replace view v_institution_summary as
with latest_dates as (
  select institution_id, max(as_of_date) as as_of_date
  from holdings_normalized
  group by institution_id
)
select
  h.institution_id,
  l.as_of_date,
  count(*) as positions,
  sum(case when h.reported_currency = 'USD' then h.value else null end) as total_value_usd,
  sum(h.shares) as total_shares
from holdings_normalized h
join latest_dates l
  on h.institution_id = l.institution_id and h.as_of_date = l.as_of_date
group by h.institution_id, l.as_of_date;

create or replace view v_institution_holdings_latest as
with latest_dates as (
  select institution_id, max(as_of_date) as as_of_date
  from holdings_normalized
  group by institution_id
)
select
  h.institution_id,
  h.as_of_date,
  coalesce(h.issuer_name, h.target_corp_name) as display_name,
  h.title_of_class,
  h.cusip,
  h.reported_currency,
  h.value,
  h.shares,
  h.weight,
  h.report_type
from holdings_normalized h
join latest_dates l
  on h.institution_id = l.institution_id and h.as_of_date = l.as_of_date;

create or replace view v_institution_holdings_latest_enriched as
with latest_dates as (
  select institution_id, max(as_of_date) as as_of_date
  from holdings_normalized
  group by institution_id
)
select
  h.institution_id,
  h.as_of_date,
  coalesce(h.issuer_name, h.target_corp_name, s.name) as display_name,
  h.title_of_class,
  h.cusip,
  s.ticker,
  s.sector,
  h.reported_currency,
  h.value,
  h.shares,
  h.weight,
  h.report_type
from holdings_normalized h
left join securities_master s on s.id = h.security_id
join latest_dates l
  on h.institution_id = l.institution_id and h.as_of_date = l.as_of_date;

create or replace view v_institution_sector_latest as
with latest_dates as (
  select institution_id, max(as_of_date) as as_of_date
  from holdings_normalized
  group by institution_id
)
select
  h.institution_id,
  h.as_of_date,
  coalesce(s.sector, 'Unknown') as sector,
  sum(h.value) as total_value,
  sum(h.shares) as total_shares
from holdings_normalized h
left join securities_master s on s.id = h.security_id
join latest_dates l
  on h.institution_id = l.institution_id and h.as_of_date = l.as_of_date
group by h.institution_id, h.as_of_date, coalesce(s.sector, 'Unknown');

create or replace view v_institution_timeseries as
select
  institution_id,
  as_of_date,
  reported_currency,
  sum(value) as total_value,
  sum(shares) as total_shares,
  count(*) as positions
from holdings_normalized
group by institution_id, as_of_date, reported_currency;
