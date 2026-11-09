// Benchmark worker: Puppeteer. One browser, a new page for each render.
// Usage: node engines/puppeteer.mjs <document.html> <warmup> <runs> <out.pdf> [--untagged] [--shell]
// --untagged sets tagged: false (Puppeteer makes a tagged PDF by default).
// --shell starts chrome-headless-shell (the old headless mode) instead of Chrome.
import puppeteer from 'puppeteer';
import { measure, parseArgs } from './worker.mjs';

const args = parseArgs(process.argv.slice(2));
const headless = args.flags.includes('--shell') ? 'shell' : true;
const tagged = !args.flags.includes('--untagged');

const start = performance.now();
const browser = await puppeteer.launch({ headless });
try {
  const render = async () => {
    const page = await browser.newPage();
    try {
      await page.goto(args.url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged });
    } finally {
      await page.close();
    }
  };
  const result = await measure({ ...args, start, render });
  console.log(JSON.stringify({ ...result, browser: await browser.version() }));
} finally {
  await browser.close();
}
