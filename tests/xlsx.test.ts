import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildXlsx } from '../src/export/xlsx';

describe('buildXlsx', () => {
  it('writes a valid workbook structure', () => {
    const bytes = buildXlsx([
      {
        name: 'Expenses',
        columns: [{ width: 12 }, { width: 30 }, { width: 12 }],
        rows: [
          [{ v: 'Date', s: 'header' }, { v: 'Label', s: 'header' }, { v: 'Amount', s: 'header' }],
          [{ v: new Date(2026, 9, 12), s: 'date' }, 'Carrefour <Market> & co', { v: 64.2, s: 'money' }]
        ]
      },
      { name: 'By category', columns: [], rows: [['x']] }
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
        'xl/worksheets/sheet2.xml'
      ].sort()
    );
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('Carrefour &lt;Market&gt; &amp; co');
    // 2026-10-12 as an Excel serial date.
    expect(sheet).toContain('<v>46307</v>');
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="By category"');
  });
});
