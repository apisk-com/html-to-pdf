import { fileURLToPath } from 'node:url';

// The browser build of Paged.js runs inside the page. The package exports
// only src/index.js, so find the file from there.
const POLYFILL = fileURLToPath(new URL('../dist/paged.polyfill.js', import.meta.resolve('pagedjs')));

// Lays out the pages with Paged.js, then prints them with Chrome.
// Paged.js adds what Chrome does not support: target-counter(),
// string-set and running elements.
export async function renderWithPagedJs(browser, html, { timeout = 30_000 } = {}) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout });

    // auto: false stops Paged.js from starting on its own. It starts below.
    await page.evaluate(() => {
      window.PagedConfig = { auto: false };
    });
    await page.addScriptTag({ path: POLYFILL });
    await page.evaluate(() => {
      window.PagedPolyfill.preview().then(
        (flow) => { window.pagedResult = { pages: flow.total }; },
        (error) => { window.pagedResult = { error: String(error) }; },
      );
    });
    const handle = await page.waitForFunction(() => window.pagedResult, { timeout });
    const result = await handle.jsonValue();
    if (result.error) {
      throw new Error(`Paged.js failed: ${result.error}`);
    }

    // Paged.js sets the paper size with @page, so the CSS size must win.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout });
    return { pdf, pages: result.pages };
  } finally {
    await page.close();
  }
}
