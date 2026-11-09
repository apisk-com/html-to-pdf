#!/usr/bin/env bash
# CI entry point: install everything, run the tests, then run the example once.
set -euo pipefail
cd "$(dirname "$0")"

npm ci
# Chromium makes the PDFs. Firefox is only for the test that shows the error.
npx playwright install --with-deps chromium firefox
npm test
node make-pdf.js report.html out/report.pdf
head -c 5 out/report.pdf | grep -q '%PDF-'

echo "All checks passed."
