// The report: a cover page without header, then a header and "Page X of Y".
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer';
import { renderReport } from '../src/report.js';
import { escapeHtml, footerTemplate, headerTemplate } from '../src/templates.js';
import { find, isTagged, print, readPages } from './helpers.js';

const OPTIONS = { company: 'Example Analytics Ltd', printedOn: '9 November 2026' };
let browser;
let html;
let pdf;
let pages;
before(async () => {
  browser = await puppeteer.launch();
  html = await readFile(new URL('../document/report.html', import.meta.url), 'utf8');
  pdf = await renderReport(browser, html, OPTIONS);
  pages = await readPages(pdf);
});
after(async () => {
  await browser?.close();
});

test('the report is a PDF with a cover and at least two more pages', () => {
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
  assert.ok(pages.length >= 3);
  assert.ok(find(pages[0], 'Operations report'));
});

test('the cover has no header and no footer', () => {
  assert.ok(!find(pages[0], 'Operations report, Q3 2026'));
  assert.ok(!find(pages[0], 'Printed on'));
  assert.ok(!find(pages[0], 'Page '));
});

test('every other page has the header, the title and "Page X of Y" in 8 pt', () => {
  const total = pages.length;
  for (const [index, page] of pages.entries()) {
    if (index === 0) continue;
    const number = find(page, `Page ${index + 1} of ${total}`);
    assert.ok(number, `page ${index + 1} has its number`);
    assert.ok(Math.abs(number.size - 8) < 0.01);
    assert.ok(find(page, 'Example Analytics Ltd'));
    assert.ok(find(page, 'Operations report, Q3 2026'));
    assert.ok(find(page, 'Printed on 9 November 2026'));
  }
});

test('the footer text starts 15 mm from the left edge', () => {
  assert.ok(Math.abs(find(pages[1], 'Printed on').x - 42.52) < 1); // 15 mm in points
});

test('the header draws the logo from its data URL', () => {
  // #99f6e4 is the light bar of the logo. No other part of page 2 uses it.
  assert.ok(pages[1].fills.has('#99f6e4'));
});

test('the page number ends 15 mm from the right edge', () => {
  const page = pages[1];
  const number = find(page, 'Page 2 of');
  assert.ok(Math.abs(number.x + number.width - (page.width - 42.52)) < 1);
});

test('the merged PDF keeps the title but loses the tags of the Chrome PDF', async () => {
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getTitle(), 'Operations report, Q3 2026');
  const chromePdf = await print(browser, html, { format: 'A4' });
  assert.equal(await isTagged(chromePdf), true);
  assert.equal(await isTagged(pdf), false);
});

test('values in the templates are escaped', async () => {
  assert.equal(escapeHtml('<b>A & B</b>'), '&lt;b&gt;A &amp; B&lt;/b&gt;');
  const company = '<b>Tom & Jerry</b>';
  const result = await print(browser, '<title>T</title><p>x</p>', {
    format: 'A4',
    margin: { top: '22mm', bottom: '20mm' },
    displayHeaderFooter: true,
    headerTemplate: headerTemplate({ company }),
    footerTemplate: footerTemplate({ printedOn: '<i>today</i>' }),
  });
  const [page] = await readPages(result);
  assert.ok(find(page, '<b>Tom & Jerry</b>'));
  assert.ok(find(page, 'Printed on <i>today</i>'));
});
