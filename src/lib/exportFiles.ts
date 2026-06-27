export type ExportCell = string | number | boolean | null | undefined;

export type ExcelSheet = {
  name: string;
  headers: ExportCell[];
  rows: ExportCell[][];
};

export function escapeCsvCell(value: ExportCell): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function escapeHtml(value: ExportCell): string {
  return (value == null ? '' : String(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildCsvContent(headers: ExportCell[], rows: ExportCell[][]): string {
  return '\ufeff' + [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n');
}

export function buildExcelHtml(sheets: ExcelSheet[]): string {
  const safeSheets = sheets.filter((sheet) => sheet.headers.length > 0);
  return `\ufeff<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Arial, sans-serif; }
  h2 { margin: 20px 0 8px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
  th { background: #f3f4f6; font-weight: 700; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; mso-number-format:'\\@'; }
</style>
</head>
<body>
${safeSheets.map((sheet) => `
  <h2>${escapeHtml(sheet.name)}</h2>
  <table>
    <thead><tr>${sheet.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${sheet.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('\n')}
    </tbody>
  </table>
`).join('\n')}
</body>
</html>`;
}

export function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(filename: string, headers: ExportCell[], rows: ExportCell[][]) {
  downloadTextFile(filename, buildCsvContent(headers, rows), 'text/csv;charset=utf-8;');
}

export function downloadExcelHtml(filename: string, sheets: ExcelSheet[]) {
  downloadTextFile(filename, buildExcelHtml(sheets), 'application/vnd.ms-excel;charset=utf-8;');
}

export function printCurrentPage() {
  window.print();
}

export function formatDateTimeForExport(value?: string | null, locale = 'en-US') {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString(locale);
  } catch {
    return value;
  }
}
