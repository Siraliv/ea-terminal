import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  KV,
  Textarea,
} from '@/components/ui';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { useDeleteTest, useTest, useUpdateTest } from '@/hooks/useTests';
import type { Json } from '@/types/database';
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

function formatJsonValue(v: Json | undefined): string {
  if (v == null) return '—';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return `[${v.length} items]`;
    return JSON.stringify(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: test, isLoading, error } = useTest(id);
  const updateMut = useUpdateTest();
  const deleteMut = useDeleteTest();

  const [notesDraft, setNotesDraft] = useState<string>('');
  const [notesTouched, setNotesTouched] = useState(false);

  // Seed the notes draft from the loaded test exactly once per test id.
  // Subsequent edits stay local until the user clicks Save Notes.
  useEffect(() => {
    if (test) {
      setNotesDraft(test.notes ?? '');
      setNotesTouched(false);
    }
  }, [test?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
            initialDeposit={test.initial_deposit}
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
        <FramedPanel title="IDENTITY">
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
