import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const actionSource=`class Cart:
    count = 0
component Actions:
    query cart:
        get "https://api.test/cart"
        response Cart
        cache 60s
    action increment(amount):
        post "https://api.test/cart/increment"
        header "X-Action" = "increment"
        body amount
        response string
        refresh cart
        instant cart:
            count = count + amount
    button text="increment":
        on click:
            increment(1)
    button text="refresh":
        on click:
            cart.refresh()
    if cart.loading:
        p text="waiting"
    else:
        p text=str(cart.data.count)
    p text=str(increment.loading) + ":" + str(increment.success) + ":" + increment.error
    if increment.success:
        p text=increment.data
    else:
        p text="none"`;

test('Stage 3 action and imperative syntax is typed and source-located',()=>{
  const compiled=compile(actionSource,'Actions.qb');assert.equal(compiled.ast.httpActions[0].parameters[0].value,'amount');assert.equal(compiled.ast.httpActions[0].instant[0].resource.value,'cart');assert.match(compiled.code,/"httpActions"/);
  const imperative=compile(`class Result:
    value = ""
component Imperative:
    http client api:
        base "https://api.test/"
    client api
    done = false
    on init:
        result = await http.get("health") response Result
        done = result.value == "ready"
    button text="send":
        on click:
            result = await http.post("events", "body") client api response string
            done = result == "saved"
    p text=str(done)`,'Imperative.qb');assert.equal(imperative.ast.init[0].kind,'awaitHttp');
  assert.equal(imperative.ast.init[0].kind==='awaitHttp'&&imperative.ast.init[0].binding?.value,'result');
  assert.throws(()=>compile(actionSource.replace('        refresh cart\n',''),'Actions.qb'),(error:unknown)=>error instanceof CompileError&&/must also be refreshed/.test(error.message));
  assert.throws(()=>compile(actionSource.replace('count = count + amount','missing = count + amount'),'Actions.qb'),/Unknown instant field/);
  assert.throws(()=>compile(actionSource.replace('post "https:\/\/api.test\/cart\/increment"','get "https://api.test/cart/increment"'),'Actions.qb'),/GET actions cannot declare a body/);
  assert.throws(()=>compile(actionSource.replace('increment(1)','increment("bad")\n            increment(1)'),'Actions.qb'),/Action parameter amount requires string, received number/);
  assert.throws(()=>compile(`component Bad:
    on init:
        await http.get("/x") response Missing
    p text="bad"`,'Bad.qb'),/Unknown response type/);
  assert.throws(()=>compile(`component Bad:
    on init:
        result = await http.get("/x")
    p text="bad"`,'Bad.qb'),/Bound imperative HTTP calls require a response type/);
  assert.throws(()=>compile(`component Bad:
    result = "state"
    on init:
        result = await http.get("/x") response string
    p text=result`,'Bad.qb'),/Result binding "result" conflicts with an existing name/);
  assert.throws(()=>compile(`component Bad:
    value = ""
    on init:
        value = result
        result = await http.get("/x") response string
    p text=value`,'Bad.qb'),/Unknown state or prop "result"/);
  assert.throws(()=>compile(`component Bad:
    value = ""
    button text="load":
        on click:
            result = await http.get("/x") response string
            value = result
    button text="leak":
        on click:
            value = result
    p text=value`,'Bad.qb'),/Unknown state or prop "result"/);
});

test('actions layer overlapping instant updates, rollback independently, refresh shared consumers, and survive owner destruction',async()=>{
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),component=compile(actionSource).code,browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});const result=await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)),waitFor=async(check:()=>boolean)=>{const end=Date.now()+2500;while(!check()){if(Date.now()>end)throw new Error('Stage 3 action timeout');await wait(5);}},json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});try{const api=await import(urls[0]),view=await import(urls[1]);let getCalls=0,postCalls=0;const getResolvers:((value:Response)=>void)[]=[],postResolvers:((value:Response)=>void)[]=[],postSignals:(AbortSignal|null)[]=[];(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{const method=init?.method??'GET';if(method==='GET'){getCalls++;return new Promise(resolve=>getResolvers.push(resolve));}postCalls++;postSignals.push(init?.signal??null);return new Promise(resolve=>postResolvers.push(resolve));};const hostA=document.createElement('main'),hostB=document.createElement('main'),disposeA=view.default(hostA,api),disposeB=view.default(hostB,api);await waitFor(()=>getCalls===1);getResolvers.shift()!(json({count:0}));await waitFor(()=>hostA.querySelectorAll('p')[0]?.textContent==='0'&&hostB.querySelectorAll('p')[0]?.textContent==='0');const increment=hostA.querySelectorAll('button')[0] as HTMLButtonElement;increment.click();increment.click();if(hostA.querySelectorAll('p')[0]?.textContent!=='2')throw new Error('Instant updates were not atomic');await waitFor(()=>postCalls===2);postResolvers[1](json('second'));await waitFor(()=>getCalls===2);getResolvers.shift()!(json({count:1}));await waitFor(()=>hostB.querySelectorAll('p')[0]?.textContent==='1');const layeredAfterSuccess=hostA.querySelectorAll('p')[0]?.textContent;postResolvers[0](json({},500));await waitFor(()=>hostA.querySelectorAll('p')[0]?.textContent==='1'&&hostA.querySelectorAll('p')[1]?.textContent==='false:true:');const mixed={count:hostA.querySelectorAll('p')[0]?.textContent,status:hostA.querySelectorAll('p')[1]?.textContent,data:hostA.querySelectorAll('p')[2]?.textContent};increment.click();if(hostA.querySelectorAll('p')[0]?.textContent!=='2')throw new Error('Instant refresh update missing');await waitFor(()=>postCalls===3);postResolvers[2](json('third'));await waitFor(()=>getCalls===3);getResolvers.shift()!(json({},503));await waitFor(()=>hostA.querySelectorAll('p')[1]?.textContent==='false:true:'&&hostA.querySelectorAll('p')[0]?.textContent==='2');const retainedAfterRefreshFailure=hostA.querySelectorAll('p')[0]?.textContent;(hostA.querySelectorAll('button')[1] as HTMLButtonElement).click();await waitFor(()=>getCalls===4);getResolvers.shift()!(json({count:2}));await waitFor(()=>hostA.querySelectorAll('p')[0]?.textContent==='2');increment.click();await waitFor(()=>postCalls===4);const unsafeSignal=postSignals[3];disposeA();postResolvers[3](json('after-dispose'));await waitFor(()=>getCalls===5);getResolvers.shift()!(json({count:3}));await waitFor(()=>hostB.querySelectorAll('p')[0]?.textContent==='3');const survivor=hostB.querySelectorAll('p')[0]?.textContent;disposeB();return {getCalls,postCalls,layeredAfterSuccess,mixed,retainedAfterRefreshFailure,unsafeHadSignal:Boolean(unsafeSignal),survivor,hosts:[hostA.textContent,hostB.textContent]};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.equal(result.layeredAfterSuccess,'2');assert.deepEqual(result.mixed,{count:'1',status:'false:true:',data:'second'});assert.equal(result.retainedAfterRefreshFailure,'2');assert.equal(result.unsafeHadSignal,false);assert.equal(result.survivor,'3');assert.deepEqual(result.hosts,['','']);assert.equal(result.postCalls,4);}
  finally{await browser.close();}
});

test('all action verbs execute only when called and imperative await uses inherited clients and typed responses',async()=>{
  const verbs=compile(`component Verbs:
    action read():
        get "https://api.test/get"
        response string
    action create():
        post "https://api.test/post"
        body "post"
        response string
    action replace():
        put "https://api.test/put"
        body "put"
        response string
    action change():
        patch "https://api.test/patch"
        body "patch"
        response string
    action remove():
        delete "https://api.test/delete"
        body "delete"
        response string
    button text="get":
        on click:
            read()
    button text="post":
        on click:
            create()
    button text="put":
        on click:
            replace()
    button text="patch":
        on click:
            change()
    button text="delete":
        on click:
            remove()
    p text=str(read.success) + str(create.success) + str(replace.success) + str(change.success) + str(remove.success)`).code;
  const imperative=compile(`component Imperative:
    http client api:
        base "https://api.test/"
        auth bearer getToken
    client api
    done = false
    button text="send":
        on click:
            result = await http.post("imperative", "payload") response string
            done = result == "ok"
    p text=str(done)`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});try{const page=await browser.newPage();await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});const result=await page.evaluate(async({runtime,verbs,imperative})=>{const urls=[runtime,verbs,imperative].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)),waitFor=async(check:()=>boolean)=>{const end=Date.now()+2000;while(!check()){if(Date.now()>end)throw new Error('Stage 3 verb timeout');await wait(5);}};try{const api=await import(urls[0]),verbsModule=await import(urls[1]),imperativeModule=await import(urls[2]),calls:{method:string;url:string;body:unknown;auth:string|null}[]=[];(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({method:String(init?.method),url:String(input),body:init?.body,auth:new Headers(init?.headers).get('authorization')});return Promise.resolve(new Response(JSON.stringify('ok'),{headers:{'content-type':'application/json'}}));};const verbsHost=document.createElement('main'),disposeVerbs=verbsModule.default(verbsHost,api);const before=calls.length;for(const button of verbsHost.querySelectorAll('button'))(button as HTMLButtonElement).click();await waitFor(()=>verbsHost.querySelector('p')?.textContent==='truetruetruetruetrue');const methods=calls.map(call=>call.method),restore=api.configureHttpApplication({functions:{getToken:()=> 'token'}}),imperativeHost=document.createElement('main'),disposeImperative=imperativeModule.default(imperativeHost,api);(imperativeHost.querySelector('button') as HTMLButtonElement).click();await waitFor(()=>imperativeHost.querySelector('p')?.textContent==='true');const imperativeCall=calls.at(-1);disposeImperative();restore();disposeVerbs();return {before,methods,imperativeCall};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,verbs,imperative});assert.equal(result.before,0);assert.deepEqual(result.methods.slice(0,5),['GET','POST','PUT','PATCH','DELETE']);assert.equal(result.imperativeCall.method,'POST');assert.equal(result.imperativeCall.url,'https://api.test/imperative');assert.equal(result.imperativeCall.auth,'Bearer token');}
  finally{await browser.close();}
});

test('typed action failures settle reactive status without replay or unhandled rejection',async()=>{
  const component=compile(`component Failure:
    action save():
        post "https://api.test/save"
        body "payload"
        response number
    button text="save":
        on click:
            save()
    p text=str(save.loading) + ":" + str(save.success) + ":" + save.error`).code,runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});const result=await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));try{const api=await import(urls[0]),view=await import(urls[1]);let calls=0;(globalThis as any).fetch=()=>{calls++;return Promise.resolve(new Response(JSON.stringify('wrong'),{headers:{'content-type':'application/json'}}));};const host=document.createElement('main'),dispose=view.default(host,api);(host.querySelector('button') as HTMLButtonElement).click();const end=Date.now()+2000;while(!host.querySelector('p')?.textContent?.includes('response requires number')){if(Date.now()>end)throw new Error('Action failure timeout');await wait(5);}const status=host.querySelector('p')?.textContent;dispose();return {calls,status};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.equal(result.calls,1);assert.equal(result.status,'false:false:response requires number');assert.deepEqual(errors,[]);}finally{await browser.close();}
});

test('component cleanup aborts owned imperative reads without surfacing stale failures',async()=>{
  const component=compile(`component LifecycleHttp:
    on init:
        await http.get("https://api.test/owned") response string
    p text="mounted"`).code,runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');const result=await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),view=await import(urls[1]);let aborted=0;(globalThis as any).fetch=(_input:RequestInfo|URL,init?:RequestInit)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>{aborted++;reject(new DOMException('aborted','AbortError'));},{once:true}));const host=document.createElement('main'),dispose=view.default(host,api);dispose();await new Promise(resolve=>setTimeout(resolve,20));return {aborted,text:host.textContent};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.deepEqual(result,{aborted:1,text:''});assert.deepEqual(errors,[]);}finally{await browser.close();}
});

test('imperative result bindings support every verb, typed records and lists, isolated scope, failures, and cleanup',async()=>{
  const bound=compile(`class Result:
    value = ""
component BoundResults:
    value = "pending"
    count = 0
    on init:
        initial = await http.get("https://api.test/initial") response Result
        value = initial.value
    button text="":
        on click:
            results = await http.get("https://api.test/list") response list[Result]
            count = len(results)
    button text="":
        on click:
            result = await http.post("https://api.test/post", "post") response Result
            value = result.value
    button text="":
        on click:
            result = await http.put("https://api.test/put", "put") response Result
            value = result.value
    button text="":
        on click:
            result = await http.patch("https://api.test/patch", "patch") response Result
            value = result.value
    button text="":
        on click:
            result = await http.delete("https://api.test/delete", "delete") response Result
            value = result.value
    p text=value + ":" + str(count)`).code;
  const cleanup=compile(`class Result:
    value = ""
component BoundCleanup:
    value = "mounted"
    button text="read":
        on click:
            result = await http.get("https://api.test/read") response Result
            value = result.value
    button text="write":
        on click:
            result = await http.post("https://api.test/write", "payload") response Result
            value = result.value
    p text=value`).code;
  const failure=compile(`class Result:
    value = ""
component BoundFailure:
    value = "unchanged"
    button text="":
        on click:
            result = await http.get("https://api.test/fail") response Result
            value = result.value
    p text=value`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});const result=await page.evaluate(async({runtime,bound,cleanup,failure})=>{const urls=[runtime,bound,cleanup,failure].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)),waitFor=async(check:()=>boolean)=>{const end=Date.now()+2500;while(!check()){if(Date.now()>end)throw new Error('Bound result timeout');await wait(5);}},json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});try{const api=await import(urls[0]),boundView=await import(urls[1]),cleanupView=await import(urls[2]),failureView=await import(urls[3]),calls:{method:string;url:string;signal:AbortSignal|null}[]=[];(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input),method=String(init?.method??'GET');calls.push({method,url,signal:init?.signal??null});if(url.endsWith('/initial'))return Promise.resolve(json({value:'initial'}));if(url.endsWith('/list'))return Promise.resolve(json([{value:'a'},{value:'b'}]));if(url.endsWith('/fail'))return Promise.resolve(json({value:7}));return Promise.resolve(json({value:method.toLowerCase()}));};const host=document.createElement('main'),dispose=boundView.default(host,api);await waitFor(()=>host.querySelector('p')?.textContent==='initial:0');for(const button of host.querySelectorAll('button')){(button as HTMLButtonElement).click();await wait(10);}await waitFor(()=>host.querySelector('p')?.textContent==='delete:2');const boundText=host.textContent,methods=calls.slice(0,6).map(call=>call.method),cleanupResolvers:((value:Response)=>void)[]=[];(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({method:String(init?.method??'GET'),url:String(input),signal:init?.signal??null});return new Promise((resolve,reject)=>{cleanupResolvers.push(resolve);init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});});};const safeHost=document.createElement('main'),safeDispose=cleanupView.default(safeHost,api);(safeHost.querySelectorAll('button')[0] as HTMLButtonElement).click();await waitFor(()=>cleanupResolvers.length===1);const safeSignal=calls.at(-1)?.signal;safeDispose();await wait(10);const unsafeHost=document.createElement('main'),unsafeDispose=cleanupView.default(unsafeHost,api);(unsafeHost.querySelectorAll('button')[1] as HTMLButtonElement).click();await waitFor(()=>cleanupResolvers.length===2);const unsafeSignal=calls.at(-1)?.signal;unsafeDispose();cleanupResolvers[1](json({value:'stale'}));await wait(10);(globalThis as any).fetch=()=>Promise.resolve(json({value:7}));const failureHost=document.createElement('main'),failureDispose=failureView.default(failureHost,api);(failureHost.querySelector('button') as HTMLButtonElement).click();await wait(30);const failureText=failureHost.textContent;failureDispose();dispose();return {methods,boundText,safeAborted:safeSignal?.aborted,unsafeHadSignal:Boolean(unsafeSignal),safeText:safeHost.textContent,unsafeText:unsafeHost.textContent,failureText};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,bound,cleanup,failure});assert.deepEqual(result.methods,['GET','GET','POST','PUT','PATCH','DELETE']);assert.equal(result.boundText,'delete:2');assert.equal(result.safeAborted,true);assert.equal(result.unsafeHadSignal,false);assert.equal(result.safeText,'');assert.equal(result.unsafeText,'');assert.equal(result.failureText,'unchanged');assert.ok(errors.some(message=>message.includes('response.value requires string')));}
  finally{await browser.close();}
});
