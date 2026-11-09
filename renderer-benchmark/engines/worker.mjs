// Shared code for the Node.js benchmark workers.
// Every worker takes the same arguments and prints one line of JSON:
//   <worker> <document.html> <warmup> <runs> <out.pdf>
//   {"coldMs": 812.4, "timesMs": [61.2, ...], "bytes": 43210, "browser": "..."}
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv) {
  const [file, warmup, runs, out] = argv.filter((a) => !a.startsWith('--'));
  if (!file || !out || !(Number(warmup) >= 1) || !(Number(runs) >= 1)) {
    console.error('Usage: <worker> <document.html> <warmup (1 or more)> <runs> <out.pdf>');
    process.exit(2);
  }
  return {
    path: resolve(file),
    url: pathToFileURL(resolve(file)).href,
    warmup: Number(warmup),
    runs: Number(runs),
    out,
    flags: argv.filter((a) => a.startsWith('--')),
  };
}

// Run the first render (cold), the rest of the warm-up, then the timed runs.
// `start` is the time before the engine started (browser launch, container start).
export async function measure({ start, render, warmup, runs, out }) {
  let pdf = await render();
  const coldMs = performance.now() - start;
  for (let i = 1; i < warmup; i++) pdf = await render();

  const timesMs = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    pdf = await render();
    timesMs.push(performance.now() - t);
  }
  await writeFile(out, pdf);
  return { coldMs, timesMs, bytes: pdf.length };
}
