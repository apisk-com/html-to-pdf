"""book.html with book.css in WeasyPrint: margin boxes, :first, running
elements, string-set and target-counter()."""

import re
from io import BytesIO

import pytest
from pypdf import PdfReader

from render_weasyprint import render_book

CHAPTERS = ["Names and URLs", "Errors", "Pagination", "Versions"]


@pytest.fixture(scope="module")
def pages():
    pdf = render_book()
    assert pdf.startswith(b"%PDF-")
    # One space between words, also where the text has line breaks.
    return [" ".join(page.extract_text().split()) for page in PdfReader(BytesIO(pdf)).pages]


def chapter_start(pages, title):
    # The first page after the contents page that has the title: the heading,
    # or the chapter name that string-set puts in the header.
    return next(number for number, text in enumerate(pages, 1) if number > 1 and title in text)


def test_page_x_of_y_on_every_page(pages):
    for number, text in enumerate(pages, 1):
        assert f"Page {number} of {len(pages)}" in text


def test_first_page_has_no_header(pages):
    assert "Example Analytics Ltd" not in pages[0]


def test_running_header_and_chapter_name_from_page_2(pages):
    for number, text in enumerate(pages[1:], 2):
        assert "Example Analytics Ltd" in text
        started = [title for title in CHAPTERS if chapter_start(pages, title) <= number]
        assert started[-1] in text


def test_contents_show_the_page_of_each_chapter(pages):
    # The numbers on page 1, without the footer "Page 1 of N". The text order
    # puts the right-floated numbers first, so compare them as a list.
    contents = pages[0].replace(f"Page 1 of {len(pages)}", "")
    numbers = [int(n) for n in re.findall(r"\b\d+\b", contents)]
    assert numbers == [chapter_start(pages, title) for title in CHAPTERS]


def test_a_long_chapter_repeats_its_name(pages):
    assert sum("Errors" in text for text in pages[1:]) >= 2
