#!/usr/bin/env bash
# Test entry point (Ubuntu 24.04). Installs the engines, renders
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

echo "== WeasyPrint: three ways to color an inline SVG (information only)"
# The color at the center of each square: page CSS, a fill attribute, a <style> in the SVG.
.venv/bin/python - <<'PY'
import subprocess
from io import BytesIO

from PIL import Image
from weasyprint import HTML

html = """<style>@page { margin: 0 } .page-css { fill: #d97706 }</style>
<svg width="300" height="100" viewBox="0 0 300 100">
  <style>.svg-css { fill: #d97706 }</style>
  <rect class="page-css" x="0" y="0" width="100" height="100"/>
  <rect fill="#d97706" x="100" y="0" width="100" height="100"/>
  <rect class="svg-css" x="200" y="0" width="100" height="100"/>
</svg>"""
pdf = HTML(string=html).write_pdf()
png = subprocess.run(["pdftoppm", "-r", "96", "-png", "-singlefile", "-"], input=pdf, capture_output=True).stdout
image = Image.open(BytesIO(png)).convert("RGB")
for name, x in [("class in the page CSS", 50), ("fill attribute", 150), ("<style> in the SVG", 250)]:
    print(f"{name}: RGB {image.getpixel((x, 50))}")
PY

echo "== Gotenberg 9: a Gotenberg 8 field (information only)"
docker run -d --rm --name gotenberg-info -p 127.0.0.1:3301:3000 gotenberg/gotenberg:9.2.0-chromium > /dev/null
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:3301/health 2> /dev/null; then break; fi
  sleep 1
done
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

echo "== Memory after 2 and after 50 renders (information only)"
for runs in 1 49; do
  echo "1 warm-up render and $runs timed renders:"
  npm run --silent bench -- --engines puppeteer,puppeteer-shell,playwright --warmup 1 --runs "$runs" 2>&1 \
    | grep -E '^(puppeteer|playwright)'
done

echo "== All checks passed"
