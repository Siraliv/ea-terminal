import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeHtmlBuffer, parseMt5HtmlString } from '../parseHtml';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(
  here,
  '../../../../reference/SD_REV_MPS_SL_LIN_v040525.html',
);

describe('parseMt5HtmlString (real MT5 sample)', () => {
  const buf = readFileSync(SAMPLE_PATH);
  const ab = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  const html = decodeHtmlBuffer(ab);
  const result = parseMt5HtmlString(html, 'SD_REV_MPS_SL_LIN_v040525.html');

  it('decodes UTF-16 LE BOM and yields a parseable document', () => {
    expect(html).toContain('<title>Strategy Tester Report</title>');
    expect(html).toContain('<b>Settings</b>');
  });

  it('extracts identity fields from the Settings block', () => {
    expect(result.identity.expertName).toBe('SD_REV_MPS_SL_LIN_v040525');
    // `_vDDMMYY` suffix is detected by the version regex (the `_`
    // counts as a non-letter boundary, the 6 digits are a valid
    // 04 May '25 date).
    expect(result.identity.eaVersion).toBe('040525');
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
    expect(result.inputs['Timeframe']).toBe(16385);
    expect(result.inputs['InitialAccountSize']).toBe(100_000);
    expect(result.inputs['LotSize']).toBe(2.5);
    expect(result.inputs['numTrds']).toBe(4);
    expect(result.inputs['Decremental']).toBe(false);
    expect(result.inputs['SlPercent']).toBe(0.7);
    expect(result.inputs['TpPercent']).toBe(0.7);
    expect(result.inputs['MaxDailyDrawdown']).toBe(100);
    expect(result.inputs['MaxDailyProfit']).toBe(4.5);
    expect(result.inputs['TargetBuffer']).toBe(0.9);
    expect(result.inputs['StackSl']).toBe(100);
    expect(result.inputs['StackTp']).toBe(100);
  });

  it('parses headline result metrics', () => {
    expect(result.headline.totalNetProfit).toBeCloseTo(-29_545.05, 2);
    expect(result.headline.profitFactor).toBeCloseTo(0.98, 2);
    expect(result.headline.expectedPayoff).toBeCloseTo(-6.1, 2);
    expect(result.headline.recoveryFactor).toBeCloseTo(-0.27, 2);
    expect(result.headline.sharpeRatio).toBeCloseTo(-0.15, 2);
    expect(result.headline.balanceDdMaxPct).toBeCloseTo(72.16, 2);
    expect(result.headline.equityDdMaxPct).toBeCloseTo(73.15, 2);
    expect(result.headline.totalTrades).toBe(4841);
  });

  it('parses ≥30 result metrics into the results bag', () => {
    const keys = Object.keys(result.results);
    expect(keys.length).toBeGreaterThanOrEqual(30);
    expect(keys).toContain('Total Net Profit');
    expect(keys).toContain('Profit Factor');
    expect(keys).toContain('Sharpe Ratio');
    expect(keys).toContain('Balance Drawdown Maximal');
    expect(keys).toContain('Equity Drawdown Maximal');
  });

  it('builds an equity curve from the deals table', () => {
    expect(result.equityCurveRaw.length).toBeGreaterThan(100);
    const first = result.equityCurveRaw[0]!;
    expect(first.b).toBeCloseTo(100_000, 2);

    const last = result.equityCurveRaw[result.equityCurveRaw.length - 1]!;
    // Final balance ≈ initial + net profit (within rounding).
    expect(last.b).toBeCloseTo(100_000 + -29_545.05, 0);
  });

  it('downsamples the equity curve to ≤500 points', () => {
    expect(result.equityCurveDownsampled.length).toBeLessThanOrEqual(500);
    expect(result.equityCurveDownsampled[0]).toEqual(result.equityCurveRaw[0]);
  });

  it('reports source metadata', () => {
    expect(result.sourceFormat).toBe('html');
    expect(result.sourceFilename).toBe('SD_REV_MPS_SL_LIN_v040525.html');
  });
});
