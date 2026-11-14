import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';

const baselineIndex=process.argv.indexOf('--baseline-compiler'),outputIndex=process.argv.indexOf('--output');
const compilers:[string,{compile:typeof compile}][]=[];
if(baselineIndex>=0){const path=process.argv[baselineIndex+1];if(!path)throw new Error('--baseline-compiler requires a path');compilers.push(['baseline',await import(pathToFileURL(path).href)]);}
compilers.push(['candidate',{compile}]);
const source='component Startup:\n    main:\n'+Array.from({length:1000},(_,index)=>`        p text="Product ${index}"`).join('\n');
const summary=(values:number[])=>{const sorted=[...values].sort((left,right)=>left-right),mean=values.reduce((sum,value)=>sum+value,0)/values.length,variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;return {median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],mean,variance,stddev:Math.sqrt(variance),min:sorted[0],max:sorted.at(-1),samples:sorted.length};};
const entries=compilers.map(([name,compiler])=>({name,compiler,code:compiler.compile(source,'startup.qb').code,compileTimes:[] as number[],startupTimes:[] as number[]}));
const browser=await firefox.launch({headless:true}),firefoxVersion=browser.version(),page=await browser.newPage();
try{
  for(let round=0;round<24;round++){
    const ordered=round%2?[...entries].reverse():entries;
    for(const entry of ordered){
      const compileStart=performance.now();entry.compiler.compile(source,'startup.qb');if(round>=3)entry.compileTimes.push(performance.now()-compileStart);
      const startup=await page.evaluate(async generated=>{const url=URL.createObjectURL(new Blob([generated],{type:'text/javascript'})),start=performance.now();try{await import(url);return (performance.now()-start)*1000;}finally{URL.revokeObjectURL(url);}},entry.code);
      if(round>=3)entry.startupTimes.push(startup);
    }
  }
}finally{await page.close();await browser.close();}
const reports=entries.map(entry=>({name:entry.name,generatedBytes:Buffer.byteLength(entry.code),generatedGzipBytes:gzipSync(entry.code).byteLength,compileMs:summary(entry.compileTimes),generatedModuleStartupUs:summary(entry.startupTimes)}));
const report={firefox:firefoxVersion,protocol:{runtime:'production generated modules',fixture:'1000 static product text nodes',ordering:'paired alternating',warmups:3,samples:21},reports};
console.log(JSON.stringify(report,null,2));
if(outputIndex>=0){const output=process.argv[outputIndex+1];if(!output)throw new Error('--output requires a path');await writeFile(output,JSON.stringify(report,null,2)+'\n');}
