import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName } from 'pdf-lib';

// Reads each page of a PDF: the text with size and position, the number of
// images that the page draws, and the fill colors that it uses.
export async function readPages(pdf) {
  const task = getDocument({ data: new Uint8Array(pdf), verbosity: 0, fontExtraProperties: true });
  const doc = await task.promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const { width, height } = page.getViewport({ scale: 1 });
    // The operator list loads the fonts, so it comes before the text.
    const ops = await page.getOperatorList();
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => item.str.trim() !== '')
      .map((item) => ({
        text: item.str,
        size: Math.hypot(item.transform[2], item.transform[3]),
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        family: content.styles[item.fontName]?.fontFamily,
        font: page.commonObjs.get(item.fontName)?.name,
      }));
    const images = ops.fnArray.filter((fn) => fn === OPS.paintImageXObject).length;
    const fills = new Set(
      ops.fnArray.flatMap((fn, i) => (fn === OPS.setFillRGBColor ? [String(ops.argsArray[i])] : [])),
    );
    pages.push({ width, height, items, images, fills, text: items.map((item) => item.text).join(' ') });
  }
  await task.destroy();
  return pages;
}

// Finds the first text item on a page that contains `text`.
export function find(page, text) {
  return page.items.find((item) => item.text.includes(text));
}


// True when the PDF has a structure tree (a tagged, accessible PDF).
export async function isTagged(pdf) {
  const doc = await PDFDocument.load(pdf);
  return doc.catalog.has(PDFName.of('StructTreeRoot'));
}

// Prints HTML to PDF in a new page and closes the page.
export async function print(browser, html, options) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf(options);
  } finally {
    await page.close();
  }
}
