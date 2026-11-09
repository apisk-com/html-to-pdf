// Render the same three documents with each engine. Print the median render
// time, the peak memory and the PDF size as Markdown tables.
// Usage: node bench.mjs [--warmup 3] [--runs 15] [--engines puppeteer,weasyprint]
//
// Memory: on Linux with sudo, each engine runs in a new cgroup (v2), so the
// values include all its processes (Node.js or Python and every browser
// process). Gotenberg reads the cgroup of its container. See memory.mjs.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import { sampleMemory } from './memory.mjs';

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
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${command.join(' ')} exited with code ${code}`));
      resolve(JSON.parse(stdout.trim().split('\n').at(-1)));
    });
  });
}

function canMeasureMemory() {
  try {
    execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore' });
    return readFileSync('/sys/fs/cgroup/cgroup.subtree_control', 'utf8').includes('memory');
  } catch {
    return false;
  }
}

// Empty the page cache before each run, so that every engine reads its files
// (browser, fonts) from disk, and its cgroup counts them the same way.
function dropCaches() {
  execFileSync('sudo', ['sh', '-c', 'sync && echo 3 > /proc/sys/vm/drop_caches']);
}

// Run a worker in a new cgroup. Return its JSON line and the memory values.
async function runInCgroup(name, command) {
  const cgroup = `/sys/fs/cgroup/${name}`;
  execFileSync('sudo', ['mkdir', cgroup]);
  try {
    const memory = sampleMemory(cgroup);
    // bash moves itself into the cgroup, then the worker takes its place (exec).
    const script = 'echo $$ | sudo tee "$0/cgroup.procs" > /dev/null && exec "$@"';
    const result = await runWorker(['bash', '-c', script, cgroup, ...command]);
    return { ...result, ...memory.stop() };
  } finally {
    // Stop any process that is still in the cgroup, then remove the cgroup.
    execFileSync('sudo', ['sh', '-c', `echo 1 > ${cgroup}/cgroup.kill; sleep 0.2; rmdir ${cgroup}`]);
  }
}

async function pageCount(file) {
  return (await PDFDocument.load(readFileSync(file), { updateMetadata: false })).getPageCount();
}

// A Markdown table with one row for each engine and one column for each document.
function table(title, columns, rows) {
  const lines = [`### ${title}`, '', `| Engine | ${columns.join(' | ')} |`, `|---|${columns.map(() => '---:').join('|')}|`];
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`);
  return lines.join('\n') + '\n';
}

const number = (n) => (n === null ? 'n/a' : Math.round(n).toLocaleString('en-US'));
const mb = (bytes) => (bytes === null ? null : bytes / 1e6);

async function main() {
  const { values } = parseArgs({
    options: {
      warmup: { type: 'string', default: '3' },
      runs: { type: 'string', default: '15' },
      engines: { type: 'string', default: ENGINES.map((e) => e.id).join(',') },
    },
  });
  const engines = ENGINES.filter((e) => values.engines.split(',').includes(e.id));
  const linuxMemory = process.platform === 'linux' && canMeasureMemory();
  mkdirSync('out', { recursive: true });

  const results = {};
  for (const engine of engines) {
    for (const doc of DOCUMENTS) {
      const pdf = `out/${engine.id}-${doc.id}.pdf`;
      const command = [...engine.command, doc.file, values.warmup, values.runs, pdf];
      if (linuxMemory) dropCaches();
      const result =
        linuxMemory && !engine.container
          ? await runInCgroup(`bench-${engine.id}-${doc.id}`, command)
          : await runWorker(command);
      const row = {
        browser: result.browser,
        medianMs: median(result.timesMs),
        minMs: Math.min(...result.timesMs),
        maxMs: Math.max(...result.timesMs),
        coldMs: result.coldMs,
        processMB: mb(result.processBytes ?? null),
        peakMB: mb(result.peakBytes ?? null),
        kb: result.bytes / 1000,
        pages: await pageCount(pdf),
      };
      results[`${engine.id} ${doc.id}`] = row;
      console.error(
        `${engine.id} ${doc.id}: median ${number(row.medianMs)} ms, ${row.pages} pages, ` +
          `memory ${number(row.processMB)} MB (anon ${number(mb(result.anonBytes ?? null))} MB, ` +
          `shmem ${number(mb(result.shmemBytes ?? null))} MB), memory.peak ${number(row.peakMB)} MB`,
      );
    }
  }
  writeFileSync('out/results.json', JSON.stringify(results, null, 2));

  // One table row for each engine: the name, then one value for each document.
  const rows = (value) =>
    engines.map((e) => [e.name, ...DOCUMENTS.map((d) => value(results[`${e.id} ${d.id}`]))]);
  const names = DOCUMENTS.map((d) => d.name);
  const cpu = os.cpus();

  console.log(`## Results on this runner

${new Date().toISOString().slice(0, 10)}, ${os.type()} ${os.release()}, ${cpu.length} CPUs (${cpu[0]?.model.trim()}), ${Math.round(os.totalmem() / 1e9)} GB RAM.
Each engine renders each document ${values.warmup} times to warm up, then ${values.runs} times with a timer.
1 KB = 1,000 bytes, 1 MB = 1,000,000 bytes.

${table('Median render time (ms)', names, rows((r) => number(r.medianMs)))}
${table('Fastest and slowest render (ms)', names, rows((r) => `${number(r.minMs)} to ${number(r.maxMs)}`))}
${table('Start and first PDF (ms)', names, rows((r) => number(r.coldMs)))}
${table('Peak memory without the page cache (MB)', names, rows((r) => number(r.processMB)))}
${table('memory.peak, with the page cache (MB)', names, rows((r) => number(r.peakMB)))}
${table('PDF size (KB) and pages', names, rows((r) => `${number(r.kb)} (${r.pages})`))}
${table('Browser or engine version', ['Reported by the worker'], engines.map((e) => [e.name, results[`${e.id} invoice`].browser]))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
