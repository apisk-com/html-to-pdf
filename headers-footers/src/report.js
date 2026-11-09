import { PDFDocument } from 'pdf-lib';
import { footerTemplate, headerTemplate } from './templates.js';

// The same paper and margins in both renders, so the page breaks are the same.
// The header and footer print inside the top and bottom margins.
const PAGE = {
  format: 'A4',
  printBackground: true,
  margin: { top: '22mm', right: '15mm', bottom: '20mm', left: '15mm' },
  timeout: 30_000,
};

// Renders HTML to PDF. Page 1 is a cover without header and footer.
// All other pages get the header and "Page X of Y".
export async function renderReport(browser, html, { company, printedOn }) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });

    // Render 1: all pages, with header and footer. The numbers count the cover.
    const withHeaders = await page.pdf({
      ...PAGE,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate({ company }),
      footerTemplate: footerTemplate({ printedOn }),
    });
    // Render 2: page 1 only, without header and footer.
    const cover = await page.pdf({ ...PAGE, pageRanges: '1' });

    return await replaceFirstPage(withHeaders, cover);
  } finally {
    await page.close();
  }
}

// Makes a new PDF from page 1 of `cover` and pages 2 to N of `pdf`.
async function replaceFirstPage(pdf, cover) {
  const main = await PDFDocument.load(pdf);
  const first = await PDFDocument.load(cover);
  const result = await PDFDocument.create();

  const [coverPage] = await result.copyPages(first, [0]);
  result.addPage(coverPage);
  const otherPages = await result.copyPages(main, main.getPageIndices().slice(1));
  for (const otherPage of otherPages) {
    result.addPage(otherPage);
  }
  // copyPages() copies pages only. Copy the document title too.
  result.setTitle(main.getTitle() ?? '');
  return result.save();
}
