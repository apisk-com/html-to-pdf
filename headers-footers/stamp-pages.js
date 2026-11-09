// Usage: node stamp-pages.js input.pdf output.pdf [pages to skip]
// Adds "Page X of Y" to an existing PDF.
import { readFile, writeFile } from 'node:fs/promises';
import { stampPageNumbers } from './src/stamp.js';

const [input, output, skip = '0'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node stamp-pages.js input.pdf output.pdf [pages to skip]');
  process.exit(1);
}
const pdf = await stampPageNumbers(await readFile(input), { skip: Number(skip) });
await writeFile(output, pdf);
console.log(`Wrote ${output}`);
