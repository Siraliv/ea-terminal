import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  KV,
} from '@/components/ui';
import { useTestsList } from '@/hooks/useTests';
import type { Test } from '@/types/domain';

interface EaRollup {
  eaName: string;
  cleanName: string;
  versions: Set<string>;
  symbols: Set<string>;
  testCount: number;
  activeCount: number;
  bestPF: number | null;
  bestNet: number | null;
  bestRecovery: number | null;
  avgWinRate: number | null;
  avgBalanceDD: number | null;
  lastUploadIso: string | null;
}

function cleanEaName(name: string): string {
  return name.replace(/\s*\(v\d{6}\)\s*$/, '').replace(/_+$/, '');
}

function avg(nums: Array<number | null>): number | null {
  const valid = nums.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function bestOf(nums: Array<number | null>): number | null {
  const valid = nums.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

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

function rollUp(tests: Test[]): EaRollup[] {
  const map = new Map<string, EaRollup>();

  for (const t of tests) {
    let bucket = map.get(t.ea_name);
    if (!bucket) {
      bucket = {
        eaName: t.ea_name,
        cleanName: cleanEaName(t.ea_name),
        versions: new Set(),
        symbols: new Set(),
        testCount: 0,
        activeCount: 0,
        bestPF: null,
        bestNet: null,
        bestRecovery: null,
        avgWinRate: null,
        avgBalanceDD: null,
        lastUploadIso: null,
      };
      map.set(t.ea_name, bucket);
    }
    bucket.testCount += 1;
    if (t.status === 'active') bucket.activeCount += 1;
    if (t.ea_version) bucket.versions.add(t.ea_version);
    if (t.symbol) bucket.symbols.add(t.symbol);
    if (
      bucket.lastUploadIso == null ||
      Date.parse(t.uploaded_at) > Date.parse(bucket.lastUploadIso)
    ) {
      bucket.lastUploadIso = t.uploaded_at;
    }
  }

  // Second pass — compute aggregates per bucket.
  for (const [eaName, bucket] of map) {
    const eaTests = tests.filter((t) => t.ea_name === eaName);
    bucket.bestPF = bestOf(eaTests.map((t) => t.profit_factor));
    bucket.bestNet = bestOf(eaTests.map((t) => t.total_net_profit));
    bucket.bestRecovery = bestOf(eaTests.map((t) => t.recovery_factor));
    bucket.avgWinRate = avg(eaTests.map((t) => t.win_rate));
    bucket.avgBalanceDD = avg(eaTests.map((t) => t.balance_dd_max_pct));
  }

  return Array.from(map.values()).sort((a, b) => b.testCount - a.testCount);
}

export function EAsPage() {
  const navigate = useNavigate();
  const { data: tests = [], isLoading, error } = useTestsList();

  const rollups = useMemo(() => rollUp(tests), [tests]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="EAs" subtitle="Loading…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="EAs" subtitle="Failed to load" />
        <FramedPanel title="ERROR">
          <p className="text-term-red text-sm">
            {error instanceof Error ? error.message : 'Unknown error.'}
          </p>
        </FramedPanel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="EAs"
        subtitle={
          rollups.length === 0
            ? 'No EAs on file yet'
            : `${rollups.length} EA${rollups.length === 1 ? '' : 's'} · ${tests.length} test${tests.length === 1 ? '' : 's'} total`
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

      {rollups.length === 0 ? (
        <FramedPanel title="EMPTY">
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-term-muted text-sm">
              No EAs on file yet. Upload your first MT5 strategy tester
              report to see roll-ups here.
            </p>
            <BracketedButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/upload')}
            >
              Go to Upload
            </BracketedButton>
          </div>
        </FramedPanel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rollups.map((r) => (
            <FramedPanel
              key={r.eaName}
              title={r.cleanName.toUpperCase()}
              titleRight={
                <BracketedTag variant="active">
                  {r.testCount} TEST{r.testCount === 1 ? '' : 'S'}
                </BracketedTag>
              }
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1">
                  {Array.from(r.versions)
                    .sort()
                    .map((v) => (
                      <BracketedTag key={v} variant="ticker">
                        v{v}
                      </BracketedTag>
                    ))}
                  {r.versions.size === 0 ? (
                    <span className="text-term-dim text-xs">— no versions —</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1">
                  {Array.from(r.symbols)
                    .sort()
                    .map((s) => (
                      <BracketedTag key={s} variant="neutral">
                        {s}
                      </BracketedTag>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-x-4 mt-2">
                  <KV
                    k="BEST PF"
                    v={fmtNum(r.bestPF, 3)}
                    tone="positive"
                  />
                  <KV
                    k="BEST NET"
                    v={fmtMoney(r.bestNet)}
                    tone="positive"
                  />
                  <KV k="BEST RECOVERY" v={fmtNum(r.bestRecovery, 2)} />
                  <KV k="AVG WIN%" v={fmtPct(r.avgWinRate)} />
                  <KV
                    k="AVG BAL DD"
                    v={fmtPct(r.avgBalanceDD)}
                    tone="warn"
                  />
                  <KV
                    k="ACTIVE"
                    v={`${r.activeCount} / ${r.testCount}`}
                  />
                  <KV
                    k="LAST UPLOAD"
                    v={r.lastUploadIso?.slice(0, 10) ?? '—'}
                    tone="muted"
                    last
                  />
                </div>

                <div className="flex gap-2 mt-2">
                  <BracketedButton
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      // Pre-fill the library filter via URL param the
                      // library page can read. For now, just navigate.
                      navigate(
                        `/tests?ea=${encodeURIComponent(r.eaName)}`,
                      )
                    }
                  >
                    View Tests
                  </BracketedButton>
                </div>
              </div>
            </FramedPanel>
          ))}
        </div>
      )}
    </div>
  );
}
