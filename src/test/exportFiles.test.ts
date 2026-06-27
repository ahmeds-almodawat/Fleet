import { describe, expect, it } from 'vitest';
import { buildCsvContent, buildExcelHtml, escapeCsvCell, escapeHtml } from '@/lib/exportFiles';

describe('export file builders', () => {
  it('escapes CSV cells safely', () => {
    expect(escapeCsvCell('A "quoted" value')).toBe('"A ""quoted"" value"');
    expect(escapeCsvCell(null)).toBe('""');
  });

  it('builds UTF-8 BOM CSV content', () => {
    const csv = buildCsvContent(['Name', 'Amount'], [['Vendor, One', 1500]]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"Vendor, One","1500"');
  });

  it('escapes HTML in Excel-compatible export', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    const html = buildExcelHtml([{ name: 'Trips', headers: ['Plate'], rows: [['<ABC>']] }]);
    expect(html).toContain('&lt;ABC&gt;');
    expect(html).not.toContain('<ABC>');
  });
});
