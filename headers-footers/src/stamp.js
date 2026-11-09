import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const pageXofY = (number, total) => `Page ${number} of ${total}`;

// Writes a page number at the bottom center of the pages of an existing PDF.
// skip: the number of pages at the start that get no number, for example a cover.
// The numbers then start at 1 on the first page after them.
export async function stampPageNumbers(pdfBytes, { skip = 0, label = pageXofY, fontSize = 9, bottom = 24 } = {}) {
  const pdf = await PDFDocument.load(pdfBytes);
  // Helvetica is a standard PDF font, so the PDF needs no font file.
  // It has Latin characters only. For other scripts, embed a font file.
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages().slice(skip);

  pages.forEach((page, index) => {
    const text = label(index + 1, pages.length);
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    // The crop box is the part of the page that a PDF viewer shows.
    const box = page.getCropBox();
    page.drawText(text, {
      x: box.x + (box.width - textWidth) / 2,
      y: box.y + bottom,
      size: fontSize,
      font,
      color: rgb(0.29, 0.33, 0.39),
    });
  });
  return pdf.save();
}
