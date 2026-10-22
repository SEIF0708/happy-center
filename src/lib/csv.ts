const FORMULA_PREFIX = /^[=+\-@|\t\r]/;

export function escapeCsvField(value: string | number | null | undefined, delimiter = ","): string {
  const raw = value == null ? "" : String(value);
  const guarded = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  const needsQuotes = guarded.includes(delimiter) || /["\n\r]/.test(guarded);
  const escaped = guarded.replaceAll('"', '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return encodeCsvRows([headers, ...rows]);
}

export function toReportCsv(input: {
  title: string;
  metadata: Array<[string, string | number]>;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  totals?: Array<string | number | null | undefined>;
}): string {
  const emptyRow = Array<string>(input.headers.length).fill("");
  const reportRows = [
    [input.title, ...emptyRow.slice(1)],
    ...input.metadata.map(([label, value]) => [label, String(value), ...emptyRow.slice(2)]),
    emptyRow,
    input.headers,
    ...input.rows.map((row) => [...row, ...emptyRow.slice(row.length)]),
  ];
  if (input.totals) {
    reportRows.push(emptyRow, [...input.totals, ...emptyRow.slice(input.totals.length)]);
  }
  return `\uFEFFsep=;\r\n${encodeCsvRows(reportRows, ";").slice(1)}`;
}

function encodeCsvRows(rows: Array<Array<string | number | null | undefined>>, delimiter = ","): string {
  const lines = rows.map((row) => row.map((value) => escapeCsvField(value, delimiter)).join(delimiter));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
