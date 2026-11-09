const FORMATS = ['A3', 'A4', 'A5', 'Letter', 'Legal'];
const MEDIA = ['print', 'screen'];
// Header and cookie names: letters, digits and a few symbols, as in RFC 9110.
const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/;
// Headers that Chrome sets itself, or that have their own option.
const BLOCKED_HEADERS = ['host', 'cookie', 'content-length', 'connection', 'transfer-encoding', 'upgrade'];

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, expose: true });
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Turns a request body into a render job for urlToPdf().
export function parseUrlToPdfRequest(body) {
  if (!isObject(body)) {
    throw badRequest('Send a JSON object with the header Content-Type: application/json.');
  }
  const {
    url,
    media = 'print',
    format = 'A4',
    landscape = false,
    width,
    waitFor,
    hide = [],
    cookies = [],
    headers = {},
    ...unknown
  } = body;

  const unknownNames = Object.keys(unknown);
  if (unknownNames.length > 0) {
    throw badRequest(`Unknown field "${unknownNames[0]}".`);
  }
  if (!MEDIA.includes(media)) {
    throw badRequest('"media" must be "print" or "screen".');
  }
  if (!FORMATS.includes(format)) {
    throw badRequest(`"format" must be one of: ${FORMATS.join(', ')}.`);
  }
  if (typeof landscape !== 'boolean') {
    throw badRequest('"landscape" must be true or false.');
  }
  if (width !== undefined && (!Number.isInteger(width) || width < 320 || width > 3840)) {
    throw badRequest('"width" must be a whole number from 320 to 3840.');
  }
  if (waitFor !== undefined && !isShortString(waitFor)) {
    throw badRequest('"waitFor" must be a CSS selector of at most 200 characters.');
  }
  if (!Array.isArray(hide) || hide.length > 20 || !hide.every(isShortString)) {
    throw badRequest('"hide" must be a list of at most 20 CSS selectors.');
  }

  return {
    url: parseUrl(url),
    media,
    format,
    landscape,
    width,
    waitFor,
    hide,
    cookies: parseCookies(cookies),
    headers: parseHeaders(headers),
  };
}

function isShortString(value) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 200;
}

function parseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw badRequest('"url" must be an absolute URL.');
  }
  // This blocks file:, data: and other schemes. It is NOT protection against SSRF.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('"url" must start with http:// or https://.');
  }
  return url.href;
}

// Cookies for the page's host: [{ "name": "sid", "value": "..." }].
function parseCookies(cookies) {
  if (!Array.isArray(cookies) || cookies.length > 20) {
    throw badRequest('"cookies" must be a list of at most 20 cookies.');
  }
  return cookies.map((cookie) => {
    if (!isObject(cookie) || !TOKEN.test(cookie.name ?? '')) {
      throw badRequest('Each cookie must have a "name" with letters, digits or -_.');
    }
    // Printable ASCII only, without quotes, commas, semicolons or backslashes (RFC 6265).
    if (typeof cookie.value !== 'string' || cookie.value.length > 4096 || /[^\x21-\x7e]|[",;\\]/.test(cookie.value)) {
      throw badRequest(`Cookie "${cookie.name}" needs a "value" of at most 4096 characters, without spaces, quotes, commas or semicolons.`);
    }
    return { name: cookie.name, value: cookie.value };
  });
}

// Extra headers for the page's own origin: { "Authorization": "Bearer ..." }.
function parseHeaders(headers) {
  if (!isObject(headers) || Object.keys(headers).length > 10) {
    throw badRequest('"headers" must be an object with at most 10 headers.');
  }
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!TOKEN.test(name) || BLOCKED_HEADERS.includes(lower)) {
      throw badRequest(`The header "${name}" is not allowed.`);
    }
    if (typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value)) {
      throw badRequest(`The header "${name}" needs a string value of at most 4096 characters.`);
    }
    result[lower] = value;
  }
  return result;
}
