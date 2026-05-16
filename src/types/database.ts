/**
 * Hand-written Supabase `Database` shape, mirroring `supabase/schema.sql`.
 * Layout matches the output of `supabase gen types typescript`, so when
 * we run that against the live project later this file can be replaced
 * 1:1 without downstream changes.
 *
 * Keep in sync when the schema changes.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── tests ────────────────────────────────────────────────────────────

export type TestRow = {
  id: string;
  user_id: string;

  // Identity
  ea_name: string;
  ea_version: string | null;
  symbol: string;
  timeframe: string | null;
  period_start: string | null;
  period_end: string | null;
  broker: string | null;
  currency: string | null;
  initial_deposit: number | null;
  leverage: string | null;

  // Promoted headline metrics
  total_net_profit: number | null;
  profit_factor: number | null;
  expected_payoff: number | null;
  recovery_factor: number | null;
  sharpe_ratio: number | null;
  balance_dd_max_pct: number | null;
  equity_dd_max_pct: number | null;
  total_trades: number | null;
  win_rate: number | null;

  // JSONB blobs
  inputs: Json;
  results: Json;
  equity_curve: Json;

  // User-added
  rating: number | null;
  status: string;
  group_label: string | null;
  notes: string | null;

  // Provenance
  source_format: 'xlsx' | 'html';
  source_filename: string | null;
  raw_curve_path: string | null;
  file_hash: string | null;
  uploaded_at: string;

  /**
   * Short stable display label per row (e.g. `A1`, `B2`). Letter is
   * assigned per unique ea_name in upload order; sequence increments
   * per (user_id, ea_name). Nullable while the lazy backfill catches
   * up — `formatTestLabel` falls back to a synthetic label until
   * the patch lands.
   */
  test_code: string | null;
};

export type TestInsert = Omit<TestRow, 'id' | 'uploaded_at' | 'status'> & {
  id?: string;
  uploaded_at?: string;
  status?: string;
};

export type TestUpdate = Partial<TestInsert>;

// ── ea_schemas ───────────────────────────────────────────────────────

export type EaSchemaRow = {
  id: string;
  user_id: string;
  ea_name: string;
  input_keys: Json;
  result_keys: Json;
  last_seen_at: string;
};

export type EaSchemaInsert = Omit<EaSchemaRow, 'id' | 'last_seen_at'> & {
  id?: string;
  last_seen_at?: string;
};

export type EaSchemaUpdate = Partial<EaSchemaInsert>;

// ── tags ─────────────────────────────────────────────────────────────

export type TagRow = {
  id: string;
  user_id: string;
  name: string;
};

export type TagInsert = Omit<TagRow, 'id'> & { id?: string };
export type TagUpdate = Partial<TagInsert>;

// ── test_tags (join) ─────────────────────────────────────────────────

export type TestTagRow = {
  test_id: string;
  tag_id: string;
};

export type TestTagInsert = TestTagRow;
export type TestTagUpdate = Partial<TestTagRow>;

// ── Database (supabase-js compatible) ────────────────────────────────

export type Database = {
  public: {
    Tables: {
      tests: {
        Row: TestRow;
        Insert: TestInsert;
        Update: TestUpdate;
        Relationships: [];
      };
      ea_schemas: {
        Row: EaSchemaRow;
        Insert: EaSchemaInsert;
        Update: EaSchemaUpdate;
        Relationships: [];
      };
      tags: {
        Row: TagRow;
        Insert: TagInsert;
        Update: TagUpdate;
        Relationships: [];
      };
      test_tags: {
        Row: TestTagRow;
        Insert: TestTagInsert;
        Update: TestTagUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
