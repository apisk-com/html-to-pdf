# URL to PDF with headless Chrome

A small HTTP service that converts a web page URL to PDF with Puppeteer. It
picks print or screen CSS, loads lazy images, hides cookie banners and other
fixed elements, waits for single-page apps, shrinks wide pages to fit the paper,
and opens pages behind a login with cookies or headers that go only to the page
host. A local test site has each of these problems, so the tests do not depend
on other people's websites. The tutorial explains each file:
[Convert Any URL to PDF with Headless Chrome](https://apisk.com/blog/url-to-pdf/).

## Requirements

- Node.js 22.12 or later (Puppeteer 25 needs it).
- macOS, Linux or Windows. `npm ci` downloads Chrome for Puppeteer.
- On Linux, the `unzip` command. Puppeteer uses it to unpack Chrome.
- For the Playwright tests only: `npx playwright install --only-shell chromium`
  (on Linux, add `--with-deps`).

## Install, run and test

```bash
npm ci
```

```bash
npm test
```

Start the test site (port 8080, and 8081 for a second origin) in one terminal:

```bash
npm run test-site
```

Start the service (port 3000, or `PORT`) in a second terminal:

```bash
npm start
```

## Example requests

```bash
curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/article.json -o article.pdf
```

The `examples` folder has one request for each problem:

| File | What it shows |
|---|---|
| `article.json` | Print CSS, lazy images, no cookie banner |
| `screen-desktop.json` | Screen CSS with the 1280 px desktop layout |
| `wide-table.json` | A wide table on landscape paper |
| `single-page-app.json` | Wait for a selector that the app adds when its data is there |
| `report-token.json` | A page that needs an `Authorization` header |
| `account-cookie.json` | A page that needs a session cookie |

To sign in with a form first, set `ROBOT_USER` and `ROBOT_PASSWORD` (on the
test site: `demo` and `demo-password`), then run:

```bash
node examples/login-and-print.js http://127.0.0.1:8080/login http://127.0.0.1:8080/account account-login.pdf
```

## Request fields

| Field | Default | What it does |
|---|---|---|
| `url` | (required) | The `http` or `https` page to print |
| `media` | `print` | `print` uses the print CSS of the page; `screen` uses its screen CSS |
| `width` | paper width | Layout width in CSS pixels (320 to 3840). The PDF shrinks to fit the paper. |
| `format` | `A4` | `A3`, `A4`, `A5`, `Letter`, `Legal` |
| `landscape` | `false` | `true` turns the paper |
| `waitFor` | none | A CSS selector. The PDF waits until an element matches it. |
| `hide` | `[]` | Up to 20 CSS selectors of elements to hide. Fixed elements are always hidden. |
| `cookies` | `[]` | Up to 20 `{ "name", "value" }` cookies, set for the host of `url` |
| `headers` | `{}` | Up to 10 headers, sent only to the origin of `url` |

The response is the PDF. The header `X-Pdf-Scale` shows the scale that made
the page fit the paper (1 means no change).

## Limits and status codes

| Limit or error | Value | Status |
|---|---|---|
| Request body | 32 KB | 413 |
| Load time and each wait | 30,000 ms (`RENDER_TIMEOUT_MS`) | 504 |
| Wait for a quiet network after the page is parsed | 5,000 ms at most, then the render goes on (`NETWORK_IDLE_MS`) | none |
| Renders at the same time | 4 (`MAX_OPEN_RENDERS`) | 503 |
| The page answers 400 or higher, or Chrome shows an error page | | 502 |
| The host does not answer | | 502 |
| A bad field or selector | | 400 |

The hiding rule also works on pages with a strict Content Security Policy,
because the service turns the policy off in its own browser context
(`page.setBypassCSP(true)`) before it opens the page.

Never send a user's password to this service. Send a short-lived session
cookie or token instead.

The `url` field can make the server open addresses in your own network (SSRF,
server-side request forgery). Do not expose this service to the internet
before you add SSRF protection.

## Files

- `src/server.js` starts Chrome and the HTTP server.
- `src/app.js` has the routes and the error responses.
- `src/validate.js` turns the request body into a render job.
- `src/url-to-pdf.js` opens the page in a new browser context and prints it.
- `src/in-page.js` runs in the page: lazy content, fixed elements, selector checks.
- `src/headers.js` sends extra headers only to the page origin.
- `examples/` has the requests and the login script.
- `test-site/server.js` is the local test site.
- `test/` has the tests (`node --test`), also for the same header problem in Playwright.
- `test.sh` is the test entry point. It runs the tests and the commands in this file.
