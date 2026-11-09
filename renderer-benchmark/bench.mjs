// Render the same three documents with each engine. Print the median render
// time, the peak memory and the PDF size as Markdown tables.
// Usage: node bench.mjs [--warmup 3] [--runs 15] [--engines puppeteer,weasyprint]
//
// Peak memory: on Linux with sudo, each engine runs in a new cgroup (v2), and
// the result is the memory.peak value of that cgroup. It counts all processes
// of the engine (Node.js or Python and every browser process), each memory
// page once. Gotenberg reports the memory.peak value of its container.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PDFDocument } from 'pdf-lib';

const PYTHON = process.env.PYTHON ?? '.venv/bin/python';

export const ENGINES = [
  { id: 'puppeteer', name: 'Puppeteer', command: ['node', 'engines/puppeteer.mjs'] },
  { id: 'puppeteer-untagged', name: 'Puppeteer, tagged: false', command: ['node', 'engines/puppeteer.mjs', '--untagged'] },
  {
    id: 'puppeteer-shell',
    name: "Puppeteer, tagged: false, headless: 'shell'",
    command: ['node', 'engines/puppeteer.mjs', '--untagged', '--shell'],
  },
  { id: 'playwright', name: 'Playwright', command: ['node', 'engines/playwright.mjs'] },
  { id: 'gotenberg', name: 'Gotenberg', command: ['node', 'engines/gotenberg.mjs'], container: true },
  { id: 'weasyprint', name: 'WeasyPrint', command: [PYTHON, 'engines/weasyprint_worker.py'] },
  { id: 'wkhtmltopdf', name: 'wkhtmltopdf', command: ['bash', 'engines/wkhtmltopdf.sh'] },
];

export const DOCUMENTS = [
  { id: 'invoice', name: 'Invoice', file: 'documents/invoice.html' },
  { id: 'report', name: 'Report', file: 'documents/report.html' },
  { id: 'chart', name: 'Chart page', file: 'documents/chart.html' },
];

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Run a worker and return its JSON line. stderr goes to the console.
export function runWorker(command) {
  const stdout = execFileSync(command[0], command.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(stdout.trim().split('\n').at(-1));
}

function canMeasureMemory() {
  try {
    execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore' });
    return readFileSync('/sys/fs/cgroup/cgroup.subtree_control', 'utf8').includes('memory');
  } catch {
    return false;
  }
}

// Empty the page cache, so that each engine reads its files (browser, fonts) from disk
// and the cgroup counts them. Without it, a file read in an earlier run is not counted.
function dropCaches() {
  execFileSync('sudo', ['sh', '-c', 'sync && echo 3 > /proc/sys/vm/drop_caches']);
}

// Run a worker in a new cgroup and return its JSON line and the peak memory in bytes.
function runInCgroup(name, command) {
  const cgroup = `/sys/fs/cgroup/${name}`;
  execFileSync('sudo', ['mkdir', cgroup]);
  try {
    // bash moves itself into the cgroup, then the worker takes its place (exec).
    const script = 'echo $$ | sudo tee "$0/cgroup.procs" > /dev/null && exec "$@"';
    const result = runWorker(['bash', '-c', script, cgroup, ...command]);
    return { ...result, peakBytes: Number(readFileSync(`${cgroup}/memory.peak`, 'utf8')) };
  } finally {
    // Stop any process that is still in the cgroup, then remove it.
    execFileSync('sudo', ['sh', '-c', `echo 1 > ${cgroup}/cgroup.kill; sleep 0.2; rmdir ${cgroup}`]);
  }
}

async function pageCount(file) {
  return (await PDFDocument.load(readFileSync(file), { updateMetadata: false })).getPageCount();
}

function table(title, columns, rows) {
  const lines = [`### ${title}`, '', `| Engine | ${columns.join(' | ')} |`, `|---|${columns.map(() => '---:').join('|')}|`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n') + '\n';
}

async function main() {
  const { values } = parseArgs({
    options: {
      warmup: { type: 'string', default: '3' },
      runs: { type: 'string', default: '15' },
      engines: { type: 'string', default: ENGINES.map((e) => e.id).join(',') },
    },
  });
  const engines = ENGINES.filter((e) => values.engines.split(',').includes(e.id));
  const memory = process.platform === 'linux' && canMeasureMemory();
  mkdirSync('out', { recursive: true });

  const results = [];
  for (const engine of engines) {
    for (const doc of DOCUMENTS) {
      const pdf = `out/${engine.id}-${doc.id}.pdf`;
      const command = [...engine.command, doc.file, values.warmup, values.runs, pdf];
      if (memory) dropCaches();
      const result =
        memory && !engine.container ? runInCgroup(`bench-${engine.id}-${doc.id}`, command) : runWorker(command);
      const row = {
        engine: engine.id,
        document: doc.id,
        browser: result.browser,
        medianMs: median(result.timesMs),
        minMs: Math.min(...result.timesMs),
        maxMs: Math.max(...result.timesMs),
        coldMs: result.coldMs,
        peakMB: memory && result.peakBytes ? result.peakBytes / 1e6 : null,
        bytes: result.bytes,
        pages: await pageCount(pdf),
      };
      results.push(row);
      console.error(`${engine.id} ${doc.id}: median ${row.medianMs.toFixed(0)} ms, ${row.pages} pages`);
    }
  }
  writeFileSync('out/results.json', JSON.stringify(results, null, 2));

  const get = (engine, doc) => results.find((r) => r.engine === engine.id && r.document === doc.id);
  const names = DOCUMENTS.map((d) => d.name);
  const ms = (n) => Math.round(n).toLocaleString('en-US');
  const cpu = os.cpus();
  console.log(`## Results on this runner

${new Date().toISOString().slice(0, 10)}, ${os.type()} ${os.release()}, ${cpu.length} CPUs (${cpu[0]?.model.trim()}), ${Math.round(os.totalmem() / 1e9)} GB RAM.
Each engine renders each document ${values.warmup} times to warm up, then ${values.runs} times with a timer.
1 KB = 1,000 bytes, 1 MB = 1,000,000 bytes.

${table('Median render time (ms)', [...names, 'Start and first invoice'], engines.map((e) => [e.name, ...DOCUMENTS.map((d) => ms(get(e, d).medianMs)), ms(get(e, DOCUMENTS[0]).coldMs)]))}
${table('Fastest and slowest render (ms)', names, engines.map((e) => [e.name, ...DOCUMENTS.map((d) => `${ms(get(e, d).minMs)} to ${ms(get(e, d).maxMs)}`)]))}
${table('Peak memory (MB)', names, engines.map((e) => [e.name, ...DOCUMENTS.map((d) => (get(e, d).peakMB === null ? 'n/a' : ms(get(e, d).peakMB)))]))}
${table('PDF size (KB) and pages', names, engines.map((e) => [e.name, ...DOCUMENTS.map((d) => `${ms(get(e, d).bytes / 1000)} (${get(e, d).pages})`)]))}
${table('Browser or engine version', ['Reported by the worker'], engines.map((e) => [e.name, get(e, DOCUMENTS[0]).browser]))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
