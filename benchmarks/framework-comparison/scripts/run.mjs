import {createServer} from 'node:http';
import {createReadStream, existsSync} from 'node:fs';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {gzipSync} from 'node:zlib';
import {firefox} from 'playwright';

const root = resolve(import.meta.dirname, '..');
const frameworks = ['qbits', 'react', 'angular', 'vue'];
const workloads = ['rows-1k', 'rows-10k', 'nested', 'catalog'];
const repetitions = {
  'rows-1k': {update: 20, reorder: 10},
  'rows-10k': {update: 5, reorder: 3},
  nested: {update: 20, reorder: 0},
  catalog: {update: 20, reorder: 0}
};
const warmups = integerArg('--warmups', 3);
const samples = integerArg('--samples', 15);
const verifyOnly = process.argv.includes('--verify-only');
const output = resolve(root, valueArg('--output') ?? '../../docs/benchmarks/frameworks-2026-10-26-phase3c1.json');
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

function valueArg(name) {const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1];}
function integerArg(name, fallback) {const raw = valueArg(name); if (raw === undefined) return fallback; const value = Number(raw); if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`); return value;}
function summarize(values) {const sorted = [...values].sort((a, b) => a - b); return {median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1), samples: sorted.length};}
function distribution() {return {coldStartupMs: [], mountMs: [], updateMs: [], reorderMs: []};}

const roots = Object.fromEntries(frameworks.map(framework => {
  const direct = resolve(root, `dist/${framework}`);
  const angularBrowser = resolve(direct, 'browser');
  return [framework, framework === 'angular' && existsSync(resolve(angularBrowser, 'index.html')) ? angularBrowser : direct];
}));
for (const [framework, directory] of Object.entries(roots)) if (!existsSync(resolve(directory, 'index.html'))) throw new Error(`Build missing for ${framework}: ${directory}`);

const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'};
const server = createServer((request, response) => {
  const parsed = new URL(request.url, 'http://127.0.0.1');
  const [, framework, ...rest] = parsed.pathname.split('/');
  const base = roots[framework];
  if (!base) {response.writeHead(404).end(); return;}
  const requested = resolve(base, rest.join('/') || 'index.html');
  if (requested !== base && !requested.startsWith(`${base}${sep}`)) {response.writeHead(403).end(); return;}
  const file = existsSync(requested) && !requested.endsWith(sep) ? requested : resolve(base, 'index.html');
  response.writeHead(200, {'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store'});
  createReadStream(file).pipe(response);
});
await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
const port = server.address().port;
const browser = await firefox.launch({headless: true});
const raw = Object.fromEntries(frameworks.map(framework => [framework, Object.fromEntries(workloads.map(workload => [workload, distribution()]))]));
const verification = Object.fromEntries(workloads.map(workload => [workload, {}]));

async function observe(framework, workload, measured) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/${framework}/`, {waitUntil: 'load'});
    await page.waitForFunction(() => window.__benchmarkReady === true);
    const coldStartupMs = await page.evaluate(() => window.__benchmarkReadyAt);
    const mountMs = await page.evaluate(async workloadName => {const start = performance.now(); await window.__benchmark.mount(workloadName); return performance.now() - start;}, workload);
    const initial = await page.evaluate(async () => {
      const clean = node => {
        if (node.nodeType === Node.TEXT_NODE) {const value = node.textContent; return value.trim() ? value : null;}
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        const attributes = [...node.attributes].map(attribute => [attribute.name, attribute.value]).sort((left, right) => left[0].localeCompare(right[0]));
        const children = [...node.childNodes].map(clean).filter(value => value !== null);
        return [node.tagName.toLowerCase(), attributes, children];
      };
      const value = JSON.stringify([...document.querySelector('#app').childNodes].map(clean).filter(item => item !== null));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return {hash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''), elements: document.querySelectorAll('#app *').length};
    });
    const update = await page.evaluate(async ({workloadName, count}) => {
      const buttons = document.querySelectorAll('#app .increment');
      const index = Math.floor(buttons.length / 2);
      const before = document.querySelectorAll('#app .value')[index].textContent;
      const start = performance.now();
      for (let iteration = 0; iteration < count; iteration++) {buttons[index].click(); await window.__benchmark.settle();}
      const elapsed = (performance.now() - start) / count;
      return {elapsed, before, after: document.querySelectorAll('#app .value')[index].textContent, count: buttons.length, repetitions: count};
    }, {workloadName: workload, count: repetitions[workload].update});
    let reorder;
    if (workload.startsWith('rows-')) reorder = await page.evaluate(async count => {
      let expected = '', moved, preserved = true;
      const start = performance.now();
      for (let iteration = 0; iteration < count; iteration++) {
        const rows = document.querySelectorAll('#app .row'); moved = rows[rows.length - 1];
        expected = moved.querySelector('.name').textContent; moved.querySelector('.move').click(); await window.__benchmark.settle();
        preserved &&= document.querySelector('#app .row') === moved;
      }
      const elapsed = (performance.now() - start) / count;
      const first = document.querySelector('#app .row');
      return {elapsed, expected, actual: first.querySelector('.name').textContent, preserved, repetitions: count};
    }, repetitions[workload].reorder);
    const memory = await page.evaluate(() => ({performanceMemory: 'memory' in performance, userAgentSpecificMemory: 'measureUserAgentSpecificMemory' in performance}));
    if (update.before !== '0' || update.after !== String(update.repetitions)) throw new Error(`${framework}/${workload}: isolated update failed (${update.before} -> ${update.after})`);
    if (reorder && (reorder.actual !== reorder.expected || !reorder.preserved)) throw new Error(`${framework}/${workload}: keyed reorder failed`);
    verification[workload][framework] = {dom: initial, update: {before: update.before, after: update.after, count: update.count}, reorder: reorder ? {expected: reorder.expected, actual: reorder.actual, preserved: reorder.preserved} : null};
    if (measured) {
      const target = raw[framework][workload];
      target.coldStartupMs.push(coldStartupMs); target.mountMs.push(mountMs); target.updateMs.push(update.elapsed);
      if (reorder) target.reorderMs.push(reorder.elapsed);
    }
    return memory;
  } finally {await context.close();}
}

let memorySupport;
try {
  const rounds = verifyOnly ? 1 : warmups + samples;
  for (let round = 0; round < rounds; round++) {
    const measured = !verifyOnly && round >= warmups;
    const order = frameworks.map((_, index) => frameworks[(index + round) % frameworks.length]);
    for (const workload of workloads) for (const framework of order) memorySupport = await observe(framework, workload, measured);
    process.stdout.write(`round ${round + 1}/${rounds}${measured ? ' measured' : ' warmup'}\n`);
  }
  for (const workload of workloads) {
    const expected = verification[workload].qbits.dom;
    for (const framework of frameworks) {
      const actual = verification[workload][framework].dom;
      if (actual.hash !== expected.hash || actual.elements !== expected.elements) throw new Error(`${framework}/${workload}: DOM differs from Qbits`);
    }
  }
  if (verifyOnly) {process.stdout.write(`verified ${frameworks.length} frameworks x ${workloads.length} workloads in Firefox ${browser.version()}\n`);}
  else {
    const sizes = {};
    for (const framework of frameworks) sizes[framework] = await javascriptSize(roots[framework]);
    const results = Object.fromEntries(frameworks.map(framework => [framework, Object.fromEntries(workloads.map(workload => [workload, Object.fromEntries(Object.entries(raw[framework][workload]).map(([metric, values]) => [metric, values.length ? summarize(values) : null]))]))]));
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      baselineCommit: (await gitRevision()).trim(),
      environment: {node: process.version, firefox: browser.version(), platform: `${process.platform} ${process.arch}`, warmups, samples, paired: true, cache: 'fresh Firefox context and no-store responses per observation'},
      versions: {qbits: packageJson.version ?? 'workspace-0.1.0', react: packageJson.dependencies.react, angular: packageJson.dependencies['@angular/core'], vue: packageJson.dependencies.vue},
      methodology: {productionBuilds: true, workloads, repetitions, operationTiming: 'performance.now around fixed click batches through framework settlement, divided to per-operation milliseconds', coldStartup: 'navigation start to benchmark API installation; fresh context, warm OS filesystem cache', domVerification: 'SHA-256 of exact descendant tag, attributes, and non-whitespace text tree plus interaction assertions'},
      memory: {...memorySupport, measured: false, reason: 'Firefox exposes neither performance.memory nor measureUserAgentSpecificMemory in this environment'},
      gzipJsBytes: sizes,
      verification,
      results
    };
    await mkdir(resolve(output, '..'), {recursive: true});
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`wrote ${output}\n`);
  }
} finally {await browser.close(); await new Promise(resolveClosed => server.close(resolveClosed));}

async function javascriptSize(directory) {
  const files = [];
  async function visit(current) {for (const entry of await readdir(current, {withFileTypes: true})) {const path = resolve(current, entry.name); if (entry.isDirectory()) await visit(path); else if (entry.name.endsWith('.js')) files.push(path);}}
  await visit(directory);
  let rawBytes = 0, gzipBytes = 0;
  for (const file of files) {const content = await readFile(file); rawBytes += content.byteLength; gzipBytes += gzipSync(content).byteLength;}
  return {rawBytes, gzipBytes, files: files.length};
}

async function gitRevision() {
  const {execFile} = await import('node:child_process');
  return new Promise((resolveResult, reject) => execFile('git', ['rev-parse', 'HEAD'], {cwd: resolve(root, '../..')}, (error, stdout) => error ? reject(error) : resolveResult(stdout)));
}
