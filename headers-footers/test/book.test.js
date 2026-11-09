// book.html with book.css: Chrome alone, then Chrome with Paged.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';
import { renderWithPagedJs } from '../src/paged.js';
import { find, print, readPages } from './helpers.js';

const CHAPTERS = ['Names and URLs', 'Errors', 'Pagination', 'Versions'];
let browser;
let html;
before(async () => {
  browser = await puppeteer.launch();
  const book = await readFile(new URL('../document/book.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../document/book.css', import.meta.url), 'utf8');
  html = book.replace('</head>', `<style>\n${css}</style>\n</head>`);
});
after(async () => {
  await browser?.close();
});

// The text in the top margin (24 mm = 68 pt) of a page.
function topMargin(page) {
  return page.items.filter((item) => item.y > page.height - 68).map((item) => item.text).join(' ');
}

// The page number (1-based) where each chapter heading is: the 16 pt text.
function chapterPages(pages) {
  return CHAPTERS.map((title) => 1 + pages.findIndex((page) => page.items.some((item) => item.text === title && item.size > 15)));
}

test('Chrome alone: @page :first, counter(page) and counter(pages) work', async () => {
  const pages = await readPages(await print(browser, html, { preferCSSPageSize: true }));
  const total = pages.length;
  assert.ok(find(pages[0], `Page 1 of ${total}`));
  assert.ok(find(pages[1], `Page 2 of ${total}`));
});

test('Chrome alone: no running header, no string-set, no target-counter', async () => {
  const pages = await readPages(await print(browser, html, { preferCSSPageSize: true }));
  // The running header stays in the text flow of page 1, so the top margins are empty.
  assert.equal(topMargin(pages[1]), '');
  assert.ok(pages[0].items.some((item) => item.text.includes('Example Analytics Ltd') && item.y < pages[0].height - 68));
  // The contents have no page numbers.
  const toc = pages[0].items.filter((item) => /^\d+$/.test(item.text.trim()));
  assert.equal(toc.length, 0);
});

test('Paged.js: the contents show the page of each chapter', async () => {
  const { pdf, pages: count } = await renderWithPagedJs(browser, html);
  const pages = await readPages(pdf);
  assert.equal(pages.length, count);
  const numbers = pages[0].items.filter((item) => /^\d+$/.test(item.text.trim())).map((item) => Number(item.text));
  assert.deepEqual(numbers, chapterPages(pages));
});

test('Paged.js: running header and chapter name from page 2, none on page 1', async () => {
  const { pdf } = await renderWithPagedJs(browser, html);
  const pages = await readPages(pdf);
  assert.equal(topMargin(pages[0]), '');
  const starts = chapterPages(pages);
  for (const [index, page] of pages.entries()) {
    if (index === 0) continue;
    const chapter = CHAPTERS[starts.filter((start) => start <= index + 1).length - 1];
    assert.equal(topMargin(page), `Example Analytics Ltd ${chapter}`);
    assert.ok(find(page, `Page ${index + 1} of ${pages.length}`));
  }
});

test('Paged.js: a chapter longer than one page repeats its name', async () => {
  const { pdf } = await renderWithPagedJs(browser, html);
  const pages = await readPages(pdf);
  const errorsPages = pages.filter((page) => topMargin(page).endsWith('Errors'));
  assert.ok(errorsPages.length >= 2);
});
