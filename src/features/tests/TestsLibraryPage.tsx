import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  Input,
  Select,
  TerminalTable,
  type TerminalColumn,
} from '@/components/ui';
import { useTestsList } from '@/hooks/useTests';
import type { Test } from '@/types/domain';

type SortKey =
  | 'uploaded_at'
  | 'profit_factor'
  | 'total_net_profit'
  | 'sharpe_ratio'
  | 'recovery_factor'
  | 'expected_payoff'
  | 'balance_dd_max_pct'
  | 'equity_dd_max_pct'
  | 'total_trades'
  | 'win_rate';

type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'uploaded_at', label: 'UPLOADED' },
  { value: 'profit_factor', label: 'PROFIT FACTOR' },
  { value: 'total_net_profit', label: 'NET PROFIT' },
  { value: 'sharpe_ratio', label: 'SHARPE' },
  { value: 'recovery_factor', label: 'RECOVERY' },
  { value: 'expected_payoff', label: 'EXP PAYOFF' },
  { value: 'balance_dd_max_pct', label: 'BAL DD %' },
  { value: 'equity_dd_max_pct', label: 'EQ DD %' },
  { value: 'total_trades', label: 'TRADES' },
  { value: 'win_rate', label: 'WIN %' },
];

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}

function fmtPct(n: number | null): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function compare(a: number | null, b: number | null, dir: SortDir): number {
  // Nulls last regardless of direction.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === 'desc' ? b - a : a - b;
}

export function TestsLibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: tests = [], isLoading, error } = useTestsList();

  // Filters — initialize from URL search params (so /tests?ea=... pre-fills).
  const [eaFilter, setEaFilter] = useState<string>(
    () => searchParams.get('ea') ?? '',
  );
  const [symbolFilter, setSymbolFilter] = useState<string>(
    () => searchParams.get('symbol') ?? '',
  );
  const [search, setSearch] = useState<string>(
    () => searchParams.get('q') ?? '',
  );

  // Mirror state back to URL (so a copy-paste reproduces the view).
  useEffect(() => {
    const next = new URLSearchParams();
    if (eaFilter) next.set('ea', eaFilter);
    if (symbolFilter) next.set('symbol', symbolFilter);
    if (search) next.set('q', search);
    setSearchParams(next, { replace: true });
  }, [eaFilter, symbolFilter, search, setSearchParams]);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('profit_factor');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const eaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tests) set.add(t.ea_name);
    return Array.from(set).sort();
  }, [tests]);

  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tests) set.add(t.symbol);
    return Array.from(set).sort();
  }, [tests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tests.filter((t) => {
      if (eaFilter && t.ea_name !== eaFilter) return false;
      if (symbolFilter && t.symbol !== symbolFilter) return false;
      if (q) {
        const hay = [
          t.ea_name,
          t.ea_version ?? '',
          t.symbol,
          t.timeframe ?? '',
          t.group_label ?? '',
          t.notes ?? '',
          t.source_filename ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tests, eaFilter, symbolFilter, search]);

  const sorted = useMemo(() => {
    const copy = filtered.slice();
    if (sortKey === 'uploaded_at') {
      copy.sort((a, b) => {
        const av = Date.parse(a.uploaded_at);
        const bv = Date.parse(b.uploaded_at);
        return sortDir === 'desc' ? bv - av : av - bv;
      });
    } else {
      copy.sort((a, b) => compare(a[sortKey], b[sortKey], sortDir));
    }
    return copy;
  }, [filtered, sortKey, sortDir]);

  const columns = useMemo<TerminalColumn<Test>[]>(
    () => [
      {
        id: 'ea',
        header: 'EA',
        cell: (t) => {
          // The EA name from MT5 already contains "(vDDMMYY)" — strip it
          // so we don't show the version twice.
          const cleanName = t.ea_name
            .replace(/\s*\(v\d{6}\)\s*$/, '')
            .replace(/_+$/, '');
          return (
            <span className="text-term-text">
              {cleanName}
              {t.ea_version ? (
                <span className="text-term-muted"> · v{t.ea_version}</span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'symbol',
        header: 'SYMBOL',
        cell: (t) => (
          <span className="text-term-muted">
            {t.symbol}
            {t.timeframe ? ` · ${t.timeframe}` : ''}
          </span>
        ),
      },
      {
        id: 'period',
        header: 'PERIOD',
        cell: (t) =>
          t.period_start && t.period_end
            ? `${t.period_start} → ${t.period_end}`
            : '—',
      },
      {
        id: 'pf',
        header: 'PF',
        align: 'right',
        cell: (t) => fmtNum(t.profit_factor, 3),
      },
      {
        id: 'np',
        header: 'NET P/L',
        align: 'right',
        cell: (t) => (
          <span
            className={
              (t.total_net_profit ?? 0) >= 0
                ? 'text-term-pos'
                : 'text-term-red'
            }
          >
            {fmtMoney(t.total_net_profit)}
          </span>
        ),
      },
      {
        id: 'sharpe',
        header: 'SHARPE',
        align: 'right',
        cell: (t) => fmtNum(t.sharpe_ratio, 2),
      },
      {
        id: 'rec',
        header: 'REC',
        align: 'right',
        cell: (t) => fmtNum(t.recovery_factor, 2),
      },
      {
        id: 'bdd',
        header: 'BAL DD',
        align: 'right',
        cell: (t) => (
          <span className="text-term-amber">
            {fmtPct(t.balance_dd_max_pct)}
          </span>
        ),
      },
      {
        id: 'edd',
        header: 'EQ DD',
        align: 'right',
        cell: (t) => (
          <span className="text-term-amber">
            {fmtPct(t.equity_dd_max_pct)}
          </span>
        ),
      },
      {
        id: 'trades',
        header: 'TRD',
        align: 'right',
        cell: (t) => t.total_trades?.toLocaleString() ?? '—',
      },
      {
        id: 'win',
        header: 'WIN%',
        align: 'right',
        cell: (t) => fmtPct(t.win_rate),
      },
      {
        id: 'rating',
        header: 'RTG',
        align: 'right',
        cell: (t) =>
          t.rating != null ? (
            <span className="text-term-gold">
              {'★'.repeat(t.rating)}
              <span className="text-term-dim">
                {'·'.repeat(5 - t.rating)}
              </span>
            </span>
          ) : (
            <span className="text-term-dim">—</span>
          ),
      },
      {
        id: 'uploaded',
        header: 'UPLOADED',
        align: 'right',
        cell: (t) => (
          <span className="text-term-muted">{fmtDate(t.uploaded_at)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="TESTS"
        subtitle={`${tests.length} test${tests.length === 1 ? '' : 's'} on file · ${filtered.length} shown`}
        titleRight={
          <BracketedTag variant="active">{tests.length}</BracketedTag>
        }
        actions={
          <BracketedButton
            variant="primary"
            size="sm"
            onClick={() => navigate('/upload')}
          >
            New Upload
          </BracketedButton>
        }
      />

      <FramedPanel title="FILTERS">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              EA
            </span>
            <Select
              value={eaFilter}
              onChange={(e) => setEaFilter(e.target.value)}
            >
              <option value="">— all —</option>
              {eaOptions.map((ea) => (
                <option key={ea} value={ea}>
                  {ea}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Symbol
            </span>
            <Select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
            >
              <option value="">— all —</option>
              {symbolOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Sort by
            </span>
            <Select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Search
            </span>
            <div className="flex gap-2 items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ea, symbol, notes…"
                className="flex-1"
              />
              <BracketedButton
                size="sm"
                variant="secondary"
                onClick={() =>
                  setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                }
              >
                {sortDir === 'desc' ? '↓ DESC' : '↑ ASC'}
              </BracketedButton>
            </div>
          </div>
        </div>

        {(eaFilter || symbolFilter || search) && (
          <div className="mt-3">
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setEaFilter('');
                setSymbolFilter('');
                setSearch('');
              }}
            >
              Clear Filters
            </BracketedButton>
          </div>
        )}
      </FramedPanel>

      <FramedPanel title="LIBRARY">
        {isLoading ? (
          <p className="text-term-muted text-sm">Loading…</p>
        ) : error ? (
          <p className="text-term-red text-sm">
            {error instanceof Error ? error.message : 'Failed to load tests.'}
          </p>
        ) : tests.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-term-muted text-sm">
              No tests on file yet. Drop an MT5 export to get started.
            </p>
            <BracketedButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/upload')}
            >
              Go to Upload
            </BracketedButton>
          </div>
        ) : (
          <TerminalTable
            columns={columns}
            rows={sorted}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/tests/${t.id}`)}
            emptyMessage="— no matches for current filters —"
          />
        )}
      </FramedPanel>
    </div>
  );
}
