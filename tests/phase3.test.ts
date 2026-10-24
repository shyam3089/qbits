import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';

import {transactionSource as source} from './helpers/phase3-fixtures.js';
const child=compile(`component Child(label = ""):
    local = 0
    section:
        span text=label
        button text=str(local):
            on click:
                local = local + 1
`).code;

test('Firefox transactions preserve state, DOM identity and subscriptions after key, mount and host failures',async()=>{
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/phase3-browser.mjs','utf8');
  const browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).verify(payload);}finally{URL.revokeObjectURL(url);}},{runtime,code:compile(source).code,child,helper});assert.deepEqual(result.failures,[]);assert.equal(result.errors,7);assert.equal(result.listeners,0);assert.equal(result.remaining,0);assert.equal(result.rapidUpdates,200);}
  finally{await browser.close();}
});

test('Firefox rejects malformed component and class computed cycles without leaving DOM',async()=>{
  const runtime=await readFile('dist/lib/runtime/index.js','utf8');const browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,code})=>{
    code=code.replace(/^import .*$/m,'');const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
    try{const api=await import(urls[0]),{model}=await import(urls[1]);const errors=[];
      for(const kind of ['component','class']){const current=structuredClone(model);if(kind==='component'){current.computed.left={kind:'reference',name:'right'};current.computed.right={kind:'reference',name:'left'};}
        else current.classes.Item.computed.doubled={kind:'reference',name:'doubled'};
        const host=document.createElement('main');try{api.mountComponent(host,current,[()=>()=>{}]);errors.push('accepted');}catch(error){errors.push(String(error.message).includes('Circular reactive dependency')&&host.childNodes.length===0?'cycle':'wrong error: '+error.message);}}
      return errors;
    }finally{urls.forEach(url=>URL.revokeObjectURL(url));}
  },{runtime,code:compile(source).code});assert.deepEqual(result,['cycle','cycle']);}finally{await browser.close();}
});

test('Firefox supports long sequential computed reads and legacy models without dependency metadata',async()=>{
  const code=compile(`component Sequential:
    n = 0
    snapshot = 0
    computed left = n + 1
    computed right = n + 2
    computed total = left + right
    button text="Run":
        on click:
${Array.from({length:100},()=>`            n = n + 1\n            snapshot = total + 0`).join('\n')}
    p text=str(n)
    p text=str(total)
    p text=str(snapshot)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,code})=>{
    const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
    try{const api=await import(urls[0]),{model}=await import(urls[1]),results=[];
      for(const legacy of [false,true]){const current=structuredClone(model);if(legacy){const pending:any[]=[current];while(pending.length){const value=pending.pop();if(value&&typeof value==='object'){delete value.dependencies;pending.push(...Object.values(value));}}}
        const host=document.createElement('main');document.body.append(host);const dispose=api.mountComponent(host,current,[]),observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,characterData:true});host.querySelector('button')!.click();results.push({values:[...host.querySelectorAll('p')].map(node=>node.textContent),writes:observer.takeRecords().length});observer.disconnect();dispose();host.remove();}
      return results;
    }finally{urls.forEach(url=>URL.revokeObjectURL(url));}
  },{runtime,code});assert.deepEqual(result,Array.from({length:2},()=>({values:['100','203','203'],writes:3})));}finally{await browser.close();}
});

test('Firefox releases failed transaction scopes with disposed handles retained',async()=>{
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/phase3-browser.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{await (await import(url)).retainFailures(payload);}finally{URL.revokeObjectURL(url);}},{runtime,helper,child,code:compile(source).code});await page.requestGC();
    const result=await page.evaluate(()=>{const refs=(globalThis as any).__failedTransactions;return {handles:refs.handles.length,nodes:refs.nodes.filter((ref:WeakRef<object>)=>ref.deref()).length,props:refs.props.filter((ref:WeakRef<object>)=>ref.deref()).length};});assert.deepEqual(result,{handles:5,nodes:0,props:0});
  }finally{await browser.close();}
});

test('Firefox preserves lazy short-circuit condition dependencies and rolls back failed activation',async()=>{
  const code=compile(`class Item:
    amount = 0
    computed total = amount + 1
component Lazy:
    item = Item(9007199254740991)
    enabled = false
    button text="Enable":
        on click:
            enabled = true
    button text="Reset":
        on click:
            item.amount = 0
    if enabled and item.total == 1:
        p text="Visible"
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,code})=>{
    const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));let errors=0;const handler={handleEvent(event:ErrorEvent){errors++;event.preventDefault();}};window.addEventListener('error',handler);
    try{const api=await import(urls[0]),{default:mount}=await import(urls[1]);const host=document.createElement('main');document.body.append(host);const dispose=mount(host,api),buttons=host.querySelectorAll('button');buttons[0].click();const rolledBack=!host.querySelector('p');buttons[1].click();const stillHidden=!host.querySelector('p');buttons[0].click();const visible=host.querySelector('p')?.textContent;dispose();host.remove();return {errors,rolledBack,stillHidden,visible};}finally{window.removeEventListener('error',handler);urls.forEach(url=>URL.revokeObjectURL(url));}
  },{runtime,code});assert.deepEqual(result,{errors:1,rolledBack:true,stillHidden:true,visible:'Visible'});}finally{await browser.close();}
});

test('Firefox fails closed when host DOM restoration repeatedly fails',async()=>{
  const code=compile(`component Closed:
    items = [1, 2]
    button text="Move":
        on click:
            items.move(2, 0)
    ul:
        for item in items key=item:
            li text=str(item)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/phase3-browser.mjs','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async payload=>{const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));try{return await (await import(url)).failClosed(payload);}finally{URL.revokeObjectURL(url);}},{runtime,code,helper});assert.deepEqual(result,{errors:1,listeners:0,nodes:0});}finally{await browser.close();}
});
