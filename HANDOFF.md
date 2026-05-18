# EA Terminal — Handoff

> Self-contained brief for picking the project back up after the Supabase
> project has been deleted to free up a free-tier slot. Read this top to
> bottom, walk through Section 4, and the app should be back online in
> ~15 minutes.

---

## 1. Where we left off

- **Repo**: <https://github.com/Siraliv/ea-terminal.git>
- **Branch**: `main`
- **Latest commit at pause**: `cf91b3f` — *Align stacked-chart Y-axis widths*
- **Vercel deployment**: live at the same project; no action needed there if
  Vercel still has the env vars set when you redeploy with the new Supabase
  credentials.

The codebase is fully developed and committed. The pause is **only on the
Supabase backend** — schema, auth users, storage bucket, all rows.

### What's still good after the Supabase delete

| Survives | Reason |
|---|---|
| All source code | Lives in GitHub |
| Saved portfolios | localStorage in your browser |
| EA Schemas as concept | Code; the table is recreated by the schema |
| Theme preference | localStorage (Zustand persisted store) |

### What's lost (and needs re-doing)

| Lost | How to replace |
|---|---|
| All uploaded MT5 tests | Re-upload `.xlsx` / `.html` files from BACKTEST-RESULTS folder |
| The raw-curves Storage bucket | Recreate (Section 4, step 3) |
| Your auth user(s) | Sign up again in the app |
| Any saved portfolios *that referenced tests* | Re-create after re-uploads — saved portfolios reference test ids that won't exist anymore. You'll see a red "N missing" tag on saved rows; just delete them and re-save. |

---

## 2. What's been built (so you know what you're returning to)

A React 19 + Vite + Supabase + TanStack Query webapp for analysing MT5
backtest reports. Sections grow top-to-bottom in the sidebar:

- **DASHBOARD** — KPIs, top performers, equity overlays
- **UPLOAD** — drag-and-drop MT5 `.xlsx` or `.html` exports
- **TESTS** — sortable library + per-test detail page (editable IDENTITY)
- **COMPARE** — overlay equity curves of multiple tests
- **EAs** — per-EA rollups
- **PORTFOLIO** — the big feature; see Section 3 below
- **SYSTEM** — infrastructure / quotas / data-hotspots
- **THEME** — Emerald / Emerald Dusk / Smoke / Paper

Major capabilities the next session shouldn't re-derive from scratch:

- **MT5 parser layer** (`src/domain/mt5/`) — handles both XLSX and HTML
  exports; normaliser converts to `Mt5Normalised`; LTTB downsampler keeps
  curves to ~500 points.
- **Test code labels** (`src/lib/testCode.ts`) — `US30-v040525-A1` style
  short labels, lazy-backfilled on app load (see migration `0001`).
- **Year range filter + raw curves** — Dashboard/Compare/Portfolio share
  the filter; raw `.json.gz` curves stream from Storage when scoped so
  year metrics are accurate.
- **Composite Quality Score + validation** — walk-forward + leave-one-out
  in `src/lib/portfolio.ts`, scoring rubric in `src/lib/portfolioReport.ts`.
- **Portfolio weighting schemes** — equal / inverse-vol / Markowitz
  (long-only via clip-and-renormalise).
- **Visualisations** — equity / drawdown / contribution / monthly heatmap
  / correlation matrix / Pareto frontier scatter.

## 3. Portfolio page (current state)

Worth flagging because it's the most developed surface and what most of
the recent work focused on.

| Panel | What it does |
|---|---|
| CONTROLS | Score / Weights / From-To year / Year-by-year toggle / Pool criterion / Start $ |
| AUTO — FULL PERIOD | Top 5 portfolios by chosen score, with corr warnings |
| PARETO FRONTIER | Risk-vs-return scatter of all ~5,000 searched combos |
| AUTO — YEAR-BY-YEAR | Best combo per calendar year |
| MANUAL BUILDER | Pick 2-5 → live preview: equity / drawdown / contribution / 8 KPI tiles / correlation matrix / monthly heatmap → COMPOSITE QUALITY SCORE on the left with [ VIEW FULL REPORT ] modal |
| SAVED PORTFOLIOS | localStorage-backed named portfolios |

What's deferred (Tier 3, not yet built):

- Monte Carlo bootstrap confidence intervals
- Rolling Sharpe / rolling correlation charts
- Side-by-side portfolio comparison view
- Web Worker for parallel optimisation
- Persist saved portfolios to Postgres (currently localStorage)
- Stress-testing scenarios

---

## 4. Reinstate Supabase (the recipe)

### Step 1 — Create the project

1. <https://supabase.com/dashboard> → **New project**
2. Pick the same region you used before (closest to you / Vercel edge)
3. Save the project URL + anon key — you'll paste them into `.env.local`
   and Vercel env vars later

### Step 2 — Apply the schema

Open Supabase Studio → **SQL Editor** → **New query**, and run **both** of
these in order:

#### 2a. Base schema (`supabase/schema.sql`)

Paste the entire contents of `supabase/schema.sql` and click Run. This
creates `tests`, `ea_schemas`, `tags`, `test_tags`, all indexes, and the
RLS policies. The file is idempotent — safe to re-run.

#### 2b. test_code migration (`supabase/migrations/0001_add_test_code.sql`)

The base schema already includes the `test_code` column inline, so this
migration is a no-op on a fresh install (everything uses `IF NOT
EXISTS`). Run it anyway for completeness — if you ever clone the repo
to a fresh machine and skip Section 2a, this one ensures the column is
present.

### Step 3 — Storage bucket

In Supabase Studio → **Storage** → **New bucket**:

- Name: **`raw-curves`** (exact match — case-sensitive)
- Public: **off**
- File size limit: leave default (or bump to ~20 MB; raw curves run a
  few MB gzipped)

The `tests` schema includes RLS policies on `storage.objects` that scope
each user to their own `{user_id}/...` prefix. Verify they exist:

```sql
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects';
```

You should see four `raw-curves`-scoped policies (SELECT / INSERT /
UPDATE / DELETE). If they're missing, re-run `supabase/schema.sql`
(the storage policy block at the bottom is also idempotent).

### Step 4 — Auth

Email/password auth — no extra config needed. The first time you visit
the app you'll register a new account.

### Step 5 — Env vars

#### Local dev (`.env.local`)

Create / update `.env.local` at the project root:

```bash
VITE_SUPABASE_URL=https://<your-new-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-new-anon-key>

# Optional — only set when you upgrade to a paid plan, so the SYSTEM
# page shows the correct quotas. Default 'free' / 'hobby'.
# VITE_SUPABASE_TIER=pro
# VITE_VERCEL_TIER=pro
```

#### Vercel production

Project Settings → Environment Variables → update the same two keys
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) with the new values,
then trigger a redeploy (or push any commit).

### Step 6 — Verify

```bash
git pull         # in case anything new is on main
npm install      # if you cleared node_modules
npm run dev      # http://localhost:5173
```

Sign up → upload one MT5 file → check that:

- The test appears in TESTS with a short code like `US30-v020525-A1`
- The detail page renders the equity curve
- The SYSTEM page shows >0 bytes in the Storage Quota card
- The Portfolio page renders (no rows means "need at least 2 tests
  in the candidate pool", which is correct on a fresh install)

---

## 5. Files worth knowing about

| Path | What it does |
|---|---|
| `supabase/schema.sql` | Full DDL + RLS, idempotent. Source of truth. |
| `supabase/migrations/0001_add_test_code.sql` | The one migration applied post-base-schema; redundant on fresh installs |
| `src/lib/portfolio.ts` | All portfolio math (combine, metrics, optimise, weights, walk-forward, leave-one-out, monthly returns, contributions, Pareto) |
| `src/lib/portfolioReport.ts` | Composite Quality Score rubric + narrative generation |
| `src/lib/yearScope.ts` | Per-year projection of curves + headline metrics |
| `src/lib/savedPortfolios.ts` | localStorage helpers (swappable to Postgres later) |
| `src/lib/testCode.ts` | Short-label assignment + `formatTestLabel` |
| `src/features/portfolio/` | All Portfolio-page components |
| `src/components/charts/` | Recharts wrappers + shared theme |
| `src/index.css` | Theme tokens (Emerald / Dusk / Smoke / Paper) |

## 6. Tier 3 backlog (where to resume)

When you come back and want to push the Portfolio page further, the
ordered backlog from the Tier 1/2 plan is:

1. **Monte Carlo bootstrap** → confidence intervals on Sharpe / DD
2. **Rolling Sharpe / rolling correlation** charts
3. **Side-by-side portfolio comparison** view
4. **Web Worker** for the optimisation search
5. **Persist saved portfolios to Postgres** (currently localStorage)
6. **Stress-testing scenarios** (apply -X% shocks)
7. **Forecasting** (Monte Carlo projection forward)

For Claude Code: starting fresh, the prompt to use is:

> Read HANDOFF.md, then read `src/lib/portfolio.ts` and
> `src/features/portfolio/PortfolioPage.tsx`. Propose an implementation
> plan for Tier 3 item #1 (Monte Carlo bootstrap → confidence intervals
> on Sharpe / DD).

---

## 7. Gotchas to remember

- **The .claude/worktrees directory is git-ignored** — vite running from a
  worktree serves stale source. Always run `npm run dev` from the main
  project root.
- **localStorage is browser-specific** — saved portfolios live per-browser.
  Sign in on a different machine and the SAVED PORTFOLIOS panel will be
  empty. That's expected for v1.
- **The dev server picks 5174 if 5173 is occupied** — common when a stale
  vite process is still running from an earlier session. `taskkill /F /PID
  <pid>` the old one if you want 5173 back.
- **Vercel build needs the env vars to compile** — Vite refuses to build
  without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The check is in
  `src/lib/supabase.ts`.
- **The HTML parser fixture** in `reference/SD_REV_MPS_SL_LIN_v040525.html`
  is 14MB and committed to git. Don't accidentally delete it — the test
  suite reads it.

---

## 8. Commit log highlights (recent → older)

```
cf91b3f Align stacked-chart Y-axis widths so plot areas + x-axis ticks line up
208f5f9 Make chart grid lines + axis baselines theme-aware
723941f Darken Emerald Dusk borders so dashed dividers stay visible
6cf3c13 Add expand button to monthly heatmap
08c7ee0 Move monthly heatmap to the Manual Builder left column
3c30969 Tier 2C: monthly heatmap + contribution chart + Pareto frontier
c12ac07 Tier 2B: weighting schemes (inverse-vol + Markowitz)
35afe37 Tier 2A: walk-forward + leave-one-out validation suite
e5eafc8 Bump ReportSummary text sizes for legibility
4365d72 Add Composite Quality Score + full report to Portfolio builder
4beb3c7 Portfolio Tier 1: honest risk metrics + correlation + persistence
1cb40fb Add Portfolio page — combination search + manual builder
e2a5a35 Add System page — infrastructure, quotas, data hotspots
0ec50c0 Add test_code labels + render Portfolio metrics as %
d004fcf Auto-detect vDDMMYY version anywhere in the EA name
bdfeb11 Make IDENTITY panel editable on the test detail page
```

(Run `git log --oneline -30` for more.)

---

Resume well.
