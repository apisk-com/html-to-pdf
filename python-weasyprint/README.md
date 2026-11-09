# HTML to PDF API in Python with FastAPI and WeasyPrint

A small HTML to PDF service in Python. `POST /invoices/pdf` fills a Jinja2 invoice template with JSON data, and
`POST /pdf` converts HTML from the request. WeasyPrint makes the PDF in a new child process for each request, with a
time limit, a memory limit and a page limit. A URL fetcher loads only `data:` URLs and the files in `app/static/`:
it blocks `file://` URLs to other files and all `http://` and `https://` URLs. The tests prove each block.

The tutorial explains each file:
[HTML to PDF API in Python with FastAPI and WeasyPrint](https://apisk.com/blog/html-to-pdf-python-fastapi/).

## Files

| File | What it does |
|---|---|
| `app/fetcher.py` | `SafeURLFetcher`: loads `data:` URLs and files in `app/static/` only |
| `app/render.py` | `render_pdf()`: one child process for each render, with the limits |
| `app/main.py` | The FastAPI app: request models, Jinja2, body size limit, render slots |
| `app/templates/invoice.html` | The invoice template |
| `app/static/` | The stylesheet, the logo and the IBM Plex Sans font (SIL Open Font License) |
| `examples/invoice.json` | An example request with 27 line items |
| `django_example/views.py` | A Django view that gets the PDF from the service |
| `tests/` | Tests with pytest and the FastAPI TestClient |
| `bench.py` | Measures the time and the memory of one render |
| `Dockerfile` | The image with Pango and a non-root user |
| `test.sh` | The test script |

## Requirements

- Python 3.12 or later on Linux. The service uses the `forkserver` start method of `multiprocessing` and the
  `RLIMIT_AS` memory limit of the `resource` module. The tests run on Ubuntu 24.04 only.
- Pango 1.44 or later. On Debian and Ubuntu, install it with
  `sudo apt-get install libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 libharfbuzz0b`.
  For other systems, read the [WeasyPrint installation steps](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html).
- WeasyPrint 70.0 or later. Versions 68, 69 and 70 fixed URL fetcher bypasses.

## Install and run

Make a virtual environment and install the packages:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Start the service. Use `python -m uvicorn`, not the `uvicorn` command: then the render processes do not import the
uvicorn script again.

```bash
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Send the example invoice from a second terminal:

```bash
curl -H 'Content-Type: application/json' -d @examples/invoice.json -o invoice.pdf http://127.0.0.1:8000/invoices/pdf
```

The response is a two-page A4 PDF. To convert your own HTML, send `{"html": "..."}` to `POST /pdf`. Relative URLs in
the HTML point to `app/static/`, so `<link rel="stylesheet" href="invoice.css">` works.

## Limits

| Environment variable | Default | What it limits |
|---|---|---|
| `MAX_BODY_BYTES` | 1000000 | Request body size (413) |
| `RENDER_SLOTS` | number of CPUs | Renders at the same time |
| `QUEUE_TIMEOUT_SECONDS` | 10 | Wait for a free render slot (503) |
| `RENDER_TIMEOUT_SECONDS` | 20 | Time of one render (504) |
| `RENDER_MEMORY_MB` | 1024 | Virtual memory of one render process (500) |
| `MAX_PAGES` | 50 | Pages in one PDF (422) |

The service takes no URL input. If you add one, you must also add protection against SSRF (server-side request
forgery) for each URL and each redirect.

## Test

```bash
.venv/bin/python -m pytest -q
```

Measure one render:

```bash
.venv/bin/python bench.py
```

## Docker

```bash
docker build -t python-weasyprint .
docker run --rm --init --read-only --tmpfs /tmp --memory 1g -p 8000:8000 python-weasyprint
```

`test.sh` builds the image, starts it with these options and sends the example request.
