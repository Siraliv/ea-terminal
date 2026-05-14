import * as XLSX from 'xlsx';
import type { EquityPoint, Mt5Normalised } from './types';
import { normaliseMt5Raw, type Mt5Raw } from './normalise';
import {
  asOptNumber,
  asOptString,
  asString,
  toIsoTimestamp,
} from './parseShared';

/**
 * Parse an MT5 Strategy Tester `.xlsx` export from a buffer/ArrayBuffer.
 *
 * The MT5 export uses a fixed layout we can rely on:
 *   - Settings: rows 3–22, identity values in column D.
 *   - EA inputs: D7..D18 as `key=value` strings.
 *   - Results: rows 23–44, three label/value column pairs (A/D, E/H, I/L).
 *   - Deals table: starts after a row with column-A value `'Deals'`,
 *     with header row immediately below; columns A=Time, L=Balance.
 *
 * This parser is deliberately defensive: it scans the Results block by
 * looking for known label cells rather than reading from hard-coded
 * row numbers (MT5 occasionally shifts a row when locale differs).
 */
export function parseMt5XlsxBuffer(
  buf: ArrayBuffer | Uint8Array,
  filename: string,
): Mt5Normalised {
  // SheetJS's 'array' mode expects a Uint8Array — passing a raw
  // ArrayBuffer silently no-ops, leaving the workbook empty.
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('Empty workbook — no sheets found.');
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook.`);
  }

  const raw = scrapeSheet(sheet, filename);
  return normaliseMt5Raw(raw);
}

/** Browser-friendly wrapper that reads a `File` and parses it. */
export async function parseMt5XlsxFile(file: File): Promise<Mt5Normalised> {
  const buf = await file.arrayBuffer();
  return parseMt5XlsxBuffer(buf, file.name);
}

// ──────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────

function cellValue(sheet: XLSX.WorkSheet, addr: string): unknown {
  const cell = sheet[addr] as XLSX.CellObject | undefined;
  return cell?.v;
}

function scrapeSheet(sheet: XLSX.WorkSheet, filename: string): Mt5Raw {
  const ref = sheet['!ref'] ?? 'A1:N1';
  const range = XLSX.utils.decode_range(ref);

  // ---- Settings (rows 4..22) ----
  const expert = asString(cellValue(sheet, 'D4'));
  const symbol = asString(cellValue(sheet, 'D5'));
  const period = asString(cellValue(sheet, 'D6'));
  const broker = asOptString(cellValue(sheet, 'D19'));
  const currency = asOptString(cellValue(sheet, 'D20'));
  const initialDeposit = asOptNumber(cellValue(sheet, 'D21'));
  const leverage = asOptString(cellValue(sheet, 'D22'));

  // ---- EA inputs (D7..D18, "key=value") ----
  // Defensive: walk D7..D30 and accept any cell whose string value
  // contains an `=`. This survives MT5 exports that include 13+ inputs.
  const inputsRaw: Record<string, string> = {};
  for (let r = 7; r <= 40; r++) {
    const v = cellValue(sheet, `D${r}`);
    if (v == null) continue;
    const s = String(v).trim();
    if (!s.includes('=')) continue;
    // Stop scanning once we hit "Company:", "Currency:" etc. — those
    // sit in column A but we look at column D, so the corresponding D
    // cells are the *values*, not key=value strings, so they'd already
    // be skipped by the include('=') guard. Safe to keep scanning.
    const eq = s.indexOf('=');
    const key = s.slice(0, eq).trim();
    const val = s.slice(eq + 1).trim();
    if (key) inputsRaw[key] = val;
  }

  // ---- Results block ----
  // Scan rows 23..50 (range up to 60 to be safe). For each row look at
  // label cells in cols A, E, I and value cells in cols D, H, L.
  const resultsRaw: Record<string, string | number> = {};
  const labelCols: ReadonlyArray<readonly [labelCol: string, valueCol: string]> =
    [
      ['A', 'D'],
      ['E', 'H'],
      ['I', 'L'],
    ];

  for (let r = 23; r <= 60; r++) {
    for (const [labelCol, valueCol] of labelCols) {
      const labelRaw = cellValue(sheet, `${labelCol}${r}`);
      if (labelRaw == null) continue;
      const label = String(labelRaw)
        .trim()
        .replace(/[:\u2009]+$/u, '')
        .trim();
      if (!label) continue;
      // Skip the single-cell title row "Results" itself, and any header
      // row that doesn't sit in a known result-row position.
      if (label === 'Results' || label === 'Settings' || label === 'Inputs') {
        continue;
      }
      const val = cellValue(sheet, `${valueCol}${r}`);
      if (val == null) continue;
      // If the value cell is empty string after trimming, skip.
      if (typeof val === 'string' && val.trim() === '') continue;
      // MT5 uses each Results label exactly once across the three
      // (label, value) column pairs. If we ever see the same label
      // twice — locale duplicate, shifted layout, or stray cell — the
      // first occurrence wins. Overwriting would silently corrupt
      // headline metrics; keeping the first preserves them.
      if (label in resultsRaw) continue;
      resultsRaw[label] = typeof val === 'number' ? val : String(val).trim();
    }
  }

  // ---- Deals table → equity curve ----
  const equityCurveRaw = scrapeDealsCurve(sheet, range);

  return {
    expert,
    symbol,
    period,
    broker,
    currency,
    initialDeposit,
    leverage,
    inputsRaw,
    resultsRaw,
    equityCurveRaw,
    sourceFormat: 'xlsx',
    sourceFilename: filename,
  };
}

/**
 * Find the Deals table and return [{t, b}] one entry per deal.
 *
 * Discovery: we look for the first cell in column A whose value matches
 * `'Deals'` (case-insensitive). The header row is `r + 1`, data starts
 * at `r + 2`. We then walk down column A, reading column L as balance,
 * stopping at the first row where neither A nor L has a usable value.
 */
function scrapeDealsCurve(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
): EquityPoint[] {
  const lastRow = range.e.r + 1; // 1-based

  // Locate the "Deals" marker.
  let dealsRow = -1;
  for (let r = 1; r <= lastRow; r++) {
    const v = cellValue(sheet, `A${r}`);
    if (typeof v === 'string' && v.trim().toLowerCase() === 'deals') {
      dealsRow = r;
      break;
    }
  }
  if (dealsRow < 0) return [];

  const dataStart = dealsRow + 2; // skip header row
  const points: EquityPoint[] = [];

  for (let r = dataStart; r <= lastRow; r++) {
    const tCell = cellValue(sheet, `A${r}`);
    const bCell = cellValue(sheet, `L${r}`);
    // Positive terminator: the deals table only contains datestamps
    // or `Date` objects in column A. Anything else (a section header
    // like "Orders" / "Summary", a footer note, a blank gap) ends the
    // table. The previous "two consecutive empties" rule walked past
    // the table whenever a comment row had a blank A but populated L.
    if (!isDealRowMarker(tCell)) break;
    const t = toIsoTimestamp(tCell);
    const b = asOptNumber(bCell);
    if (t == null || b == null) continue;
    points.push({ t, b });
  }

  return points;
}

/**
 * Does this column-A cell look like a deals-table data row?
 *
 * Accepts:
 *   - `Date` (SheetJS with `cellDates: true` returns these).
 *   - Strings shaped `YYYY.MM.DD HH:MM(:SS)?` (the MT5 format).
 *   - Excel serial dates (positive finite numbers).
 *
 * Rejects anything else — most importantly bare section headers like
 * `"Orders"` / `"Summary"`, which previously slipped past the
 * two-empties heuristic.
 */
function isDealRowMarker(v: unknown): boolean {
  if (v instanceof Date) return Number.isFinite(v.getTime());
  if (typeof v === 'number') return Number.isFinite(v) && v > 0;
  if (typeof v === 'string') {
    return /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}[ T]\d{1,2}:\d{2}/.test(v.trim());
  }
  return false;
}

