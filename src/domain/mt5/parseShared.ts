/**
 * Helpers shared by the XLSX and HTML parsers. Anything that converts
 * a cell value into a typed primitive lives here so the two parsers
 * don't drift.
 */
import { parseLooseNumber } from './normalise';

/**
 * Coerce a value (string | Date | number | null) into an ISO 8601
 * timestamp string. MT5 emits timestamps in `"YYYY.MM.DD HH:MM:SS"`
 * form across both XLSX and HTML exports; SheetJS may also hand us a
 * `Date` (when `cellDates: true`) or an Excel serial number.
 *
 * **Time-zone convention.** MT5 reports broker server time without a
 * tz suffix. We treat every wall-clock string as **naïve UTC** so the
 * XLSX and HTML parsers produce identical timestamps for the same
 * input — `Date.parse("2015.01.02 16:00:03")` is locale-dependent and
 * was the source of subtle drift between the two parsers. Callers
 * should likewise treat `EquityPoint.t` as broker time, not literal
 * UTC, and avoid `getHours()` (use `getUTCHours()`) when displaying.
 */
export function toIsoTimestamp(v: unknown): string | null {
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // MT5 format: "2015.01.02 16:00:03" — also tolerate '-' / '/'.
    const m = s.match(
      /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
    );
    if (m) {
      const [, y, mo, d, h, mi, se] = m;
      const iso = `${y}-${pad2(mo!)}-${pad2(d!)}T${pad2(h!)}:${mi}:${se ?? '00'}.000Z`;
      const ts = Date.parse(iso);
      return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
    }
    // Fallback: try ISO-style strings. Append `Z` if no tz info is
    // present so we still interpret as UTC instead of falling back to
    // the host machine's local zone (which would differ between dev
    // boxes and Vercel's prod runtime).
    const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
    const parsed = Date.parse(hasTz ? s : `${s}Z`);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof v === 'number') {
    // Excel serial date → JS Date. SheetJS returns numbers when
    // `cellDates` is false; the parser usually sets it to true so this
    // is a fallback path.
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + v * 86_400_000;
    return new Date(ms).toISOString();
  }
  return null;
}

export function pad2(s: string): string {
  return s.length === 1 ? `0${s}` : s;
}

export function asString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

export function asOptString(v: unknown): string | null {
  const s = asString(v);
  return s === '' ? null : s;
}

export function asOptNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return parseLooseNumber(v);
  return null;
}
