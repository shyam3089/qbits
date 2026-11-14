import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {firefox} from 'playwright';
import {mountFixture,reactiveFixtures} from '../tests/helpers/reactivity-fixtures.js';

const baselineIndex=process.argv.indexOf('--baseline');
if(baselineIndex<0||!process.argv[baselineIndex+1])throw new Error('--baseline requires a compiled runtime path');
const sources={baseline:await readFile(process.argv[baselineIndex+1],'utf8'),candidate:await readFile('dist/lib/runtime/index.js','utf8')};
const modules=reactiveFixtures(),mountModules=Object.fromEntries([1000,10000].map(size=>[size,mountFixture(size)]));
const samples=31,warmups=5,operations=1000,browser=await firefox.launch({headless:true}),firefoxVersion=browser.version(),page=await browser.newPage();
try{
  const performance=await page.evaluate(async({sources,modules,mountModules,samples,warmups,operations})=>{
    (globalThis as any).__name=(value:string)=>value;
    const names=['baseline','candidate'] as const,values=()=>({baseline:[] as number[],candidate:[] as number[]});
    const summarize=(items:number[])=>{const sorted=[...items].sort((a,b)=>a-b),mean=items.reduce((sum,value)=>sum+value,0)/items.length,variance=items.reduce((sum,value)=>sum+(value-mean)**2,0)/items.length;return {median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],mean,variance,stddev:Math.sqrt(variance),min:sorted[0],max:sorted.at(-1),samples:sorted.length};};
    const alternate=async(run:(name:typeof names[number])=>number|Promise<number>)=>{const result=values();for(let round=0;round<warmups+samples;round++){const order=round%2?[...names].reverse():names;for(const name of order){const value=await run(name);if(round>=warmups)result[name].push(value);}}return {baseline:summarize(result.baseline),candidate:summarize(result.candidate)};};
    const coldRuntimeStartupUs=await alternate(async name=>{const url=URL.createObjectURL(new Blob([sources[name]],{type:'text/javascript'})),started=performance.now();try{await import(url);return (performance.now()-started)*1000;}finally{URL.revokeObjectURL(url);}});
    const urls:string[]=[],url=(source:string)=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
    try{
      const runtimes:any={};for(const name of names)runtimes[name]=await import(url(sources[name]));
      const mounts:Record<string,unknown>={};
      for(const [size,fixture] of Object.entries(mountModules)){
        const module=await import(url((fixture as Record<string,string>)['./Mount.qb']));
        mounts[size]=await alternate(name=>{const host=document.createElement('main'),started=performance.now(),dispose=module.default(host,runtimes[name]),elapsed=performance.now()-started;dispose();return elapsed;});
      }
      const rowURL=url(modules['./Row.qb']),list=await import(url(modules['./List.qb'].replace(JSON.stringify('./Row.qb'),JSON.stringify(rowURL)))),hosts:Record<string,HTMLElement>={},disposers:Record<string,()=>void>={},increments:Record<string,HTMLButtonElement>={},inputs:Record<string,HTMLInputElement>={},serial={baseline:0,candidate:0};
      for(const name of names){const host=document.createElement('main');document.body.append(host);hosts[name]=host;disposers[name]=list.default(host,runtimes[name]);const first=host.querySelector('li')!,last=host.querySelector('li:last-child')!;increments[name]=[...first.querySelectorAll('button')].find(node=>node.textContent==='Increment')!;inputs[name]=last.querySelector('input')!;for(let index=0;index<200;index++)increments[name].click();}
      const isolatedUpdateUs=await alternate(name=>{const started=performance.now();for(let index=0;index<operations;index++)increments[name].click();return (performance.now()-started)*1000/operations;});
      for(const name of names)for(let index=0;index<200;index++){inputs[name].value=`Warm ${index}`;inputs[name].dispatchEvent(new Event('input'));}
      const nestedComponentUs=await alternate(name=>{const started=performance.now();for(let index=0;index<operations;index++){inputs[name].value=`Value ${serial[name]++}`;inputs[name].dispatchEvent(new Event('input'));}return (performance.now()-started)*1000/operations;});
      for(const name of names){disposers[name]();hosts[name].remove();}
      return {coldRuntimeStartupUs,mountMs:mounts,isolatedUpdateUs,nestedComponentUs};
    }finally{urls.forEach(URL.revokeObjectURL);}
  },{sources,modules,mountModules,samples,warmups,operations});
  const artifacts=Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,{sha256:createHash('sha256').update(source).digest('hex'),bytes:Buffer.byteLength(source),gzipBytes:gzipSync(source).length}]));
  console.log(JSON.stringify({firefox:firefoxVersion,protocol:{ordering:'per-sample alternating in one Firefox page',samples,warmups,operations},artifacts,performance},null,2));
}finally{await page.close();await browser.close();}
