// Usage: node make-book.js [output.pdf]
// Renders document/book.html with book.css: Paged.js in Chrome.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer';
import { renderWithPagedJs } from './src/paged.js';

const output = process.argv[2] ?? 'out/book.pdf';
const html = await readFile(new URL('./document/book.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./document/book.css', import.meta.url), 'utf8');
// Paged.js cannot fetch a linked stylesheet on a file:// page,
// so the CSS goes into the page as a <style> element.
const page = html.replace('</head>', `<style>\n${css}</style>\n</head>`);

const browser = await puppeteer.launch();
try {
  const { pdf, pages } = await renderWithPagedJs(browser, page);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, pdf);
  console.log(`Wrote ${output} (${pages} pages)`);
} finally {
  await browser.close();
}
