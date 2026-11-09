#!/usr/bin/env bash
# CI entry point (GitHub Actions, ubuntu-24.04): the tests, then the
# commands from the tutorial and the README against the local test site.
set -euo pipefail
cd "$(dirname "$0")"

echo "== System packages: unzip for Puppeteer, fonts, poppler (pdfinfo, pdftotext)"
sudo apt-get update -qq
sudo apt-get install -y -qq unzip fonts-liberation poppler-utils

echo "== Node.js packages, Chrome for Puppeteer, Chromium for Playwright"
npm ci
npx playwright install --with-deps --only-shell chromium

echo "== Tests"
npm test

echo "== The commands of the tutorial"
rm -f ./*.pdf
mkdir -p out
npm run test-site > out/test-site.log 2>&1 &
site_pid=$!
npm start > out/service.log 2>&1 &
service_pid=$!
cleanup() {
  # npm passes SIGTERM on to the node process.
  kill "$site_pid" "$service_pid" 2> /dev/null || true
  tail -n 20 out/test-site.log out/service.log || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS http://localhost:3000/health > /dev/null 2>&1 && curl -fsS http://127.0.0.1:8080/article > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

TIMEFORMAT='   %R s'
echo "-- article.json"
time curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/article.json -o article.pdf
echo "-- screen-desktop.json"
time curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/screen-desktop.json -o desktop.pdf
echo "-- wide-table.json"
time curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/wide-table.json -o wide.pdf
echo "-- single-page-app.json"
time curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/single-page-app.json -o orders.pdf
echo "-- report-token.json"
time curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/report-token.json -o report.pdf
echo "-- account-cookie.json"
time curl -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/account-cookie.json -o account.pdf
echo "-- login-and-print.js (the test site robot account is demo / demo-password)"
export ROBOT_USER=demo ROBOT_PASSWORD=demo-password
node examples/login-and-print.js http://127.0.0.1:8080/login http://127.0.0.1:8080/account account-login.pdf

check() {
  local file=$1 text=$2
  head -c 5 "$file" | grep -q '%PDF-' || { echo "Not a PDF: $file"; head -c 300 "$file"; exit 1; }
  pdftotext "$file" - | grep -q "$text" || { echo "$file does not contain: $text"; exit 1; }
  echo "$file: $(pdfinfo "$file" | grep -E '^Pages' | tr -s ' '), $(wc -c < "$file") bytes, contains \"$text\""
}
check article.pdf 'Photo 12'
check desktop.pdf 'Related walks'
check wide.pdf 'Year total'
check orders.pdf 'A-1001'
check report.pdf 'Private report'
check account.pdf 'Account statement for demo'
check account-login.pdf 'Account statement for demo'

echo "-- The scale header for the wide table"
curl -sS -D - -o /dev/null -X POST http://localhost:3000/pdf -H "Content-Type: application/json" -d @examples/wide-table.json | grep -i '^x-pdf-scale'

echo "== All checks passed"
