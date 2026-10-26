import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir,cpus,platform,release} from 'node:os';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {build} from 'vite';
import {firefox} from 'playwright';
import {generate} from '../language/index.js';
import {generate as baselineGenerate} from '../tests/benchmarks/phase3a-generator.js';
import {lightFixture,realisticFixture} from '../tests/helpers/stabilization-fixtures.js';
import {instrumentRuntime} from './profile-runtime.js';
const args=process.argv.slice(2),option=(name:string,fallback:string)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const sizes=option('--sizes','1000,10000').split(',').map(Number),samples=Number(option('--samples','7')),events=Number(option('--events','1000')),trials=Number(option('--trials','3')),warmups=Number(option('--warmups','2'));
if([...sizes,samples,events,trials,warmups].some(n=>!Number.isSafeInteger(n)||n<1)||sizes.some(n=>n<2))throw new Error('Counts must be positive integers; sizes >= 2');
const mode=option('--mode','all'),scenarios=option('--scenarios','light,realistic').split(',');
if(!['all','profile','timing'].includes(mode)||scenarios.some(name=>!['light','realistic'].includes(name)))throw new Error('Use modes all/profile/timing and scenarios light/realistic');
const output=option('--output','.tools/stabilization/latest.json'),helper=await readFile('tests/helpers/stabilization-browser.mjs','utf8'),hash=(source:string)=>createHash('sha256').update(source).digest('hex');
const variants=[{name:'phase3a',path:'tests/benchmarks/phase3a-runtime.js',generate:baselineGenerate},{name:'phase3a1',path:option('--candidate','dist/lib/runtime/index.js'),generate}];
const tsVersion=JSON.parse(await readFile('node_modules/typescript/package.json','utf8')).version;
const temporaryRoot=resolve(tmpdir()),temp=await mkdtemp(join(temporaryRoot,'framework-stabilization-')),browser=await firefox.launch({headless:true});
async function bundle(entry:string){const result=await build({configFile:false,logLevel:'silent',build:{lib:{entry:resolve(entry),formats:['es']},minify:'esbuild',write:false,emptyOutDir:false}});if(!Array.isArray(result))throw new Error('Expected library output');return result[0].output.filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n');}
const report={schemaVersion:1,baselineProvenance:JSON.parse(await readFile('tests/benchmarks/provenance.json','utf8')),date:new Date().toISOString(),environment:{node:process.version,firefox:browser.version(),cpu:cpus()[0]?.model,platform:platform(),release:release(),vite:JSON.parse(await readFile('node_modules/vite/package.json','utf8')).version,playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version,typescript:tsVersion},samples,events,trials,warmups,profile:{} as Record<string,unknown>,results:[] as any[]};
try{
  for(const scenario of scenarios)for(const size of sizes){
    const fixtures=new Map<string,{modules:Record<string,string>;runtimeSource:string;appSource:string;runtimeOriginal:string;compileMs:number;sourceBytes:number}>();
    for(const variant of variants){const start=performance.now(),fixture=scenario==='light'?lightFixture(size,variant.generate):realisticFixture(size,variant.generate),compileMs=performance.now()-start;
      const modules=scenario==='light'?{'./Child.qb':(fixture as any).child,'./Bench.qb':(fixture as any).root}:fixture as Record<string,string>,runtimeOriginal=await readFile(variant.path,'utf8');
      const directory=join(temp,variant.name,scenario,String(size));await mkdir(directory,{recursive:true});
      for(const [name,source] of Object.entries(modules)){let code=source;for(const dependency of Object.keys(modules))code=code.split(JSON.stringify(dependency)).join(JSON.stringify(dependency.replace('.qb','.js')));await writeFile(join(directory,name.replace('.qb','.js')),code);}
      fixtures.set(variant.name,{modules,runtimeOriginal,runtimeSource:await bundle(variant.path),appSource:await bundle(join(directory,'Bench.js')),compileMs,sourceBytes:Object.values(modules).reduce((n,source)=>n+Buffer.byteLength(source),0)});
      if(mode!=='timing'&&size===sizes[0]){const page=await browser.newPage();try{report.profile[scenario+':'+variant.name]=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).profile(payload);}finally{URL.revokeObjectURL(url);}},{helper,modules,runtimeSource:instrumentRuntime(runtimeOriginal)});}finally{await page.close();}}
    }
    if(mode==='profile')continue;
    for(let trial=0;trial<trials;trial++)for(const variant of trial%2?[...variants].reverse():variants){const fixture=fixtures.get(variant.name)!,page=await browser.newPage();
      try{const payload={helper,runtimeSource:fixture.runtimeSource,appSource:fixture.appSource,size,samples,events,warmups};
        const measurement=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).measure(payload);}finally{URL.revokeObjectURL(url);}},payload);
        const heap=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).retain(payload);}finally{URL.revokeObjectURL(url);}},payload);
        await page.requestGC();const retention=await page.evaluate(()=>{const probe=(globalThis as any).__stabilizationRetention;return {handles:probe.handles.length,nodes:probe.nodes.filter((ref:WeakRef<object>)=>ref.deref()).length,props:probe.props.filter((ref:WeakRef<object>)=>ref.deref()).length,targets:probe.targets.filter((ref:WeakRef<object>)=>ref.deref()).length,instances:probe.instances.filter((ref:WeakRef<object>)=>ref.deref()).length,sampledInstances:probe.instances.length};});
        if(!measurement.identity||measurement.listeners||measurement.remaining||retention.nodes||retention.props||retention.instances||variant.name==='phase3a1'&&retention.targets)throw new Error('Benchmark correctness failed: '+variant.name);
        report.results.push({variant:variant.name,scenario,trial,compileMs:fixture.compileMs,generatedBytes:fixture.sourceBytes,runtimeSha256:hash(fixture.runtimeOriginal),runtimeProductionSha256:hash(fixture.runtimeSource),appSha256:hash(fixture.appSource),runtimeBytes:Buffer.byteLength(fixture.runtimeSource),runtimeGzipBytes:gzipSync(fixture.runtimeSource).length,appBytes:Buffer.byteLength(fixture.appSource),appGzipBytes:gzipSync(fixture.appSource).length,...measurement,heap,retention});
        console.log(JSON.stringify({variant:variant.name,scenario,size,trial,identity:measurement.identity}));
      }finally{await page.close();}
    }
  }
}finally{await browser.close();if(dirname(resolve(temp))!==temporaryRoot||!basename(temp).startsWith('framework-stabilization-'))throw new Error('Refusing cleanup outside the named temporary directory');await rm(temp,{recursive:true,force:true});}
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log('Wrote '+output);
