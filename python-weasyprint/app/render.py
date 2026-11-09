"""Render HTML to PDF with WeasyPrint, one child process for each render.

The parent kills a child process that runs too long, and a memory limit
stops a child process that uses too much memory.
"""

import multiprocessing
import os
import resource
import time
from dataclasses import dataclass

from weasyprint import HTML

from app.fetcher import STATIC_DIR, SafeURLFetcher

# Limits for one render. Change them with environment variables.
RENDER_TIMEOUT_SECONDS = float(os.environ.get("RENDER_TIMEOUT_SECONDS", "20"))
RENDER_MEMORY_MB = int(os.environ.get("RENDER_MEMORY_MB", "1024"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "50"))


@dataclass
class RenderResult:
    pdf: bytes
    pages: int
    seconds: float  # time of the render in the child process
    peak_memory_mb: float  # peak resident memory of the child process
    blocked: list[str]  # URLs that the fetcher did not load


class RenderError(Exception):
    """The render failed. The status is the HTTP status for the API."""

    def __init__(self, message, status=500):
        super().__init__(message)
        self.status = status


def _render_in_child(conn, html, base_url, memory_mb, max_pages):
    """Run in the child process and send one tuple to the parent."""
    try:
        if memory_mb:
            limit = memory_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        start = time.perf_counter()
        fetcher = SafeURLFetcher()
        document = HTML(string=html, base_url=base_url, url_fetcher=fetcher).render()
        pages = len(document.pages)
        if pages > max_pages:
            conn.send(("error", 422, f"The PDF has {pages} pages. The limit is {max_pages}."))
            return
        pdf = document.write_pdf()
        seconds = time.perf_counter() - start
        peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024  # KiB on Linux
        conn.send(("ok", pdf, pages, seconds, peak_mb, fetcher.blocked))
    except MemoryError:
        conn.send(("error", 500, "The render needs more memory than RENDER_MEMORY_MB."))
    except Exception as error:
        conn.send(("error", 500, f"{type(error).__name__}: {error}"))
    finally:
        conn.close()


# The fork server imports this module, and WeasyPrint with it, one time.
# Each render process is a copy of the fork server, so it starts fast.
# Python also imports the main script in each render process: start the
# service with "python -m uvicorn", which Python does not import again.
_context = multiprocessing.get_context("forkserver")
_context.set_forkserver_preload([__name__])


def render_pdf(html, base_url=STATIC_DIR):
    """Render HTML to PDF in a new process. Block until the PDF is ready."""
    timeout = RENDER_TIMEOUT_SECONDS
    receiver, sender = _context.Pipe(duplex=False)
    process = _context.Process(
        target=_render_in_child,
        args=(sender, html, str(base_url), RENDER_MEMORY_MB, MAX_PAGES),
        daemon=True,
    )
    process.start()
    sender.close()  # the child has its own copy
    try:
        if not receiver.poll(timeout):
            raise RenderError(f"The render took longer than {timeout:g} seconds.", 504)
        try:
            result = receiver.recv()
        except EOFError:
            raise RenderError("The render process stopped without a result.") from None
    finally:
        receiver.close()
        process.kill()  # no effect if the process ended already
        process.join()
    if result[0] == "error":
        raise RenderError(result[2], result[1])
    _, pdf, pages, seconds, peak_mb, blocked = result
    return RenderResult(pdf, pages, seconds, peak_mb, blocked)
