import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMt5XlsxBuffer } from '../parseXlsx';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(
  here,
  '../../../../reference/v020525-Test-Result-(Tick Data)-S325T175.xlsx',
);

describe('parseMt5XlsxBuffer (real MT5 sample)', () => {
  const buf = readFileSync(SAMPLE_PATH);
  // Hand a fresh ArrayBuffer view to the parser.
  const ab = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  const result = parseMt5XlsxBuffer(ab, 'v020525-Test-Result-(Tick Data)-S325T175.xlsx');

  it('extracts identity fields from the Settings block', () => {
    expect(result.identity.expertName).toBe('US_SD_CON_MPS_TP_LIN_(v020525)');
    expect(result.identity.eaVersion).toBe('020525');
    expect(result.identity.symbol).toBe('US30_SPREAD_MEDIUM');
    expect(result.identity.timeframe).toBe('H1');
    expect(result.identity.periodStart).toBe('2015-01-01');
    expect(result.identity.periodEnd).toBe('2025-12-29');
    expect(result.identity.broker).toBe('Raw Trading Ltd');
    expect(result.identity.currency).toBe('USD');
    expect(result.identity.initialDeposit).toBe(100_000);
    expect(result.identity.leverage).toBe('1:100');
  });

  it('extracts EA inputs as typed values', () => {
    expect(result.inputs['SlPercent']).toBe(3.25);
    expect(result.inputs['TpPercent']).toBe(1.75);
    expect(result.inputs['LotSize']).toBe(17.5);
    expect(result.inputs['numTrds']).toBe(1);
    expect(result.inputs['Decremental']).toBe(false);
    expect(result.inputs['MaxDailyDrawdown']).toBe(5);
    expect(result.inputs['MaxDailyProfit']).toBe(100);
    expect(result.inputs['TargetBuffer']).toBe(0.9);
    expect(result.inputs['StackSl']).toBe(100);
    expect(result.inputs['StackTp']).toBe(100);
    expect(result.inputs['InitialAccountSize']).toBe(100_000);
    expect(result.inputs['Timeframe']).toBe(16385);
  });

  it('parses headline result metrics', () => {
    expect(result.headline.totalNetProfit).toBeCloseTo(187_794.48, 2);
    expect(result.headline.profitFactor).toBeCloseTo(1.129648, 4);
    expect(result.headline.expectedPayoff).toBeCloseTo(109.182837, 4);
    expect(result.headline.recoveryFactor).toBeCloseTo(4.078079, 4);
    expect(result.headline.sharpeRatio).toBeCloseTo(1.956425, 4);
    expect(result.headline.balanceDdMaxPct).toBeCloseTo(14.26, 2);
    expect(result.headline.equityDdMaxPct).toBeCloseTo(15.4, 2);
    expect(result.headline.totalTrades).toBe(1720);
    expect(result.headline.winRate).toBeCloseTo(60.81, 2);
  });

  it('parses ≥40 result metrics into the results bag', () => {
    const keys = Object.keys(result.results);
    expect(keys.length).toBeGreaterThanOrEqual(40);
    expect(keys).toContain('Total Net Profit');
    expect(keys).toContain('Profit Factor');
    expect(keys).toContain('Sharpe Ratio');
    expect(keys).toContain('Largest profit trade');
    expect(keys).toContain('Largest loss trade');
    expect(keys).toContain('Maximum consecutive losses ($)');
  });

  it('builds an equity curve from the deals table', () => {
    // The sample has ~3441 deals. We are tolerant to a few skipped rows.
    expect(result.equityCurveRaw.length).toBeGreaterThanOrEqual(3000);
    expect(result.equityCurveRaw.length).toBeLessThanOrEqual(3500);

    // First point is the initial balance row.
    const first = result.equityCurveRaw[0]!;
    expect(first.b).toBeCloseTo(100_000, 2);

    // Final balance ≈ initial + net profit.
    const last = result.equityCurveRaw[result.equityCurveRaw.length - 1]!;
    expect(last.b).toBeCloseTo(287_794.48, 0);
  });

  it('downsamples the equity curve to ~500 points', () => {
    expect(result.equityCurveDownsampled.length).toBe(500);
    // First and last points are preserved.
    expect(result.equityCurveDownsampled[0]).toEqual(result.equityCurveRaw[0]);
    expect(
      result.equityCurveDownsampled[result.equityCurveDownsampled.length - 1],
    ).toEqual(result.equityCurveRaw[result.equityCurveRaw.length - 1]);
  });

  it('reports source metadata', () => {
    expect(result.sourceFormat).toBe('xlsx');
    expect(result.sourceFilename).toBe(
      'v020525-Test-Result-(Tick Data)-S325T175.xlsx',
    );
  });
});
