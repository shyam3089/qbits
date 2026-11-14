import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';

const readBody=(request:IncomingMessage)=>new Promise<Buffer>((resolve,reject)=>{
  const chunks:Buffer[]=[];
  request.on('data',chunk=>chunks.push(Buffer.from(chunk)));
  request.on('end',()=>resolve(Buffer.concat(chunks)));
  request.on('error',reject);
});

test('Stage 4A.2.3 integrates real Firefox files with a local multipart server and transfer lifecycle',async()=>{
  const uploads:{headers:IncomingMessage['headers'];body:Buffer;path:string}[]=[],closed:string[]=[];
  let releaseHeld:(()=>void)|undefined,heldStarted:(()=>void)|undefined;
  const heldRequest=new Promise<void>(resolve=>{heldStarted=resolve;});
  const sendChunks=(response:ServerResponse,total:number,length:boolean,delay=15)=>{
    if(length)response.setHeader('content-length',String(total));
    response.setHeader('content-type','application/octet-stream');
    let sent=0;const timer=setInterval(()=>{if(response.destroyed){clearInterval(timer);return;}const size=Math.min(4,total-sent);response.write(Buffer.alloc(size,65+sent));sent+=size;if(sent===total){clearInterval(timer);response.end();}},delay);
  };
  const server=createServer(async(request,response)=>{
    const path=new URL(request.url??'/',`http://${request.headers.host}`).pathname;
    if(path==='/'){response.setHeader('content-type','text/html');response.end('<!doctype html><main></main>');return;}
    if(request.method==='POST'&&(path==='/upload'||path==='/held')){
      const body=await readBody(request);uploads.push({headers:request.headers,body,path});
      response.on('close',()=>{if(!response.writableEnded)closed.push(path);});
      if(path==='/held'){heldStarted?.();await new Promise<void>(resolve=>{releaseHeld=resolve;});}
      response.setHeader('content-type','application/json');
      response.end(JSON.stringify({data:{name:path.slice(1),size:body.length}}));return;
    }
    if(path==='/download'){sendChunks(response,16,true);return;}
    if(path==='/chunked'){sendChunks(response,12,false);return;}
    if(path==='/large'){response.setHeader('content-length','32');response.end(Buffer.alloc(32));return;}
    if(path==='/slow-a'||path==='/slow-b'){sendChunks(response,24,true,25);return;}
    response.statusCode=path==='/failure'?503:404;response.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
  const component=compile(`class Receipt:
    name = ""
    size = 0
component Transfers:
    state photo = null
    state photos = [] as File
    state eventPhoto = null
    state eventPhotos = [] as File
    http client api:
        base "${origin}/"
        auth bearer getToken
        interceptor addTrace
        interceptor response unwrap
    client api
    action uploadPhoto(file):
        post "upload"
        header "X-Action" = "photo"
        upload "photo" = file
        response Receipt
    action heldUpload(file):
        post "held"
        upload "photo" = file
        response Receipt
    action invoice():
        get "download"
        download "invoice.bin"
    input type="file" bind=photo
    button text="Upload":
        on click:
            uploadPhoto(photo)
    button text="Clear":
        on click:
            photo = null
    button text="Held":
        on click:
            heldUpload(photo)
    button text="Cancel":
        on click:
            heldUpload.cancel()
    input type="file" multiple bind=photos:
        on change:
            eventPhoto = event.file
            eventPhotos = event.files
    button text="Download":
        on click:
            invoice()
    p class="selection" text=str(len(photos)) + ":" + str(len(eventPhotos))
    p class="upload" text=str(uploadPhoto.loading) + ":" + str(uploadPhoto.progress) + ":" + str(uploadPhoto.success) + ":" + uploadPhoto.error
    if uploadPhoto.success:
        p class="result" text=uploadPhoto.data.name + ":" + str(uploadPhoto.data.size)
    p class="held" text=str(heldUpload.loading) + ":" + heldUpload.error
    p class="download" text=str(invoice.loading) + ":" + str(invoice.progress) + ":" + str(invoice.success) + ":" + invoice.error`,'TransferIntegration.qb').code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(origin);await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});
    const mounted=await page.evaluate(async({runtime,component})=>{
      const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),componentUrl=URL.createObjectURL(new Blob([component],{type:'text/javascript'}));
      const api=await import(runtimeUrl),view=await import(componentUrl);let identity=false;const NativeFormData=FormData;
      class IdentityFormData extends NativeFormData {append(name:string,value:string|Blob,filename?:string){const input=document.querySelector('input[type=file]') as HTMLInputElement|null;if(name==='photo'&&value===input?.files?.[0])identity=true;if(filename===undefined)super.append(name,value);else super.append(name,value as Blob,filename);}}
      Object.assign(globalThis,{FormData:IdentityFormData});
      const restore=api.configureHttpApplication({functions:{getToken:()=> 'stage-token',addTrace:(request:any)=>{request.headers.set('x-interceptor','yes');},unwrap:(value:any)=>value instanceof Blob?value:value.data}});
      const created:string[]=[],revoked:string[]=[],nativeCreate=URL.createObjectURL.bind(URL),nativeRevoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(blob:Blob)=>{const url=nativeCreate(blob);created.push(url);return url;};URL.revokeObjectURL=(url:string)=>{revoked.push(url);nativeRevoke(url);};
      const host=document.createElement('main');document.body.append(host);const dispose=view.default(host,api);
      Object.assign(globalThis,{__transfer:{api,host,dispose,restore,runtimeUrl,componentUrl,created,revoked,nativeCreate,nativeRevoke,NativeFormData,getIdentity:()=>identity}});return true;
    },{runtime,component});assert.equal(mounted,true);
    const inputs=page.locator('input[type=file]'),single=inputs.nth(0),multiple=inputs.nth(1);
    await single.setInputFiles({name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('first')});
    await page.getByRole('button',{name:'Upload'}).click();await page.locator('.result').filter({hasText:'upload:'}).waitFor();
    assert.equal(await page.evaluate(()=>(globalThis as any).__transfer.getIdentity()),true);
    await page.getByRole('button',{name:'Clear'}).click();assert.equal(await single.inputValue(),'');
    await single.setInputFiles({name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('first')});
    await page.getByRole('button',{name:'Upload'}).click();await page.locator('.result').filter({hasText:'upload:'}).waitFor();
    await multiple.setInputFiles([{name:'second.txt',mimeType:'text/plain',buffer:Buffer.from('second')},{name:'first.txt',mimeType:'text/plain',buffer:Buffer.from('first')}]);
    assert.equal(await page.locator('.selection').textContent(),'2:2');assert.deepEqual(await multiple.evaluate((input:HTMLInputElement)=>Array.from(input.files??[],file=>file.name)),['second.txt','first.txt']);
    await multiple.setInputFiles([]);assert.equal(await page.locator('.selection').textContent(),'0:0');
    assert.equal(uploads.length,2);for(const upload of uploads){const text=upload.body.toString('latin1');assert.match(upload.headers['content-type']??'',/^multipart\/form-data; boundary=/);assert.equal(upload.headers.authorization,'Bearer stage-token');assert.equal(upload.headers['x-interceptor'],'yes');assert.equal(upload.headers['x-action'],'photo');assert.match(text,/name="photo"; filename="first\.txt"/);assert.match(text,/first/);}
    const transferResult=await page.evaluate(async(origin)=>{
      const {api}=(globalThis as any).__transfer,determinate:number[]=[],indeterminate:(number|null)[]=[],first=new AbortController(),second=new AbortController();
      const download=await api.createHttp().transfer('GET',origin+'/download',{direction:'download',onProgress:(value:number|null)=>determinate.push(value)}) as Blob;
      await api.createHttp().transfer('GET',origin+'/chunked',{direction:'download',onProgress:(value:number|null)=>indeterminate.push(value)});
      let oversized='';try{await api.createHttp({maxTransferBytes:8}).transfer('GET',origin+'/large',{direction:'download'});}catch(error){oversized=(error as Error).message;}
      const a=api.createHttp().transfer('GET',origin+'/slow-a',{direction:'download',signal:first.signal}),b=api.createHttp().transfer('GET',origin+'/slow-b',{direction:'download',signal:second.signal});first.abort(new DOMException('explicit','AbortError'));let cancelled='';try{await a;}catch(error){cancelled=(error as Error).name;}const concurrent=await b as Blob;
      let failure='';try{await api.createHttp().transfer('GET',origin+'/failure',{direction:'download'});}catch(error){failure=`${(error as any).name}:${(error as any).status}`;}
      return {download:download.size,determinate,indeterminate,oversized,cancelled,concurrent:concurrent.size,failure};
    },origin);
    assert.equal(transferResult.download,16);assert(transferResult.determinate.length>0&&transferResult.determinate.every(value=>value!==null&&value>=0&&value<=100));assert.equal(transferResult.determinate.at(-1),100);assert(transferResult.indeterminate.includes(null));assert.match(transferResult.oversized,/maximum of 8 bytes/);assert.equal(transferResult.cancelled,'AbortError');assert.equal(transferResult.concurrent,24);assert.equal(transferResult.failure,'HttpError:503');
    await page.getByRole('button',{name:'Download'}).click();await page.locator('.download').filter({hasText:'true:'}).waitFor();await page.waitForTimeout(20);
    const urls=await page.evaluate(()=>({created:(globalThis as any).__transfer.created.length,revoked:(globalThis as any).__transfer.revoked.length}));assert.equal(urls.created,urls.revoked);
    await page.getByRole('button',{name:'Held'}).click();await heldRequest;await page.evaluate(()=>(globalThis as any).__transfer.dispose());releaseHeld?.();await page.waitForTimeout(50);assert.deepEqual(closed,[]);assert.equal(await page.evaluate(()=>(globalThis as any).__transfer.host.textContent),'');assert.deepEqual(pageErrors,[]);
    await page.evaluate(()=>{const state=(globalThis as any).__transfer;state.restore();Object.assign(globalThis,{FormData:state.NativeFormData});URL.createObjectURL=state.nativeCreate;URL.revokeObjectURL=state.nativeRevoke;state.nativeRevoke(state.runtimeUrl);state.nativeRevoke(state.componentUrl);});
  }finally{releaseHeld?.();await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
