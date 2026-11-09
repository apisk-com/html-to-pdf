// A local test site with the usual problems of URL to PDF:
// print CSS, lazy images, a cookie banner, a login with a session cookie,
// a page that needs a token header, a single-page app and a wide table.
// The tests start it on free ports. `npm run test-site` starts it on 8080.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const PHOTO_COLORS = ['#0f766e', '#b45309', '#1d4ed8', '#be123c', '#4d7c0f', '#7c3aed'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startTestSite({ port = 0, thirdPartyPort = 0, photoDelayMs = 150, apiDelayMs = 1200 } = {}) {
  // One session exists from the start, as if your app made it for the renderer.
  const sessions = new Map([['renderer-demo-session', 'demo']]);
  // What the "third-party" server received: one entry for each request.
  const thirdPartyRequests = [];

  // A second server on another origin, like a CDN or an analytics service.
  const thirdParty = createServer((req, res) => {
    thirdPartyRequests.push({ path: req.url, authorization: req.headers.authorization, cookie: req.headers.cookie });
    if (req.url.startsWith('/badge.svg')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" rx="6" fill="#e5e7eb"/><text x="80" y="26" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#374151">Partner badge</text></svg>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Other site</title><h1>Other site</h1>');
  });
  await listen(thirdParty, thirdPartyPort);
  const thirdPartyUrl = `http://localhost:${thirdParty.address().port}`;

  const site = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://test-site');
    const cookies = parseCookies(req.headers.cookie);
    const html = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
      res.end(body);
    };

    if (url.pathname === '/article') {
      return html(200, articlePage({ showBanner: cookies.consent !== 'yes' }));
    }
    if (url.pathname.startsWith('/photo/')) {
      const number = Number(url.pathname.match(/\d+/)?.[0] ?? 1);
      await sleep(photoDelayMs);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(photoSvg(number));
    }
    if (url.pathname === '/wide') {
      return html(200, widePage());
    }
    if (url.pathname === '/app') {
      return html(200, appPage());
    }
    if (url.pathname === '/api/orders') {
      await sleep(apiDelayMs);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(ORDERS));
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      if (form.get('username') !== 'demo' || form.get('password') !== 'demo-password') {
        return html(401, loginPage('Wrong user name or password.'));
      }
      const sid = createSession('demo');
      return html(303, '', {
        Location: '/account',
        'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
      });
    }
    if (url.pathname === '/login') {
      return html(200, loginPage());
    }
    if (url.pathname === '/account') {
      const user = sessions.get(cookies.sid);
      if (!user) {
        return html(302, '', { Location: '/login' });
      }
      return html(200, accountPage(user));
    }
    if (url.pathname === '/report') {
      if (req.headers.authorization !== 'Bearer report-token') {
        return html(401, page('Not allowed', '<h1>401: send a valid token</h1>'));
      }
      return html(200, reportPage(thirdPartyUrl));
    }
    if (url.pathname === '/strict-csp') {
      // A strict policy: only files from this site, and no inline style or script.
      return html(200, strictCspPage(), {
        'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'",
      });
    }
    if (url.pathname === '/strict.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      return res.end(STRICT_CSS);
    }
    if (url.pathname === '/hang') {
      return html(200, '<!doctype html><title>Hang</title><h1>Page with a request that never ends</h1><img src="/never" alt="">');
    }
    if (url.pathname === '/never') {
      // The response never starts. closeAllConnections() ends it when the test site closes.
      return;
    }
    if (url.pathname === '/go-away') {
      return html(302, '', { Location: `${thirdPartyUrl}/landing` });
    }
    return html(404, page('Not found', '<h1>404</h1>'));
  });
  await listen(site, port);
  const siteUrl = `http://127.0.0.1:${site.address().port}`;

  // Your app would make this session for the renderer. See the tutorial.
  function createSession(user) {
    const sid = randomBytes(18).toString('base64url');
    sessions.set(sid, user);
    return sid;
  }

  async function close() {
    for (const server of [site, thirdParty]) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }

  return { url: siteUrl, thirdPartyUrl, thirdPartyRequests, createSession, close };
}

const STRICT_CSS = `
body { font: 16px sans-serif; margin: 20px; }
.consent { position: fixed; bottom: 0; left: 0; right: 0; padding: 16px; background: #fde68a; }
`;

function strictCspPage() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Strict policy</title><link rel="stylesheet" href="/strict.css"></head>
<body>
<h1>Strict policy page</h1>
<p>This page has a Content Security Policy that blocks inline styles.</p>
<div class="consent">Cookie notice: accept all</div>
</body>
</html>`;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim().split('=')).filter(([name]) => name),
  );
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

// The site layout: a dark header with navigation on screen, plain text in print.
function page(title, body, extraCss = '') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.6 "Liberation Sans", Arial, sans-serif; color: #1f2937; background: #f3f4f6; }
  .site-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 32px; background: #111827; color: #f9fafb; }
  .site-header .logo { font-weight: bold; font-size: 20px; }
  .site-header nav a { color: #d1d5db; margin-left: 20px; text-decoration: none; }
  .layout { display: grid; grid-template-columns: 1fr; gap: 32px; max-width: 1180px; margin: 0 auto; padding: 32px; }
  main { background: #fff; padding: 32px 40px; border-radius: 8px; }
  h1 { margin-top: 0; font-size: 34px; line-height: 1.2; }
  .meta { color: #6b7280; }
  .screen-only { display: block; }
  .print-only { display: none; }
  aside { background: #fff; padding: 24px; border-radius: 8px; height: fit-content; }
  @media (min-width: 1000px) {
    .layout { grid-template-columns: minmax(0, 1fr) 280px; }
  }
  @media print {
    body { background: #fff; }
    .site-header { background: none; color: #111827; padding: 0 0 8px; border-bottom: 2px solid #111827; }
    .site-header nav, aside, .screen-only { display: none; }
    .print-only { display: block; }
    .layout { display: block; padding: 0; }
    main { padding: 16px 0 0; }
    main a[href^="http"]::after { content: " (" attr(href) ")"; color: #6b7280; font-size: 12px; }
  }
  ${extraCss}
</style>
</head>
<body>
<header class="site-header">
  <span class="logo">Field Notes</span>
  <nav><a href="/">Home</a><a href="/archive">Archive</a><a href="/subscribe">Subscribe</a></nav>
</header>
${body}
</body>
</html>`;
}

function photoSvg(number) {
  const color = PHOTO_COLORS[(number - 1) % PHOTO_COLORS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">
<rect width="480" height="300" fill="#e0f2fe"/>
<circle cx="380" cy="80" r="36" fill="#fbbf24"/>
<path d="M0 230 L120 120 L220 210 L320 110 L480 240 L480 300 L0 300 Z" fill="${color}"/>
<text x="24" y="44" font-family="Liberation Sans, Arial, sans-serif" font-size="28" font-weight="bold" fill="#0f172a">Photo ${number}</text>
</svg>`;
}

function articlePage({ showBanner }) {
  const paragraph = (n) => `<p>Paragraph ${n}. The path follows the cliffs for most of the day. Start early, carry water and check the tide times before you go down to the beach. The ground is hard and dry in summer, but the clay near the river stays wet until June.</p>`;
  const lazyPhotos = [1, 2, 3, 4, 5, 6]
    .map((n) => `<img loading="lazy" src="/photo/${n}.svg" width="240" height="150" alt="Photo ${n}">`)
    .join('\n');
  // These images get their src from a script when they come near the viewport.
  const observerPhotos = [7, 8, 9, 10, 11, 12]
    .map((n) => `<img class="js-lazy" data-src="/photo/${n}.svg" width="240" height="150" alt="">`)
    .join('\n');
  const banner = showBanner
    ? `<div class="cookie-banner" role="dialog">
  <p>We use cookies to measure how people use this site.</p>
  <button onclick="document.cookie='consent=yes; path=/'; this.parentElement.remove()">Accept</button>
</div>`
    : '';
  const body = `<div class="layout">
<main>
  <article>
    <h1>A day on the coast path</h1>
    <p class="meta">By Sam Rivera · 14 miles · 6 hours</p>
    <p class="print-only">Printed from Field Notes. Prices and tide times change: check them before you go.</p>
    ${[1, 2, 3, 4].map(paragraph).join('\n')}
    <p>Read the <a href="https://example.com/tides">tide tables</a> and the <a href="https://example.com/rules">park rules</a> first.</p>
    ${[5, 6, 7, 8, 9, 10, 11, 12].map(paragraph).join('\n')}
    <h2>Photos from the morning</h2>
    <div class="photos">${lazyPhotos}</div>
    ${[13, 14, 15, 16].map(paragraph).join('\n')}
    <h2>Photos from the afternoon</h2>
    <div class="photos">${observerPhotos}</div>
    ${[17, 18].map(paragraph).join('\n')}
    <p>End of the article.</p>
  </article>
</main>
<aside>
  <h3>Related walks</h3>
  <p>North cliffs loop<br>River mouth and dunes<br>Lighthouse and back</p>
  <h3>Newsletter</h3>
  <p class="screen-only">One email a month with new walks.</p>
</aside>
</div>
${banner}
<script>
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.src = entry.target.dataset.src;
        observer.unobserve(entry.target);
      }
    }
  });
  document.querySelectorAll('img.js-lazy').forEach((img) => observer.observe(img));
</script>`;
  return page('A day on the coast path', body, `
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0 24px; }
  .photos img { width: 100%; height: auto; aspect-ratio: 8 / 5; background: #d1d5db; border-radius: 4px; }
  .cookie-banner { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 24px; align-items: center; justify-content: center; padding: 18px 32px; background: #1e3a8a; color: #fff; font-size: 18px; }
  .cookie-banner p { margin: 0; }
  .cookie-banner button { font: inherit; padding: 8px 20px; border: 0; border-radius: 6px; background: #fbbf24; }`);
}

function widePage() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const regions = ['North', 'South', 'East', 'West', 'Central', 'Online'];
  const rows = regions.map((region, r) => {
    const values = months.map((_, m) => 100 + ((r * 37 + m * 53) % 400));
    const total = values.reduce((sum, value) => sum + value, 0);
    return `<tr><th>${region}</th>${values.map((v) => `<td>${v}</td>`).join('')}<td class="total">${total}</td></tr>`;
  });
  const body = `<main class="wide">
  <h1>Monthly sales by region</h1>
  <p>Units sold in each month. The last column is the year total.</p>
  <table>
    <thead><tr><th>Region</th>${months.map((m) => `<th>${m}</th>`).join('')}<th class="total">Year total</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</main>`;
  return page('Monthly sales by region', body, `
  main.wide { margin: 24px; }
  table { width: 1500px; border-collapse: collapse; font-size: 15px; }
  th, td { padding: 8px 10px; border: 1px solid #d1d5db; text-align: right; }
  thead th { background: #e0f2fe; }
  tbody th { text-align: left; }
  .total { background: #fef3c7; font-weight: bold; }`);
}

const ORDERS = [
  { id: 'A-1001', customer: 'Harbour Cafe', total: '$420.00' },
  { id: 'A-1002', customer: 'Dune Outfitters', total: '$1,250.00' },
  { id: 'A-1003', customer: 'Lighthouse Books', total: '$88.50' },
];

function appPage() {
  const body = `<main style="margin: 24px">
  <h1>Orders</h1>
  <div id="app"><p class="loading">Loading orders...</p></div>
</main>
<script>
  fetch('/api/orders')
    .then((response) => response.json())
    .then((orders) => {
      const app = document.querySelector('#app');
      app.innerHTML = '<table><tr><th>Order</th><th>Customer</th><th>Total</th></tr>' +
        orders.map((o) => '<tr><td>' + o.id + '</td><td>' + o.customer + '</td><td>' + o.total + '</td></tr>').join('') +
        '</table>';
      app.dataset.ready = 'true';
    });
</script>`;
  return page('Orders', body);
}

function loginPage(error = '') {
  return page('Sign in', `<main style="margin: 24px; max-width: 420px">
  <h1>Sign in</h1>
  ${error ? `<p class="error">${error}</p>` : ''}
  <form method="post" action="/login">
    <p><label>User name <input name="username" autocomplete="username"></label></p>
    <p><label>Password <input name="password" type="password" autocomplete="current-password"></label></p>
    <p><button type="submit">Sign in</button></p>
  </form>
</main>`);
}

function accountPage(user) {
  return page('Account statement', `<main style="margin: 24px">
  <h1 id="statement">Account statement for ${user}</h1>
  <table>
    <tr><th>Date</th><th>Description</th><th>Amount</th></tr>
    <tr><td>2 Nov</td><td>Monthly plan</td><td>$29.00</td></tr>
    <tr><td>5 Nov</td><td>Extra storage</td><td>$4.00</td></tr>
  </table>
</main>`);
}

function reportPage(thirdPartyUrl) {
  return page('Private report', `<main style="margin: 24px">
  <h1 id="report">Private report</h1>
  <p>Only callers with the report token can open this page.</p>
  <img src="${thirdPartyUrl}/badge.svg" width="160" height="40" alt="Partner badge">
</main>`);
}

// `npm run test-site` starts the site on port 8080 (and 8081 for the other origin).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.TEST_SITE_PORT ?? 8080);
  const site = await startTestSite({ port, thirdPartyPort: port + 1 });
  console.log(`Test site on ${site.url} (other origin: ${site.thirdPartyUrl})`);
  console.log(`Pages: /article /wide /app /login /account /report`);
}
