import express from 'express';
import { urlToPdf } from './url-to-pdf.js';
import { parseUrlToPdfRequest } from './validate.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // A URL request is small. Larger bodies get status 413.
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/pdf', async (req, res) => {
    const job = parseUrlToPdfRequest(req.body);
    const { pdf, scale } = await urlToPdf(job);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="page.pdf"',
      // The scale that fits the page width on the paper (1 = no change).
      'X-Pdf-Scale': scale.toFixed(3),
    });
    res.send(Buffer.from(pdf));
  });

  // Express 5 sends errors from async handlers here.
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'The page did not load in time.' });
    }
    if (/net::ERR_/.test(error.message)) {
      // DNS errors, refused connections and TLS errors of the target page.
      return res.status(502).json({ error: error.message.split(' at ')[0] });
    }
    const status = error.status ?? 500;
    if (status >= 500) {
      console.error(error);
    }
    res.status(status).json({ error: error.expose ? error.message : 'Rendering failed.' });
  });

  return app;
}
