#!/usr/bin/env bash
# Benchmark worker: wkhtmltopdf. A new process for each render, as the
# wrappers for PHP, Python and Ruby do. Prints the same JSON line as the
# other workers.
# Usage: bash engines/wkhtmltopdf.sh <document.html> <warmup> <runs> <out.pdf>
set -euo pipefail
file=$1 warmup=$2 runs=$3 out=$4

render() {
  # wkhtmltopdf ignores @page rules: the flags set the same page as the CSS.
  # --disable-smart-shrinking keeps the CSS sizes (the default shrinks to about 0.8).
  wkhtmltopdf --quiet --page-size A4 \
    --margin-top 16mm --margin-bottom 16mm --margin-left 15mm --margin-right 15mm \
    --disable-smart-shrinking --enable-local-file-access "$file" "$out"
}

# EPOCHREALTIME is the time in seconds with microseconds; without the dot it is in microseconds.
start=${EPOCHREALTIME/./}
render
cold=$(( ${EPOCHREALTIME/./} - start ))
for ((i = 1; i < warmup; i++)); do render; done

times=()
for ((i = 0; i < runs; i++)); do
  t=${EPOCHREALTIME/./}
  render
  times+=($(( ${EPOCHREALTIME/./} - t )))
done

# Microseconds to milliseconds, as JSON.
list=$(printf '%s\n' "${times[@]}" | awk '{ printf "%s%.1f", (NR > 1 ? "," : ""), $1 / 1000 }')
printf '{"coldMs": %s, "timesMs": [%s], "bytes": %s, "browser": "%s"}\n' \
  "$(awk -v us="$cold" 'BEGIN { printf "%.1f", us / 1000 }')" "$list" \
  "$(wc -c < "$out" | tr -d ' ')" "$(wkhtmltopdf --version | tr -d '\n')"
