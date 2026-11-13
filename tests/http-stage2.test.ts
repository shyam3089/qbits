import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const dependencySource=`class Account:
    id = 0
component Dependencies:
    query details:
        get "https://api.test/details"
        param userId = account.data.id
        response string
    query account:
        get "https://api.test/account"
        response Account
    p text="ok"`;

test('Stage 2 syntax infers forward dependencies, emits timing policy, and rejects cycles and unsafe replay',()=>{
  const compiled=compile(dependencySource.replace('response string','response string\n        debounce 300ms\n        timeout 10s\n        retry 2\n        cache 60s\n        refresh on-focus\n        poll 30s'));
  assert.deepEqual(compiled.ast.queries[0].dependencies.map(item=>item.value),['account']);
  assert.deepEqual({debounce:compiled.ast.queries[0].debounce?.value,timeout:compiled.ast.queries[0].timeout?.value,retry:compiled.ast.queries[0].retry?.value,cache:compiled.ast.queries[0].cache?.value,poll:compiled.ast.queries[0].poll?.value,focus:compiled.ast.queries[0].refreshOnFocus},{debounce:300,timeout:10_000,retry:2,cache:60_000,poll:30_000,focus:true});
  assert.match(compiled.code,/"dependencies":\["account"\]/);
  const cycle=`component Cycle:
    query first:
        get "https://api.test/first"
        param value = second.data
        response number
    query second:
        get "https://api.test/second"
        param value = first.data
        response number
    p text="cycle"`;
  assert.throws(()=>compile(cycle,'Cycle.qb'),(error:unknown)=>error instanceof CompileError&&error.diagnostic.line===2&&/Query dependency cycle/.test(error.message));
  assert.throws(()=>compile(`component Unsafe:
    query save:
        post "https://api.test/save"
        response string
        retry 1
    p text="unsafe"`),/supported only for safe GET queries/);
  assert.throws(()=>compile(`component Invalid:
    query item:
        get "https://api.test/item"
        response string
        timeout 0ms
    p text="invalid"`),/between 1ms/);
});

test('Stage 2 scheduling, retry, deduplication, cache isolation, polling, and cleanup work in Firefox',async()=>{
  const sources={
    dependencies:compile(dependencySource.replace('    p text="ok"',`    query independent:
        get "https://api.test/independent"
        response string
    if details.success:
        p text=details.data
    else:
        p text="waiting"`)).code,
    debounce:compile(`component Debounce:
    term = ""
    query search:
        get "https://api.test/search"
        param q = term
        response string
        debounce 30ms
    button text="change":
        on click:
            term = term + "x"
    if search.success:
        p text=search.data
    else:
        p text="waiting"`).code,
    reliability:compile(`component Reliability:
    query flaky:
        get "https://api.test/flaky"
        response string
        retry 2
        timeout 1s
    query slow:
        get "https://api.test/slow"
        response string
        timeout 30ms
    if flaky.success:
        p text=flaky.data
    else:
        p text="retrying"
    if slow.loading:
        p text="slow"
    else:
        p text=slow.error`).code,
    shared:compile(`component Shared:
    query item:
        get "https://api.test/shared"
        response string
    if item.success:
        p text=item.data
    else:
        p text="loading"`).code,
    cached:compile(`component Cached:
    http client api:
        base "https://api.test/"
        auth bearer getToken
    client api
    query profile:
        get "profile"
        response string
        cache 30ms
    if profile.success:
        p text=profile.data + ":" + str(profile.refreshing)
    else:
        p text="loading"`).code,
    polling:compile(`component Polling:
    query ticks:
        get "https://api.test/ticks"
        response number
        poll 25ms
        refresh on-focus
    button text="refresh":
        on click:
            ticks.refresh()
    if ticks.success:
        p text=str(ticks.data)
    else:
        p text="loading"`).code,
    disposedDebounce:compile(`component DisposedDebounce:
    value = ""
    query result:
        get "https://api.test/disposed-debounce"
        param value = value
        response string
        debounce 40ms
    p text="waiting"`).code,
  };
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});const result=await page.evaluate(async({runtime,sources})=>{
    const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),componentUrls:string[]=[];
    let stage='unknown';const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)),waitFor=async(check:()=>boolean,timeout=2000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error(`Timed out waiting for HTTP state: ${stage}`);await wait(5);}};
    const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
    try{const api=await import(runtimeUrl),modules:Record<string,any>={};for(const [name,code] of Object.entries(sources)){const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));componentUrls.push(url);modules[name]=await import(url);}const original=globalThis.fetch;
      let accountResolve!:(response:Response)=>void,independentResolve!:(response:Response)=>void;const dependencyCalls:string[]=[];(globalThis as any).fetch=(input:RequestInfo|URL)=>{const url=String(input);dependencyCalls.push(url);if(url.includes('/account'))return new Promise(resolve=>{accountResolve=resolve;});if(url.includes('/independent'))return new Promise(resolve=>{independentResolve=resolve;});if(url.includes('/details'))return Promise.resolve(json('details'));throw new Error(url);};const dependencyHost=document.createElement('main'),dependencyDispose=modules.dependencies.default(dependencyHost,api);await waitFor(()=>dependencyCalls.length===2);const blocked=!dependencyCalls.some(value=>value.includes('/details'));accountResolve(json({id:7}));await waitFor(()=>dependencyCalls.some(value=>value.includes('/details')));independentResolve(json('independent'));await waitFor(()=>dependencyHost.textContent==='details');dependencyDispose();
      const debounceCalls:string[]=[];(globalThis as any).fetch=(input:RequestInfo|URL)=>{debounceCalls.push(String(input));return Promise.resolve(json(new URL(String(input)).searchParams.get('q')));};const debounceHost=document.createElement('main'),debounceDispose=modules.debounce.default(debounceHost,api),debounceButton=debounceHost.querySelector('button')!;debounceButton.click();debounceButton.click();await waitFor(()=>debounceHost.textContent?.includes('xx')??false);debounceDispose();
      let flakyCalls=0,slowAborted=false;(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);if(url.includes('/flaky')){flakyCalls++;return Promise.resolve(flakyCalls<3?json({},503,{'retry-after':'0'}):json('recovered'));}return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>{slowAborted=true;reject(new DOMException('aborted','AbortError'));},{once:true}));};const reliabilityHost=document.createElement('main'),reliabilityDispose=modules.reliability.default(reliabilityHost,api);await waitFor(()=>reliabilityHost.textContent?.includes('recovered')??false,3000);await waitFor(()=>reliabilityHost.textContent?.includes('timed out')??false);reliabilityDispose();
      let sharedCalls=0,sharedAborts=0,sharedResolve!:(response:Response)=>void;(globalThis as any).fetch=(_input:RequestInfo|URL,init?:RequestInit)=>{sharedCalls++;init?.signal?.addEventListener('abort',()=>sharedAborts++,{once:true});return new Promise(resolve=>{sharedResolve=resolve;});};const sharedA=document.createElement('main'),sharedB=document.createElement('main'),disposeA=modules.shared.default(sharedA,api),disposeB=modules.shared.default(sharedB,api);await waitFor(()=>sharedCalls===1);disposeA();sharedResolve(json('shared'));await waitFor(()=>sharedB.textContent==='shared');disposeB();
      let token='A',profileCalls=0,profileResolve:((response:Response)=>void)|undefined;const restore=api.configureHttpApplication({functions:{getToken:()=>token}});(globalThis as any).fetch=(_input:RequestInfo|URL,init?:RequestInit)=>{profileCalls++;const auth=new Headers(init?.headers).get('authorization');if(profileCalls<=2)return Promise.resolve(json(`${auth?.endsWith('A')?'A':'B'}1`));return new Promise(resolve=>{profileResolve=resolve;});};const cacheA=document.createElement('main'),disposeCacheA=modules.cached.default(cacheA,api);await waitFor(()=>cacheA.textContent==='A1:false');disposeCacheA();const cacheA2=document.createElement('main'),disposeCacheA2=modules.cached.default(cacheA2,api);await waitFor(()=>cacheA2.textContent==='A1:false');disposeCacheA2();const afterFresh=profileCalls;token='B';const cacheB=document.createElement('main'),disposeCacheB=modules.cached.default(cacheB,api);await waitFor(()=>cacheB.textContent==='B1:false');disposeCacheB();await wait(40);token='A';const stale=document.createElement('main'),disposeStale=modules.cached.default(stale,api);await waitFor(()=>stale.textContent==='A1:true');profileResolve!(json('A2'));await waitFor(()=>stale.textContent==='A2:false');disposeStale();restore();
      let pollCalls=0,pollActive=0,pollMax=0;(globalThis as any).fetch=async()=>{pollCalls++;pollActive++;pollMax=Math.max(pollMax,pollActive);await wait(10);pollActive--;return json(pollCalls);};const pollHost=document.createElement('main'),pollDispose=modules.polling.default(pollHost,api);await waitFor(()=>pollCalls>=2);const beforeFocus=pollCalls;globalThis.dispatchEvent(new Event('focus'));await waitFor(()=>pollCalls>beforeFocus);const beforeDouble=pollCalls;const refresh=pollHost.querySelector('button')!;refresh.click();refresh.click();await waitFor(()=>pollCalls>beforeDouble);pollDispose();const afterDispose=pollCalls;globalThis.dispatchEvent(new Event('focus'));await wait(70);
      let disposedDebounceCalls=0;(globalThis as any).fetch=()=>{disposedDebounceCalls++;return Promise.resolve(json('bad'));};const disposedHost=document.createElement('main'),disposedHandle=modules.disposedDebounce.default(disposedHost,api);disposedHandle();await wait(70);
      (globalThis as any).fetch=original;return {dependency:{blocked,calls:dependencyCalls.map(value=>new URL(value).pathname)},debounce:debounceCalls.map(value=>new URL(value).searchParams.get('q')),reliability:{flakyCalls,slowAborted,text:reliabilityHost.textContent},shared:{sharedCalls,sharedAborts,text:sharedB.textContent},cache:{afterFresh,profileCalls,stale:stale.textContent},poll:{beforeFocus,afterDispose,final:pollCalls,max:pollMax},disposedDebounceCalls};
    }finally{componentUrls.forEach(URL.revokeObjectURL);URL.revokeObjectURL(runtimeUrl);}
  },{runtime,sources});
  assert.equal(result.dependency.blocked,true);assert.deepEqual(new Set(result.dependency.calls),new Set(['/account','/independent','/details']));
  assert.deepEqual(result.debounce,['xx']);assert.deepEqual(result.reliability,{flakyCalls:3,slowAborted:true,text:''});
  assert.deepEqual(result.shared,{sharedCalls:1,sharedAborts:0,text:''});assert.equal(result.cache.afterFresh,1);assert.equal(result.cache.profileCalls,3);assert.equal(result.cache.stale,'');
  assert.equal(result.poll.final,result.poll.afterDispose);assert.equal(result.poll.max,1);assert.equal(result.disposedDebounceCalls,0);
  }finally{await browser.close();}
});

test('failed dependencies suppress downstream work and obsolete input responses cannot commit',async()=>{
  const failed=compile(`component FailedDependency:
    query downstream:
        get "https://api.test/downstream"
        param id = upstream.data
        response string
    query upstream:
        get "https://api.test/upstream"
        response number
    if downstream.loading:
        p text="waiting"
    else:
        p text=downstream.error`).code;
  const stale=compile(`component Stale:
    value = "a"
    query result:
        get "https://api.test/stale"
        param value = value
        response string
    button text="change":
        on click:
            value = "b"
    if result.success:
        p text=result.data
    else:
        p text="waiting"`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});const result=await page.evaluate(async({runtime,failed,stale})=>{const urls=[runtime,failed,stale].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)),waitFor=async(check:()=>boolean)=>{const end=Date.now()+2000;while(!check()){if(Date.now()>end)throw new Error('HTTP consistency timeout');await wait(5);}},json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});try{const api=await import(urls[0]),failedModule=await import(urls[1]),staleModule=await import(urls[2]);let upstreamCalls=0,downstreamCalls=0;(globalThis as any).fetch=(input:RequestInfo|URL)=>{const path=new URL(String(input)).pathname;if(path==='/upstream'){upstreamCalls++;return Promise.resolve(json({},503));}downstreamCalls++;return Promise.resolve(json('forbidden'));};const failedHost=document.createElement('main'),disposeFailed=failedModule.default(failedHost,api);await waitFor(()=>failedHost.textContent?.includes('Dependency "upstream" failed')??false);const dependencyError=failedHost.textContent;disposeFailed();const calls:string[]=[],resolvers:((response:Response)=>void)[]=[],aborts:number[]=[];(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(new URL(String(input)).searchParams.get('value')!);const index=calls.length-1;aborts[index]=0;init?.signal?.addEventListener('abort',()=>aborts[index]++,{once:true});return new Promise(resolve=>resolvers[index]=resolve);};const staleHost=document.createElement('main'),disposeStale=staleModule.default(staleHost,api);await waitFor(()=>calls.length===1);staleHost.querySelector('button')!.click();await waitFor(()=>calls.length===2);resolvers[1](json('new'));await waitFor(()=>staleHost.textContent?.includes('new')??false);resolvers[0](json('old'));await wait(30);const staleText=staleHost.textContent;disposeStale();return {upstreamCalls,downstreamCalls,dependencyError,calls,aborts,staleText};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,failed,stale});assert.equal(result.upstreamCalls,1);assert.equal(result.downstreamCalls,0);assert.match(result.dependencyError,/Dependency "upstream" failed/);assert.deepEqual(result.calls,['a','b']);assert.equal(result.aborts[0],1);assert.equal(result.staleText,'changenew');}
  finally{await browser.close();}
});
