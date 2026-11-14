import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import type {Duplex} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const socketSource=`component Alerts:
    state last = ""
    state disconnected = 0
    socket alerts:
        connect "/alerts"
        on message(data):
            last = data
        on disconnect:
            disconnected = disconnected + 1
            reconnect 3s
    button text="Send":
        on click:
            alerts.send("hello")
    button text="Close":
        on click:
            alerts.close()
    p text=alerts.state + ":" + str(alerts.connected) + ":" + last`;

test('Stage 4B syntax emits typed socket models and source-located diagnostics',()=>{
  const result=compile(socketSource,'Alerts.qb'),socket=result.ast.sockets[0];assert.equal(socket.name.value,'alerts');assert.equal(socket.message?.parameter.value,'data');assert.equal(socket.disconnect?.reconnect?.value,3000);assert.match(result.code,/"sockets"/);
  const invalid=(source:string,pattern:RegExp)=>assert.throws(()=>compile(source,'BadSocket.qb'),(error:unknown)=>error instanceof CompileError&&pattern.test(error.message)&&error.diagnostic.line>0&&error.diagnostic.column>0);
  invalid(socketSource.replace('        connect "/alerts"\n',''),/requires connect/);
  invalid(socketSource.replace('on message(data):','on message:'),/Expected/);
  invalid(socketSource.replace('reconnect 3s','reconnect 31s'),/between 1ms and 30s/);
  invalid(socketSource.replace('alerts.send("hello")','alerts.send(1)'),/requires a string/);
  invalid(socketSource.replace('alerts.state','alerts.missing'),/Unknown socket member/);
  invalid(socketSource.replace('alerts.close()','alerts.close("bad")'),/does not accept arguments/);
});

interface Peer {socket:Duplex;messages:string[];closeCodes:number[];send:(value:string,opcode?:number)=>void;destroy:()=>void}
const rawFrame=(payload:Buffer,opcode=1):Buffer=>{let head:Buffer;if(payload.length<126)head=Buffer.from([0x80|opcode,payload.length]);else if(payload.length<=65_535)head=Buffer.from([0x80|opcode,126,payload.length>>8,payload.length&255]);else{head=Buffer.alloc(10);head[0]=0x80|opcode;head[1]=127;head.writeBigUInt64BE(BigInt(payload.length),2);}return Buffer.concat([head,payload]);};
const frame=(value:string,opcode=1):Buffer=>rawFrame(Buffer.from(value),opcode);
const attachPeer=(socket:Duplex):Peer=>{
  const peer:Peer={socket,messages:[],closeCodes:[],send:(value,opcode=1)=>socket.write(frame(value,opcode)),destroy:()=>socket.destroy()};let buffered=Buffer.alloc(0);
  socket.on('data',chunk=>{buffered=Buffer.concat([buffered,Buffer.from(chunk)]);while(buffered.length>=2){const opcode=buffered[0]&15,masked=Boolean(buffered[1]&128);let length=buffered[1]&127,offset=2;if(length===126){if(buffered.length<4)return;length=buffered.readUInt16BE(2);offset=4;}else if(length===127){if(buffered.length<10)return;const wide=buffered.readBigUInt64BE(2);if(wide>BigInt(Number.MAX_SAFE_INTEGER))return;length=Number(wide);offset=10;}const maskBytes=masked?4:0;if(buffered.length<offset+maskBytes+length)return;const mask=masked?buffered.subarray(offset,offset+4):undefined;offset+=maskBytes;const payload=Buffer.from(buffered.subarray(offset,offset+length));if(mask)for(let index=0;index<payload.length;index++)payload[index]^=mask[index%4];buffered=buffered.subarray(offset+length);if(opcode===1)peer.messages.push(payload.toString());else if(opcode===8){const code=payload.length>=2?payload.readUInt16BE(0):1005;peer.closeCodes.push(code);socket.write(rawFrame(payload,8));socket.end();}}});return peer;
};
const waitFor=async(check:()=>boolean,timeout=4000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error('WebSocket test timeout');await new Promise(resolve=>setTimeout(resolve,10));}};

test('Stage 4B connects, sends, reconnects, rejects binary data, secures URLs and cleans up in Firefox',async()=>{
  const peers:Peer[]=[],upgrades:{url:string;authorization:string|undefined}[]=[];
  const server=createServer((request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html>');});
  server.on('upgrade',(request,socket)=>{const key=request.headers['sec-websocket-key'];if(!key){socket.destroy();return;}upgrades.push({url:request.url??'',authorization:request.headers.authorization});const accept=createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);peers.push(attachPeer(socket));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  const source=socketSource.replace('    socket alerts:',`    http client api:\n        base "${origin}/api/"\n        auth bearer getToken\n    client api\n    socket alerts:`).replace('connect "/alerts"','connect "alerts"').replace('reconnect 3s','reconnect 10ms'),component=compile(source,'SocketE2E.qb').code;
  const oversized=compile(`component Oversized:\n    socket test:\n        connect "/alerts"\n    on init:\n        test.send("${'x'.repeat(65_537)}")\n    p text=test.state`,'Oversized.qb').code,queued=compile(`component Queued:\n    socket test:\n        connect "/alerts"\n    on init:\n${'        test.send("x")\n'.repeat(101)}    p text=test.state`,'Queued.qb').code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});
    await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(value=>URL.createObjectURL(new Blob([value],{type:'text/javascript'}))),api=await import(urls[0]),view=await import(urls[1]);let authCalls=0;const restore=api.configureHttpApplication({functions:{getToken:()=>{authCalls++;return 'secret';}}}),host=document.createElement('main');document.body.append(host);const dispose=view.default(host,api);Object.assign(globalThis,{__socketTest:{urls,api,view,host,dispose,restore,getAuthCalls:()=>authCalls}});},{runtime,component});
    await waitFor(()=>peers.length===1);assert.equal(upgrades[0].url,'/api/alerts');assert.equal(upgrades[0].authorization,undefined);assert.equal(await page.evaluate(()=>(globalThis as any).__socketTest.getAuthCalls()),0);
    peers[0].send('first');await page.getByText('open:true:first',{exact:true}).waitFor();await page.getByRole('button',{name:'Send'}).click();await waitFor(()=>peers[0].messages.includes('hello'));
    peers[0].destroy();await waitFor(()=>peers.length===2);assert.equal(peers.length,2);peers[1].send('second');await page.getByText('open:true:second',{exact:true}).waitFor();
    peers[1].send('binary',2);await waitFor(()=>peers.length===3);assert.equal(peers[1].closeCodes.includes(4003),true);assert.equal(peers.length,3);
    peers[2].send('x'.repeat(1_048_577));await waitFor(()=>peers.length===4);assert.equal(peers[2].closeCodes.includes(4009),true);
    await page.evaluate(()=>(globalThis as any).__socketTest.dispose());await waitFor(()=>peers[3].closeCodes.includes(1000));await new Promise(resolve=>setTimeout(resolve,80));assert.equal(peers.length,4);assert.equal(await page.evaluate(()=>(globalThis as any).__socketTest.host.textContent),'');assert.deepEqual(errors,[]);
    await page.evaluate(()=>{const state=(globalThis as any).__socketTest,host=document.createElement('main');document.body.append(host);state.host2=host;state.dispose2=state.view.default(host,state.api);});await waitFor(()=>peers.length===5);await page.locator('main').last().getByRole('button',{name:'Close'}).click();await waitFor(()=>peers[4].closeCodes.includes(1000));await new Promise(resolve=>setTimeout(resolve,80));assert.equal(peers.length,5);await page.evaluate(()=>(globalThis as any).__socketTest.dispose2());
    const security=compile(`component Unsafe:\n    socket bad:\n        connect "ws://evil.example/socket"\n    p text=bad.state`,'Unsafe.qb').code;
    const securityError=await page.evaluate(async code=>{const state=(globalThis as any).__socketTest,url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));try{const module=await import(url),host=document.createElement('aside');try{module.default(host,state.api);return '';}catch(error){return (error as Error).message;}}finally{URL.revokeObjectURL(url);}},security);assert.match(securityError,/cannot escape the configured origin/);
    const limits=await page.evaluate(async({oversized,queued})=>{const api=(globalThis as any).__socketTest.api,run=async(code:string)=>{const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));try{const module=await import(url),host=document.createElement('aside');try{module.default(host,api);return '';}catch(error){return (error as Error).message;}}finally{URL.revokeObjectURL(url);}};return {oversized:await run(oversized),queued:await run(queued)};},{oversized,queued});assert.match(limits.oversized,/outbound message exceeds 65536 bytes/);assert.match(limits.queued,/outbound queue limit exceeded/);
    await page.evaluate(()=>{const state=(globalThis as any).__socketTest;state.restore();state.urls.forEach(URL.revokeObjectURL);});
  }finally{for(const peer of peers)peer.destroy();await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
