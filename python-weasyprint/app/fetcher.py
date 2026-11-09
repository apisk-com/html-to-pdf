"""A WeasyPrint URL fetcher that loads data: URLs and static files only."""

from pathlib import Path
from urllib.parse import unquote, urlsplit

from weasyprint.urls import URLFetcher

STATIC_DIR = (Path(__file__).parent / "static").resolve()


class BlockedURLError(ValueError):
    """The fetcher did not allow this URL."""


class SafeURLFetcher(URLFetcher):
    """Load data: URLs and files inside one folder. Block all other URLs.

    WeasyPrint calls fetch() for each image, stylesheet, @import, font,
    SVG image and attachment, and (since version 68) for each redirect.
    """

    def __init__(self, folder=STATIC_DIR):
        super().__init__(allowed_protocols={"data", "file"}, allow_redirects=False, timeout=5)
        self.folder = Path(folder).resolve()
        self.blocked = []

    def fetch(self, url, headers=None):
        if url.startswith("data:") or self._in_folder(url):
            return super().fetch(url, headers)
        self.blocked.append(url[:200])
        raise BlockedURLError(f"URL not allowed: {url[:200]}")

    def _in_folder(self, url):
        if not url.startswith("file:"):
            return False
        # resolve() removes "..", and follows links to their real place.
        path = Path(unquote(urlsplit(url).path)).resolve()
        return path.is_relative_to(self.folder) and path.is_file()
