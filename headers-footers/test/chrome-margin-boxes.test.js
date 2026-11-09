// CSS @page margin boxes in Chrome alone, without Paged.js.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';
import { find, print, readPages } from './helpers.js';

const LOGO = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#99f6e4"/></svg>',
).toString('base64');
// Four short pages.
const PAGES = '<p>One</p><p style="break-before: page">Two</p><p style="break-before: page">Three</p><p style="break-before: page">Four</p>';

let browser;
before(async () => {
  browser = await puppeteer.launch();
});
after(async () => {
  await browser?.close();
});

async function render(css, body = PAGES) {
  const pdf = await print(browser, `<style>${css}</style>${body}`, { preferCSSPageSize: true });
  return readPages(pdf);
}

test('@page :first removes the header from page 1 only', async () => {
  const pages = await render(`
    @page { size: A4; margin: 20mm; @top-left { content: "HEADER"; font: 9pt Arial; } }
    @page :first { @top-left { content: none; } }`);
  assert.ok(!find(pages[0], 'HEADER'));
  assert.ok(find(pages[1], 'HEADER'));
});

test('a named page changes the margin boxes of its pages', async () => {
  const pages = await render(`
    @page { size: A4; margin: 20mm; @bottom-right { content: "Page " counter(page); font: 9pt Arial; } }
    @page cover { @bottom-right { content: none; } }
    .cover { page: cover; }`, `<div class="cover">COVER</div>${PAGES.replace('<p>One</p>', '<p style="break-before: page">One</p>')}`);
  assert.ok(find(pages[0], 'COVER'));
  assert.ok(!find(pages[0], 'Page'));
  assert.ok(find(pages[1], 'Page 2'));
});

test('content: url() prints a data URL image in a margin box', async () => {
  const pages = await render(`@page { size: A4; margin: 20mm; @top-left { content: url(${LOGO}); } }`);
  assert.ok(pages[0].fills.has('#99f6e4'));
});

test('counter-reset: page on an element does not restart the numbers', async () => {
  const pages = await render(
    `@page { size: A4; margin: 20mm; @bottom-right { content: "Page " counter(page); font: 9pt Arial; } }
    .restart { counter-reset: page 1; }`,
    PAGES.replace('<p style="break-before: page">Three</p>', '<p class="restart" style="break-before: page">Three</p>'),
  );
  assert.ok(find(pages[2], 'Page 3'));
});
