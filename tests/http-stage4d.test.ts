import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const serviceSource=`class Item:
    count = 0
service Catalog:
    client api
    query item:
        get "/item"
        response Item
        cache 60s
        refresh on-focus
    query pending:
        get "/pending"
        response Item
    action increment(amount):
        post "/item"
        body amount
        response Item
        refresh item
        instant item:
            count = count + amount`;

const consumerSource=`import Catalog from "./Catalog.qb"
component Consumer:
    http client api:
        base "https://api.test"
        auth bearer token
    use Catalog
    section:
        if Catalog.item.success:
            p text=str(Catalog.item.data.count)
        else:
            p text="Loading"
        button text="Increment":
            on click:
                Catalog.increment(1)
        button text="Refresh":
            on click:
                Catalog.pending.refresh()`;

test('Stage 4D service syntax is typed, imported, and source-located',()=>{
  const service=compile(serviceSource,'Catalog.qb');assert.equal(service.ast.kind,'Service');assert.equal(service.ast.queries[0].cache?.value,60_000);assert.match(service.code,/serviceName/);
  const services=new Map([['Catalog',service.ast]]),consumer=compile(consumerSource,'Consumer.qb',{services});assert.equal(consumer.ast.uses[0].value,'Catalog');assert.match(consumer.code,/"services"/);assert.match(consumer.code,/Catalog\.qb/);
  assert.throws(()=>compile(consumerSource,'Consumer.qb'),(error:unknown)=>error instanceof CompileError&&/Unknown service "Catalog"/.test(error.message)&&error.diagnostic.line===6);
  assert.throws(()=>compile(consumerSource.replace('    use Catalog\n','    use Catalog\n    use Catalog\n'),'Consumer.qb',{services}),/Duplicate service use/);
  assert.throws(()=>compile(consumerSource.replace('Catalog.increment(1)','Catalog.missing(1)'),'Consumer.qb',{services}),/Unknown service action missing/);
  assert.throws(()=>compile(consumerSource.replace('Catalog.increment(1)','Catalog.increment("bad")'),'Consumer.qb',{services}),/requires number, received string/);
  assert.throws(()=>compile(consumerSource.replace('    http client api:\n        base "https://api.test"\n        auth bearer token\n',''),'Consumer.qb',{services}),/requires unknown HTTP client/);
  assert.throws(()=>compile(serviceSource.replace('            count = count + amount','            missing = count + amount'),'Catalog.qb'),/Unknown instant field/);
  assert.throws(()=>compile('service Cyclic:\n    query first:\n        get second.data\n        response string\n    query second:\n        get first.data\n        response string','Cyclic.qb'),/Query dependency cycle/);
});

test('Stage 4D shares services per app, isolates auth, propagates actions, rolls back, and cleans up in Firefox',async()=>{
  const runtime=await readFile(new URL('../dist/lib/runtime/index.js',import.meta.url),'utf8'),service=compile(serviceSource,'Catalog.qb'),consumer=compile(consumerSource,'Consumer.qb',{services:new Map([['Catalog',compile(serviceSource,'Catalog.qb').ast]])});
  const rootSource=`import Consumer from "./Consumer.qb"
component App:
    show = true
    button text="Hide":
        on click:
            show = false
    Consumer
    if show:
        Consumer`;
  const root=compile(rootSource,'App.qb',{components:new Map([['Consumer',consumer.ast]])});
  const browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});
    const result=await page.evaluate(async({runtime,serviceCode,consumerCode,rootCode})=>{
      const urls:string[]=[],url=(source:string)=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;},runtimeUrl=url(runtime),serviceUrl=url(serviceCode),consumerUrl=url(consumerCode.replace('"./Catalog.qb"',JSON.stringify(serviceUrl))),rootUrl=url(rootCode.replace('"./Consumer.qb"',JSON.stringify(consumerUrl)));
      const requests:{method:string;auth:string;path:string;aborted:boolean}[]=[],counts:Record<string,number>={A:1,B:10};let failNext=false,hold=false,aborts=0;
      (globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{const method=init?.method??'GET',headers=new Headers(init?.headers),auth=(headers.get('authorization')??'').replace('Bearer ',''),path=new URL(String(input)).pathname,record={method,auth,path,aborted:false};requests.push(record);return new Promise<Response>((resolve,reject)=>{const signal=init?.signal,onAbort=()=>{record.aborted=true;aborts++;reject(new DOMException('Aborted','AbortError'));};if(signal?.aborted)return onAbort();signal?.addEventListener('abort',onAbort,{once:true});const finish=()=>{signal?.removeEventListener('abort',onAbort);if(method==='POST'){if(failNext){failNext=false;resolve(new Response('failed',{status:500}));return;}counts[auth]=(counts[auth]??0)+Number(init?.body??0);}resolve(new Response(JSON.stringify({count:counts[auth]??-1}),{headers:{'content-type':'application/json'}}));};if(!hold)queueMicrotask(finish);});};
      const api=await import(runtimeUrl),view=await import(rootUrl),wait=async(predicate:()=>boolean)=>{for(let attempt=0;attempt<100;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out');};
      const restoreA=api.configureHttpApplication({functions:{token:()=> 'A'}}),hostA=document.createElement('main');document.body.append(hostA);const disposeA=view.default(hostA,api);await wait(()=>[...hostA.querySelectorAll('p')].every(node=>node.textContent==='1'));
      const initialGets=requests.filter(item=>item.method==='GET'&&item.auth==='A'&&item.path==='/item').length,sectionsA=()=>[...hostA.querySelectorAll('section')];
      failNext=true;(sectionsA()[0].querySelector('button') as HTMLButtonElement).click();const optimistic=[...hostA.querySelectorAll('p')].map(node=>node.textContent);await wait(()=>[...hostA.querySelectorAll('p')].every(node=>node.textContent==='1'));
      (sectionsA()[0].querySelector('button') as HTMLButtonElement).click();await wait(()=>[...hostA.querySelectorAll('p')].every(node=>node.textContent==='2'));
      (hostA.querySelector('button') as HTMLButtonElement).click();await wait(()=>hostA.querySelectorAll('section').length===1);const afterUnmount=hostA.querySelector('p')?.textContent;
      restoreA();const restoreB=api.configureHttpApplication({functions:{token:()=> 'B'}}),hostB=document.createElement('main');document.body.append(hostB);const disposeB=view.default(hostB,api);await wait(()=>[...hostB.querySelectorAll('p')].every(node=>node.textContent==='10'));
      const isolated={a:hostA.querySelector('p')?.textContent,b:[...hostB.querySelectorAll('p')].map(node=>node.textContent),auths:[...new Set(requests.map(item=>item.auth))].sort()};
      restoreB();const beforeSameAuth=requests.filter(item=>item.method==='GET'&&item.auth==='A'&&item.path==='/item').length,restoreC=api.configureHttpApplication({functions:{token:()=> 'A'}}),hostC=document.createElement('main');document.body.append(hostC),disposeC=view.default(hostC,api);await wait(()=>[...hostC.querySelectorAll('p')].every(node=>node.textContent==='2'));const sameAuthIsolated=requests.filter(item=>item.method==='GET'&&item.auth==='A'&&item.path==='/item').length===beforeSameAuth+1;disposeC();restoreC();
      hold=true;const beforePending=requests.length;(sectionsA()[0].querySelectorAll('button')[1] as HTMLButtonElement).click();await wait(()=>requests.length>beforePending);disposeA();await new Promise(resolve=>setTimeout(resolve,0));const afterDispose=hostA.textContent;disposeB();restoreB();
      urls.forEach(URL.revokeObjectURL);return {initialGets,optimistic,rolledBack:counts.A===2,afterUnmount,isolated,sameAuthIsolated,aborts,afterDispose};
    },{runtime,serviceCode:service.code,consumerCode:consumer.code,rootCode:root.code});
    assert.deepEqual(result,{initialGets:1,optimistic:['2','2'],rolledBack:true,afterUnmount:'2',isolated:{a:'2',b:['10','10'],auths:['A','B']},sameAuthIsolated:true,aborts:1,afterDispose:''});
  }finally{await browser.close();}
});
