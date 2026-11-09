#!/usr/bin/env bash
# CI entry point (GitHub Actions, ubuntu-24.04). Installs the engines, renders
# each document once with each engine (tests), then runs the benchmark and
# prints the results as Markdown tables.
set -euo pipefail
cd "$(dirname "$0")"

echo "== Runner"
lsb_release -ds
uname -r
lscpu | grep -E '^(Model name|CPU\(s\)):'
free -m | head -n 2
docker --version
echo "cgroup controllers: $(cat /sys/fs/cgroup/cgroup.subtree_control)"

echo "== System packages: poppler, Liberation fonts, Pango for WeasyPrint"
sudo apt-get update -qq
sudo apt-get install -y -qq poppler-utils fonts-liberation time \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 libharfbuzz0b > /dev/null
dpkg-query -W -f='${Package} ${Version}\n' libpango-1.0-0 libharfbuzz0b fonts-liberation

echo "== wkhtmltopdf 0.12.6.1 (archived; for comparison only)"
deb_url=https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.jammy_amd64.deb
curl -fsSL -o /tmp/wkhtmltox.deb "$deb_url"
sudo apt-get install -y -qq /tmp/wkhtmltox.deb > /dev/null
wkhtmltopdf --version

echo "== Gotenberg image"
docker pull -q gotenberg/gotenberg:9.2.0-chromium
docker image ls gotenberg/gotenberg --format 'Image size: {{.Repository}}:{{.Tag}} {{.Size}}'

echo "== Node.js packages, Chrome for Puppeteer, Chromium for Playwright"
npm ci
npx playwright install --with-deps chromium

echo "== Python packages"
python -m venv .venv
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python --version
.venv/bin/python -c 'import weasyprint; print("WeasyPrint", weasyprint.__version__)'

echo "== Tests: each engine renders each document"
npm test

echo "== Benchmark"
npm run bench

echo "== Report: the page of each section heading (information only)"
for engine in puppeteer weasyprint wkhtmltopdf; do
  pages=$(pdftotext "out/$engine-report.pdf" - | awk 'BEGIN { RS = "\f" } /[0-9]+\. [A-Za-z]+ region/ { printf "%d ", NR }')
  echo "$engine: $pages"
done

echo "== /usr/bin/time -v on the same report runs (information only)"
# GNU time reports the largest single process, not all the processes of the engine.
for worker in "node engines/puppeteer.mjs" "node engines/playwright.mjs" ".venv/bin/python engines/weasyprint_worker.py"; do
  kb=$( { /usr/bin/time -f '%M' $worker documents/report.html 3 15 out/time.pdf > /dev/null; } 2>&1 | tail -n 1)
  echo "$worker: maximum resident set size $((kb / 1000)) MB"
done

echo "== Gotenberg 9: a Gotenberg 8 field (information only)"
docker run -d --rm --name gotenberg-info -p 127.0.0.1:3301:3000 gotenberg/gotenberg:9.2.0-chromium > /dev/null
curl -s --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null http://127.0.0.1:3301/health
curl -s -w '\nHTTP status %{http_code}\n' -F files=@documents/invoice.html\;filename=index.html \
  -F pdfa=PDF/A-2b http://127.0.0.1:3301/forms/chromium/convert/html -o out/info.txt || true
cat out/info.txt; echo
docker rm -f gotenberg-info > /dev/null

# The workflow keeps no files, so print the PDFs that the article shows as
# base64. To see one, copy its line into a file and run: base64 -d file > out.pdf
echo "::group::PDFs of the invoice and the chart page (base64)"
for engine in puppeteer playwright gotenberg weasyprint wkhtmltopdf; do
  for doc in invoice chart; do
    echo "== out/$engine-$doc.pdf"
    base64 -w 0 "out/$engine-$doc.pdf"
    echo
  done
done
echo "::endgroup::"

echo "== All checks passed"
