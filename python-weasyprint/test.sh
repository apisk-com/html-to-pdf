#!/usr/bin/env bash
# CI entry point (GitHub Actions, ubuntu-24.04): install Pango, run the tests,
# measure one render, run the service, then build and test the Docker image.
set -euo pipefail
cd "$(dirname "$0")"

echo "== System packages: Pango and HarfBuzz for WeasyPrint"
sudo apt-get update -qq
sudo apt-get install -y -qq libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 libharfbuzz0b > /dev/null
dpkg-query -W -f='${Package} ${Version}\n' libpango-1.0-0 libharfbuzz0b

echo "== Python packages"
python -m venv .venv
.venv/bin/pip install -q -r requirements-dev.txt
.venv/bin/python --version
.venv/bin/python -c 'import weasyprint; print("WeasyPrint", weasyprint.__version__)'

echo "== Tests"
.venv/bin/python -m pytest -q

echo "== Log messages that the tutorial quotes (information only)"
.venv/bin/python -c '
import logging
logging.basicConfig(format="%(name)s %(levelname)s: %(message)s")
from weasyprint import HTML
from app.fetcher import SafeURLFetcher
HTML(string="<img src=\"http://169.254.169.254/logo.png\"><p>x</p>", url_fetcher=SafeURLFetcher()).write_pdf()
HTML(string="<img src=\"logo.png\"><p>x</p>").write_pdf()'
.venv/bin/python -c 'from weasyprint import default_url_fetcher' 2>&1 | tail -n 1 || true

echo "== One render: time and memory (GitHub runner, $(nproc) CPUs)"
.venv/bin/python bench.py

# Median time of 10 invoice requests, measured by curl.
median_request() {
  for _ in $(seq 1 10); do
    curl -sf -o /dev/null -w '%{time_total}\n' -H 'Content-Type: application/json' \
      -d @examples/invoice.json "$1/invoices/pdf"
  done | sort -n | awk '{t[NR] = $1} END {printf "%.0f ms\n", (t[5] + t[6]) / 2 * 1000}'
}

echo "== Request time: the uvicorn command and python -m uvicorn"
.venv/bin/uvicorn app.main:app --port 8002 --log-level warning &
script_server=$!
curl -sf --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null http://127.0.0.1:8002/health
echo "uvicorn app.main:app: $(median_request http://127.0.0.1:8002)"
kill "$script_server"
wait "$script_server" 2>/dev/null || true

echo "== Service smoke test"
mkdir -p out
.venv/bin/python -m uvicorn app.main:app --port 8000 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
curl -sf --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null http://127.0.0.1:8000/health
echo "python -m uvicorn app.main:app: $(median_request http://127.0.0.1:8000)"
curl -sf -D - -H 'Content-Type: application/json' -d @examples/invoice.json \
  -o out/invoice.pdf http://127.0.0.1:8000/invoices/pdf
head -c 5 out/invoice.pdf | grep -q '%PDF-'
kill "$server"
wait "$server" 2>/dev/null || true
trap - EXIT

echo "== Docker image"
image=python-weasyprint
container=python-weasyprint-test
docker build -q -t "$image" .
docker image ls "$image" --format 'Image size: {{.Size}}'
docker run --rm "$image" python --version

cleanup() {
  docker logs "$container" 2>&1 | tail -n 30 || true
  docker rm -f "$container" > /dev/null 2>&1 || true
}
trap cleanup EXIT
docker run -d --name "$container" --init --read-only --tmpfs /tmp --memory 1g \
  -p 8001:8000 "$image"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:8001/health 2> /dev/null; then
    break
  fi
  sleep 1
done

status=$(curl -s -o out/docker.pdf -w '%{http_code}' -H 'Content-Type: application/json' \
  -d @examples/invoice.json http://127.0.0.1:8001/invoices/pdf)
if [ "$status" != 200 ] || [ "$(head -c 5 out/docker.pdf)" != '%PDF-' ]; then
  echo "Docker smoke test failed: status $status" >&2
  exit 1
fi
echo "Docker: invoice.pdf has $(wc -c < out/docker.pdf) bytes"

# A file URL in the HTML must not end up in the PDF as an attachment.
curl -sf -H 'Content-Type: application/json' -o out/attachment.pdf http://127.0.0.1:8001/pdf \
  -d '{"html": "<link rel=\"attachment\" href=\"file:///etc/passwd\"><p>Hi</p>"}'
.venv/bin/python -c '
import sys
from pypdf import PdfReader
attachments = PdfReader(sys.argv[1]).attachments
print("Docker: attachments in the PDF:", attachments)
sys.exit(1 if attachments else 0)' out/attachment.pdf
docker stats --no-stream --format 'Docker: container memory after two renders: {{.MemUsage}}' "$container"
docker logs "$container" 2>&1 | tail -n 8

echo "== The error without Pango (information only)"
docker run --rm python:3.12-slim-trixie sh -c \
  'pip install -q --root-user-action=ignore weasyprint==70.0 2> /dev/null; python -c "import weasyprint"' 2>&1 \
  | grep -E 'OSError|could not import' || true

echo "== All checks passed"
