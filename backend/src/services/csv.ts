import type { PriceRow } from '../models/types.js';

const REQUIRED_HEADERS = ['date', 'open', 'high', 'low', 'close', 'volume'] as const;

interface RawRow {
  lineNumber: number;
  date: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface ParseResult {
  error?: string;
  headers?: string[];
  rows?: RawRow[];
  colMap?: Record<string, number>;
}

function parseCSV(text: string): ParseResult {
  const lines = text.split('\n');
  const dataLines = lines.filter(l => l.trim().length > 0);
  if (dataLines.length < 2) {
    return { error: 'CSV must have a header row and at least one data row' };
  }

  const headerRow = dataLines[0].trim();
  const headers = headerRow.split(',').map(h => h.trim().toLowerCase());

  const seen: Record<string, boolean> = {};
  for (const h of headers) {
    if (seen[h]) {
      return { error: `Duplicate column "${h}" in header` };
    }
    seen[h] = true;
  }

  for (const required of REQUIRED_HEADERS) {
    if (!seen[required]) {
      return { error: `Missing required column "${required}" in header` };
    }
  }

  for (const h of Object.keys(seen)) {
    if (!REQUIRED_HEADERS.includes(h as (typeof REQUIRED_HEADERS)[number])) {
      return { error: `Unexpected column "${h}" in header` };
    }
  }

  const colMap: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    colMap[headers[i]] = i;
  }

  const rows: RawRow[] = [];

  for (let i = 1; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    const values = line.split(',').map(v => v.trim());
    const row: Record<string, string> = { lineNumber: String(i + 1), date: '', open: '', high: '', low: '', close: '', volume: '' };
    for (const h of REQUIRED_HEADERS) {
      row[h] = values[colMap[h]] || '';
    }
    rows.push(row as unknown as RawRow);
  }

  if (rows.length < 2) {
    return { error: 'CSV must have at least two data rows' };
  }

  return { headers, rows, colMap };
}

function validateRow(row: RawRow): string[] | null {
  const errors: string[] = [];
  const { date, open, high, low, close, volume } = row;

  if (!date) {
    errors.push(`Row ${row.lineNumber}: date is blank`);
  } else {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      errors.push(`Row ${row.lineNumber}: "${date}" is not a valid date`);
    }
  }

  const numFields = [
    { name: 'open', value: open },
    { name: 'high', value: high },
    { name: 'low', value: low },
    { name: 'close', value: close },
    { name: 'volume', value: volume },
  ];

  for (const field of numFields) {
    if (!field.value || field.value.trim() === '') {
      errors.push(`Row ${row.lineNumber}: ${field.name} is blank`);
      continue;
    }
    const num = Number(field.value);
    if (isNaN(num) || !isFinite(num)) {
      errors.push(`Row ${row.lineNumber}: ${field.name} "${field.value}" is not a finite number`);
      continue;
    }
    if (num <= 0) {
      errors.push(`Row ${row.lineNumber}: ${field.name} must be greater than 0`);
    }
  }

  if (errors.length > 0) return errors;

  const o = Number(open), h = Number(high), l = Number(low), c = Number(close);

  if (h < o) {
    errors.push(`Row ${row.lineNumber}: high (${h}) must be >= open (${o})`);
  }
  if (h < c) {
    errors.push(`Row ${row.lineNumber}: high (${h}) must be >= close (${c})`);
  }
  if (l > o) {
    errors.push(`Row ${row.lineNumber}: low (${l}) must be <= open (${o})`);
  }
  if (l > c) {
    errors.push(`Row ${row.lineNumber}: low (${l}) must be <= close (${c})`);
  }
  if (l > h) {
    errors.push(`Row ${row.lineNumber}: low (${l}) must be <= high (${h})`);
  }

  return errors.length > 0 ? errors : null;
}

function mapRowToDB(row: RawRow): PriceRow {
  return {
    trading_date: row.date,
    open_price: Number(row.open),
    high_price: Number(row.high),
    low_price: Number(row.low),
    close_price: Number(row.close),
    volume: Number(row.volume),
  };
}

export { parseCSV, validateRow, mapRowToDB };
export type { ParseResult, RawRow };