// Page numbers on an existing PDF with pdf-lib.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import puppeteer from 'puppeteer';
import { stampPageNumbers } from '../src/stamp.js';
import { find, print, readPages } from './helpers.js';

let browser;
let plainPdf;
before(async () => {
  browser = await puppeteer.launch();
  // A PDF with 3 pages and no page numbers.
  const html = '<p>One</p><p style="break-before: page">Two</p><p style="break-before: page">Three</p>';
  plainPdf = await print(browser, html, { format: 'A4' });
});
after(async () => {
  await browser?.close();
});

test('every page gets "Page X of Y" at the bottom center', async () => {
  const pages = await readPages(await stampPageNumbers(plainPdf));
  assert.equal(pages.length, 3);
  for (const [index, page] of pages.entries()) {
    const number = find(page, `Page ${index + 1} of 3`);
    assert.ok(number);
    assert.ok(Math.abs(number.x + number.width / 2 - page.width / 2) < 1);
    assert.ok(Math.abs(number.y - 24) < 1);
  }
});

test('skip: the cover gets no number, and the count starts after it', async () => {
  const pages = await readPages(await stampPageNumbers(plainPdf, { skip: 1 }));
  assert.ok(!find(pages[0], 'Page'));
  assert.ok(find(pages[1], 'Page 1 of 2'));
  assert.ok(find(pages[2], 'Page 2 of 2'));
});

test('the crop box sets the position', async () => {
  const doc = await PDFDocument.load(plainPdf);
  // Show only the left half of each page.
  for (const page of doc.getPages()) {
    page.setCropBox(0, 0, page.getWidth() / 2, page.getHeight());
  }
  const pages = await readPages(await stampPageNumbers(await doc.save()));
  const number = find(pages[0], 'Page 1 of 3');
  assert.ok(Math.abs(number.x + number.width / 2 - pages[0].width / 2) < 1);
});

test('a label in German works with Helvetica, Cyrillic text needs a font file', async () => {
  const german = await stampPageNumbers(plainPdf, { label: (n, total) => `Seite ${n} von ${total}` });
  assert.ok(find((await readPages(german))[0], 'Seite 1 von 3'));
  await assert.rejects(
    stampPageNumbers(plainPdf, { label: (n, total) => `Страница ${n} из ${total}` }),
    /WinAnsi cannot encode/,
  );
});
