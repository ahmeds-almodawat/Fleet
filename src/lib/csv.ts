// Simple CSV helpers (Excel-friendly for Arabic by adding UTF-8 BOM)

export type CsvRow = (string | number | null | undefined)[];

function escapeCsvCell(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function toCsv(headers: string[], rows: CsvRow[]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(','));
  for (const row of rows) {
    lines.push(
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          return escapeCsvCell(String(cell));
        })
        .join(',')
    );
  }
  return lines.join('\n');
}

export function downloadCsv(filename: string, csvContent: string) {
  // Add BOM so Excel opens UTF-8 Arabic correctly
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
