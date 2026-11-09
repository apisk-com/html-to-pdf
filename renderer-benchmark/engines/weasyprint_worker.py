"""Benchmark worker: WeasyPrint, in one Python process.

Usage: python engines/weasyprint_worker.py <document.html> <warmup> <runs> <out.pdf>
Prints the same JSON line as the Node.js workers.
"""
import json
import sys
import time
from pathlib import Path


def main():
    if len(sys.argv) != 5 or int(sys.argv[2]) < 1:
        sys.exit('Usage: weasyprint_worker.py <document.html> <warmup (1 or more)> <runs> <out.pdf>')
    path, warmup, runs, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]

    start = time.perf_counter()
    import weasyprint  # the import loads Pango, so it is part of the start-up time
    from weasyprint.urls import URLFetcher

    def render():
        # The documents load fonts from their folder: allow file: and data: URLs, no network.
        fetcher = URLFetcher(allowed_protocols={'file', 'data'})
        return weasyprint.HTML(filename=path, url_fetcher=fetcher).write_pdf()

    pdf = render()
    cold_ms = (time.perf_counter() - start) * 1000
    for _ in range(warmup - 1):
        pdf = render()

    times_ms = []
    for _ in range(runs):
        t = time.perf_counter()
        pdf = render()
        times_ms.append((time.perf_counter() - t) * 1000)

    Path(out).write_bytes(pdf)
    print(json.dumps({'coldMs': cold_ms, 'timesMs': times_ms, 'bytes': len(pdf), 'browser': f'WeasyPrint {weasyprint.__version__}'}))


if __name__ == '__main__':
    main()
