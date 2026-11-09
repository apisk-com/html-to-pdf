// Functions that run inside the page with page.evaluate().
// They use only browser APIs.

// Scrolls down one screen at a time, so that lazy images and scripts load.
// Then goes back to the top and waits for the images and the fonts.
export async function loadLazyContent({ maxHeight, timeoutMs }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const step = window.innerHeight;
  for (let y = 0; y < Math.min(document.documentElement.scrollHeight, maxHeight); y += step) {
    window.scrollTo({ top: y, behavior: 'instant' });
    // Give scroll handlers and IntersectionObserver callbacks time to start the requests.
    await sleep(100);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });

  const images = [...document.images].filter((img) => img.getAttribute('src'));
  const ready = Promise.all([
    ...images.map((img) => img.decode().catch(() => {})),
    document.fonts.ready,
  ]);
  // A broken image server must not stop the PDF.
  await Promise.race([ready, sleep(timeoutMs)]);
}

// Marks fixed elements (cookie banners, chat buttons, fixed headers) and the
// elements that match the caller's selectors. A style rule then hides them.
export function markOverlays(selectors) {
  for (const element of document.querySelectorAll('body *')) {
    if (getComputedStyle(element).position === 'fixed') {
      element.setAttribute('data-pdf-hide', '');
    }
  }
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      element.setAttribute('data-pdf-hide', '');
    }
  }
}

// Returns the first selector that is not valid CSS.
export function findBadSelector(selectors) {
  return selectors.find((selector) => {
    try {
      document.querySelector(selector);
      return false;
    } catch {
      return true;
    }
  });
}
