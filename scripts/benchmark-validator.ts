import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {compile,parse,validate} from '../language/index.js';

const outputIndex=process.argv.indexOf('--output');
const sizes=[4_000,8_000,16_000];
const warmups=3,samples=11;
const percentile=(values:number[],fraction:number)=>values[Math.min(values.length-1,Math.ceil(values.length*fraction)-1)];
const results=[];
for(const size of sizes){
  const actions=Array.from({length:size},(_,index)=>`    action a${index}:\n        value = value + 1`).join('\n');
  const source=`class Counter:\n    value = 0\n${actions}\ncomponent App:\n    p text="ready"`;
  const ast=parse(source,`validator-${size}.qb`);
  for(let index=0;index<warmups;index++)validate(ast,source,`validator-${size}.qb`);
  const timings=[];
  for(let index=0;index<samples;index++){const start=performance.now();validate(ast,source,`validator-${size}.qb`);timings.push(performance.now()-start);}
  timings.sort((left,right)=>left-right);
  for(let index=0;index<warmups;index++)compile(source,`compiler-${size}.qb`);
  const compileTimings=[];
  for(let index=0;index<samples;index++){const start=performance.now();compile(source,`compiler-${size}.qb`);compileTimings.push(performance.now()-start);}
  compileTimings.sort((left,right)=>left-right);
  results.push({actions:size,validationMedianMs:timings[Math.floor(timings.length/2)],validationP95Ms:percentile(timings,.95),compileMedianMs:compileTimings[Math.floor(compileTimings.length/2)],compileP95Ms:percentile(compileTimings,.95)});
}
const report={protocol:{warmups,samples,scope:'validation-only scaling plus full parse/validate/generate compilation; one class with unique actions'},results};
console.log(JSON.stringify(report,null,2));
if(outputIndex>=0)await writeFile(process.argv[outputIndex+1],JSON.stringify(report,null,2)+'\n');
