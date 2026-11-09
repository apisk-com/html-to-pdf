# HTML to PDF

Working code that converts HTML and web pages to PDF with headless Chrome, Puppeteer, Playwright, WeasyPrint and other open-source tools. Each folder is one complete example: one language and tool, or one
problem. The [APISK tutorials](https://apisk.com/blog/) explain the code step
by step.

## Examples

### By language and tool

| Folder | Language and tools | What it does | Tutorial |
|---|---|---|---|
| [nodejs-puppeteer](nodejs-puppeteer/) | Node.js, Express 5, Puppeteer | HTML to PDF API: `POST /pdf` with HTML, a Handlebars template or a URL; tests and a Docker image | [Build an HTML to PDF API with Node.js and Puppeteer](https://apisk.com/blog/html-to-pdf-api-nodejs/), 12 November 2026 |
| [nodejs-playwright](nodejs-playwright/) | Node.js, Playwright | A `page.pdf()` module and a command-line script | [Generate PDFs with Playwright in Node.js and Python](https://apisk.com/blog/playwright-pdf/), 1 December 2026 |
| [python-playwright](python-playwright/) | Python, Playwright, FastAPI | A `page.pdf()` script (sync API) and a `POST /pdf` service (async API) | [Generate PDFs with Playwright in Node.js and Python](https://apisk.com/blog/playwright-pdf/), 1 December 2026 |
| [python-weasyprint](python-weasyprint/) | Python, FastAPI, WeasyPrint, Jinja2 | HTML to PDF API with templates, a safe URL fetcher and a Docker image | [HTML to PDF API in Python with FastAPI and WeasyPrint](https://apisk.com/blog/html-to-pdf-python-fastapi/), 15 December 2026 |

### By problem

| Folder | Language and tools | What it does | Tutorial |
|---|---|---|---|
| [wkhtmltopdf-migration](wkhtmltopdf-migration/) | wkhtmltopdf, Puppeteer, WeasyPrint | Renders one invoice with wkhtmltopdf, Chrome and WeasyPrint, and compares the PDFs | [Replace wkhtmltopdf: Migrate to Chrome or WeasyPrint](https://apisk.com/blog/wkhtmltopdf-alternative/), 24 November 2026 |
| [page-breaks](page-breaks/) | CSS, Chrome, WeasyPrint | Page breaks in tables, rows and headings, tested in Chrome and WeasyPrint | [CSS Page Breaks for HTML to PDF: Tables, Rows, Headings](https://apisk.com/blog/css-page-breaks-pdf/), 3 December 2026 |
| [headers-footers](headers-footers/) | Puppeteer, pdf-lib, WeasyPrint | Headers, footers, "Page X of Y" and a different first page | [PDF Headers, Footers and Page Numbers with Headless Chrome](https://apisk.com/blog/pdf-headers-footers-page-numbers/), 17 December 2026 |
| [url-to-pdf](url-to-pdf/) | Node.js, headless Chrome | Converts web pages to PDF: print CSS, lazy content, logins | [Convert Any URL to PDF with Headless Chrome](https://apisk.com/blog/url-to-pdf/), 7 January 2027 |
| [renderer-benchmark](renderer-benchmark/) | Puppeteer, Playwright, WeasyPrint, Gotenberg | The same documents rendered by four engines, with timings | [Puppeteer vs Playwright vs WeasyPrint vs Gotenberg for PDFs](https://apisk.com/blog/choose-html-to-pdf-renderer/), 21 January 2027 |

Each folder runs on its own: open its `README.md` for the commands.

## Add an example

Examples for other languages and tools are welcome. Put each one in its own
folder. Name the folder `<language>-<tool>`, for example
`java-openhtmltopdf`, or name it after the problem that it solves. Add a
`test.sh` file that installs what the example needs on Ubuntu 24.04 and runs
its tests. The test workflow runs `test.sh` for each folder that a push or a
pull request changes.

## License

MIT. See [LICENSE](LICENSE).
