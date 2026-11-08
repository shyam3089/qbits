import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {firefox} from 'playwright';
import {compile,CompileError,measureComponentComplexity,parse,utf8Length} from '../language/index';
import {compileFile} from '../tooling/modules';
import {languagePlugin} from '../tooling/vite';

async function temporaryProject(run:(root:string)=>Promise<void>):Promise<void>{const root=await mkdtemp(join(tmpdir(),'qbits-phase3a3-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
function message(run:()=>unknown):string{try{run();assert.fail('Expected failure');}catch(error){assert.ok(error instanceof CompileError||error instanceof RangeError);return error.message;}}

test('module graph limits are aggregate, exact, cycle-safe, and iterative',async()=>temporaryProject(async root=>{
  const sources={
    'Root.qb':'import A from "./A.qb"\nimport B from "./B.qb"\ncomponent Root:\n    div:\n        A\n        B',
    'A.qb':'import Shared from "./Shared.qb"\ncomponent A:\n    Shared',
    'B.qb':'import Shared from "./Shared.qb"\ncomponent B:\n    Shared',
    'Shared.qb':'component Shared:\n    p text="shared"'
  };
  for(const [name,source] of Object.entries(sources))await writeFile(join(root,name),source);
  const bytes=Object.values(sources).reduce((total,source)=>total+utf8Length(source),0);
  const complexity=Object.entries(sources).reduce((total,[name,source])=>total+measureComponentComplexity(parse(source,join(root,name))),0);
  const exact={graphLimits:{maxModules:4,maxImportDepth:2,maxTotalSourceBytes:bytes,maxAggregateComplexity:complexity}};
  assert.match(compileFile(join(root,'Root.qb'),undefined,undefined,exact).code,/componentName/);
  const cli=spawnSync(process.execPath,['dist/lib/tooling/cli.js','check',join(root,'Root.qb'),'--max-modules=4'],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);
  const cliFailure=spawnSync(process.execPath,['dist/lib/tooling/cli.js','check',join(root,'Root.qb'),'--max-modules=3'],{encoding:'utf8'});assert.equal(cliFailure.status,1);assert.match(cliFailure.stderr,/distinct modules/);
  const plugin=languagePlugin(exact),watched:string[]=[];const transformed=plugin.transform!.call({addWatchFile:(path:string)=>watched.push(path),error:(failure:unknown)=>{throw failure;}} as never,sources['Root.qb'],join(root,'Root.qb')) as {code:string};assert.match(transformed.code,/componentName/);assert.ok(watched.some(path=>path.endsWith('Shared.qb')));
  assert.match(message(()=>compileFile(join(root,'Root.qb'),undefined,undefined,{graphLimits:{...exact.graphLimits,maxModules:3}})),/distinct modules/);
  assert.match(message(()=>compileFile(join(root,'Root.qb'),undefined,undefined,{graphLimits:{...exact.graphLimits,maxImportDepth:1}})),/Import depth/);
  assert.match(message(()=>compileFile(join(root,'Root.qb'),undefined,undefined,{graphLimits:{...exact.graphLimits,maxTotalSourceBytes:bytes-1}})),/Project source/);
  assert.match(message(()=>compileFile(join(root,'Root.qb'),undefined,undefined,{graphLimits:{...exact.graphLimits,maxAggregateComplexity:complexity-1}})),/Project complexity/);
  await writeFile(join(root,'CycleA.qb'),'import CycleB from "./CycleB.qb"\ncomponent CycleA:\n    CycleB');
  await writeFile(join(root,'CycleB.qb'),'import CycleA from "./CycleA.qb"\ncomponent CycleB:\n    CycleA');
  assert.match(message(()=>compileFile(join(root,'CycleA.qb'))),/Unsupported component import cycle/);

  const count=5_000;
  for(let index=0;index<count;index++)await writeFile(join(root,`C${index}.qb`),index===count-1?`component C${index}:\n    p text="end"`:`import C${index+1} from "./C${index+1}.qb"\ncomponent C${index}:\n    C${index+1}`);
  const failure=message(()=>compileFile(join(root,'C0.qb')));assert.match(failure,/Import depth exceeds/);assert.doesNotMatch(failure,/call stack/i);
}));

test('direct compiler entry enforces aggregate source and complexity limits',()=>{
  const source='component Direct:\n    p text="ok"',complexity=measureComponentComplexity(parse(source));
  assert.match(compile(source,'Direct.qb',{graphLimits:{maxTotalSourceBytes:utf8Length(source),maxAggregateComplexity:complexity}}).code,/componentName/);
  assert.match(message(()=>compile(source,'Direct.qb',{graphLimits:{maxTotalSourceBytes:utf8Length(source)-1}})),/Project source/);
  assert.match(message(()=>compile(source,'Direct.qb',{graphLimits:{maxAggregateComplexity:complexity-1}})),/Project complexity/);
});

test('deterministic grammar-aware multi-file DAG fuzzing handles sharing without double counting',async()=>temporaryProject(async root=>{
  for(const seed of [0x3a30_0001,0x3a30_0002,0x3a30_0003]){
    let state=seed>>>0;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;},directory=join(root,String(seed));
    await mkdir(directory);const count=60,sources=new Map<string,string>();
    for(let index=count-1;index>=0;index--){const remaining=count-index-1,imports:string[]=[],children:string[]=[];if(remaining){const candidates=new Set<number>();for(let edge=0;edge<Math.min(2,remaining);edge++)candidates.add(index+1+(next()%remaining));for(const child of candidates){imports.push(`import C${child} from "./C${child}.qb"`);children.push(`        C${child}`);}}const source=`${imports.join('\n')}${imports.length?'\n':''}component C${index}:\n    div:${children.length?'\n'+children.join('\n'):'\n        p text="leaf"'}`;sources.set(`C${index}.qb`,source);await writeFile(join(directory,`C${index}.qb`),source);}
    const bytes=[...sources.values()].reduce((sum,value)=>sum+utf8Length(value),0);assert.match(compileFile(join(directory,'C0.qb'),undefined,undefined,{graphLimits:{maxModules:count,maxImportDepth:count,maxTotalSourceBytes:bytes,maxAggregateComplexity:50_000}}).code,/componentName/);
  }
}));

test('shared runtime budgets are exact and failed staged reservations roll back and reuse capacity',async()=>{
  const size=50,values=Array.from({length:size},(_,index)=>index).join(', ');
  const child=compile(`component Child:\n    items = [${values}]\n    div:\n        for item in items key=item:\n            p text=str(item)`).code;
  const parent=compile(`import Child from "./Child.qb"\ncomponent Parent:\n    items = [${values}]\n    div:\n        for item in items key=item:\n            Child`).code;
  const transaction=compile(`component Transaction:\n    items = [1, 2]\n    button text="Burst":\n        on click:\n            items.append(3)\n            items.append(4)\n    button text="Remove":\n        on click:\n            items.remove(2)\n    button text="Add":\n        on click:\n            items.append(3)\n    for item in items key=item:\n        button text=str(item)`).code;
  const staticTree=compile('component Static:\n    div:\n        p text="x"').code;
  const leaf=compile('component Leaf:\n    p text="leaf"').code;
  const branch=compile('import Leaf from "./Leaf.qb"\ncomponent Branch:\n    Leaf').code;
  const effects=compile('component Effects:\n    n = 0\n    p text=str(n)\n    p text=str(n)').code;
  const sequence=compile(`component Sequence:\n    items = [1, 2, 3, 4, 5]\n    button text="Remove 5":\n        on click:\n            items.remove(5)\n    button text="Add 5":\n        on click:\n            items.append(5)\n    button text="Move 1":\n        on click:\n            items.move(1, 2)\n    button text="Move 4":\n        on click:\n            items.move(4, 0)\n    for item in items key=item:\n        p text=str(item)`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,child,parent,transaction,staticTree,leaf,branch,effects,sequence})=>{
    const urls=[runtime,child,transaction,staticTree,leaf,effects,sequence].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));const parentUrl=URL.createObjectURL(new Blob([parent.replace(JSON.stringify('./Child.qb'),JSON.stringify(urls[1]))],{type:'text/javascript'}));const branchUrl=URL.createObjectURL(new Blob([branch.replace(JSON.stringify('./Leaf.qb'),JSON.stringify(urls[4]))],{type:'text/javascript'}));urls.push(parentUrl,branchUrl);
    const host=document.createElement('main'),errors:string[]=[];document.body.append(host);window.addEventListener('error',event=>{errors.push(event.error?.message??event.message);event.preventDefault();});
    try{const api=await import(urls[0]),childModule=await import(urls[1]),transactionModule=await import(urls[2]),staticModule=await import(urls[3]),leafModule=await import(urls[4]),effectsModule=await import(urls[5]),sequenceModule=await import(urls[6]),parentModule=await import(urls[7]),branchModule=await import(urls[8]);
      let recordFailure='';try{api.mountComponent(host,parentModule.model,[childModule.default],{},{maxListRecords:2549});}catch(error){recordFailure=(error as Error).message;}const recordFailedEmpty=!host.childNodes.length;
      const exactDispose=api.mountComponent(host,parentModule.model,[childModule.default],{},{maxListRecords:2550});const paragraphs=host.querySelectorAll('p').length;exactDispose();
      let domFailure='';try{api.mountComponent(host,staticModule.model,[],{},{maxDomNodes:2});}catch(error){domFailure=(error as Error).message;}const domFailedEmpty=!host.childNodes.length;const domDispose=api.mountComponent(host,staticModule.model,[],{},{maxDomNodes:3});domDispose();
      let workFailure='';try{api.mountComponent(host,staticModule.model,[],{},{maxWorkPerOperation:2});}catch(error){workFailure=(error as Error).message;}const workFailedEmpty=!host.childNodes.length;const workDispose=api.mountComponent(host,staticModule.model,[],{},{maxWorkPerOperation:3});workDispose();
      let componentFailure='';try{api.mountComponent(host,branchModule.model,[leafModule.default],{},{maxComponentInstances:1});}catch(error){componentFailure=(error as Error).message;}const componentFailedEmpty=!host.childNodes.length;const componentDispose=api.mountComponent(host,branchModule.model,[leafModule.default],{},{maxComponentInstances:2});componentDispose();
      let effectFailure='';try{api.mountComponent(host,effectsModule.model,[],{},{maxReactiveEffects:1});}catch(error){effectFailure=(error as Error).message;}const effectFailedEmpty=!host.childNodes.length;const effectDispose=api.mountComponent(host,effectsModule.model,[],{},{maxReactiveEffects:2});effectDispose();
      const dispose=api.mountComponent(host,transactionModule.model,[],{},{maxListRecords:3}),buttons=host.querySelectorAll('button'),first=buttons[3];first.focus();buttons[0].click();const failed={labels:[...host.querySelectorAll('button')].slice(3).map(node=>node.textContent),same:host.querySelectorAll('button')[3]===first,focused:document.activeElement===first};buttons[1].click();buttons[2].click();const reused=[...host.querySelectorAll('button')].slice(3).map(node=>node.textContent);dispose();
      const sequenceDispose=api.mountComponent(host,sequenceModule.model,[]),sequenceButtons=host.querySelectorAll('button'),reference=[1,2,3,4,5];let state=0x3a30_2026;
      for(let step=0;step<200;step++){state=(Math.imul(state,1664525)+1013904223)>>>0;const operation=state%4;if(operation===0&&reference.includes(5)){sequenceButtons[0].click();reference.splice(reference.indexOf(5),1);}else if(operation===1&&!reference.includes(5)){sequenceButtons[1].click();reference.push(5);}else if(operation===2){sequenceButtons[2].click();const index=reference.indexOf(1);if(index>=0){const [item]=reference.splice(index,1);reference.splice(Math.min(2,reference.length),0,item);}}else if(operation===3){sequenceButtons[3].click();const index=reference.indexOf(4);if(index>=0){const [item]=reference.splice(index,1);reference.unshift(item);}}const actual=[...host.querySelectorAll('p')].map(node=>Number(node.textContent));if(actual.join(',')!==reference.join(','))throw new Error(`Reference mismatch at ${step}: ${actual} != ${reference}`);}
      const sequenceResult=[...host.querySelectorAll('p')].map(node=>Number(node.textContent));sequenceDispose();return{recordFailure,recordFailedEmpty,paragraphs,domFailure,domFailedEmpty,workFailure,workFailedEmpty,componentFailure,componentFailedEmpty,effectFailure,effectFailedEmpty,failed,reused,sequenceResult,reference,errors,empty:!host.childNodes.length};
    }finally{host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
  },{runtime,child,parent,transaction,staticTree,leaf,branch,effects,sequence});
  assert.match(result.recordFailure,/List records.*2549/);assert.equal(result.recordFailedEmpty,true);assert.equal(result.paragraphs,2500);
  assert.match(result.domFailure,/Framework DOM nodes.*2/);assert.equal(result.domFailedEmpty,true);assert.match(result.effectFailure,/Reactive effects.*1/);assert.equal(result.effectFailedEmpty,true);
  assert.match(result.workFailure,/Framework work.*2/);assert.equal(result.workFailedEmpty,true);assert.match(result.componentFailure,/Component instances.*1/);assert.equal(result.componentFailedEmpty,true);
  assert.deepEqual(result.failed,{labels:['1','2'],same:true,focused:true});assert.deepEqual(result.reused,['1','3']);assert.deepEqual(result.errors,['List records exceeds the configured limit of 3']);assert.equal(result.empty,true);
  assert.deepEqual(result.sequenceResult,result.reference);
  }finally{await browser.close();}
});

test('runtime work accounting covers initialization and rejects invalid nested numeric literals',async()=>{
  const sources=[compile(`component Accounted:
    first = 1
    second = 2
    third = 3
    p`).code,compile(`component PropAccounted(value = 1):
    p`).code,compile(`class Item:
    value = 0
component ClassAccounted:
    item = Item(1)
    p`).code];
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,sources})=>{
    const urls=[runtime,...sources].map(value=>URL.createObjectURL(new Blob([value],{type:'text/javascript'})));
    try{const api=await import(urls[0]),component=await import(urls[1]),prop=await import(urls[2]),classComponent=await import(urls[3]),host=document.createElement('main'),failures:string[]=[];
      for(let attempt=0;attempt<2;attempt++)try{api.mountComponent(host,component.model,[],{},{maxWorkPerOperation:6});}catch(error){failures.push((error as Error).message);}
      const emptyAfterFailures=!host.childNodes.length,dispose=api.mountComponent(host,component.model,[],{},{maxWorkPerOperation:7}),exactNodes=host.childNodes.length;dispose();
      const initializationFailures:string[]=[];for(const [model,limit] of [[prop.model,1],[classComponent.model,6]] as const)try{api.mountComponent(host,model,[],{},{maxWorkPerOperation:limit});}catch(error){initializationFailures.push((error as Error).message);}
      const invalid={props:{},classes:{},states:{items:{kind:'list',items:[{kind:'literal',value:Number.NaN}]}},computed:{},init:[],cleanup:[],roots:[]};
      let numericFailure='';try{api.mountComponent(host,invalid,[]);}catch(error){numericFailure=(error as Error).message;}
      const invalidCondition={props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[{kind:'conditional',condition:{kind:'literal',value:Number.POSITIVE_INFINITY},consequent:[],alternate:[]}]};
      let conditionFailure='';try{api.mountComponent(host,invalidCondition,[]);}catch(error){conditionFailure=(error as Error).message;}
      return{failures,initializationFailures,emptyAfterFailures,exactNodes,numericFailure,conditionFailure,empty:!host.childNodes.length};
    }finally{urls.forEach(value=>URL.revokeObjectURL(value));}
  },{runtime,sources});
  assert.deepEqual(result.failures,['Framework work exceeds the configured limit of 6','Framework work exceeds the configured limit of 6']);
  assert.deepEqual(result.initializationFailures,['Framework work exceeds the configured limit of 1','Framework work exceeds the configured limit of 6']);
  assert.equal(result.emptyAfterFailures,true);assert.equal(result.exactNodes,1);assert.match(result.numericFailure,/safe integer range/);assert.match(result.conditionFailure,/safe integer range/);assert.equal(result.empty,true);
  }finally{await browser.close();}
});
