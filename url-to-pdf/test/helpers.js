import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Returns the text of each page of a PDF.
export async function pdfPages(bytes) {
  const data = new Uint8Array(bytes);
  assert.equal(Buffer.from(data.subarray(0, 5)).toString(), '%PDF-');
  const task = getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  await task.destroy();
  return pages;
}

// The numbers of the "Photo N" labels in a text.
export function photoNumbers(text) {
  return [...text.matchAll(/Photo (\d+)/g)].map((match) => Number(match[1])).sort((a, b) => a - b);
}

export const ALL_PHOTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
