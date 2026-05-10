import { describe, it, expect } from 'vitest';
import { lttbDownsample, downsampleEquityCurve } from '../lttb';
import type { EquityPoint } from '../types';

describe('lttbDownsample', () => {
  it('returns the input verbatim when threshold >= length', () => {
    const data = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ];
    expect(lttbDownsample(data, 5)).toEqual(data);
    expect(lttbDownsample(data, 3)).toEqual(data);
  });

  it('always preserves the first and last points', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 50),
    }));
    const out = lttbDownsample(data, 100);
    expect(out[0]).toEqual(data[0]);
    expect(out[out.length - 1]).toEqual(data[data.length - 1]);
    expect(out.length).toBe(100);
  });

  it('preserves visual peaks of a sine wave to within tight tolerance', () => {
    const N = 4000;
    const data = Array.from({ length: N }, (_, i) => ({
      x: i,
      y: Math.sin((i / N) * 8 * Math.PI), // 4 full peaks
    }));

    const sampled = lttbDownsample(data, 500);
    expect(sampled.length).toBe(500);

    const inMax = Math.max(...data.map((p) => p.y));
    const inMin = Math.min(...data.map((p) => p.y));
    const outMax = Math.max(...sampled.map((p) => p.y));
    const outMin = Math.min(...sampled.map((p) => p.y));

    // Output should preserve the peaks within ~1% (downsample picks
    // the most "important" point per bucket but may not hit the exact
    // peak sample).
    expect(outMax).toBeGreaterThan(inMax - 0.01);
    expect(outMin).toBeLessThan(inMin + 0.01);
  });
});

describe('downsampleEquityCurve', () => {
  it('reduces a long curve to the requested threshold', () => {
    const points: EquityPoint[] = Array.from({ length: 3441 }, (_, i) => ({
      t: new Date(2015, 0, 1, 0, i).toISOString(),
      b: 100_000 + i * 25,
    }));

    const out = downsampleEquityCurve(points, 500);
    expect(out.length).toBe(500);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it('returns the original series unchanged when shorter than threshold', () => {
    const points: EquityPoint[] = Array.from({ length: 200 }, (_, i) => ({
      t: new Date(2015, 0, 1, 0, i).toISOString(),
      b: 100_000 + i,
    }));

    const out = downsampleEquityCurve(points, 500);
    expect(out.length).toBe(200);
    expect(out).toEqual(points);
  });
});
