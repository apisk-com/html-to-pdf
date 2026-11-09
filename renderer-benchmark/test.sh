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
sudo apt-get install -y -qq poppler-utils fonts-liberation \
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
