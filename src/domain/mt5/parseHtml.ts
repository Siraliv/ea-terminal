import type { EquityPoint, Mt5Normalised } from './types';
import { normaliseMt5Raw, type Mt5Raw } from './normalise';
import { asOptNumber, asOptString, toIsoTimestamp } from './parseShared';

/**
 * Parse an MT5 Strategy Tester `.htm` / `.html` export.
 *
 * The MT5 HTML report is a single `<table>` with section markers
 * (`<b>Settings</b>`, `<b>Results</b>`, `<b>Orders</b>`, `<b>Deals</b>`).
 *
 *   - Settings rows look like:
 *       <td colspan="3">Expert:</td><td colspan="10"><b>NAME</b></td>
 *   - Inputs are rows that follow the `Inputs:` label until `Company:`;
 *     the value cell is `<b>Key=Value</b>`.
 *   - Results rows pack up to 3 label/value pairs per row.
 *   - Deals table has 13 columns; col 0 = Time, col 11 = Balance.
 *
 * The parser scrapes those rows into an `Mt5Raw` and hands off to
 * `normaliseMt5Raw`, so all downstream coercion (compound metric
 * shapes, identity parsing, LTTB downsampling) is reused from the
 * XLSX path unchanged.
 */
export function parseMt5HtmlString(
  html: string,
  filename: string,
): Mt5Normalised {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr'));
  if (rows.length === 0) {
    throw new Error('Empty HTML report — no <tr> rows found.');
  }

  const raw = scrapeRows(rows, filename);
  return normaliseMt5Raw(raw);
}

/**
 * Browser wrapper that decodes the File correctly. MT5 emits the HTML
 * report as UTF-16 LE with a BOM; passing it through `File.text()`
 * does the right thing in modern browsers (it honours the BOM), but
 * we belt-and-brace it by inspecting the first two bytes ourselves —
 * older Safari and the jsdom test env don't always handle UTF-16.
 */
export async function parseMt5HtmlFile(file: File): Promise<Mt5Normalised> {
  const buf = await file.arrayBuffer();
  const html = decodeHtmlBuffer(buf);
  return parseMt5HtmlString(html, file.name);
}

/** Decode an MT5 HTML buffer respecting its BOM (UTF-16 LE/BE or UTF-8). */
export function decodeHtmlBuffer(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// ──────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────

type Section = 'preamble' | 'settings' | 'inputs' | 'results' | 'orders' | 'deals';

function scrapeRows(rows: HTMLTableRowElement[], filename: string): Mt5Raw {
  let section: Section = 'preamble';

  // Identity fields (populated from the Settings block).
  let expert = '';
  let symbol = '';
  let period = '';
  let broker: string | null = null;
  let currency: string | null = null;
  let initialDeposit: number | null = null;
  let leverage: string | null = null;

  const inputsRaw: Record<string, string> = {};
  const resultsRaw: Record<string, string | number> = {};
  const equityCurveRaw: EquityPoint[] = [];
  let dealsHeaderSeen = false;

  for (const row of rows) {
    // Section markers sit on their own row inside a <b> tag.
    const marker = sectionMarker(row);
    if (marker) {
      section = marker;
      dealsHeaderSeen = false;
      continue;
    }

    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length === 0) continue;

    if (section === 'settings' || section === 'inputs') {
      handleSettingsRow(cells, {
        setExpert: (v) => (expert = v),
        setSymbol: (v) => (symbol = v),
        setPeriod: (v) => (period = v),
        setBroker: (v) => (broker = v),
        setCurrency: (v) => (currency = v),
        setInitialDeposit: (v) => (initialDeposit = v),
        setLeverage: (v) => (leverage = v),
        addInput: (k, v) => (inputsRaw[k] = v),
        enterInputs: () => (section = 'inputs'),
        leaveInputs: () => (section = 'settings'),
      });
      continue;
    }

    if (section === 'results') {
      // Each results row carries up to 3 label/value pairs. Walk cells
      // in stride: label cell uses `colspan="3"` and the value cell
      // sits immediately after with a `<b>` child.
      for (let i = 0; i < cells.length - 1; i++) {
        const labelCell = cells[i]!;
        const label = cleanLabel(labelCell.textContent);
        if (!label) continue;
        const valueCell = cells[i + 1]!;
        const value = readValue(valueCell);
        if (value === '') continue;
        resultsRaw[label] = value;
        i++; // skip past the value cell we just consumed
      }
      continue;
    }

    if (section === 'deals') {
      // Wait until we've actually walked past the column-header row
      // before reading data rows. Some MT5 builds emit a one-line
      // summary inside the Deals section *before* the header — the
      // old "first non-marker row" flag was eating the first real
      // deal in those exports. We sniff for the literal "Time" cell
      // (the leftmost header label is stable across MT5 locales we
      // ship for).
      if (!dealsHeaderSeen) {
        const first = (cells[0]?.textContent ?? '').trim().toLowerCase();
        if (first === 'time') {
          dealsHeaderSeen = true;
        }
        continue;
      }
      if (cells.length < 12) continue;
      const t = toIsoTimestamp(cells[0]!.textContent ?? '');
      const balanceText = cells[11]!.textContent ?? '';
      const b = asOptNumber(balanceText);
      if (t == null || b == null) continue;
      equityCurveRaw.push({ t, b });
    }
  }

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
    sourceFormat: 'html',
    sourceFilename: filename,
  };
}

/** Detect a row that's just a section title in a `<b>` element. */
function sectionMarker(row: HTMLTableRowElement): Section | null {
  const bold = row.querySelector('b');
  if (!bold) return null;
  // A marker row contains *only* a heading — no sibling label cells.
  // The Settings/Results/Orders/Deals markers all sit alone inside a
  // single full-width <td> or <th>.
  const cells = row.querySelectorAll('td, th');
  if (cells.length !== 1) return null;
  const text = (bold.textContent ?? '').trim().toLowerCase();
  switch (text) {
    case 'settings':
      return 'settings';
    case 'results':
      return 'results';
    case 'orders':
      return 'orders';
    case 'deals':
      return 'deals';
    default:
      return null;
  }
}

interface SettingsHandlers {
  setExpert: (v: string) => void;
  setSymbol: (v: string) => void;
  setPeriod: (v: string) => void;
  setBroker: (v: string | null) => void;
  setCurrency: (v: string | null) => void;
  setInitialDeposit: (v: number | null) => void;
  setLeverage: (v: string | null) => void;
  addInput: (key: string, value: string) => void;
  enterInputs: () => void;
  leaveInputs: () => void;
}

function handleSettingsRow(
  cells: HTMLTableCellElement[],
  h: SettingsHandlers,
): void {
  // The Settings block uses 2-cell rows: a label cell (`colspan="3"`)
  // and a value cell (`colspan="10"`). The Inputs block reuses the
  // same shape but the label cell is empty.
  const labelCell = cells[0]!;
  const valueCell = cells[1];
  if (!valueCell) return;

  const label = cleanLabel(labelCell.textContent);
  const value = readValue(valueCell);

  // Empty label + `key=value` shape → an EA input row.
  if (!label) {
    if (value.includes('=')) {
      const eq = value.indexOf('=');
      const key = value.slice(0, eq).trim();
      const val = value.slice(eq + 1).trim();
      if (key) h.addInput(key, val);
    }
    return;
  }

  switch (label) {
    case 'Expert':
      h.setExpert(value);
      return;
    case 'Symbol':
      h.setSymbol(value);
      return;
    case 'Period':
      h.setPeriod(value);
      return;
    case 'Inputs':
      h.enterInputs();
      // The first inputs row carries its `key=value` on the same row.
      if (value.includes('=')) {
        const eq = value.indexOf('=');
        const key = value.slice(0, eq).trim();
        const val = value.slice(eq + 1).trim();
        if (key) h.addInput(key, val);
      }
      return;
    case 'Company':
      h.leaveInputs();
      h.setBroker(asOptString(value));
      return;
    case 'Currency':
      h.setCurrency(asOptString(value));
      return;
    case 'Initial Deposit':
      h.setInitialDeposit(asOptNumber(value));
      return;
    case 'Leverage':
      h.setLeverage(asOptString(value));
      return;
    default:
      return;
  }
}

/** Normalise a label cell's text — collapse whitespace, drop trailing `:`. */
function cleanLabel(raw: string | null | undefined): string {
  if (raw == null) return '';
  return raw
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:\u2009]+$/u, '')
    .trim();
}

/** Read a value cell's text (prefers `<b>` content), normalised. */
function readValue(cell: Element): string {
  const bold = cell.querySelector('b');
  const raw = (bold ?? cell).textContent ?? '';
  return raw.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}
