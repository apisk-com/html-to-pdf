// What Chrome does with headerTemplate and footerTemplate.
// Each test proves one row of the rules table in the tutorial.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';
import { find, print, readPages } from './helpers.js';

const TEAL = '#0f766e';
const BODY = '<title>Doc title</title><p style="font: 12pt Arial">BODYTEXT</p>';
const LONG_BODY = BODY + '<div style="height: 600mm"></div>';
const MARGIN = { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' };
// An empty footer, so that Chrome does not print its default footer.
const NO_FOOTER = '<span></span>';

let browser;
let server;
let imageRequests = 0;
before(async () => {
  browser = await puppeteer.launch();
  const logo = await readFile(new URL('../document/logo.svg', import.meta.url));
  server = http.createServer((req, res) => {
    imageRequests++;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(logo);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});
after(async () => {
  await browser?.close();
  server?.close();
});

// Prints BODY with a header template and returns page 1.
async function header(template, options = {}, html = BODY) {
  const pdf = await print(browser, html, {
    format: 'A4',
    margin: MARGIN,
    displayHeaderFooter: true,
    headerTemplate: template,
    footerTemplate: NO_FOOTER,
    ...options,
  });
  const [page] = await readPages(pdf);
  return { page, pdf };
}

test('text without a font size is 1px (0.75 pt) high', async () => {
  const { page } = await header('<div>TINY</div>');
  assert.ok(Math.abs(find(page, 'TINY').size - 0.75) < 0.01);
});

test('a font size in the template works', async () => {
  const { page } = await header('<div style="font-size: 10pt">SIZED</div>');
  assert.ok(Math.abs(find(page, 'SIZED').size - 10) < 0.01);
});

test('the CSS of the page does not reach the template', async () => {
  const html = `<style>.brand { font-size: 20px; }</style>${BODY}`;
  const { page } = await header('<div class="brand">BRAND</div>', {}, html);
  assert.ok(find(page, 'BRAND').size < 1);
});

test('a <style> element inside the template works', async () => {
  const { page } = await header('<style>.f { font-size: 10pt; }</style><div class="f">STYLED</div>');
  assert.ok(Math.abs(find(page, 'STYLED').size - 10) < 0.01);
});

test('a double quote inside style="..." ends the attribute', async () => {
  const { page } = await header('<div style="font-family: "Liberation Sans", Arial; font-size: 10pt">QUOTE</div>');
  assert.ok(find(page, 'QUOTE').size < 1);
});

test('without font-family, the template uses the default font of Chrome, not the page font', async (t) => {
  const html = '<title>T</title><p style="font: 12pt Arial">BODYTEXT</p>';
  const { page } = await header('<div style="font-size: 10pt">DEFAULTFONT</div>', {}, html);
  const templateFont = find(page, 'DEFAULTFONT').font;
  const pageFont = find(page, 'BODYTEXT').font;
  t.diagnostic(`template font: ${templateFont}, page font: ${pageFont}`);
  assert.notEqual(templateFont.split('+')[1], pageFont.split('+')[1]);
});

test('the template starts at the left edge of the paper, not at the page margin', async () => {
  const { page } = await header('<div style="font-size: 10pt">EDGE</div>');
  assert.ok(find(page, 'EDGE').x < 1);
  assert.ok(find(page, 'BODYTEXT').x > 40);
});

test('with a top margin of 0, the header prints over the body text', async () => {
  const { page } = await header('<div style="font-size: 10pt">OVER</div>', { margin: { top: '0' } });
  assert.ok(Math.abs(find(page, 'OVER').y - find(page, 'BODYTEXT').y) < 12);
});

test('a header taller than the top margin is not cut, it goes over the body', async () => {
  const template = '<div style="font-size: 10pt; height: 40mm">TALLTOP<div style="margin-top: 30mm">TALLEND</div></div>';
  const { page } = await header(template);
  assert.ok(find(page, 'TALLEND').y < find(page, 'BODYTEXT').y);
});

test('without a footerTemplate, Chrome prints its default footer', async () => {
  const { page } = await header('<div style="font-size: 10pt">ONLYHEADER</div>', { footerTemplate: undefined });
  assert.ok(find(page, 'about:blank'));
  assert.ok(find(page, '1/1'));
});

test('an image from a data URL is drawn, an image from an http URL is not loaded', async () => {
  const logo = await readFile(new URL('../document/logo.svg', import.meta.url));
  const dataUrl = `data:image/svg+xml;base64,${logo.toString('base64')}`;
  const httpUrl = `http://127.0.0.1:${server.address().port}/logo.svg`;

  imageRequests = 0;
  const fromHttp = await header(`<img src="${httpUrl}" style="width: 20px; height: 20px">`);
  assert.equal(imageRequests, 0);
  assert.ok(!fromHttp.page.fills.has(TEAL));

  const fromData = await header(`<img src="${dataUrl}" style="width: 20px; height: 20px">`);
  assert.ok(fromData.page.fills.has(TEAL));
});

test('an inline SVG element is drawn', async () => {
  const svg = `<svg width="20" height="20"><rect width="20" height="20" fill="${TEAL}"/></svg>`;
  const { page } = await header(svg);
  assert.ok(page.fills.has(TEAL));
});

test('a background color needs -webkit-print-color-adjust: exact', async () => {
  const style = `font-size: 10pt; width: 100%; background: ${TEAL}`;
  const plain = await header(`<div style="${style}">BG</div>`, { printBackground: true });
  assert.ok(!plain.page.fills.has(TEAL));
  const exact = await header(`<div style="${style}; -webkit-print-color-adjust: exact">BG</div>`, { printBackground: true });
  assert.ok(exact.page.fills.has(TEAL));
});

test('scripts in the template do not run', async () => {
  const template = '<div id="h" style="font-size: 10pt">BEFORE</div><script>document.getElementById("h").textContent = "AFTER";</script>';
  const { page } = await header(template);
  assert.ok(find(page, 'BEFORE'));
  assert.ok(!find(page, 'AFTER'));
});

test('web fonts: @font-face in the template works only when the page uses the same font', async () => {
  const font = await readFile(new URL('./fixtures/inter-latin-400-normal.woff2', import.meta.url));
  const fontFace = `<style>@font-face { font-family: "Brand"; src: url(data:font/woff2;base64,${font.toString('base64')}); }</style>`;
  const text = '<div style="font: 10pt Brand, serif">FONT</div>';
  const usesBrand = '<p style="font: 12pt Brand">BRANDBODY</p>';
  const fontOf = async (template, html) => find((await header(template, {}, html)).page, 'FONT').font;

  // The page loads and uses the font. The template only names it.
  assert.ok(!(await fontOf(text, fontFace + usesBrand + BODY)).includes('Inter'));
  // The template loads the font. The page does not use it.
  assert.ok(!(await fontOf(fontFace + text, BODY)).includes('Inter'));
  // Both load the same font, and the page uses it.
  assert.ok((await fontOf(fontFace + text, fontFace + usesBrand + BODY)).includes('Inter'));
});

test('a font that is installed on the computer works in the template', async () => {
  const { page } = await header('<div style="font: 10pt Arial">INSTALLED</div>');
  assert.match(find(page, 'INSTALLED').font, /Arial|Liberation/);
});

test('title and url come from the page; url is about:blank after setContent()', async () => {
  const template = '<div style="font-size: 10pt">T=<span class="title"></span> U=<span class="url"></span></div>';
  const { page } = await header(template);
  assert.ok(find(page, 'T=Doc title U=about:blank'));
});

test('pageNumber and totalPages count the whole document, also with pageRanges', async () => {
  const footer = '<div style="font-size: 10pt">P<span class="pageNumber"></span>of<span class="totalPages"></span></div>';
  const pdf = await print(browser, LONG_BODY, {
    format: 'A4',
    margin: MARGIN,
    displayHeaderFooter: true,
    headerTemplate: NO_FOOTER,
    footerTemplate: footer,
    pageRanges: '2-',
  });
  const pages = await readPages(pdf);
  assert.equal(pages.length, 2);
  assert.ok(find(pages[0], 'P2of3'));
  assert.ok(find(pages[1], 'P3of3'));
});

test('a page range after the last page is an error', async () => {
  await assert.rejects(print(browser, BODY, { pageRanges: '2-' }), /Page range exceeds page count/);
});
