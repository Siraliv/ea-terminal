import { describe, it, expect } from 'vitest';
import {
  coerceInputValue,
  coerceMetric,
  parseCountPct,
  parseCountValue,
  parseLooseNumber,
  parseValuePct,
} from '../normalise';

describe('parseLooseNumber', () => {
  it('handles plain numbers', () => {
    expect(parseLooseNumber('1234.56')).toBe(1234.56);
    expect(parseLooseNumber('-5045.87')).toBe(-5045.87);
  });

  it('strips spaces and commas as thousands separators', () => {
    expect(parseLooseNumber('42 524.84')).toBe(42524.84);
    expect(parseLooseNumber('42\u00A0524.84')).toBe(42524.84);
    expect(parseLooseNumber('1,234,567')).toBe(1_234_567);
  });

  it('returns null for non-numeric input', () => {
    expect(parseLooseNumber('')).toBeNull();
    expect(parseLooseNumber('-')).toBeNull();
    expect(parseLooseNumber('abc')).toBeNull();
  });
});

describe('parseValuePct', () => {
  it('parses MT5 drawdown format', () => {
    expect(parseValuePct('42 524.84 (14.26%)')).toEqual({
      value: 42524.84,
      pct: 14.26,
    });
    expect(parseValuePct('46 049.74 (15.40%)')).toEqual({
      value: 46049.74,
      pct: 15.4,
    });
  });

  it('returns null for shapes that do not match', () => {
    expect(parseValuePct('100% real ticks')).toBeNull();
    expect(parseValuePct('1.13')).toBeNull();
  });
});

describe('parseCountPct', () => {
  it('parses won-percent format', () => {
    expect(parseCountPct('844 (59.36%)')).toEqual({ count: 844, pct: 59.36 });
    expect(parseCountPct('1046 (60.81%)')).toEqual({ count: 1046, pct: 60.81 });
  });
});

describe('parseCountValue', () => {
  it('parses count-first ordering', () => {
    expect(parseCountValue('16 (26 299.93)')).toEqual({
      count: 16,
      value: 26299.93,
    });
  });

  it('parses value-first ordering', () => {
    expect(parseCountValue('26 299.93 (16)')).toEqual({
      count: 16,
      value: 26299.93,
    });
  });

  it('parses negative loss format', () => {
    expect(parseCountValue('12 (-17 725.72)')).toEqual({
      count: 12,
      value: -17725.72,
    });
  });
});

describe('coerceMetric', () => {
  it('passes numbers through', () => {
    expect(coerceMetric(187794.48)).toBe(187794.48);
  });

  it('parses bare numbers from strings', () => {
    expect(coerceMetric('1.129648')).toBe(1.129648);
  });

  it('parses bare percentages', () => {
    expect(coerceMetric('4339.44%')).toBe(4339.44);
  });

  it('parses value-pct compound', () => {
    expect(coerceMetric('46 049.74 (15.40%)')).toEqual({
      value: 46049.74,
      pct: 15.4,
    });
  });

  it('returns the original string when no shape matches', () => {
    expect(coerceMetric('100% real ticks')).toBe('100% real ticks');
    expect(coerceMetric('5:17:29')).toBe('5:17:29');
  });
});

describe('coerceInputValue', () => {
  it('returns numeric for numeric strings', () => {
    expect(coerceInputValue('3.25')).toBe(3.25);
    expect(coerceInputValue('17.5')).toBe(17.5);
    expect(coerceInputValue('100000')).toBe(100000);
  });

  it('returns boolean for "true"/"false"', () => {
    expect(coerceInputValue('false')).toBe(false);
    expect(coerceInputValue('true')).toBe(true);
  });

  it('keeps strings that are not pure numbers', () => {
    expect(coerceInputValue('US30')).toBe('US30');
  });
});
