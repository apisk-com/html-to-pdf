import puppeteer from 'puppeteer';
import { sendHeadersOnlyTo } from './headers.js';
import { findBadSelector, loadLazyContent, markOverlays } from './in-page.js';

// Limits for one render. Change them with environment variables.
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 30_000);
const MAX_OPEN_RENDERS = Number(process.env.MAX_OPEN_RENDERS ?? 4);
// The longest wait for a quiet network after the page is parsed. Then the render goes on.
const NETWORK_IDLE_MS = Number(process.env.NETWORK_IDLE_MS ?? 5_000);
// Stop the scroll for lazy content at this height (CSS pixels).
const MAX_SCROLL_HEIGHT = 20_000;

// Paper sizes in millimeters, and a fixed margin on each side.
const PAPER_MM = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
const MARGIN_MM = 10;
const PX_PER_MM = 96 / 25.4;

let browserPromise;
let openRenders = 0;

// One Chrome process for the whole service.
export function getBrowser() {
  browserPromise ??= puppeteer
    .launch({ handleSIGINT: false, handleSIGTERM: false })
    .then((browser) => {
      // If Chrome crashes, the next request starts a new one.
      browser.on('disconnected', () => {
        browserPromise = undefined;
      });
      return browser;
    })
    .catch((error) => {
      browserPromise = undefined;
      throw error;
    });
  return browserPromise;
}

export async function closeBrowser() {
  const browser = await browserPromise;
  await browser?.close();
}

// The width of the paper between the margins, in CSS pixels.
export function printableWidth(format, landscape) {
  const [width, height] = PAPER_MM[format];
  return Math.floor(((landscape ? height : width) - 2 * MARGIN_MM) * PX_PER_MM);
}

// Opens the URL in a new browser context and returns { pdf, scale }.
export async function urlToPdf(job) {
  if (openRenders >= MAX_OPEN_RENDERS) {
    throw httpError(503, 'Too many renders. Try again later.');
  }
  openRenders++;
  let context;
  try {
    const browser = await getBrowser();
    // A new context for each request: cookies, cache and storage
    // of one caller never reach the next caller.
    context = await browser.createBrowserContext();
    const target = new URL(job.url);
    if (job.cookies.length > 0) {
      await context.setCookie(
        ...job.cookies.map(({ name, value }) => ({
          name,
          value,
          domain: target.hostname,
          path: '/',
          httpOnly: true,
          secure: target.protocol === 'https:',
          sameSite: 'Lax',
        })),
      );
    }

    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);
    // Chrome checks the selectors, so a typo gets status 400, not a timeout.
    const badSelector = await page.evaluate(findBadSelector, [job.waitFor, ...job.hide].filter(Boolean));
    if (badSelector) {
      throw httpError(400, `"${badSelector}" is not a valid CSS selector.`);
    }
    await sendHeadersOnlyTo(page, target.origin, job.headers);

    // Lay out the page at the paper width, or at the width that the caller asks for.
    const paperWidth = printableWidth(job.format, job.landscape);
    await page.setViewport({ width: job.width ?? paperWidth, height: 1000 });
    await page.emulateMediaType(job.media);
    // The style rule that hides banners must also work on pages with a strict
    // Content Security Policy, which blocks style elements that the page did not make.
    await page.setBypassCSP(true);

    // The load event never comes on some pages, so stop at domcontentloaded.
    const response = await page.goto(job.url, { waitUntil: 'domcontentloaded' });
    if (page.url().startsWith('chrome-error://')) {
      throw httpError(502, 'The page could not be reached.');
    }
    if (response && response.status() >= 400) {
      throw httpError(502, `The page answered with status ${response.status()}.`);
    }
    // Give scripts a short time to load data. A request that never ends must not stop the PDF.
    await page.waitForNetworkIdle({ idleTime: 500, concurrency: 2, timeout: NETWORK_IDLE_MS }).catch(() => {});
    if (job.waitFor) {
      await page.waitForSelector(job.waitFor);
    }

    await page.evaluate(loadLazyContent, { maxHeight: MAX_SCROLL_HEIGHT, timeoutMs: 5_000 });
    await page.evaluate(markOverlays, job.hide);
    await page.addStyleTag({ content: '[data-pdf-hide] { display: none !important; }' });

    // Cancel requests that are still open. Chrome waits for them before it prints.
    await page.evaluate(() => window.stop());

    // Shrink wide pages so that the widest element fits on the paper.
    const contentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const layoutWidth = Math.max(job.width ?? paperWidth, contentWidth);
    const scale = Math.max(0.1, Math.min(1, paperWidth / layoutWidth));

    const pdf = await page.pdf({
      format: job.format,
      landscape: job.landscape,
      printBackground: true,
      margin: { top: `${MARGIN_MM}mm`, right: `${MARGIN_MM}mm`, bottom: `${MARGIN_MM}mm`, left: `${MARGIN_MM}mm` },
      scale,
    });
    return { pdf, scale };
  } finally {
    openRenders--;
    // Closing the context closes its pages and deletes its cookies.
    await context?.close().catch(() => {});
  }
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}
