import {
  BracketedButton,
  BracketedTag,
  type BracketedTagVariant,
  FramedPanel,
  KV,
} from '@/components/ui';
import type { Mt5Normalised } from '@/domain/mt5/types';

export type SlotStatus =
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'saving'
  | 'saved'
  | 'duplicate'
  | 'error';

export interface SlotState {
  id: string;
  file: File;
  status: SlotStatus;
  parsed?: Mt5Normalised;
  error?: string;
  /** Persisted test id, present when status === 'saved' or 'duplicate'. */
  testId?: string;
}

export interface FilePreviewCardProps {
  slot: SlotState;
  onSave: (slot: SlotState) => void;
  onRemove: (id: string) => void;
  onOpen: (testId: string) => void;
}

const STATUS_LABEL: Record<SlotStatus, string> = {
  pending: 'PENDING',
  parsing: 'PARSING',
  parsed: 'PARSED',
  saving: 'SAVING',
  saved: 'SAVED',
  duplicate: 'DUPLICATE',
  error: 'ERROR',
};

const STATUS_VARIANT: Record<SlotStatus, BracketedTagVariant> = {
  pending: 'neutral',
  parsing: 'active',
  parsed: 'active',
  saving: 'active',
  saved: 'win',
  duplicate: 'paused',
  error: 'breached',
};

function fmtMoney(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number | null): string {
  if (n == null) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null) return '—';
  return n.toFixed(digits);
}

export function FilePreviewCard({
  slot,
  onSave,
  onRemove,
  onOpen,
}: FilePreviewCardProps) {
  const tagVariant = STATUS_VARIANT[slot.status];
  const tagLabel = STATUS_LABEL[slot.status];

  return (
    <FramedPanel
      title={slot.file.name}
      titleRight={<BracketedTag variant={tagVariant}>{tagLabel}</BracketedTag>}
    >
      {slot.status === 'parsing' || slot.status === 'pending' ? (
        <p className="text-term-muted text-sm">Reading {slot.file.name}…</p>
      ) : null}

      {slot.status === 'error' ? (
        <p className="text-term-red text-sm whitespace-pre-wrap">
          {slot.error ?? 'Unknown error.'}
        </p>
      ) : null}

      {slot.parsed ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <KV k="EA" v={slot.parsed.identity.expertName} />
          <KV
            k="Symbol"
            v={`${slot.parsed.identity.symbol} ${slot.parsed.identity.timeframe ?? ''}`}
          />
          <KV
            k="Period"
            v={`${slot.parsed.identity.periodStart ?? '—'} → ${slot.parsed.identity.periodEnd ?? '—'}`}
          />
          <KV
            k="Net Profit"
            v={fmtMoney(slot.parsed.headline.totalNetProfit)}
            tone={
              (slot.parsed.headline.totalNetProfit ?? 0) >= 0
                ? 'positive'
                : 'negative'
            }
          />
          <KV
            k="Profit Factor"
            v={fmtNum(slot.parsed.headline.profitFactor, 3)}
          />
          <KV k="Sharpe" v={fmtNum(slot.parsed.headline.sharpeRatio, 3)} />
          <KV
            k="Balance DD %"
            v={fmtPct(slot.parsed.headline.balanceDdMaxPct)}
            tone="warn"
          />
          <KV
            k="Equity DD %"
            v={fmtPct(slot.parsed.headline.equityDdMaxPct)}
            tone="warn"
          />
          <KV
            k="Total Trades"
            v={slot.parsed.headline.totalTrades?.toString() ?? '—'}
          />
          <KV k="Win Rate" v={fmtPct(slot.parsed.headline.winRate)} />
          <KV
            k="Inputs"
            v={`${Object.keys(slot.parsed.inputs).length} keys`}
          />
          <KV
            k="Curve"
            v={`${slot.parsed.equityCurveRaw.length} pts → ${slot.parsed.equityCurveDownsampled.length} downsampled`}
            last
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 mt-3">
        {slot.status === 'parsed' ? (
          <BracketedButton
            variant="primary"
            size="sm"
            onClick={() => onSave(slot)}
          >
            Save
          </BracketedButton>
        ) : null}

        {(slot.status === 'saved' || slot.status === 'duplicate') &&
        slot.testId ? (
          <BracketedButton
            variant="secondary"
            size="sm"
            onClick={() => onOpen(slot.testId!)}
          >
            Open
          </BracketedButton>
        ) : null}

        <div className="flex-1" />

        <BracketedButton
          variant="secondary"
          size="sm"
          onClick={() => onRemove(slot.id)}
        >
          Remove
        </BracketedButton>
      </div>
    </FramedPanel>
  );
}
