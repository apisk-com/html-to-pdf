import { readFileSync } from 'node:fs';

// Chrome prints headerTemplate and footerTemplate as small separate documents.
// The CSS, web fonts and scripts of the page do not reach them, and they
// cannot load files over the network. So all styles are inline, and the logo
// is a data URL.
const logo = readFileSync(new URL('../document/logo.svg', import.meta.url));
const LOGO_URL = `data:image/svg+xml;base64,${logo.toString('base64')}`;

// Without a font size, the text is 1px high. Without a font family, it is
// serif. Without the side margins, it starts at the edge of the paper.
const ROW = [
  'width: 100%',
  'margin: 0 15mm',
  'display: flex',
  'align-items: center',
  'justify-content: space-between',
  "font-family: Arial, Helvetica, 'Liberation Sans', sans-serif",
  'font-size: 8pt',
  'color: #4b5563',
].join('; ');

// The templates are HTML. Escape every value that you put into them.
export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => entities[char]);
}

// Chrome fills the element with class "title" with the <title> of the page.
export function headerTemplate({ company }) {
  return `
<div style="${ROW}; padding-bottom: 5px; border-bottom: 0.75pt solid #d1d5db;">
  <span style="display: flex; align-items: center; gap: 6px;">
    <img src="${LOGO_URL}" style="width: 14px; height: 14px;">
    <span>${escapeHtml(company)}</span>
  </span>
  <span class="title"></span>
</div>`;
}

// Chrome fills "pageNumber" and "totalPages" on each page.
export function footerTemplate({ printedOn }) {
  return `
<div style="${ROW}">
  <span>Printed on ${escapeHtml(printedOn)}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}
