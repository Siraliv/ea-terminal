import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  Input,
  KV,
  Textarea,
} from '@/components/ui';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { useDeleteTest, useTest, useUpdateTest } from '@/hooks/useTests';
import type { Json, TestInsert } from '@/types/database';
import type { Test } from '@/types/domain';

const SETTINGS_KEYS = [
  ['EA', 'ea_name'],
  ['Version', 'ea_version'],
  ['Symbol', 'symbol'],
  ['Timeframe', 'timeframe'],
  ['Period', null], // composed
  ['Broker', 'broker'],
  ['Currency', 'currency'],
  ['Initial Deposit', 'initial_deposit'],
  ['Leverage', 'leverage'],
  ['Source', 'source_format'],
  ['Filename', 'source_filename'],
  ['Uploaded', 'uploaded_at'],
] as const;

const HEADLINE_KEYS: Array<{
  k: string;
  field: keyof Test;
  fmt: (v: unknown) => string;
  tone?: 'positive' | 'negative' | 'warn' | 'neutral' | 'muted';
}> = [
  {
    k: 'Net Profit',
    field: 'total_net_profit',
    fmt: (v) => money(v),
  },
  { k: 'Profit Factor', field: 'profit_factor', fmt: (v) => num(v, 3) },
  { k: 'Expected Payoff', field: 'expected_payoff', fmt: (v) => num(v, 2) },
  { k: 'Recovery', field: 'recovery_factor', fmt: (v) => num(v, 2) },
  { k: 'Sharpe', field: 'sharpe_ratio', fmt: (v) => num(v, 2) },
  {
    k: 'Bal DD %',
    field: 'balance_dd_max_pct',
    fmt: (v) => pct(v),
    tone: 'warn',
  },
  {
    k: 'Eq DD %',
    field: 'equity_dd_max_pct',
    fmt: (v) => pct(v),
    tone: 'warn',
  },
  { k: 'Total Trades', field: 'total_trades', fmt: (v) => int(v) },
  { k: 'Win Rate', field: 'win_rate', fmt: (v) => pct(v) },
];

function money(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function num(v: unknown, digits = 2): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}
function pct(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}
function int(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toLocaleString();
}

/**
 * Render a stored JSONB result-metric value into a human-readable
 * cell.
 *
 * The MT5 parser emits compound objects for metrics whose source
 * cell carries two pieces of information:
 *   - `{value, pct}`   — e.g. Balance Drawdown Maximal: 106 048.00 (72.16%)
 *   - `{count, pct}`   — e.g. Profit Trades (% of total): 2235 (46.17%)
 *   - `{count, value}` — e.g. Maximum consecutive wins ($): 21 ($24 846.91)
 *
 * Without the cases below these collapsed to raw `JSON.stringify` —
 * `{"count":21,"value":24846.91}` showing up in the UI. We re-emit
 * them in MT5's native `count ($value)` / `value (pct%)` notation
 * so the cell reads naturally.
 */
function formatJsonValue(v: Json | undefined): string {
  if (v == null) return '—';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return `[${v.length} items]`;
    const obj = v as Record<string, unknown>;
    const hasNum = (k: string) =>
      typeof obj[k] === 'number' && Number.isFinite(obj[k] as number);
    if (hasNum('value') && hasNum('pct')) {
      return `${fmtNum(obj['value'] as number)} (${fmtPct(obj['pct'] as number)})`;
    }
    if (hasNum('count') && hasNum('pct')) {
      return `${obj['count']} (${fmtPct(obj['pct'] as number)})`;
    }
    if (hasNum('count') && hasNum('value')) {
      return `${obj['count']} ($${fmtNum(obj['value'] as number)})`;
    }
    return JSON.stringify(obj);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return fmtNum(v);
  return String(v);
}

/** `1718359.72` → `"1,718,359.72"` — 2 decimals, thousands grouped. */
function fmtNum(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** `46.17` → `"46.17%"` — never more than 2 decimals. */
function fmtPct(n: number): string {
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

export function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: test, isLoading, error } = useTest(id);
  const updateMut = useUpdateTest();
  const deleteMut = useDeleteTest();

  const [notesDraft, setNotesDraft] = useState<string>('');
  const [notesTouched, setNotesTouched] = useState(false);

  // ── Identity edit mode ─────────────────────────────────────────
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft>(
    () => emptyIdentityDraft(),
  );

  // Seed the notes draft from the loaded test. Re-seeds whenever the
  // server value changes (e.g. realtime UPDATE from another tab) —
  // but only while the user hasn't started editing locally. As soon
  // as `notesTouched` flips true, unsaved work is preserved until
  // they Save or navigate away.
  //
  // The deps are `test?.id` + `test?.notes` so we don't re-fire on
  // every TanStack-Query refetch that produces an identity-fresh
  // object with unchanged data. setState in the effect body is
  // intentional — there is no pure-derivation path that preserves
  // the local-edit semantics.
  useEffect(() => {
    if (!test) return;
    if (notesTouched) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotesDraft(test.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test?.id, test?.notes, notesTouched]);

  const onRate = useCallback(
    (rating: number | null) => {
      if (!test) return;
      updateMut.mutate({ id: test.id, patch: { rating } });
    },
    [test, updateMut],
  );

  const onSaveNotes = useCallback(() => {
    if (!test) return;
    updateMut.mutate(
      { id: test.id, patch: { notes: notesDraft } },
      { onSuccess: () => setNotesTouched(false) },
    );
  }, [test, updateMut, notesDraft]);

  const onArchiveToggle = useCallback(() => {
    if (!test) return;
    const next = test.status === 'active' ? 'archived' : 'active';
    updateMut.mutate({ id: test.id, patch: { status: next } });
  }, [test, updateMut]);

  const onStartEditIdentity = useCallback(() => {
    if (!test) return;
    setIdentityDraft(draftFromTest(test));
    setEditingIdentity(true);
  }, [test]);

  const onCancelEditIdentity = useCallback(() => {
    setEditingIdentity(false);
    setIdentityDraft(emptyIdentityDraft());
  }, []);

  const onSaveIdentity = useCallback(() => {
    if (!test) return;
    const patch = patchFromDraft(identityDraft);
    updateMut.mutate(
      { id: test.id, patch },
      {
        onSuccess: () => {
          setEditingIdentity(false);
          setIdentityDraft(emptyIdentityDraft());
        },
      },
    );
  }, [test, updateMut, identityDraft]);

  const onDelete = useCallback(() => {
    if (!test) return;
    if (!window.confirm(`Permanently delete this test? This cannot be undone.`)) {
      return;
    }
    deleteMut.mutate(test, {
      onSuccess: () => navigate('/tests'),
    });
  }, [test, deleteMut, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="TEST" subtitle="Loading…" />
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="TEST" subtitle="Not found" />
        <FramedPanel title="ERROR">
          <p className="text-term-red text-sm">
            {error instanceof Error
              ? error.message
              : 'Test not found or you do not have access to it.'}
          </p>
          <BracketedButton
            variant="secondary"
            size="sm"
            onClick={() => navigate('/tests')}
          >
            Back to Library
          </BracketedButton>
        </FramedPanel>
      </div>
    );
  }

  const cleanEaName = test.ea_name
    .replace(/\s*\(v\d{6}\)\s*$/, '')
    .replace(/_+$/, '');

  const inputEntries = Object.entries(test.inputs ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const resultsEntries = Object.entries(test.results ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={cleanEaName}
        subtitle={`${test.symbol}${test.timeframe ? ` · ${test.timeframe}` : ''}${
          test.ea_version ? ` · v${test.ea_version}` : ''
        } · ${test.period_start ?? '—'} → ${test.period_end ?? '—'}`}
        titleRight={
          <BracketedTag variant={test.status === 'archived' ? 'archived' : 'active'}>
            {test.status.toUpperCase()}
          </BracketedTag>
        }
        actions={
          <>
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/tests')}
            >
              Back
            </BracketedButton>
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={onArchiveToggle}
            >
              {test.status === 'archived' ? 'Restore' : 'Archive'}
            </BracketedButton>
            <BracketedButton
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              Delete
            </BracketedButton>
          </>
        }
      />

      {/* HEADLINE METRICS */}
      <FramedPanel title="HEADLINE">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-1">
          {HEADLINE_KEYS.map((m) => (
            <KV
              key={m.k}
              k={m.k}
              v={m.fmt(test[m.field])}
              tone={
                m.tone ??
                (m.field === 'total_net_profit'
                  ? typeof test.total_net_profit === 'number' &&
                    test.total_net_profit >= 0
                    ? 'positive'
                    : 'negative'
                  : 'neutral')
              }
            />
          ))}
        </div>
      </FramedPanel>

      {/* EQUITY CURVE */}
      <FramedPanel
        title="EQUITY CURVE"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            {test.equity_curve.length} points
          </span>
        }
      >
        {test.equity_curve.length > 0 ? (
          <EquityCurveChart
            data={test.equity_curve}
            initialBalances={
              test.initial_deposit != null
                ? [
                    {
                      value: test.initial_deposit,
                      color: 'rgb(var(--term-pos))',
                    },
                  ]
                : []
            }
          />
        ) : (
          <p className="text-term-muted text-sm">— no curve data —</p>
        )}
      </FramedPanel>

      {/* RATING */}
      <FramedPanel title="RATING">
        <div className="flex items-center gap-3">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (test.rating ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onRate(test.rating === n ? null : n)}
                className={[
                  'font-mono text-2xl leading-none px-1 transition-colors',
                  active
                    ? 'text-term-gold text-glow'
                    : 'text-term-dim hover:text-term-muted',
                ].join(' ')}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
              >
                ★
              </button>
            );
          })}
          <span className="text-term-muted text-xs ml-2">
            {test.rating != null
              ? `${test.rating} / 5`
              : 'click to rate (click again to clear)'}
          </span>
        </div>
      </FramedPanel>

      {/* NOTES */}
      <FramedPanel
        title="NOTES"
        titleRight={
          notesTouched ? (
            <BracketedButton
              variant="primary"
              size="sm"
              onClick={onSaveNotes}
              disabled={updateMut.isPending}
            >
              {updateMut.isPending ? 'Saving…' : 'Save Notes'}
            </BracketedButton>
          ) : null
        }
      >
        <Textarea
          rows={4}
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesTouched(true);
          }}
          placeholder="Observations, follow-ups, why this run matters…"
        />
      </FramedPanel>

      {/* SETTINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FramedPanel
          title="IDENTITY"
          titleRight={
            editingIdentity ? (
              <div className="flex items-center gap-2">
                <BracketedButton
                  variant="primary"
                  size="sm"
                  onClick={onSaveIdentity}
                  disabled={updateMut.isPending}
                >
                  Save
                </BracketedButton>
                <BracketedButton
                  variant="secondary"
                  size="sm"
                  onClick={onCancelEditIdentity}
                  disabled={updateMut.isPending}
                >
                  Cancel
                </BracketedButton>
              </div>
            ) : (
              <BracketedButton
                variant="secondary"
                size="sm"
                onClick={onStartEditIdentity}
              >
                Edit
              </BracketedButton>
            )
          }
        >
          {editingIdentity ? (
            <IdentityEditor
              draft={identityDraft}
              onChange={setIdentityDraft}
            />
          ) : (
            <div className="flex flex-col">
              {SETTINGS_KEYS.map(([label, field]) => {
                if (label === 'Period') {
                  return (
                    <KV
                      key={label}
                      k={label}
                      v={`${test.period_start ?? '—'} → ${test.period_end ?? '—'}`}
                    />
                  );
                }
                const value = (test as unknown as Record<string, unknown>)[
                  field as string
                ];
                let display: string;
                if (label === 'Initial Deposit') {
                  display = typeof value === 'number' ? money(value) : '—';
                } else if (label === 'Uploaded') {
                  display =
                    typeof value === 'string'
                      ? new Date(value).toISOString().slice(0, 19).replace('T', ' ')
                      : '—';
                } else {
                  display =
                    value == null || value === ''
                      ? '—'
                      : String(value);
                }
                return <KV key={label} k={label} v={display} />;
              })}
            </div>
          )}
        </FramedPanel>

        <FramedPanel
          title="EA INPUTS"
          titleRight={
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              {inputEntries.length} keys
            </span>
          }
        >
          <div className="flex flex-col">
            {inputEntries.length === 0 ? (
              <p className="text-term-muted text-sm">— no inputs recorded —</p>
            ) : (
              inputEntries.map(([k, v], i) => (
                <KV
                  key={k}
                  k={k}
                  v={formatJsonValue(v)}
                  last={i === inputEntries.length - 1}
                />
              ))
            )}
          </div>
        </FramedPanel>
      </div>

      {/* ALL RESULTS */}
      <FramedPanel
        title="ALL RESULT METRICS"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            {resultsEntries.length} metrics
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {resultsEntries.map(([k, v], i) => (
            <KV
              key={k}
              k={k}
              v={formatJsonValue(v)}
              last={i >= resultsEntries.length - 2}
            />
          ))}
        </div>
      </FramedPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// IDENTITY editor
// ─────────────────────────────────────────────────────────────────

/**
 * Local-only draft shape for the editable Identity fields. All values
 * are strings (incl. `initial_deposit`) so inputs can hold partial /
 * cleared content while the user is typing; we coerce to typed
 * patch values in `patchFromDraft` at save time.
 *
 * Source / Filename / Uploaded are intentionally not editable — they
 * describe the underlying upload, not the strategy identity, and
 * mutating them would lie about provenance.
 */
interface IdentityDraft {
  ea_name: string;
  ea_version: string;
  symbol: string;
  timeframe: string;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  broker: string;
  currency: string;
  initial_deposit: string; // free text → parsed at save
  leverage: string;
}

function emptyIdentityDraft(): IdentityDraft {
  return {
    ea_name: '',
    ea_version: '',
    symbol: '',
    timeframe: '',
    period_start: '',
    period_end: '',
    broker: '',
    currency: '',
    initial_deposit: '',
    leverage: '',
  };
}

function draftFromTest(t: Test): IdentityDraft {
  return {
    ea_name: t.ea_name ?? '',
    ea_version: t.ea_version ?? '',
    symbol: t.symbol ?? '',
    timeframe: t.timeframe ?? '',
    period_start: t.period_start ?? '',
    period_end: t.period_end ?? '',
    broker: t.broker ?? '',
    currency: t.currency ?? '',
    initial_deposit:
      typeof t.initial_deposit === 'number'
        ? String(t.initial_deposit)
        : '',
    leverage: t.leverage ?? '',
  };
}

/**
 * Convert the string-only draft into a typed patch ready for
 * `useUpdateTest`. Empty strings become `null` (clears the field);
 * `initial_deposit` is loose-parsed so "100,000" / "100 000" both
 * yield `100000`.
 */
function patchFromDraft(d: IdentityDraft): Partial<TestInsert> {
  const optStr = (s: string) => {
    const v = s.trim();
    return v === '' ? null : v;
  };
  const deposit = parseLooseNumber(d.initial_deposit);
  return {
    ea_name: d.ea_name.trim() || '—',
    ea_version: optStr(d.ea_version),
    symbol: d.symbol.trim() || '—',
    timeframe: optStr(d.timeframe),
    period_start: optStr(d.period_start),
    period_end: optStr(d.period_end),
    broker: optStr(d.broker),
    currency: optStr(d.currency),
    initial_deposit: deposit,
    leverage: optStr(d.leverage),
  };
}

/** Tolerant number parser — strips spaces, NBSP and commas. */
function parseLooseNumber(s: string): number | null {
  const cleaned = s.replace(/[\s\u00A0,]/g, '').replace(/^\+/, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Form for editing the identity fields. Two-column label/input grid
 * matching the visual density of the view-mode KV rows.
 */
function IdentityEditor({
  draft,
  onChange,
}: {
  draft: IdentityDraft;
  onChange: (next: IdentityDraft) => void;
}) {
  const set = <K extends keyof IdentityDraft>(key: K, val: string) => {
    onChange({ ...draft, [key]: val });
  };

  const rows: Array<{
    label: string;
    key: keyof IdentityDraft;
    placeholder?: string;
    type?: 'text' | 'date' | 'number';
  }> = [
    { label: 'EA', key: 'ea_name' },
    { label: 'Version', key: 'ea_version', placeholder: '020525' },
    { label: 'Symbol', key: 'symbol' },
    { label: 'Timeframe', key: 'timeframe', placeholder: 'H1' },
    { label: 'Period start', key: 'period_start', type: 'date' },
    { label: 'Period end', key: 'period_end', type: 'date' },
    { label: 'Broker', key: 'broker' },
    { label: 'Currency', key: 'currency', placeholder: 'USD' },
    {
      label: 'Initial deposit',
      key: 'initial_deposit',
      placeholder: '100000',
    },
    { label: 'Leverage', key: 'leverage', placeholder: '1:100' },
  ];

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ label, key, placeholder, type }) => (
        <div
          key={key}
          className="flex items-center gap-3 py-1 border-b border-dashed border-term-borderDim last:border-b-0"
        >
          <span className="text-term-muted text-xs uppercase tracking-wider w-32 shrink-0">
            {label}
          </span>
          <Input
            className="w-full"
            type={type ?? 'text'}
            value={draft[key]}
            onChange={(e) => set(key, e.target.value)}
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
  );
}
