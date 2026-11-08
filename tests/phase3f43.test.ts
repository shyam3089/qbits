import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

test('computed lists reject every mutating method in components and classes',()=>{
  for(const call of ['append(Item(2))','remove(Item(1))','move(Item(1), 0)','sort("id", true)']){
    const source=`class Item:
    id = 0
component C:
    items = [Item(1)]
    computed snapshot = items
    button:
        on click:
            snapshot.${call}`;
    assert.throws(()=>compile(source,'readonly.qb'),(error:unknown)=>error instanceof CompileError&&error.diagnostic.line===8&&/read-only value/.test(error.message));
  }
  assert.throws(()=>compile('class Bucket:\n    value = 1\n    computed values = [value]\n    action change:\n        values.append(2)\ncomponent C:\n    div'),/read-only value/);
  assert.throws(()=>compile('class Bucket:\n    value = 1\n    computed values = [value]\ncomponent C:\n    bucket = Bucket(1)\n    button:\n        on click:\n            bucket.values.append(2)'),/Computed values and actions are read-only/);
  assert.throws(()=>compile('component C:\n    button:\n        on click:\n            [1].append(2)'),/Assignment target must be state or an instance field/);
});

test('disposed staged lists release prepared records and preserve the surrounding app in Firefox',async()=>{
  const modules=[false,true].map(appendFirst=>compile(`component C:
    visible = true
    items = [1]
    input:
        value="kept"
    button text="Hide and append":
        on click:
            ${appendFirst?'items.append(2)':'visible = false'}
            ${appendFirst?'visible = false':'items.append(2)'}
    button text="Show":
        on click:
            visible = true
    button text="Shrink":
        on click:
            items.remove(2)
    button text="Hide":
        on click:
            visible = false
    if visible:
        for item in items key=item:
            p text=str(item)`).code);
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const result=await page.evaluate(async({runtime,modules})=>{
      const urls=[runtime,...modules].map(code=>URL.createObjectURL(new Blob([code],{type:'text/javascript'})));
      const observations:unknown[]=[],errors:string[]=[];
      window.addEventListener('error',event=>{errors.push(event.error?.message??event.message);event.preventDefault();});
      try{
        const api=await import(urls[0]);
        for(const url of urls.slice(1)){
          const component=await import(url),host=document.createElement('main');document.body.append(host);
          const dispose=api.mountComponent(host,component.model,[],{},{maxListRecords:2,maxDomNodes:24,maxReactiveEffects:4});
          try{
            const input=host.querySelector('input')!,buttons=[...host.querySelectorAll('button')];input.focus();input.setSelectionRange(1,3);
            for(let cycle=0;cycle<4;cycle++){
              buttons[0].click();
              const hidden=host.querySelectorAll('p').length===0;
              buttons[1].click();
              observations.push({hidden,rows:[...host.querySelectorAll('p')].map(node=>node.textContent),same:host.querySelector('button')===buttons[0],focused:document.activeElement===input,selection:[input.selectionStart,input.selectionEnd]});
              buttons[2].click();
            }
          }finally{dispose();observations.push({empty:host.childNodes.length===0});host.remove();}
        }
        // A failed reservation must still roll back the ancestor and retain its row.
        const component=await import(urls[1]),host=document.createElement('main');document.body.append(host);
        const dispose=api.mountComponent(host,component.model,[],{},{maxListRecords:1}),row=host.querySelector('p'),buttons=host.querySelectorAll('button');
        try{buttons[0].click();observations.push({retained:host.querySelector('p')===row,text:row!.textContent});buttons[3].click();buttons[1].click();observations.push({recovered:[...host.querySelectorAll('p')].map(node=>node.textContent)});}finally{dispose();host.remove();}
        return{observations,errors};
      }finally{urls.forEach(URL.revokeObjectURL);}
    },{runtime,modules});
    const cycle={hidden:true,rows:['1','2'],same:true,focused:true,selection:[1,3]};
    assert.deepEqual(result,{observations:[...Array(4).fill(cycle),{empty:true},...Array(4).fill(cycle),{empty:true},{retained:true,text:'1'},{recovered:['1']}],errors:['List records exceeds the configured limit of 1']});
  }finally{await browser.close();}
});

test('runtime rejects computed-list writes before mutation and keeps derived state consistent after rollback',async()=>{
  const operations=['items.append(Item(9))','items.remove(Item(1))','items.move(Item(1), 0)','items.sort("id", true)','items = items'];
  const code=compile(`class Item:
    id = 0
component C:
    items = [Item(1), Item(2)]
    ticks = 0
    observed = 0
    computed snapshot = items
${operations.map((operation,index)=>`    button text="Invalid ${index}":\n        on click:\n            ticks = ticks + 1\n            ${operation}`).join('\n')}
    button text="Read":
        on click:
            observed = len(snapshot)
    button text="Append":
        on click:
            items.append(Item(3))
    p text=str(len(items)) + ":" + str(len(snapshot)) + ":" + str(ticks) + ":" + str(observed)
    for item in snapshot key=item.id:
        input:
            value=str(item.id)`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const result=await page.evaluate(async({runtime,code,operationCount})=>{
      const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      const host=document.createElement('main'),errors:string[]=[];document.body.append(host);
      window.addEventListener('error',event=>{errors.push(event.error?.message??event.message);event.preventDefault();});
      try{
        const api=await import(urls[0]),component=await import(urls[1]);
        // Exercise the runtime boundary independently of the compiler rejection.
        for(const root of component.model.roots.slice(0,operationCount))root.handler.statements[1].target.name='snapshot';
        const dispose=component.default(host,api),buttons=host.querySelectorAll('button'),first=host.querySelector('input')!;
        try{
          first.focus();first.setSelectionRange(0,1);const snapshots:unknown[]=[];
          for(let index=0;index<operationCount+2;index++){
            buttons[index<operationCount?index:operationCount+1].click();buttons[operationCount].click();
            snapshots.push({state:host.querySelector('p')!.textContent,rows:[...host.querySelectorAll('input')].map(input=>input.value),same:host.querySelector('input')===first,focused:document.activeElement===first,selection:[first.selectionStart,first.selectionEnd]});
          }
          dispose();return{snapshots,empty:host.childNodes.length===0,errors};
        }finally{dispose();}
      }finally{host.remove();urls.forEach(URL.revokeObjectURL);}
    },{runtime,code,operationCount:operations.length});
    const baseline={state:'2:2:0:2',rows:['1','2'],same:true,focused:true,selection:[0,1]},recovered={...baseline,state:'3:3:0:3',rows:['1','2','3']};
    assert.deepEqual(result,{snapshots:[...Array(operations.length).fill(baseline),recovered,recovered],empty:true,errors:[...Array(operations.length).fill('Cannot assign read-only value snapshot'),'Duplicate iteration key 3']});
  }finally{await browser.close();}
});

test('recursive class expressions consume exact work and nested components share the operation budget',async()=>{
  const chain=(levels:number)=>compile(`class Item:
    value = 1
${Array.from({length:levels},(_,index)=>`    computed c${index} = ${index?`c${index-1} + c${index-1}`:'value + value'}`).join('\n')}
component C:
    item = Item(1)
    p text=str(item.c${levels-1})`).code;
  const codes=[chain(6),chain(7),chain(2),compile('import Leaf from "./Leaf.qb"\ncomponent Parent:\n    Leaf\n    Leaf').code];
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const result=await page.evaluate(async({runtime,codes})=>{
      const urls=[runtime,...codes.slice(0,3)].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      urls.push(URL.createObjectURL(new Blob([codes[3].replace('./Leaf.qb',urls[3])],{type:'text/javascript'})));
      const host=document.createElement('main');document.body.append(host);
      try{
        const api=await import(urls[0]),six=await import(urls[1]),seven=await import(urls[2]),child=await import(urls[3]),parent=await import(urls[4]);
        const failures:unknown[]=[];
        for(const [component,limit] of [[six,199],[six,199],[seven,200],[parent,43]] as const){
          try{const dispose=api.mountComponent(host,component.model,component===parent?[child.default]:[],{},{maxWorkPerOperation:limit});dispose();failures.push({unexpected:true});}
          catch(error){failures.push({message:(error as Error).message,empty:host.childNodes.length===0});}
        }
        const dispose=api.mountComponent(host,six.model,[],{},{maxWorkPerOperation:200}),value=host.textContent;dispose();
        const disposeParent=api.mountComponent(host,parent.model,[child.default],{},{maxWorkPerOperation:44}),nested=[...host.querySelectorAll('p')].map(node=>node.textContent);disposeParent();
        return{failures,value,nested,empty:host.childNodes.length===0};
      }finally{host.remove();urls.forEach(URL.revokeObjectURL);}
    },{runtime,codes});
    assert.deepEqual(result,{failures:[199,199,200,43].map(limit=>({message:`Framework work exceeds the configured limit of ${limit}`,empty:true})),value:'64',nested:['4','4'],empty:true});
  }finally{await browser.close();}
});

test('count traversal exhausts a bounded budget deterministically and recovers state, identity and subscriptions',async()=>{
  const code=compile(`component C:
    values = [1, 1, 1, 1, 1, 1, 1, 1]
    enabled = false
    ticks = 0
    computed ready = enabled and ${Array(6).fill('count(values, 1) == 8').join(' and ')}
    input:
        value="kept"
    button text="Work":
        on click:
            ticks = ticks + 1
            enabled = true
    button text="Safe":
        on click:
            ticks = ticks + 1
    p text=str(ticks) + ":" + str(ready)`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const result=await page.evaluate(async({runtime,code})=>{
      const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),host=document.createElement('main'),errors:string[]=[];document.body.append(host);
      window.addEventListener('error',event=>{errors.push(event.error?.message??event.message);event.preventDefault();});
      try{
        const api=await import(urls[0]),component=await import(urls[1]),dispose=api.mountComponent(host,component.model,[],{},{maxWorkPerOperation:80});
        const input=host.querySelector('input')!,paragraph=host.querySelector('p'),buttons=host.querySelectorAll('button');input.focus();input.setSelectionRange(1,3);
        const states:unknown[]=[];
        try{for(let attempt=0;attempt<2;attempt++){buttons[0].click();states.push({text:paragraph!.textContent,same:host.querySelector('p')===paragraph,focused:document.activeElement===input,selection:[input.selectionStart,input.selectionEnd]});buttons[1].click();}states.push({text:paragraph!.textContent});}finally{dispose();}
        const disposeAllowed=api.mountComponent(host,component.model,[],{},{maxWorkPerOperation:200});host.querySelector('button')!.click();const allowed=host.querySelector('p')!.textContent;disposeAllowed();
        return{states,allowed,empty:host.childNodes.length===0,errors};
      }finally{host.remove();urls.forEach(URL.revokeObjectURL);}
    },{runtime,code});
    assert.deepEqual(result,{states:[{text:'0:false',same:true,focused:true,selection:[1,3]},{text:'1:false',same:true,focused:true,selection:[1,3]},{text:'2:false'}],allowed:'1:true',empty:true,errors:Array(2).fill('Framework work exceeds the configured limit of 80')});
  }finally{await browser.close();}
});
