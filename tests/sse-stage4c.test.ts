import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const sseSource=`component Notifications:
    state last = ""
    state disconnected = 0
    sse notifications:
        connect "/notifications"
        on message(data):
            last = data
        on disconnect:
            disconnected = disconnected + 1
            reconnect 3s
    button text="Close":
        on click:
            notifications.close()
    p text=notifications.state + ":" + str(notifications.connected) + ":" + str(notifications.connecting) + ":" + str(disconnected) + ":" + last + ":" + notifications.error`;

test('Stage 4C syntax emits typed SSE models and source-located diagnostics',()=>{
  const result=compile(sseSource,'Notifications.qb'),stream=result.ast.sse[0];assert.equal(stream.name.value,'notifications');assert.equal(stream.message?.parameter.value,'data');assert.equal(stream.disconnect?.reconnect?.value,3000);assert.match(result.code,/"sse"/);
  const invalid=(source:string,pattern:RegExp)=>assert.throws(()=>compile(source,'BadSse.qb'),(error:unknown)=>error instanceof CompileError&&pattern.test(error.message)&&error.diagnostic.line>0&&error.diagnostic.column>0);
  invalid(sseSource.replace('        connect "/notifications"\n',''),/requires connect/);
  invalid(sseSource.replace('on message(data):','on message:'),/Expected/);
  invalid(sseSource.replace('reconnect 3s','reconnect 31s'),/between 1ms and 30s/);
  invalid(sseSource.replace('notifications.close()','notifications.send("bad")'),/supports only close/);
  invalid(sseSource.replace('notifications.close()','notifications.close("bad")'),/supports only close/);
  invalid(sseSource.replace('connect "/notifications"','connect "ws://example.test/events"'),/unsupported protocol/);
  invalid(sseSource.replace('notifications.state','notifications.missing'),/Unknown SSE member/);
});

interface Stream {request:IncomingMessage;response:ServerResponse;closed:boolean}
const waitFor=async(check:()=>boolean,timeout=5000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error('SSE test timeout');await new Promise(resolve=>setTimeout(resolve,10));}};
const send=(stream:Stream,data:string)=>stream.response.write(`data: ${data}\n\n`);

test('Stage 4C streams, reconnects, limits retries, secures authentication and cleans up in Firefox',async()=>{
  const streams:Stream[]=[],limitRequests:{authorization:string|undefined;url:string}[]=[],requests:{authorization:string|undefined;cookie:string|undefined;url:string}[]=[];
  const server=createServer((request,response)=>{
    const path=new URL(request.url??'/',`http://${request.headers.host}`).pathname;
    if(path==='/'){response.setHeader('content-type','text/html');response.end('<!doctype html>');return;}
    if(path==='/api/notifications'){
      requests.push({authorization:request.headers.authorization,cookie:request.headers.cookie,url:request.url??''});response.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','connection':'keep-alive'});response.flushHeaders();const stream:Stream={request,response,closed:false};streams.push(stream);request.on('close',()=>{stream.closed=true;});return;
    }
    if(path==='/limit'){
      limitRequests.push({authorization:request.headers.authorization,url:request.url??''});response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});response.flushHeaders();setTimeout(()=>response.destroy(),1);return;
    }
    response.statusCode=404;response.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  const source=sseSource.replace('    sse notifications:',`    http client api:\n        base "${origin}/api/"\n        auth bearer getToken\n        interceptor addTrace\n    client api\n    sse notifications:`).replace('connect "/notifications"','connect "notifications"').replace('reconnect 3s','reconnect 10ms'),component=compile(source,'SseE2E.qb').code;
  const limitComponent=compile(`component RetryLimit:\n    sse events:\n        connect "/limit"\n        on disconnect:\n            reconnect 1ms\n    p text=events.state + ":" + events.error`,'RetryLimit.qb').code,runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.addScriptTag({content:'globalThis.__name=(value)=>value;document.cookie="session=stage4c; SameSite=Lax";'});
    await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(value=>URL.createObjectURL(new Blob([value],{type:'text/javascript'}))),api=await import(urls[0]),view=await import(urls[1]);let authCalls=0,interceptorCalls=0;const restore=api.configureHttpApplication({functions:{getToken:()=>{authCalls++;return 'secret';},addTrace:()=>{interceptorCalls++;}}}),host=document.createElement('main');document.body.append(host);const dispose=view.default(host,api);Object.assign(globalThis,{__sseTest:{urls,api,view,host,dispose,restore,getCalls:()=>({authCalls,interceptorCalls})}});},{runtime,component});
    await waitFor(()=>streams.length===1);assert.equal(requests[0].url,'/api/notifications');assert.equal(requests[0].authorization,undefined);assert.match(requests[0].cookie??'',/session=stage4c/);assert.deepEqual(await page.evaluate(()=>(globalThis as any).__sseTest.getCalls()),{authCalls:0,interceptorCalls:0});
    send(streams[0],'café 😀');await page.getByText(/open:true:false:0:café 😀:/).waitFor();streams[0].response.write('malformed-field\n\n');await page.waitForTimeout(50);assert.match(await page.locator('main').last().textContent()??'',/café 😀/);
    streams[0].response.destroy();await waitFor(()=>streams.length===2);assert.equal(streams.length,2);send(streams[1],'second');await page.getByText(/open:true:false:1:second:/).waitFor();
    send(streams[1],'x'.repeat(1_048_577));await waitFor(()=>streams.length===3);assert.equal(streams[1].closed,true);send(streams[2],'after-limit');await page.getByText(/open:true:false:2:after-limit:/).waitFor();
    await page.getByRole('button',{name:'Close'}).click();await waitFor(()=>streams[2].closed);await page.waitForTimeout(100);assert.equal(streams.length,3);assert.match(await page.locator('main').last().textContent()??'',/^Closeclosed:false:false:2:after-limit:$/);
    await page.evaluate(()=>{const state=(globalThis as any).__sseTest,host=document.createElement('main');document.body.append(host);state.host2=host;state.dispose2=state.view.default(host,state.api);});await waitFor(()=>streams.length===4);await page.evaluate(()=>(globalThis as any).__sseTest.dispose2());await waitFor(()=>streams[3].closed);await page.waitForTimeout(80);assert.equal(streams.length,4);assert.equal(await page.evaluate(()=>(globalThis as any).__sseTest.host2.textContent),'');
    const security=compile(`component Unsafe:\n    sse bad:\n        connect "http://evil.example/events"\n    p text=bad.state`,'UnsafeSse.qb').code,securityError=await page.evaluate(async code=>{const state=(globalThis as any).__sseTest,url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));try{const module=await import(url),host=document.createElement('aside');try{module.default(host,state.api);return '';}catch(error){return (error as Error).message;}}finally{URL.revokeObjectURL(url);}},security);assert.match(securityError,/cannot escape the configured origin/);
    await page.evaluate(async code=>{const state=(globalThis as any).__sseTest,url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),module=await import(url),host=document.createElement('aside');host.id='retry';document.body.append(host);(globalThis as any).__retryUrl=url;(globalThis as any).__retryDispose=module.default(host,state.api);return true;},limitComponent);await waitFor(()=>limitRequests.length===11,6000);await page.locator('#retry').getByText(/reconnect limit of 10 reached/).waitFor();await page.waitForTimeout(150);assert.equal(limitRequests.length,11);assert.equal(limitRequests.some(item=>item.authorization!==undefined),false);
    await page.evaluate(()=>{const state=(globalThis as any).__sseTest;(globalThis as any).__retryDispose();URL.revokeObjectURL((globalThis as any).__retryUrl);state.dispose();state.restore();state.urls.forEach(URL.revokeObjectURL);});assert.deepEqual(errors,[]);
  }finally{for(const stream of streams)stream.response.destroy();await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
