// Benchmark worker: Playwright with Chromium. One browser, a new context for each render.
// Usage: node engines/playwright.mjs <document.html> <warmup> <runs> <out.pdf>
// In headless mode, Playwright starts its Chromium headless shell by default.
import { chromium } from 'playwright';
import { measure, parseArgs } from './worker.mjs';

const args = parseArgs(process.argv.slice(2));

const start = performance.now();
const browser = await chromium.launch({ chromiumSandbox: true });
try {
  const render = async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(args.url, { waitUntil: 'load' });
      // Playwright does not wait for web fonts before page.pdf().
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({ preferCSSPageSize: true, printBackground: true });
    } finally {
      await context.close();
    }
  };
  const result = await measure({ ...args, start, render });
  console.log(JSON.stringify({ ...result, browser: `Chromium ${browser.version()}` }));
} finally {
  await browser.close();
}
