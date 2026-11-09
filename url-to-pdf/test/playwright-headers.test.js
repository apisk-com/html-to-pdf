// The same header problem in Playwright. Run by `npm test` like the other tests.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { startTestSite } from '../test-site/server.js';

const TOKEN = 'Bearer report-token';
let site;
let browser;

before(async () => {
  site = await startTestSite();
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  await site.close();
});

// Opens /report and /go-away, and returns the paths on the other origin that got the token.
async function leakedPaths(setup) {
  site.thirdPartyRequests.length = 0;
  const context = await browser.newContext(setup.contextOptions);
  try {
    const page = await context.newPage();
    await setup.page?.(page);
    await page.goto(`${site.url}/report`);
    await page.goto(`${site.url}/go-away`);
  } finally {
    await context.close();
  }
  return site.thirdPartyRequests.filter((r) => r.authorization === TOKEN).map((r) => r.path).sort();
}

test('extraHTTPHeaders sends the token to every host', async () => {
  const paths = await leakedPaths({ contextOptions: { extraHTTPHeaders: { Authorization: TOKEN } } });
  assert.deepEqual(paths, ['/badge.svg', '/landing']);
});

test('route.continue() headers follow a redirect to another host', async () => {
  const origin = new URL(site.url).origin;
  const paths = await leakedPaths({
    page: (page) =>
      page.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== origin) return route.continue();
        return route.continue({ headers: { ...route.request().headers(), authorization: TOKEN } });
      }),
  });
  assert.deepEqual(paths, ['/landing']);
});

test('route.fetch() with maxRedirects: 0 keeps the token on the page origin', async () => {
  const origin = new URL(site.url).origin;
  const paths = await leakedPaths({
    page: (page) =>
      page.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin !== origin) return route.continue();
        const response = await route.fetch({
          headers: { ...route.request().headers(), authorization: TOKEN },
          maxRedirects: 0,
        });
        return route.fulfill({ response });
      }),
  });
  assert.deepEqual(paths, []);
});
