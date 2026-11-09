import puppeteer from 'puppeteer';

// Limits for one render. Change them with environment variables.
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 20_000);
const MAX_OPEN_PAGES = Number(process.env.MAX_OPEN_PAGES ?? 4);
// For a url source: the longest wait for the network to go quiet after the page is parsed.
const NETWORK_IDLE_MS = Number(process.env.NETWORK_IDLE_MS ?? 5_000);

let browserPromise;
let openPages = 0;

// One Chrome process for the whole service. Requests share it.
export function getBrowser() {
  browserPromise ??= launchBrowser();
  return browserPromise;
}

async function launchBrowser() {
  try {
    const browser = await puppeteer.launch({
      // server.js handles these signals: open requests finish, then Chrome closes.
      handleSIGINT: false,
      handleSIGTERM: false,
    });
    // If Chrome crashes, the next request starts a new one.
    browser.on('disconnected', () => {
      browserPromise = undefined;
    });
    return browser;
  } catch (error) {
    browserPromise = undefined;
    throw error;
  }
}

export async function closeBrowser() {
  const browser = await browserPromise;
  await browser?.close();
}

// An error that the API returns to the client with status 502 (the target page failed).
function badGateway(message) {
  return Object.assign(new Error(message), { status: 502, expose: true });
}

// Opens a url source and fails when Chrome shows an error page or the server answers 4xx or 5xx.
async function openUrl(page, url) {
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    // A network error, for example "net::ERR_CONNECTION_REFUSED". A timeout stays a timeout.
    if (error.message.startsWith('net::')) {
      throw badGateway(`The target page could not be reached: ${error.message}`);
    }
    throw error;
  }
  if (page.url().startsWith('chrome-error://')) {
    throw badGateway('The target page could not be reached.');
  }
  if (response && response.status() >= 400) {
    throw badGateway(`The target page answered with status ${response.status()}.`);
  }
  // Wait for the network to go quiet, but only for a short time. Pages with
  // ads or analytics can keep a request open for ever: then print what is there.
  await page.waitForNetworkIdle({ idleTime: 500, concurrency: 2, timeout: NETWORK_IDLE_MS }).catch(() => {});
  // Cancel requests that are still open. Chrome waits for them before it prints.
  await page.evaluate(() => window.stop());
}

// Renders one job to PDF and passes the PDF stream to send().
// The page stays open until send() finishes, then closes in all cases.
export async function renderPdf(job, send) {
  if (openPages >= MAX_OPEN_PAGES) {
    throw Object.assign(new Error('Too many renders. Try again later.'), {
      status: 503,
      expose: true,
    });
  }
  openPages++;
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);

    if (job.url) {
      await openUrl(page, job.url);
    } else {
      // Wait for images and stylesheets that the HTML links to.
      await page.setContent(job.html, { waitUntil: 'load' });
    }

    const pdf = await page.createPDFStream(job.options);
    await send(pdf);
  } finally {
    openPages--;
    // close() fails when Chrome crashed. Keep the first error, not this one.
    await page?.close().catch(() => {});
  }
}
