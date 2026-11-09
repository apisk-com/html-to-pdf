import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { startTestSite } from '../test-site/server.js';
import { ALL_PHOTOS, pdfPages, photoNumbers } from './helpers.js';

// A short timeout, so that the timeout test runs fast. Set it before the import.
process.env.RENDER_TIMEOUT_MS = '6000';
const { createApp } = await import('../src/app.js');
const { closeBrowser, getBrowser } = await import('../src/url-to-pdf.js');

let site;
let api;
let apiUrl;

before(async () => {
  site = await startTestSite();
  api = createApp().listen(0);
  apiUrl = `http://127.0.0.1:${api.address().port}`;
});

after(async () => {
  api.close();
  await site.close();
  await closeBrowser();
});

function postPdf(body) {
  return fetch(`${apiUrl}/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function renderPages(body) {
  const res = await postPdf(body);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  return { pages: await pdfPages(await res.arrayBuffer()), scale: Number(res.headers.get('x-pdf-scale')) };
}

// page.pdf() alone, without the steps of urlToPdf(). The tests compare with it.
async function plainPdf(path, options = {}) {
  const browser = await getBrowser();
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.goto(`${site.url}${path}`, { waitUntil: options.waitUntil ?? 'load' });
    return await pdfPages(await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } }));
  } finally {
    await context.close();
  }
}

describe('page.pdf() alone', () => {
  test('repeats the cookie banner on every page and misses the lazy images', async () => {
    const pages = await plainPdf('/article');
    assert.ok(pages.length >= 2);
    for (const text of pages) {
      assert.match(text, /We use cookies/);
    }
    assert.deepEqual(photoNumbers(pages.join(' ')), []);
  });

  test('cuts a table that is wider than 1.5 times the paper', async () => {
    const text = (await plainPdf('/wide')).join(' ');
    assert.match(text, /Sep/);
    assert.doesNotMatch(text, /Year total/);
  });

  test('Chrome shrinks wide content by at most 1.5 times, then cuts it', async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      const result = {};
      for (const width of [718, 1000, 1200]) {
        await page.setContent(`<div style="width:${width}px; display:flex; justify-content:space-between; font:20px sans-serif"><span>LEFT</span><span>RIGHT</span></div>`);
        const pdf = await page.pdf({ format: 'A4', margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
        result[width] = (await pdfPages(pdf))[0];
      }
      // 718 px is the A4 width between 10 mm margins. 1.5 x 718 = 1077 px.
      assert.match(result[718], /RIGHT/);
      assert.match(result[1000], /RIGHT/);
      assert.doesNotMatch(result[1200], /RIGHT/);
    } finally {
      await page.close();
    }
  });

  test('prints "Loading" for a single-page app, also with networkidle2', async () => {
    for (const waitUntil of ['load', 'networkidle2']) {
      const text = (await plainPdf('/app', { waitUntil })).join(' ');
      assert.match(text, /Loading orders/, waitUntil);
      assert.doesNotMatch(text, /A-1001/, waitUntil);
    }
  });
});

describe('POST /pdf', () => {
  test('prints the article with print CSS, all photos and no cookie banner', async () => {
    const { pages, scale } = await renderPages({ url: `${site.url}/article` });
    const text = pages.join(' ');
    assert.ok(pages.length >= 2);
    assert.deepEqual(photoNumbers(text), ALL_PHOTOS);
    assert.doesNotMatch(text, /We use cookies/);
    // Print CSS: no navigation and no sidebar, but the print-only note.
    assert.doesNotMatch(text, /Subscribe|Related walks/);
    assert.match(text, /Printed from Field Notes/);
    assert.match(text, /https:\/\/example\.com\/tides/);
    assert.equal(scale, 1);
  });

  test('uses screen CSS when media is "screen"', async () => {
    const { pages } = await renderPages({ url: `${site.url}/article`, media: 'screen' });
    const text = pages.join(' ');
    assert.match(text, /Subscribe/);
    assert.doesNotMatch(text, /Printed from Field Notes/);
    // At the paper width (718 px), the sidebar goes under the article.
    assert.doesNotMatch(pages[0], /Related walks/);
  });

  test('lays out the page at 1280 px and shrinks it to the paper', async () => {
    const { pages, scale } = await renderPages({ url: `${site.url}/article`, media: 'screen', width: 1280 });
    // 718 / 1280: the desktop layout puts the sidebar next to the article.
    assert.equal(scale, 0.561);
    assert.match(pages[0], /Related walks/);
  });

  test('shrinks a wide table until the last column fits', async () => {
    const portrait = await renderPages({ url: `${site.url}/wide` });
    assert.match(portrait.pages[0], /Year total/);
    assert.ok(portrait.scale < 0.5);
    const landscape = await renderPages({ url: `${site.url}/wide`, landscape: true });
    assert.match(landscape.pages[0], /Year total/);
    assert.ok(landscape.scale > portrait.scale);
  });

  test('waits for the selector of a single-page app', async () => {
    const { pages } = await renderPages({ url: `${site.url}/app`, waitFor: '#app[data-ready]' });
    assert.match(pages[0], /A-1001/);
    assert.doesNotMatch(pages[0], /Loading orders/);
  });

  test('hides elements that match the "hide" selectors', async () => {
    const { pages } = await renderPages({ url: `${site.url}/article`, media: 'screen', hide: ['.site-header'] });
    assert.doesNotMatch(pages.join(' '), /Subscribe/);
  });
});

describe('pages behind a login', () => {
  test('without a session, the PDF shows the login page', async () => {
    const { pages } = await renderPages({ url: `${site.url}/account` });
    assert.match(pages[0], /Sign in/);
  });

  test('without a session, waitFor turns the login page into status 504', async () => {
    const res = await postPdf({ url: `${site.url}/account`, waitFor: '#statement' });
    assert.equal(res.status, 504);
  });

  test('prints the account page with a session cookie from your app', async () => {
    const sid = site.createSession('demo');
    const { pages } = await renderPages({
      url: `${site.url}/account`,
      cookies: [{ name: 'sid', value: sid }],
      waitFor: '#statement',
    });
    assert.match(pages[0], /Account statement for demo/);
  });

  test('the session cookie does not stay in the browser after the request', async () => {
    const sid = site.createSession('demo');
    await renderPages({ url: `${site.url}/account`, cookies: [{ name: 'sid', value: sid }] });
    const { pages } = await renderPages({ url: `${site.url}/account` });
    assert.match(pages[0], /Sign in/);
  });
});

describe('headers', () => {
  test('returns 502 when the page answers 401', async () => {
    const res = await postPdf({ url: `${site.url}/report` });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /status 401/);
  });

  test('sends the token to the page origin only', async () => {
    site.thirdPartyRequests.length = 0;
    const { pages } = await renderPages({
      url: `${site.url}/report`,
      headers: { Authorization: 'Bearer report-token' },
    });
    assert.match(pages[0], /Private report/);
    const badge = site.thirdPartyRequests.find((request) => request.path === '/badge.svg');
    assert.ok(badge, 'the page loads the badge from the other origin');
    assert.equal(badge.authorization, undefined);
  });

  test('does not send the token after a redirect to another origin', async () => {
    site.thirdPartyRequests.length = 0;
    await renderPages({ url: `${site.url}/go-away`, headers: { Authorization: 'Bearer report-token' } });
    const landing = site.thirdPartyRequests.find((request) => request.path === '/landing');
    assert.ok(landing);
    assert.equal(landing.authorization, undefined);
  });

  test('page.setExtraHTTPHeaders() sends the token to every host', async () => {
    site.thirdPartyRequests.length = 0;
    const browser = await getBrowser();
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await page.setExtraHTTPHeaders({ Authorization: 'Bearer report-token' });
      await page.goto(`${site.url}/report`, { waitUntil: 'load' });
      await page.goto(`${site.url}/go-away`, { waitUntil: 'load' });
    } finally {
      await context.close();
    }
    // Chrome can also ask the other host for /favicon.ico, with the same header.
    const leaked = site.thirdPartyRequests
      .filter((request) => request.authorization === 'Bearer report-token' && request.path !== '/favicon.ico')
      .map((request) => request.path);
    assert.deepEqual(leaked.sort(), ['/badge.svg', '/landing']);
  });
});

describe('errors', () => {
  const badRequests = [
    ['no url', {}],
    ['a file URL', { url: 'file:///etc/passwd' }],
    ['a relative URL', { url: '/article' }],
    ['an unknown media type', { url: 'https://example.com/', media: 'tv' }],
    ['a width that is too small', { url: 'https://example.com/', width: 100 }],
    ['an unknown field', { url: 'https://example.com/', password: 'secret' }],
    ['a cookie value with a space', { url: 'https://example.com/', cookies: [{ name: 'sid', value: 'a b' }] }],
    ['a Cookie header', { url: 'https://example.com/', headers: { Cookie: 'sid=1' } }],
    ['a header with a line break', { url: 'https://example.com/', headers: { 'X-Token': 'a\r\nb' } }],
    ['too many hide selectors', { url: 'https://example.com/', hide: Array(21).fill('.x') }],
    ['JSON that does not parse', '{"url": '],
  ];

  for (const [name, body] of badRequests) {
    test(`returns 400 for ${name}`, async () => {
      const res = await postPdf(body);
      assert.equal(res.status, 400);
      assert.equal(typeof (await res.json()).error, 'string');
    });
  }

  test('returns 400 for a selector that is not valid CSS', async () => {
    const res = await postPdf({ url: `${site.url}/article`, hide: ['.banner{'] });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /not a valid CSS selector/);
  });

  test('returns 413 for a body over 32 KB', async () => {
    const res = await postPdf({ url: `${site.url}/article`, hide: ['x'.repeat(40_000)] });
    assert.equal(res.status, 413);
  });

  test('returns 502 when the host does not answer', async () => {
    // A port that was free a moment ago: nothing listens on it.
    const probe = createServer().listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    const res = await postPdf({ url: `http://127.0.0.1:${port}/` });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /ERR_CONNECTION_REFUSED/);
  });
});
