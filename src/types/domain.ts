import type { TestRow, EaSchemaRow, TagRow, Json } from './database';

/** Single (timestamp_ms, balance) point on an equity curve. */
export interface EquityPoint {
  /** ISO timestamp from the MT5 deal, e.g. "2015-01-02T16:00:03Z". */
  t: string;
  /** Running account balance after this deal. */
  b: number;
}

/** Equity curve as stored in JSONB. */
export type EquityCurve = EquityPoint[];

/** A persisted test row, with the JSONB columns narrowed. */
export interface Test extends Omit<TestRow, 'inputs' | 'results' | 'equity_curve'> {
  inputs: Record<string, Json>;
  results: Record<string, Json>;
  equity_curve: EquityCurve;
}

export type EaSchema = EaSchemaRow;
export type Tag = TagRow;
