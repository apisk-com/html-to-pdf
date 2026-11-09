"""Measure the render of one document: time and peak memory.

Usage: python bench.py [runs]
"""

import json
import resource
import statistics
import sys
import time
from pathlib import Path

from weasyprint import HTML

from app.main import Invoice, invoice_html
from app.render import STATIC_DIR, SafeURLFetcher, render_pdf


def isolated(html, runs):
    """render_pdf(): one child process for each render."""
    calls, renders, memory = [], [], []
    for _ in range(runs):
        start = time.perf_counter()
        result = render_pdf(html)
        calls.append(time.perf_counter() - start)
        renders.append(result.seconds)
        memory.append(result.peak_memory_mb)
    print(f"  {result.pages} pages, {len(result.pdf):,} bytes")
    print(f"  render in the child process: {statistics.median(renders) * 1000:.0f} ms")
    print(f"  render_pdf() call, with the process start: {statistics.median(calls) * 1000:.0f} ms")
    print(f"  peak memory of one child process: {max(memory):.0f} MB")


def in_process(html, runs):
    """The same render in this process, for comparison."""
    times = []
    for _ in range(runs):
        start = time.perf_counter()
        HTML(string=html, base_url=str(STATIC_DIR), url_fetcher=SafeURLFetcher()).write_pdf()
        times.append(time.perf_counter() - start)
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024  # KiB on Linux
    print(f"  in this process: first {times[0] * 1000:.0f} ms, then {statistics.median(times[1:]) * 1000:.0f} ms")
    print(f"  peak memory of this process after {runs} renders: {peak_mb:.0f} MB")


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    data = json.loads((Path(__file__).parent / "examples" / "invoice.json").read_text())
    html = invoice_html(Invoice.model_validate(data))
    render_pdf("<p>Start</p>")  # start the fork server
    print(f"Invoice, median of {runs} runs")
    isolated(html, runs)
    in_process(html, runs)


# Each render process imports the main module. This check stops it from running main() again.
if __name__ == "__main__":
    main()
