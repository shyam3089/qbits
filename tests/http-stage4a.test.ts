import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';
import {createHttp,HttpError} from '../runtime/http.js';

const filesSource=`component Files:
    http client api:
        base "https://api.test/"
        auth bearer getToken
    client api
    action uploadPhoto(file):
        post "photos"
        upload "photo" = file
    action downloadInvoice():
        get "invoice"
        download "invoice.pdf"
    if uploadPhoto.loading:
        p text="Uploading..."
    if uploadPhoto.progress:
        progress value=uploadPhoto.progress max=100
    if downloadInvoice.loading:
        progress value=downloadInvoice.progress max=100
    button text="download":
        on click:
            downloadInvoice()
    button text="cancel":
        on click:
            downloadInvoice.cancel()`;

test('Stage 4A syntax emits transfer models and rejects unsafe combinations with source locations',()=>{
  const compiled=compile(filesSource,'Files.qb'),[upload,download]=compiled.ast.httpActions;
  assert.equal(upload.uploads[0].name.value,'photo');assert.equal(upload.response,undefined);assert.equal(download.download?.value,'invoice.pdf');assert.match(compiled.code,/"uploads"/);
  const invalid=(source:string,pattern:RegExp)=>assert.throws(()=>compile(source,'BadTransfer.qb'),(error:unknown)=>error instanceof CompileError&&pattern.test(error.message)&&error.diagnostic.line>0&&error.diagnostic.column>0);
  invalid(filesSource.replace('post "photos"','get "photos"'),/Uploads require POST/);
  invalid(filesSource.replace('upload "photo" = file','upload "photo" = file\n        body "bad"'),/cannot also declare body/);
  invalid(filesSource.replace('upload "photo" = file','upload "photo" = "bad"'),/File or Blob/);
  invalid(filesSource.replace('download "invoice.pdf"','download "../invoice.pdf"'),/safe basename/);
  invalid(filesSource.replace('download "invoice.pdf"','download "invoice.pdf"\n        response string'),/cannot declare response/);
  invalid(filesSource.replace('download "invoice.pdf"','upload "other" = file\n        download "invoice.pdf"'),/cannot upload and download/);
  invalid(filesSource.replace('upload "photo" = file','upload "photo" = file\n        upload "photo" = file'),/Duplicate upload field/);
  invalid(filesSource.replace('        upload "photo" = file','        upload "photo" = file\n        header "Content-Type" = "multipart/form-data"'),/secure boundary/);
});

class FakeXhr {
  static instances:FakeXhr[]=[];
  method='';url='';headers=new Map<string,string>();body:Document|XMLHttpRequestBodyInit|null=null;status=200;statusText='OK';response:unknown=new Blob();responseURL='';responseType:XMLHttpRequestResponseType='';readyState=0;
  upload:{onprogress:((event:ProgressEvent)=>void)|null}={onprogress:null};onprogress:((event:ProgressEvent)=>void)|null=null;onreadystatechange:(()=>void)|null=null;onerror:(()=>void)|null=null;ontimeout:(()=>void)|null=null;onabort:(()=>void)|null=null;onload:(()=>void)|null=null;aborted=false;
  constructor(){FakeXhr.instances.push(this);}open(method:string,url:string){this.method=method;this.url=url;this.responseURL=url;}setRequestHeader(name:string,value:string){this.headers.set(name.toLowerCase(),value);}getResponseHeader(){return null;}getAllResponseHeaders(){return 'content-type: application/json\r\n';}send(body?:Document|XMLHttpRequestBodyInit|null){this.body=body??null;}abort(){this.aborted=true;this.onabort?.();}
  progress(direction:'upload'|'download',loaded:number,total?:number){const event={loaded,total:total??0,lengthComputable:total!==undefined} as ProgressEvent;(direction==='upload'?this.upload.onprogress:this.onprogress)?.(event);}
  load(value:Blob,status=200,headers='content-type: application/json\r\n'){this.response=value;this.status=status;this.statusText=status===200?'OK':'Failed';this.getAllResponseHeaders=()=>headers;this.onload?.();}
}

test('HTTP transfer engine preserves multipart, auth, interceptors, progress, binary data, cancellation and bounds',async()=>{
  FakeXhr.instances=[];const progress:(number|null)[]=[],api=createHttp({xhr:()=>new FakeXhr() as unknown as XMLHttpRequest,maxTransferBytes:8,clients:{api:{base:'https://api.test/',auth:()=> 'token',request:[request=>{request.headers.set('x-trace','yes');}]}}}),form=new FormData(),instance=async(index:number)=>{while(!FakeXhr.instances[index])await new Promise(resolve=>setTimeout(resolve,0));return FakeXhr.instances[index];};form.append('photo',new Blob(['abc']),'photo.txt');
  const uploadPromise=api.transfer('POST','photos',{client:'api',direction:'upload',body:form,response:'string',onProgress:value=>progress.push(value)}),upload=await instance(0);assert.equal(upload.headers.get('authorization'),'Bearer token');assert.equal(upload.headers.get('x-trace'),'yes');assert.equal(upload.headers.has('content-type'),false);assert.equal(upload.body,form);upload.progress('upload',0,10);upload.progress('upload',5,10);upload.progress('upload',10,10);upload.load(new Blob([JSON.stringify('saved')]));assert.equal(await uploadPromise,'saved');assert.deepEqual(progress,[0,50,100]);
  const unknown:(number|null)[]=[],downloadPromise=api.transfer('GET','invoice',{client:'api',direction:'download',onProgress:value=>unknown.push(value)}),download=await instance(1);download.progress('download',3);download.load(new Blob(['123']),200,'content-type: application/octet-stream\r\n');const binary=await downloadPromise as Blob;assert.equal(await binary.text(),'123');assert.deepEqual(unknown,[null]);
  const controller=new AbortController(),cancelled=api.transfer('GET','cancel',{client:'api',direction:'download',signal:controller.signal}),cancel=await instance(2);controller.abort(new DOMException('cancelled','AbortError'));await assert.rejects(cancelled,(error:unknown)=>error instanceof DOMException&&error.name==='AbortError');assert.equal(cancel.aborted,true);
  const oversized=api.transfer('GET','large',{client:'api',direction:'download'}),large=await instance(3);large.progress('download',9);await assert.rejects(oversized,/maximum of 8 bytes/);
  const failed=api.transfer('GET','failure',{client:'api',direction:'download'}),failure=await instance(4);failure.load(new Blob(),503);await assert.rejects(failed,(error:unknown)=>error instanceof HttpError&&error.status===503);
  const redirected=api.transfer('GET','redirect',{client:'api',direction:'download'}),redirect=await instance(5);redirect.responseURL='https://evil.test/file';redirect.load(new Blob(['x']),200,'content-type: application/octet-stream\r\n');await assert.rejects(redirected,/cross-origin redirect/);
});

test('download actions track progress, cancellation and object URL cleanup in Firefox',async()=>{
  const component=compile(`component Downloads:
    action invoice():
        get "https://api.test/invoice"
        download "invoice.pdf"
    button text="start":
        on click:
            invoice()
    button text="cancel":
        on click:
            invoice.cancel()
    p text=str(invoice.loading) + ":" + str(invoice.progress) + ":" + str(invoice.success) + ":" + invoice.error
    if invoice.loading:
        progress value=invoice.progress max=100`).code,runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});
    const result=await page.evaluate(async({runtime,component})=>{
      const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),componentUrl=URL.createObjectURL(new Blob([component],{type:'text/javascript'})),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)),waitFor=async(check:()=>boolean)=>{const end=Date.now()+2000;while(!check()){if(Date.now()>end)throw new Error('transfer timeout');await wait(5);}};
      try{
        const api=await import(runtimeUrl),view=await import(componentUrl),requests:any[]=[];
        class Xhr {method='';url='';status=200;statusText='OK';response:any=new Blob(['pdf']);responseURL='https://api.test/invoice';responseType='';readyState=0;upload:any={};onprogress:any;onreadystatechange:any;onerror:any;ontimeout:any;onabort:any;onload:any;aborted=false;open(method:string,url:string){this.method=method;this.url=url;requests.push(this);}setRequestHeader(){}getResponseHeader(){return null;}getAllResponseHeaders(){return 'content-type: application/pdf\r\n';}send(){}abort(){this.aborted=true;this.onabort?.();}}
        ;(globalThis as any).XMLHttpRequest=Xhr;const created:string[]=[],revoked:string[]=[],clicked:string[]=[];const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL),originalClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=(blob:Blob)=>{const value=originalCreate(blob);created.push(value);return value;};URL.revokeObjectURL=(value:string)=>{revoked.push(value);originalRevoke(value);};HTMLAnchorElement.prototype.click=function(){clicked.push(this.download);};
        const host=document.createElement('main'),dispose=view.default(host,api),buttons=host.querySelectorAll('button');(buttons[0] as HTMLButtonElement).click();await waitFor(()=>requests.length===1);requests[0].onprogress({loaded:0,total:10,lengthComputable:true});const zero=host.querySelector('p')?.textContent,zeroValue=host.querySelector('progress')?.getAttribute('value');requests[0].onprogress({loaded:3,total:0,lengthComputable:false});const indeterminate=host.querySelector('p')?.textContent,hasValue=host.querySelector('progress')?.hasAttribute('value');requests[0].onprogress({loaded:5,total:10,lengthComputable:true});const half=host.querySelector('p')?.textContent;requests[0].onload();await waitFor(()=>host.querySelector('p')?.textContent==='false:50:true:');await wait(5);const success=host.querySelector('p')?.textContent;
        (buttons[0] as HTMLButtonElement).click();(buttons[0] as HTMLButtonElement).click();await waitFor(()=>requests.length===3);requests[1].onprogress({loaded:2,total:10,lengthComputable:true});requests[2].onprogress({loaded:7,total:10,lengthComputable:true});(buttons[1] as HTMLButtonElement).click();await waitFor(()=>host.querySelector('p')?.textContent?.includes('Transfer cancelled')??false);const cancelled=host.querySelector('p')?.textContent,cancelAborted=requests[2].aborted,olderAborted=requests[1].aborted;requests[1].onload();await waitFor(()=>host.querySelector('p')?.textContent?.startsWith('false:70:false:')??false);await wait(5);(buttons[0] as HTMLButtonElement).click();await waitFor(()=>requests.length===4);dispose();const destroyedAborted=requests[3].aborted;await wait(5);HTMLAnchorElement.prototype.click=originalClick;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;return {zero,zeroValue,indeterminate,hasValue,half,success,cancelled,cancelAborted,olderAborted,destroyedAborted,clicked,created:created.length,revoked:revoked.length,text:host.textContent};
      }finally{URL.revokeObjectURL(componentUrl);URL.revokeObjectURL(runtimeUrl);}
    },{runtime,component});
    assert.equal(result.zero,'true:0:false:');assert.equal(result.zeroValue,'0');assert.equal(result.indeterminate,'true:-1:false:');assert.equal(result.hasValue,false);assert.equal(result.half,'true:50:false:');assert.equal(result.success,'false:50:true:');assert.match(result.cancelled,/true:70:false:Transfer cancelled/);assert.equal(result.cancelAborted,true);assert.equal(result.olderAborted,false);assert.equal(result.destroyedAborted,true);assert.deepEqual(result.clicked,['invoice.pdf','invoice.pdf']);assert.equal(result.created,result.revoked);assert.equal(result.text,'');assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
