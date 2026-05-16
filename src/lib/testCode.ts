import type { Test } from '@/types/domain';

/**
 * Short stable display labels for test rows.
 *
 * Persisted column: `tests.test_code` = `{EA_letter}{sequence}` —
 * e.g. `A1`, `A2`, `B1`. The letter is assigned per unique
 * `ea_name` per user in upload order; the sequence increments per
 * `(user_id, ea_name)`. Both are stable for the life of the row.
 *
 * Display label is composed at render time:
 *   `{shortSymbol}-v{version}-{test_code}` → `US30-v040525-A1`
 * Parts are omitted gracefully when missing.
 */

// ────────────────────────────────────────────────────────────────
// Letter conversion
// ────────────────────────────────────────────────────────────────

/**
 * Convert a 1-based index into an Excel-style column letter:
 * 1 → `A`, 26 → `Z`, 27 → `AA`, 52 → `AZ`, 53 → `BA`, …
 */
export function toLetter(n: number): string {
  if (!Number.isInteger(n) || n < 1) return '';
  let s = '';
  let v = n;
  while (v > 0) {
    v--;
    s = String.fromCharCode(65 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return s;
}

/**
 * Inverse of `toLetter`. `A` → 1, `Z` → 26, `AA` → 27. Returns 0
 * for an empty / malformed input.
 */
export function fromLetter(s: string): number {
  if (!s) return 0;
  let n = 0;
  for (const ch of s.toUpperCase()) {
    const code = ch.charCodeAt(0) - 64;
    if (code < 1 || code > 26) return 0;
    n = n * 26 + code;
  }
  return n;
}

// ────────────────────────────────────────────────────────────────
// Assignment
// ────────────────────────────────────────────────────────────────

interface ParsedCode {
  letter: string;
  seq: number;
}

function parseCode(code: string | null | undefined): ParsedCode | null {
  if (!code) return null;
  const m = /^([A-Z]+)(\d+)$/.exec(code);
  if (!m) return null;
  return { letter: m[1]!, seq: Number(m[2]) };
}

/**
 * Compute the next test code for a new upload of `eaName` given the
 * full list of `existing` tests for this user.
 *
 * - If any existing test already has a code for this EA, reuse its
 *   letter and bump the sequence past the largest seen.
 * - Otherwise allocate the next free letter — the smallest positive
 *   integer that isn't already claimed by another EA in the user's
 *   library, encoded via `toLetter`. This survives deletions: if EA
 *   `B` is wiped, a fresh EA still gets `C` (not `B`), because we
 *   walk existing letters and pick the next gap-free slot above
 *   them. (Reusing `B` would conflict with any historical
 *   references like saved screenshots, exported portfolios, etc.)
 */
export function nextCodeForEa(
  eaName: string,
  existing: readonly Test[],
): string {
  // Same EA: reuse letter, bump sequence.
  const sameEa = existing.filter((t) => t.ea_name === eaName);
  const sameEaCodes = sameEa
    .map((t) => parseCode(t.test_code))
    .filter((c): c is ParsedCode => c !== null);
  if (sameEaCodes.length > 0) {
    const letter = sameEaCodes[0]!.letter;
    const maxSeq = Math.max(...sameEaCodes.map((c) => c.seq));
    return `${letter}${maxSeq + 1}`;
  }

  // New EA: allocate next free letter index (max existing + 1).
  // This deliberately doesn't reuse letters from deleted EAs.
  const allLetterNs = new Set<number>();
  for (const t of existing) {
    const c = parseCode(t.test_code);
    if (c) allLetterNs.add(fromLetter(c.letter));
  }
  const maxN = allLetterNs.size === 0 ? 0 : Math.max(...allLetterNs);
  return `${toLetter(maxN + 1)}1`;
}

/**
 * Walk the user's tests in upload order and assign codes to any row
 * that doesn't already have one. Existing codes are preserved.
 *
 * Returns a map of `test.id → assignedCode` for rows that need a
 * patch — empty if everything is already coded.
 */
export function assignMissingCodes(
  tests: readonly Test[],
): Map<string, string> {
  const patches = new Map<string, string>();
  if (tests.length === 0) return patches;

  // Snapshot of currently-coded rows; we mutate this as we go so
  // sequential null rows for the same EA each get unique codes.
  const working: Array<Pick<Test, 'id' | 'ea_name' | 'test_code'>> =
    tests.map((t) => ({
      id: t.id,
      ea_name: t.ea_name,
      test_code: t.test_code,
    }));

  // Process nulls in upload order so older rows get lower sequences.
  const sortedNullIdxs = working
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.test_code)
    .sort((a, b) => {
      const ai = tests.findIndex((x) => x.id === a.t.id);
      const bi = tests.findIndex((x) => x.id === b.t.id);
      const at = Date.parse(tests[ai]!.uploaded_at);
      const bt = Date.parse(tests[bi]!.uploaded_at);
      return at - bt;
    })
    .map(({ i }) => i);

  for (const idx of sortedNullIdxs) {
    const row = working[idx]!;
    // Re-pull the working snapshot as a Test[]-ish shape for nextCodeForEa.
    const code = nextCodeForEa(
      row.ea_name,
      working as unknown as readonly Test[],
    );
    patches.set(row.id, code);
    working[idx] = { ...row, test_code: code };
  }

  return patches;
}

// ────────────────────────────────────────────────────────────────
// Display
// ────────────────────────────────────────────────────────────────

/**
 * Shorten an MT5 symbol to its instrument code — strip the
 * suffix/decoration that brokers append.
 *   `US30_SPREAD_MEDIUM` → `US30`
 *   `EURUSD.r`           → `EURUSD`
 *   `GBPJPY+`            → `GBPJPY`
 *   `XAUUSD`             → `XAUUSD`
 */
export function shortSymbol(symbol: string | null | undefined): string {
  if (!symbol) return '';
  const m = symbol.match(/^[A-Za-z0-9]+/);
  return m ? m[0].toUpperCase() : symbol;
}

/**
 * Compose the public label for a test: `US30-v040525-A1`.
 *
 * Falls back gracefully when parts are missing:
 *   - no version → `US30-A1`
 *   - no code yet (backfill pending) → `US30-v040525-…`
 *   - no symbol → `v040525-A1`
 */
export function formatTestLabel(
  test: Pick<Test, 'symbol' | 'ea_version' | 'test_code'>,
): string {
  const parts: string[] = [];
  const sym = shortSymbol(test.symbol);
  if (sym) parts.push(sym);
  if (test.ea_version) parts.push(`v${test.ea_version}`);
  parts.push(test.test_code ?? '…');
  return parts.join('-');
}
