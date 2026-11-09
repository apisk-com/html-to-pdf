# HTML to PDF renderer benchmark

This folder renders the same three HTML documents with Puppeteer, Playwright,
Gotenberg, WeasyPrint and wkhtmltopdf. For each engine and document, it
measures the median render time, the peak memory and the PDF size. The
tutorial [Puppeteer vs Playwright vs WeasyPrint vs Gotenberg for PDFs](https://apisk.com/blog/choose-html-to-pdf-renderer/)
explains the method and the results.

## The documents

| File | Content |
|---|---|
| `documents/invoice.html` | A one-page invoice with system fonts, flexbox and a grid |
| `documents/report.html` | A report with 10 tables and 880 rows, 30 A4 pages in Chrome. `documents/make-report.mjs` writes it. |
| `documents/chart.html` | One page with three web fonts (IBM Plex, WOFF2 with WOFF as a fallback) and two inline SVG charts |

The fonts are under the SIL Open Font License (`documents/OFL-*.txt`).

## The engines

| Engine | Worker | How it renders |
|---|---|---|
| Puppeteer 25.16.0 | `engines/puppeteer.mjs` | One Chrome, a new page for each render. `--untagged` sets `tagged: false`, `--shell` starts chrome-headless-shell. |
| Playwright 1.65.0 | `engines/playwright.mjs` | One Chromium headless shell, a new context for each render |
| Gotenberg 9.2.0 | `engines/gotenberg.mjs` | A container from `gotenberg/gotenberg:9.2.0-chromium`. Each render is one request to `POST /forms/chromium/convert/html`. |
| WeasyPrint 70.0 | `engines/weasyprint_worker.py` | One Python process |
| wkhtmltopdf 0.12.6.1 | `engines/wkhtmltopdf.sh` | A new process for each render. The project is archived; it is here for comparison only. |

Each worker prints one line of JSON with the time of each render. `bench.mjs`
starts the workers one after the other, so two engines never share the CPU.

## Requirements

- Linux with cgroup v2 and `sudo` for the memory values. On other systems, the
  benchmark measures time and size only.
- Node.js 22.12 or later
- Python 3.12 or later, and the Pango libraries for WeasyPrint
- Docker for Gotenberg
- wkhtmltopdf 0.12.6.1 (optional)

`test.sh` installs all of them on Ubuntu 24.04.

## Install

```bash
npm ci
```

```bash
npx playwright install --with-deps chromium
```

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install -r requirements.txt
```

```bash
docker pull gotenberg/gotenberg:9.2.0-chromium
```

## Test and run

Render each document once with each installed engine and check the PDF files:

```bash
npm test
```

Run the benchmark. It prints the results as Markdown tables and writes
`out/results.json` and one PDF for each engine and document:

```bash
npm run bench
```

Change the number of renders, or test some engines only:

```bash
npm run bench -- --warmup 3 --runs 15 --engines puppeteer,weasyprint
```

## How the values are measured

- Render time: the time of one render in a process that is already running,
  after 3 renders to warm up. For Gotenberg, it is the time of the HTTP request.
  For wkhtmltopdf, each render starts a new process.
- Start and first invoice: from the start of the browser, the WeasyPrint import
  or the container to the first PDF of the invoice.
- Peak memory: `memory.peak` of a new Linux cgroup for each engine and
  document. It counts all processes of the engine, also every browser process,
  and each memory page once. For Gotenberg, it is the cgroup of the container.
  Before each run, `bench.mjs` empties the page cache, so the files that the
  engine reads count the same way for every engine.
- PDF size: the size of the last PDF.

The numbers depend on the machine. Run the benchmark with your own documents
on your own servers before you choose an engine.
