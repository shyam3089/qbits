import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { firefox } from 'playwright';
import { mountFixture, reactiveFixtures } from '../tests/helpers/reactivity-fixtures.js';

const baselineIndex = process.argv.indexOf('--baseline');
const outputIndex = process.argv.indexOf('--output');
const paths = baselineIndex < 0 ? ['dist/lib/runtime/index.js'] : [process.argv[baselineIndex + 1], 'dist/lib/runtime/index.js'];
const helper = await readFile('tests/helpers/reactivity-browser.mjs', 'utf8');
const modules = reactiveFixtures();
const mountModules = Object.fromEntries([1000,10000].map(size=>[size,mountFixture(size)]));
const browser = await firefox.launch({headless: true});
const firefoxVersion=browser.version();
const reports:unknown[]=[];
try {
  console.log(`Firefox ${firefoxVersion}; three warmups, 21 timing samples, 1000 operations per update sample, 15 warmed reorder samples. Results report median and p95; memory is observational.`);
  for (const path of [...new Set(paths)]) {
    const page = await browser.newPage();
    try {
      const runtime = await readFile(path, 'utf8');
      const performance = await page.evaluate(async ({helper,runtime,modules,mountModules})=>{
        const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));
        try{const {benchmarkSuite}=await import(url);return await benchmarkSuite(runtime,modules,mountModules);}
        finally{URL.revokeObjectURL(url);}
      },{helper,runtime,modules,mountModules});
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
      const report={path,runtimeSha256:createHash('sha256').update(runtime).digest('hex'),runtimeBytes:Buffer.byteLength(runtime),runtimeGzipBytes:gzipSync(runtime).byteLength,performance,instrumented:result,retention};
      reports.push(report);console.log(JSON.stringify(report,null,2));
    } finally {await page.close();}
  }
} finally {await browser.close();}
if(outputIndex>=0){const output=process.argv[outputIndex+1];if(!output)throw new Error('--output requires a path');await writeFile(output,JSON.stringify({recordedAt:new Date().toISOString(),firefox:firefoxVersion,protocol:{warmups:3,samples:21,operationsPerUpdateSample:1000,reorderSamples:15},reports},null,2)+'\n');}
