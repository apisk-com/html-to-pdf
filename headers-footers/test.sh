#!/usr/bin/env bash
# Test entry point (Ubuntu 24.04). Runs the Node.js tests
# (Chrome, Paged.js, pdf-lib), the WeasyPrint tests, and the scripts.
set -euo pipefail
cd "$(dirname "$0")"

echo "== System packages: fonts, poppler (pdfinfo, pdftotext) and Pango for WeasyPrint"
sudo apt-get update -qq
sudo apt-get install -y -qq fonts-liberation poppler-utils \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0

echo "== Node.js packages and Chrome for Puppeteer"
npm ci
npm test

echo "== Python packages and WeasyPrint tests"
python -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
pytest -q

echo "== The scripts"
rm -rf out && mkdir -p out
node make-report.js out/report.pdf
node make-book.js out/book.pdf
python render_weasyprint.py out/book-weasyprint.pdf
node stamp-pages.js out/book-weasyprint.pdf out/stamped.pdf 1
for f in out/*.pdf; do
  head -c 5 "$f" | grep -q '%PDF-' || { echo "Not a PDF: $f"; exit 1; }
  echo "$f: $(pdfinfo "$f" | grep -E '^Pages' | tr -s ' ')"
done

echo "== WeasyPrint, page 1 (contents) and page 3"
pdftotext -layout -f 1 -l 1 out/book-weasyprint.pdf - | grep -v '^\s*$'
pdftotext -layout -f 3 -l 3 out/book-weasyprint.pdf - | grep -v '^\s*$' | head -n 4

echo "== All checks passed"
