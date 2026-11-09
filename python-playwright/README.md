# HTML to PDF with Playwright in Python

This folder makes PDF files from HTML with Playwright `page.pdf()` in Python: a script with the sync API and a small
FastAPI service with `POST /pdf` (async API). The tutorial explains each option and the problems that you can get:
[Generate PDFs with Playwright in Node.js and Python](https://apisk.com/blog/playwright-pdf/). The Node.js version
is in the [nodejs-playwright](../nodejs-playwright/) folder.

## Files

| File | What it does |
|---|---|
| `report.html` | Sample document: a table, a page break, print CSS and a script that fills the table |
| `make_pdf.py` | Command-line script with the Playwright sync API |
| `app.py` | FastAPI service with the Playwright async API |
| `tests/test_pdf.py` | Tests (`pytest`) |
| `test.sh` | The test script |

## Requirements

- Python 3.12 or later
- Playwright for Python 1.64.1 (the latest Python release on 9 November 2026)

Playwright makes PDFs only with Chromium. Firefox and WebKit do not support `page.pdf()`.

## Run it

Make a virtual environment and install the packages and Chromium:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
```

Make a PDF with the sync API:

```bash
.venv/bin/python make_pdf.py report.html out/report.pdf
```

Start the service:

```bash
.venv/bin/uvicorn app:app --port 8000
```

Send the sample report to the service from a second terminal:

```bash
jq -Rs '{html: .}' report.html | curl -s -H 'Content-Type: application/json' -d @- -o report.pdf http://127.0.0.1:8000/pdf
```

The request body is JSON: `html` (required, at most 2,000,000 characters), `media` (`print` or `screen`), `format`
(`A4`, `Letter` or `Legal`) and `landscape` (`true` or `false`). The service blocks all network requests from the
HTML. If you add a URL input, you must also add protection against SSRF (server-side request forgery).

Run the tests:

```bash
.venv/bin/python -m pytest -q
```

On Linux, add `--with-deps` to `playwright install` to install the system libraries. `test.sh` does this.
