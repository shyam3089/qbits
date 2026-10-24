import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {cpus,platform,release} from 'node:os';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';
const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const paths=option('--runtimes','tests/benchmarks/pre-guards-runtime.js,tests/benchmarks/phase2d-runtime.js,dist/lib/runtime/index.js').split(',');
const sizes=option('--sizes','1000,10000').split(',').map(Number),samples=Number(option('--samples','7')),events=Number(option('--events','1000')),trials=Number(option('--trials','3'));
if([...sizes,samples,events,trials].some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('Sizes, samples, trials and event counts must be positive integers');
if(sizes.some(size=>size<2))throw new Error('The keyed fixture requires at least two rows');
const helper=await readFile('tests/helpers/phase3-benchmark-browser.mjs','utf8');
const hash=(source:string)=>createHash('sha256').update(source).digest('hex');
const fixtures=(size:number)=>({child:compile(`component Child(label = ""):
    count = 0
    section:
        span text=label
        button text=str(count):
            on click:
                count = count + 1
`).code,root:compile(`import Child from "./Child.qb"
class Item:
    id = 0
    count = 0
    computed doubled = count + count
component Bench(title = "sample"):
    first = Item(0, 0)
    last = Item(${size-1}, 0)
    extra = Item(${size}, 0)
    items = [${['first',...Array.from({length:size-2},(_,i)=>`Item(${i+1}, 0)`),'last'].join(', ')}]
    computed length = len(items)
    button text="Update":
        on click:
            first.count = first.count + 1
    button text="First":
        on click:
            items.move(last, 0)
    button text="Last":
        on click:
            items.move(last, ${size-1})
    button text="Append":
        on click:
            items.append(extra)
    button text="Remove":
        on click:
            items.remove(extra)
    p text=title + str(length)
    Child label=str(first.count)
    ul:
        for item in items key=item.id:
            li text=str(item.doubled)
`).code});
const browser=await firefox.launch({headless:true});
const report={schemaVersion:1,baselineProvenance:JSON.parse(await readFile('tests/benchmarks/provenance.json','utf8')),date:new Date().toISOString(),environment:{node:process.version,firefox:browser.version(),platform:platform(),release:release(),cpu:cpus()[0]?.model},samples,events,trials,results:[] as unknown[]};
try {
  for(let trial=0;trial<trials;trial++)for(const size of sizes){const modules=fixtures(size);for(const path of trial%2?[...paths].reverse():paths){
    const runtimeSource=await readFile(path,'utf8'),page=await browser.newPage();
    try {
      const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{const probe=await import(url);return await probe.measure(payload);}finally{URL.revokeObjectURL(url);}},{runtimeSource,modules,size,samples,events,helper});
      await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{const probe=await import(url);await probe.retain(payload);}finally{URL.revokeObjectURL(url);}},{runtimeSource,modules,helper});
      await page.requestGC();
      const retention=await page.evaluate(()=>{const probe=(globalThis as any).__phase3Retention;const result={retainedHandles:probe.handles.length,reachableProps:probe.props.filter((ref:WeakRef<object>)=>ref.deref()).length,reachableNodes:probe.nodes.filter((ref:WeakRef<object>)=>ref.deref()).length};delete (globalThis as any).__phase3Retention;return result;});
      if(!result.identity||result.liveListeners||result.disposedNodes||retention.reachableProps||retention.reachableNodes)throw new Error('Benchmark correctness/retention check failed: '+path);
      report.results.push({path,trial,runtimeBytes:Buffer.byteLength(runtimeSource),runtimeGzipBytes:gzipSync(runtimeSource).length,runtimeSha256:hash(runtimeSource),fixtureSha256:hash(JSON.stringify(modules)),...result,retention});
      console.log(JSON.stringify({path,trial,size,updateMicroseconds:result.updateMicroseconds,reorderMedianMs:result.reorderMedianMs,mountMs:result.mountMs,retention}));
    }finally{await page.close();}
  }}
}finally{await browser.close();}
const output=option('--output','.tools/phase3a/latest.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
