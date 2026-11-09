"""Render document/book.html with WeasyPrint and the same book.css as Chrome.

Usage: python render_weasyprint.py [output.pdf]
"""

import sys
from pathlib import Path

from weasyprint import CSS, HTML

HERE = Path(__file__).parent


def render_book() -> bytes:
    # A trusted local file. For HTML from users, block file and network
    # access with a url_fetcher.
    html = HTML(filename=HERE / "document" / "book.html")
    return html.write_pdf(stylesheets=[CSS(filename=HERE / "document" / "book.css")])


if __name__ == "__main__":
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "out/book-weasyprint.pdf")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(render_book())
    print(f"Wrote {output}")
