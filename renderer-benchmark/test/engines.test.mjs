// Render each document once with each installed engine, and check the PDF.
// Run with npm test from the renderer-benchmark folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { DOCUMENTS, ENGINES, median, runWorker } from '../bench.mjs';
import { reportHtml } from '../documents/make-report.mjs';

// Pages of the report. The Chrome engines print 30 pages; the other engines lay out the tables differently.
const REPORT_PAGES = { weasyprint: [20, 40], wkhtmltopdf: [20, 40] };

// true if the command runs without an error
function works(command, args) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function installed(engine) {
  if (engine.id === 'weasyprint') return existsSync(engine.command[0]);
  if (engine.id === 'gotenberg') return works('docker', ['info']);
  if (engine.id === 'wkhtmltopdf') return works('wkhtmltopdf', ['--version']);
  return true; // Puppeteer and Playwright come with npm ci
}

mkdirSync('out/test', { recursive: true });

for (const engine of ENGINES) {
  for (const doc of DOCUMENTS) {
    test(`${engine.id} renders ${doc.id}`, { skip: !installed(engine) && 'not installed' }, async () => {
      const out = `out/test/${engine.id}-${doc.id}.pdf`;
      const result = runWorker([...engine.command, doc.file, '1', '2', out]);

      assert.equal(result.timesMs.length, 2);
      assert.ok(result.coldMs > 0);
      const pdf = readFileSync(out);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.equal(result.bytes, pdf.length);

      const pages = (await PDFDocument.load(pdf)).getPageCount();
      if (doc.id !== 'report') {
        assert.equal(pages, 1, `${doc.id} must fit on one page`);
      } else if (REPORT_PAGES[engine.id]) {
        const [min, max] = REPORT_PAGES[engine.id];
        assert.ok(pages >= min && pages <= max, `report has ${pages} pages`);
      } else {
        assert.equal(pages, 30);
      }
    });
  }
}

test('report.html is the output of make-report.mjs', () => {
  assert.equal(readFileSync('documents/report.html', 'utf8'), reportHtml());
});

test('median of an odd and an even list', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
