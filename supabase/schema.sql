-- =============================================================
-- EA TERMINAL — Supabase schema
--
-- Apply with the SQL editor in the Supabase dashboard, or via:
--   supabase db push
--
-- This file is idempotent: every statement uses IF NOT EXISTS or
-- DROP+CREATE, so it can be re-run safely during development.
-- =============================================================

-- ---- Extensions ---------------------------------------------------
create extension if not exists "pgcrypto";

-- ---- TESTS --------------------------------------------------------
-- One row per uploaded MT5 Strategy Tester report.
create table if not exists public.tests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Identity
  ea_name         text not null,
  ea_version      text,
  symbol          text not null,
  timeframe       text,
  period_start    date,
  period_end      date,
  broker          text,
  currency        text,
  initial_deposit numeric,
  leverage        text,

  -- Promoted (indexed) headline metrics
  total_net_profit          numeric,
  profit_factor             numeric,
  expected_payoff           numeric,
  recovery_factor           numeric,
  sharpe_ratio              numeric,
  balance_dd_max_pct        numeric,
  equity_dd_max_pct         numeric,
  total_trades              integer,
  win_rate                  numeric,

  -- Flexible blobs
  inputs          jsonb not null default '{}'::jsonb,
  results         jsonb not null default '{}'::jsonb,
  equity_curve    jsonb not null default '[]'::jsonb,

  -- User-added
  rating          smallint check (rating between 0 and 5),
  status          text not null default 'active',
  group_label     text,
  notes           text,

  -- Provenance
  source_format   text not null check (source_format in ('xlsx','html')),
  source_filename text,
  raw_curve_path  text,
  file_hash       text,
  uploaded_at     timestamptz not null default now(),

  -- Short display label like `A1`, `A2`, `B1`. Letter is assigned
  -- per unique ea_name in upload order; sequence increments per
  -- (user_id, ea_name) and is never reused after a row is deleted.
  -- Composed at render time with symbol + version into a full
  -- label like `US30-v040525-A1`.
  test_code       text
);

-- Hash dedupe is per-user, not global (different users can upload same file).
create unique index if not exists tests_user_filehash_uq
  on public.tests (user_id, file_hash);

create index if not exists tests_user_ea_idx
  on public.tests (user_id, ea_name);
create index if not exists tests_perf_idx
  on public.tests (user_id, profit_factor desc);
create index if not exists tests_uploaded_idx
  on public.tests (user_id, uploaded_at desc);
create index if not exists tests_inputs_gin
  on public.tests using gin (inputs);
create index if not exists tests_results_gin
  on public.tests using gin (results);

-- Unique per-user test code. Nullable rows are tolerated so backfill
-- can run gradually; once a code is set, it can't collide with
-- another code on the same user.
create unique index if not exists tests_user_code_uq
  on public.tests (user_id, test_code)
  where test_code is not null;

-- ---- EA SCHEMAS ---------------------------------------------------
-- Per-EA registry: which input keys exist, so the UI can render filters.
create table if not exists public.ea_schemas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ea_name       text not null,
  input_keys    jsonb not null default '{}'::jsonb,
  result_keys   jsonb not null default '{}'::jsonb,
  last_seen_at  timestamptz not null default now(),
  unique (user_id, ea_name)
);

-- ---- TAGS ---------------------------------------------------------
create table if not exists public.tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name    text not null,
  unique (user_id, name)
);

create table if not exists public.test_tags (
  test_id uuid not null references public.tests(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (test_id, tag_id)
);

create index if not exists test_tags_tag_idx on public.test_tags (tag_id);

-- ---- ROW-LEVEL SECURITY -------------------------------------------
alter table public.tests       enable row level security;
alter table public.ea_schemas  enable row level security;
alter table public.tags        enable row level security;
alter table public.test_tags   enable row level security;

-- Tests
drop policy if exists "tests select own"  on public.tests;
drop policy if exists "tests insert own"  on public.tests;
drop policy if exists "tests update own"  on public.tests;
drop policy if exists "tests delete own"  on public.tests;
create policy "tests select own"  on public.tests for select using (auth.uid() = user_id);
create policy "tests insert own"  on public.tests for insert with check (auth.uid() = user_id);
create policy "tests update own"  on public.tests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tests delete own"  on public.tests for delete using (auth.uid() = user_id);

-- EA schemas
drop policy if exists "ea_schemas select own" on public.ea_schemas;
drop policy if exists "ea_schemas write own"  on public.ea_schemas;
create policy "ea_schemas select own" on public.ea_schemas for select using (auth.uid() = user_id);
create policy "ea_schemas write own"  on public.ea_schemas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tags
drop policy if exists "tags select own" on public.tags;
drop policy if exists "tags write own"  on public.tags;
create policy "tags select own" on public.tags for select using (auth.uid() = user_id);
create policy "tags write own"  on public.tags for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Test-tag join (read/write allowed if the user owns the parent test)
drop policy if exists "test_tags select own" on public.test_tags;
drop policy if exists "test_tags write own"  on public.test_tags;
create policy "test_tags select own" on public.test_tags for select using (
  exists (select 1 from public.tests t where t.id = test_id and t.user_id = auth.uid())
);
create policy "test_tags write own" on public.test_tags for all
  using (
    exists (select 1 from public.tests t where t.id = test_id and t.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tests t where t.id = test_id and t.user_id = auth.uid())
  );

-- ---- STORAGE: raw-curves bucket ----------------------------------
-- Created via the Supabase dashboard (Storage → New bucket). Apply
-- the policies below in the dashboard's Storage policies UI, or via
-- this script after the bucket exists.

insert into storage.buckets (id, name, public)
values ('raw-curves', 'raw-curves', false)
on conflict (id) do nothing;

drop policy if exists "raw-curves read own"   on storage.objects;
drop policy if exists "raw-curves write own"  on storage.objects;
drop policy if exists "raw-curves update own" on storage.objects;
drop policy if exists "raw-curves delete own" on storage.objects;

-- Object path layout: {user_id}/{test_id}.json.gz
-- The first path segment must equal auth.uid().
create policy "raw-curves read own" on storage.objects for select
  using (bucket_id = 'raw-curves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "raw-curves write own" on storage.objects for insert
  with check (bucket_id = 'raw-curves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "raw-curves update own" on storage.objects for update
  using (bucket_id = 'raw-curves' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'raw-curves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "raw-curves delete own" on storage.objects for delete
  using (bucket_id = 'raw-curves' and (storage.foldername(name))[1] = auth.uid()::text);
