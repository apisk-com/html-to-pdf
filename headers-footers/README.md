# PDF headers, footers and page numbers

This folder shows four ways to add headers, footers and "Page X of Y" to PDF files. The first way uses
`headerTemplate` and `footerTemplate` in Puppeteer, with a cover page that has no header. The second way uses CSS
`@page` margin boxes with Paged.js in Chrome, with a table of contents that shows page numbers. The third way uses
the same CSS in WeasyPrint. The fourth way writes page numbers into an existing PDF with pdf-lib. The tutorial
explains each part and the tests that prove it:
[PDF Headers, Footers and Page Numbers with Headless Chrome](https://apisk.com/blog/pdf-headers-footers-page-numbers/).

## Files

| File | What it does |
|---|---|
| `src/templates.js` | The header and footer templates for `page.pdf()` |
| `src/report.js` | Renders the report two times and makes one PDF with pdf-lib: a cover without header, then pages with header and footer |
| `src/paged.js` | Lays out the pages with Paged.js in Chrome, then prints them |
| `src/stamp.js` | Writes "Page X of Y" into an existing PDF with pdf-lib |
| `make-report.js`, `make-book.js`, `stamp-pages.js` | Command-line scripts |
| `render_weasyprint.py` | Renders the book with WeasyPrint |
| `document/report.html` | Sample report with a cover page |
| `document/book.html`, `document/book.css` | Sample book: `@page` margin boxes, a running header, the chapter name and a table of contents |
| `test/` | Node.js tests (`node --test`), one for each rule in the tutorial |
| `tests/test_weasyprint.py` | WeasyPrint tests (`pytest`) |
| `test.sh` | The script that GitHub Actions runs |

## Requirements

- Node.js 22.13 or later
- Puppeteer 25.16.0 (Chrome for Testing 156), Paged.js 0.4.3 and pdf-lib 1.17.1
- For the WeasyPrint part: Python 3.12 or later, WeasyPrint 70.0 and the Pango libraries
  (on Ubuntu: `sudo apt-get install libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0`)

On Linux, Puppeteer needs the `unzip` command to unpack Chrome when you install the packages.

## Run the examples

Install the packages. This also downloads Chrome:

```bash
npm ci
```

Make the report with a cover page, a header and page numbers:

```bash
node make-report.js out/report.pdf
```

Make the book with Paged.js. Its table of contents shows the page of each chapter:

```bash
node make-book.js out/book.pdf
```

Write page numbers into an existing PDF. The last argument is the number of pages at the start that get no
number (here, a cover):

```bash
node stamp-pages.js input.pdf out/numbered.pdf 1
```

Make the same book with WeasyPrint:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python render_weasyprint.py out/book-weasyprint.pdf
```

## Tests

```bash
npm test
```

```bash
.venv/bin/pytest -q
```

The Node.js tests print real PDFs with Chrome and read them back with pdf.js. They measure the font size and
position of the header text, find drawn images and colors, and compare the page numbers in the table of contents
with the pages of the chapters. The WeasyPrint tests read the PDF text with pypdf.

The sample font in `test/fixtures` is Inter, under the SIL Open Font License (`test/fixtures/OFL.txt`).
