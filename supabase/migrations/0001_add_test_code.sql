-- =============================================================
-- 0001 — add tests.test_code
--
-- Adds a short stable display label per row (e.g. `A1`, `B2`).
-- Letter is assigned per unique ea_name in upload order; sequence
-- increments per (user_id, ea_name) and is never reused after
-- delete. Composed at render time with symbol + version into a
-- full label like `US30-v040525-A1`.
--
-- Backfill is performed lazily by the app on first load — any row
-- with a null `test_code` gets one assigned the next time
-- useTestsList resolves for its owner. No manual data step needed.
--
-- Apply with the SQL editor in the Supabase dashboard, or via:
--   supabase db push
-- This migration is idempotent.
-- =============================================================

alter table public.tests
  add column if not exists test_code text;

-- Conditional uniqueness: null values allowed (so backfill can run
-- in stages); non-null values must be unique per user.
create unique index if not exists tests_user_code_uq
  on public.tests (user_id, test_code)
  where test_code is not null;
