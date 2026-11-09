// Benchmark worker: Gotenberg. Starts a container, sends each render to the
// Chromium HTML route, reads the peak memory of the container, then removes it.
// Usage: node engines/gotenberg.mjs <document.html> <warmup> <runs> <out.pdf>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { measure, parseArgs } from './worker.mjs';

const IMAGE =process.env.GOTENBERG_IMAGE ?? 'gotenberg/gotenberg:9.2.0-chromium';
const PORT = process.env.GOTENBERG_PORT ?? '3300';
const BASE = `http://127.0.0.1:${PORT}`;

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();

async function waitForHealth() {
  for (let i = 0; i < 600; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // The container is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Gotenberg did not start in 30 seconds');
}

// memory.peak of the container's cgroup (cgroup v2). null if it is not available.
function peakMemory(id) {
  try {
    const pid = docker('inspect', '-f', '{{.State.Pid}}', id);
    const path = readFileSync(`/proc/${pid}/cgroup`, 'utf8').trim().split('::')[1];
    return Number(readFileSync(`/sys/fs/cgroup${path}/memory.peak`, 'utf8'));
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));

// Gotenberg wants the page as index.html, and the files that it loads in the same request.
const html = readFileSync(args.path);
const assets = [...html.toString().matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
const files = assets.map((name) => [name, readFileSync(join(dirname(args.path), name))]);

const start = performance.now();
const id = docker('run', '-d', '--rm', '-p', `127.0.0.1:${PORT}:3000`, IMAGE);
try {
  await waitForHealth();
  const render = async () => {
    const form = new FormData();
    form.append('files', new Blob([html]), 'index.html');
    for (const [name, data] of files) form.append('files', new Blob([data]), name);
    form.append('preferCssPageSize', 'true');
    form.append('printBackground', 'true');
    const response = await fetch(`${BASE}/forms/chromium/convert/html`, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`Gotenberg: ${response.status} ${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const result = await measure({ ...args, start, render });
  const version = (await (await fetch(`${BASE}/version`)).text()).trim();
  const chromium = docker('exec', id, 'chromium', '--version');
  console.log(JSON.stringify({ ...result, peakBytes: peakMemory(id), browser: `Gotenberg ${version}, ${chromium}` }));
} finally {
  docker('rm', '-f', id);
}
