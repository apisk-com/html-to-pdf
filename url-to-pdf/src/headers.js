// Adds the caller's headers only to requests for one origin
// (scheme, host and port). page.setExtraHTTPHeaders() would send them
// to every host that the page loads from, also after a redirect.
export async function sendHeadersOnlyTo(page, origin, headers) {
  if (Object.keys(headers).length === 0) {
    return;
  }
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    // Puppeteer asks again for each redirect, so each hop is checked.
    if (new URL(request.url()).origin === origin) {
      request.continue({ headers: { ...request.headers(), ...headers } });
    } else {
      request.continue();
    }
  });
}
