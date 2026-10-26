import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';

test('stabilized dependency sets restore instance and computed edges after repeated DOM failures',async()=>{
  const code=compile(`class Item:
    id = 0
    value = 0
component Edges:
    original = Item(1, 0)
    replacement = Item(1, 0)
    other = Item(2, 0)
    current = original
    items = [original, other]
    computed first = current.value + 1
    computed total = first + first
    button text="Swap":
        on click:
            current = replacement
            items.move(other, 0)
    button text="Original":
        on click:
            original.value = original.value + 1
    button text="Replacement":
        on click:
            replacement.value = replacement.value + 1
    p text=str(current.value)
    p text=str(total)
    ul:
        for item in items key=item.id:
            li text=str(item.value)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/stabilization-regressions.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).verifyEdges(payload);}finally{URL.revokeObjectURL(url);}},{runtime,code,helper});assert.deepEqual(result,{failures:[],errors:2,remaining:0});}finally{await browser.close();}
});

test('literal dependency metadata elision preserves safe values and legacy model fallback',async()=>{
  const value="quotes: ' \\\" \\ slash; <img src=x> \u2028 \u2029",code=compile(`component Literals:\n    n = 1\n    computed fixed = 2\n    p text=${JSON.stringify(value)}\n    p text=str(fixed)\n`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,code})=>{const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),{model,default:mount}=await import(urls[1]),host=document.createElement('main'),dispose=mount(host,api);const result={text:host.querySelector('p')?.textContent,number:host.querySelectorAll('p')[1].textContent,safe:!host.querySelector('img'),literalHints:model.roots[0].attributes.text.dependencies??null,computedHints:model.computed.fixed.dependencies??null};dispose();return result;}finally{urls.forEach(url=>URL.revokeObjectURL(url));}},{runtime,code});assert.deepEqual(result,{text:value,number:'2',safe:true,literalHints:null,computedHints:null});}finally{await browser.close();}
});

test('fixed root-signal bindings deduplicate computed chains and ignore stale nonempty hints',async()=>{
  const code=compile(`component Chains:
    n = 0
    snapshot = 0
    computed left = n + 1
    computed right = n + 2
    computed total = left + right
    button text="Sequential":
        on click:
            n = n + 1
            snapshot = total + 0
            n = n + 1
            snapshot = total + 0
    button text="Batch":
        on click:
            n = n + 1
            n = n + 1
    p text=str(total)
    p text=str(snapshot)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/stabilization-regressions.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).verifyChains(payload);}finally{URL.revokeObjectURL(url);}},{runtime,code,helper});assert.deepEqual(result,{sequential:{values:['7','7'],calls:{left:2,right:2,total:2},writes:2},batched:{values:['11','7'],calls:{left:1,right:1,total:1},writes:1},remaining:0});}finally{await browser.close();}
});

test('initial child propagation observes parent changes made by a custom mount callback',async()=>{
  const parent=compile(`import Child from "./Child.qb"
component Parent:
    n = 0
    button text="Set":
        on click:
            n = 1
    Child amount=n
    p text=str(n)
`).code,child=compile(`component Child(amount = 0):
    computed total = amount + 1
    span text=str(total)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/stabilization-regressions.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).verifyInitialProps(payload);}finally{URL.revokeObjectURL(url);}},{runtime,parent,child,helper});assert.deepEqual(result,{child:'2',parent:'1',remaining:0});}finally{await browser.close();}
});

test('disposed handles release mount targets and sampled class instances in Firefox',async()=>{
  const code=compile(`class Item:
    id = 0
component Memory(title = ""):
    items = [Item(1)]
    n = 0
    button text="Update":
        on click:
            n = n + 1
    p text=title + str(n)
    for item in items key=item.id:
        li text=str(item.id)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/stabilization-browser.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{await (await import(url)).retain(payload);}finally{URL.revokeObjectURL(url);}},{runtimeSource:runtime,appSource:code,helper});await page.requestGC();
    const result=await page.evaluate(()=>{const data=(globalThis as any).__stabilizationRetention;return {handles:data.handles.length,targets:data.targets.filter((ref:WeakRef<object>)=>ref.deref()).length,instances:data.instances.filter((ref:WeakRef<object>)=>ref.deref()).length,props:data.props.filter((ref:WeakRef<object>)=>ref.deref()).length,nodes:data.nodes.filter((ref:WeakRef<object>)=>ref.deref()).length,sampledInstances:data.instances.length};});assert.deepEqual(result,{handles:5,targets:0,instances:0,props:0,nodes:0,sampledInstances:5});
  }finally{await browser.close();}
});

test('empty-hook optimization rejects malformed zero-length action bodies atomically',async()=>{
  const code=compile(`class Item:
    value = 0
    action bump:
        value = value + 1
component Blocks:
    item = Item(0)
    n = 0
    button text="Run":
        on click:
            n = n + 1
            item.bump()
    p text=str(n)
    p text=str(item.value)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/stabilization-regressions.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).verifyBlocks(payload);}finally{URL.revokeObjectURL(url);}},{runtime,code,helper});assert.deepEqual(result,{errors:2,failedValues:['0','0'],writesOnFailure:0,validValues:['1','1'],remaining:0});}finally{await browser.close();}
});

test('dynamic computed member chains evaluate once when dirty inputs refresh during an action',async()=>{
  const code=compile(`class Meter:
    value = 0
component Pull:
    n = 0
    snapshot = 0
    computed meter = Meter(n)
    computed total = meter.value + 1
    button text="Read":
        on click:
            n = n + 1
            snapshot = total + 0
            snapshot = total + 0
    p text=str(total)
    p text=str(snapshot)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/stabilization-regressions.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).verifyDynamicChain(payload);}finally{URL.revokeObjectURL(url);}},{runtime,code,helper});assert.deepEqual(result,[{values:['2','2'],meter:1,total:1},{values:['3','3'],meter:1,total:1}]);}finally{await browser.close();}
});
