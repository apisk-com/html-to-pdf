# HTML to PDF with Playwright in Node.js

This folder makes PDF files from HTML with Playwright `page.pdf()` in Node.js: a module with one function and a
command-line script. The tutorial explains each option and the problems that you can get:
[Generate PDFs with Playwright in Node.js and Python](https://apisk.com/blog/playwright-pdf/). The Python version
is in the [python-playwright](../python-playwright/) folder.

## Files

| File | What it does |
|---|---|
| `report.html` | Sample document: a table, a page break, print CSS and a script that fills the table |
| `pdf.js` | `htmlToPdf()`: one HTML string to one PDF buffer |
| `make-pdf.js` | Command-line script |
| `test/pdf.test.js` | Tests (`node --test`) |
| `test.sh` | The script that GitHub Actions runs |

## Requirements

- Node.js 22 or later
- Playwright 1.65.0

Playwright makes PDFs only with Chromium. Firefox and WebKit do not support `page.pdf()`.

## Run it

Install the packages and Chromium:

```bash
npm ci
npx playwright install chromium
```

Make a PDF of the sample report:

```bash
node make-pdf.js report.html out/report.pdf
```

To use the screen CSS instead of the print CSS, add `screen` as the third argument.

Run the tests (one test needs Firefox: `npx playwright install firefox`):

```bash
npm test
```

On Linux, add `--with-deps` to `playwright install` to install the system libraries. `test.sh` does this.
