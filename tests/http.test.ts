import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';
import {createHttp,HttpError} from '../runtime/http.js';

test('HTTP client applies auth and interceptors and validates typed responses',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const api=createHttp({fetch:async(input,init)=>{calls.push({url:String(input),init:init!});return new Response(JSON.stringify({data:{id:7,name:'Tea'}}),{headers:{'content-type':'application/json'}});},clients:{api:{base:'https://api.example.test/v1/',auth:async()=> 'secret',request:[request=>{request.headers.set('x-trace','trace-1');}],response:[value=>(value as {data:unknown}).data]}}});
  const value=await api.get('products',{client:'api',params:{active:true},response:{fields:{id:'number',name:'string'}}});
  assert.deepEqual({...value as object},{id:7,name:'Tea'});assert.equal(calls[0].url,'https://api.example.test/v1/products?active=true');
  const headers=calls[0].init.headers as Headers;assert.equal(headers.get('authorization'),'Bearer secret');assert.equal(headers.get('x-trace'),'trace-1');assert.equal(calls[0].init.credentials,'same-origin');assert.equal(calls[0].init.redirect,'error');
});

test('HTTP client rejects unsafe auth, cross-origin escape, invalid records and HTTP failures',async()=>{
  const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  await assert.rejects(()=>createHttp({fetch:async()=>response({ok:true}),clients:{api:{base:'http://example.test/',auth:()=> 'token'}}}).get('/x',{client:'api'}),/requires HTTPS/);
  await assert.rejects(()=>createHttp({fetch:async()=>response({id:1}),clients:{api:{base:'https://api.example.test/'}}}).get('https://evil.test/x',{client:'api'}),/cannot escape/);
  await assert.rejects(()=>createHttp({fetch:async()=>response({id:1,extra:true})}).get('/x',{response:{fields:{id:'number'}}}),/Unknown field extra/);
  await assert.rejects(()=>createHttp({fetch:async()=>response({},503)}).get('/x'),(error:unknown)=>error instanceof HttpError&&error.status===503);
});

test('compiler accepts approved Stage 1 client/query syntax and reports typed errors',()=>{
  const source=`class Product:
    id = 0
    name = ""
component Catalog:
    http client api:
        base "https://api.example.test/v1/"
        auth bearer getToken
        interceptor addTrace
        interceptor response unwrap
        interceptor error reportError
    client api
    query products:
        get "products"
        param active = true
        header "X-Mode" = "full"
        response list[Product]
    if products.loading:
        p text="Loading"
    else:
        if products.success:
            p text=str(len(products.data))
        else:
            p text=products.error`;
  const result=compile(source,'Catalog.qb');assert.equal(result.ast.queries[0].responseList,true);assert.match(result.code,/"httpClients"/);assert.match(result.code,/"queries"/);
  assert.throws(()=>compile(source.replace('response list[Product]','response list[Missing]'),'Catalog.qb'),(error:unknown)=>error instanceof CompileError&&/Unknown response type/.test(error.message)&&error.diagnostic.line===16);
  assert.throws(()=>compile(source.replace('get "products"','get "products"\n        body true'),'Catalog.qb'),/GET queries cannot declare a body/);
});

test('reactive query resources render typed data and ignore completion after disposal in Firefox',async()=>{
  const compiled=compile(`class Product:
    id = 0
    name = ""
component Catalog:
    query products:
        get "https://api.example.test/products"
        response list[Product]
    if products.loading:
        p text="Loading"
    else:
        if products.success:
            for product in products.data key=product.id:
                p text=product.name
        else:
            p text=products.error`);
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,component})=>{const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),componentUrl=URL.createObjectURL(new Blob([component],{type:'text/javascript'}));try{const original=globalThis.fetch;let resolveFetch:((value:Response)=>void)|undefined;(globalThis as any).fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});const api=await import(runtimeUrl),view=await import(componentUrl),host=document.createElement('main'),dispose=view.default(host,api);const initial=host.textContent;for(let attempt=0;!resolveFetch&&attempt<20;attempt++)await new Promise(resolve=>setTimeout(resolve,0));resolveFetch!(new Response(JSON.stringify([{id:1,name:'Tea'}]),{headers:{'content-type':'application/json'}}));await new Promise(resolve=>setTimeout(resolve,50));const loaded=host.textContent;dispose();const detached=host.textContent;(globalThis as any).fetch=original;return {initial,loaded,detached};}finally{URL.revokeObjectURL(componentUrl);URL.revokeObjectURL(runtimeUrl);}},{runtime,component:compiled.code});assert.deepEqual(result,{initial:'Loading',loaded:'Tea',detached:''});}
  finally{await browser.close();}
});
