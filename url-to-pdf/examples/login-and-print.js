// Signs in with a robot account, then prints a page that needs the session.
// The password comes from the environment of this job. It never goes into
// a render request, a queue message or a log.
import { writeFile } from 'node:fs/promises';
import { closeBrowser, getBrowser, urlToPdf } from '../src/url-to-pdf.js';
import { parseUrlToPdfRequest } from '../src/validate.js';

const [loginUrl, pageUrl, output = 'account.pdf'] = process.argv.slice(2);
const { ROBOT_USER, ROBOT_PASSWORD } = process.env;
if (!loginUrl || !pageUrl || !ROBOT_USER || !ROBOT_PASSWORD) {
  console.error('Usage: ROBOT_USER=... ROBOT_PASSWORD=... node examples/login-and-print.js <login URL> <page URL> [file.pdf]');
  process.exit(1);
}

const browser = await getBrowser();
// The login gets its own context. Only the session cookies leave it.
const context = await browser.createBrowserContext();
let cookies;
try {
  const page = await context.newPage();
  await page.goto(loginUrl);
  await page.locator('input[name="username"]').fill(ROBOT_USER);
  await page.locator('input[name="password"]').fill(ROBOT_PASSWORD);
  await Promise.all([page.waitForNavigation(), page.locator('button[type="submit"]').click()]);
  const host = new URL(pageUrl).hostname;
  cookies = (await context.cookies())
    .filter((cookie) => cookie.domain === host)
    .map(({ name, value }) => ({ name, value }));
} finally {
  await context.close();
}

try {
  const { pdf } = await urlToPdf(parseUrlToPdfRequest({ url: pageUrl, cookies }));
  await writeFile(output, pdf);
  console.log(`Saved ${output} (${pdf.length} bytes) with ${cookies.length} session cookie(s).`);
} finally {
  await closeBrowser();
}
