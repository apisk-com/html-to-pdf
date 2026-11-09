// Usage: node make-report.js [output.pdf]
// Renders document/report.html: a cover page, then a header and "Page X of Y".
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer';
import { renderReport } from './src/report.js';

const output = process.argv[2] ?? 'out/report.pdf';
const html = await readFile(new URL('./document/report.html', import.meta.url), 'utf8');

const browser = await puppeteer.launch();
try {
  const pdf = await renderReport(browser, html, {
    company: 'Example Analytics Ltd',
    printedOn: new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date()),
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, pdf);
  console.log(`Wrote ${output} (${Math.round(pdf.length / 1024)} KB)`);
} finally {
  await browser.close();
}
