import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { firefox } from 'playwright';
import { reactiveFixtures } from '../tests/helpers/reactivity-fixtures.js';

const baselineIndex = process.argv.indexOf('--baseline');
const paths = baselineIndex < 0 ? ['dist/lib/runtime/index.js'] : [process.argv[baselineIndex + 1], 'dist/lib/runtime/index.js'];
const helper = await readFile('tests/helpers/reactivity-browser.mjs', 'utf8');
const modules = reactiveFixtures();
const browser = await firefox.launch({headless: true});
try {
  console.log(`Firefox ${browser.version()}; 1000 rows, 9 reorder samples, 30 mount/dispose cycles. Reorder and mount/dispose cycle times are medians; other timings are single observations, not CI thresholds.`);
  for (const path of [...new Set(paths)]) {
    const page = await browser.newPage();
    try {
      const runtime = await readFile(path, 'utf8');
      const result = await page.evaluate(async ({helper, runtime, modules}) => {
        const url = URL.createObjectURL(new Blob([helper], {type: 'text/javascript'}));
        try {const {measure} = await import(url); return await measure(runtime, modules);}
        finally {URL.revokeObjectURL(url);}
      }, {helper, runtime, modules});
      await page.evaluate(async ({helper, runtime, modules}) => {
        const url = URL.createObjectURL(new Blob([helper], {type: 'text/javascript'}));
        try {const {retentionProbe} = await import(url); await retentionProbe(runtime, modules);}
        finally {URL.revokeObjectURL(url);}
      }, {helper, runtime, modules});
      await page.requestGC();
      const retention = await page.evaluate(() => {
        const probe = (globalThis as any).__qubitsRetentionProbe;
        const observed = {retainedDisposedHandles: probe.handles.length,
          reachablePropObjects: probe.props.filter((ref: WeakRef<object>) => ref.deref()).length,
          reachableDOMNodes: probe.nodes.filter((ref: WeakRef<object>) => ref.deref()).length};
        delete (globalThis as any).__qubitsRetentionProbe; return observed;
      });
      console.log(JSON.stringify({path, runtimeSha256: createHash('sha256').update(runtime).digest('hex'), ...result, retention}, null, 2));
    } finally {await page.close();}
  }
} finally {await browser.close();}
