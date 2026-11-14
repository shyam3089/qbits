import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const source=`component Files:
    state photo = null
    state photos = [] as File

    action uploadPhoto(file):
        post "/photos"
        upload "photo" = file

    action selectFiles(files):
        post "/selection"
        response string

    input type="file" bind=photo
    input type="file" on change uploadPhoto(event.file)
    input:
        type="file"
        on change:
            photo = event.file
            photos = event.files
            selectFiles(event.files)
    button:
        on click:
            photo = null`;

test('Stage 4A.2.1 parses nullable File state, File lists, bind and file event references',()=>{
  const compiled=compile(source,'Files.qb'),[photo,photos]=compiled.ast.states,roots=compiled.ast.roots;
  assert.equal(photo.initial.kind,'literal');assert.equal(photo.initial.kind==='literal'&&photo.initial.value,null);
  assert.equal(photos.initial.kind,'list');assert.equal(photos.initial.kind==='list'&&photos.initial.itemType?.value,'File');
  assert.equal(roots[0].kind==='element'&&roots[0].attributes.bind.kind,'reference');
  assert.equal(roots[1].kind==='element'&&roots[1].handler?.statements[0].kind,'invoke');
  const inline=roots[1].kind==='element'&&roots[1].handler?.statements[0];assert.equal(inline&&inline.kind==='invoke'&&inline.arguments[0].kind,'member');assert.equal(inline&&inline.kind==='invoke'&&inline.arguments[0].kind==='member'&&inline.arguments[0].name.value,'file');
  assert.match(compiled.code,/"value":null/);assert.match(compiled.code,/"itemType":"File"/);assert.match(compiled.code,/"name":"event"/);assert.match(compiled.code,/"name":"files"/);
  assert.doesNotThrow(()=>compile(source.replace('state photo = null','photo = null'),'LegacyFileState.qb'));
  assert.doesNotThrow(()=>compile(`component AssignedFile:
    state photo = null
    input:
        type="file"
        on change:
            photo = event.file`,'AssignedFile.qb'));
});

test('Stage 4A.2.1 file diagnostics are strict and source-located',()=>{
  const rejects=(text:string,pattern:RegExp)=>assert.throws(()=>compile(text,'InvalidFiles.qb'),(error:unknown)=>error instanceof CompileError&&pattern.test(error.message)&&error.diagnostic.line>0&&error.diagnostic.column>0,text);
  rejects(`component C:
    state photo = null
    p text="unused"`,/null state requires input type="file" bind/);
  rejects(`component C:
    state photo = null
    input bind=photo`,/bind is supported only on input type="file"/);
  rejects(`component C:
    state photos = [] as File
    input type="file" bind=photos`,/requires nullable File state, received list:file/);
  rejects(`component C:
    state photo = "bad"
    input type="file" bind=photo`,/requires nullable File state, received string/);
  rejects(`component C:
    state photo = null
    input:
        type="checkbox"
        on change:
            photo = event.file`,/Checkbox change events expose only event.checked/);
  rejects(`component C:
    state photo = null
    input type="file" bind=photo
    input:
        type="file"
        on change:
            photo = event.value`,/File input change events expose only event.file and event.files/);
  rejects(`component C:
    state photo = null
    input type="file" bind=photo
    input:
        type="file"
        on change:
            photo = event.files`,/event.files requires list:file state/);
  rejects(`component C:
    action uploadPhoto(file):
        post "/photos"
        upload "photo" = file
    button:
        on click:
            uploadPhoto(event.file)`,/Unknown state or prop "event"/);
  rejects(`component C:
    state photo = null
    action send(file):
        post "/send"
        body file
        response string
    input type="file" bind=photo
    input type="file" on change send(event.file)`,/cannot be serialized as JSON/);
  rejects(`component C:
    state files = [] as File
    action uploadFiles(incoming):
        post "/photos"
        upload "photos" = incoming
    input:
        type="file"
        on change:
            files = event.files
            uploadFiles(event.files)`,/Upload values require a File or Blob, received list:file/);
  rejects(`component C:
    state name = ""
    button:
        on click:
            name = null`,/matching state type/);
  rejects(`component C:
    state values = [null]
    p text="unused"`,/Lists cannot infer a type from null/);
  rejects(`component C(value = null):
    p text="unused"`,/Props cannot infer a type from null/);
  rejects(`class Item:
    value = null
component C:
    p text="unused"`,/Class fields cannot infer a type from null/);
  rejects(`shared Files:
    photo = null`,/Shared state defaults cannot infer a type from null/);
  rejects(`component C:
    state photo = null
    input type="file" bind=photo
    p text=str(photo)`,/File values are opaque/);
  rejects(`component C:
    state kind = "file"
    input type=kind`,/static string literal/);
  rejects(`component C:
    state photo = null
    input type="file" on change photo = event.file`,/direct action invocation/);
});

test('Stage 4A.2.2 binds native files, dispatches ordered payloads, and cleans up in Firefox',async()=>{
  const component=compile(`component Files:
    state photo = null
    state photos = [] as File
    state name = ""
    state enabled = false

    action uploadPhoto(file):
        post "/photos"
        upload "photo" = file

    action selectFiles(files):
        post "/selection"
        response string

    input type="file" bind=photo
    button text="Upload":
        on click:
            uploadPhoto(photo)
    button text="Clear":
        on click:
            photo = null
    input type="file" multiple bind=photos:
        on change:
            uploadPhoto(event.file)
            selectFiles(event.files)
    input:
        value=name
        on input:
            name = event.value
    input:
        type="checkbox"
        checked=enabled
        on change:
            enabled = event.checked
    p text=name + ":" + str(enabled) + ":" + str(len(photos))`,'FilesRuntime.qb').code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://app.test/',route=>route.fulfill({body:'<!doctype html>',contentType:'text/html'}));await page.goto('https://app.test/');await page.addScriptTag({content:'globalThis.__name=(value)=>value;'});
    const result=await page.evaluate(async({runtime,component})=>{
      const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),componentUrl=URL.createObjectURL(new Blob([component],{type:'text/javascript'}));
      try{
        const api=await import(runtimeUrl),view=await import(componentUrl),requests:any[]=[];let added=0,removed=0;
        const originalAdd=Element.prototype.addEventListener,originalRemove=Element.prototype.removeEventListener;
        Element.prototype.addEventListener=function(...args:any[]){added++;return originalAdd.apply(this,args as any);};Element.prototype.removeEventListener=function(...args:any[]){removed++;return originalRemove.apply(this,args as any);};
        class Xhr {method='';url='';status=200;statusText='OK';response:any=new Blob();responseURL='https://app.test/photos';responseType='';readyState=0;upload:any={};onprogress:any;onreadystatechange:any;onerror:any;ontimeout:any;onabort:any;onload:any;aborted=false;body:any;open(method:string,url:string){this.method=method;this.url=url;requests.push(this);}setRequestHeader(){}getResponseHeader(){return null;}getAllResponseHeaders(){return '';}send(body:any){this.body=body;}abort(){if(this.aborted)return;this.aborted=true;this.onabort?.();}}
        ;(globalThis as any).XMLHttpRequest=Xhr;let selectionCalls=0;(globalThis as any).fetch=async()=>{selectionCalls++;return new Response(JSON.stringify('selected'),{headers:{'content-type':'application/json'}});};const NativeFormData=FormData;class TrackingFormData extends NativeFormData {values:any[]=[];append(name:string,value:any,filename?:string){this.values.push(value);if(filename===undefined)super.append(name,value);else super.append(name,value,filename);}};(globalThis as any).FormData=TrackingFormData;
        const host=document.createElement('main'),dispose=view.default(host,api),inputs=host.querySelectorAll('input'),single=inputs[0] as HTMLInputElement,multiple=inputs[1] as HTMLInputElement,text=inputs[2] as HTMLInputElement,checkbox=inputs[3] as HTMLInputElement,buttons=host.querySelectorAll('button'),status=host.querySelector('p')!;
        const first=new File(['first'],'first.txt',{type:'text/plain'}),second=new File(['second'],'second.txt',{type:'text/plain'}),select=(input:HTMLInputElement,files:File[])=>{const transfer=new DataTransfer();for(const file of files)transfer.items.add(file);input.files=transfer.files;const selected=Array.from(input.files);input.dispatchEvent(new Event('change',{bubbles:true}));return selected;};
        const selectedSingle=select(single,[first]);(buttons[0] as HTMLButtonElement).click();const boundIdentity=requests[0].body.values[0]===selectedSingle[0];(buttons[1] as HTMLButtonElement).click();const cleared=single.value===''&&single.files?.length===0;
        const selectedMultiple=select(multiple,[second,first]);const ordered=requests[1].body.values[0]===selectedMultiple[0]&&status.textContent===':false:2';const reselectedFiles=select(multiple,[second,first]);const reselected=requests[2].body.values[0]===reselectedFiles[0];select(multiple,[]);const emptySafe=requests.length===3&&status.textContent===':false:0';
        text.value='kept';text.dispatchEvent(new Event('input',{bubbles:true}));checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));const compatible=status.textContent==='kept:true:0';
        let strictError='';const invalidHost=document.createElement('aside');try{view.default(invalidHost,api,{}, {photo:'bad'});}catch(error){strictError=(error as Error).message;}
        select(single,[first]);(buttons[0] as HTMLButtonElement).click();const beforeDispose=requests.length;dispose();const uploadsContinued=requests.every(request=>!request.aborted),emptyHost=host.childNodes.length===0,listenersBalanced=added===removed;text.value='stale';text.dispatchEvent(new Event('input'));select(multiple,[first]);(buttons[0] as HTMLButtonElement).click();const staleSafe=requests.length===beforeDispose;
        Element.prototype.addEventListener=originalAdd;Element.prototype.removeEventListener=originalRemove;(globalThis as any).FormData=NativeFormData;
        return {boundIdentity,cleared,ordered,reselected,emptySafe,compatible,strictError,uploadsContinued,emptyHost,listenersBalanced,staleSafe,multiple:multiple.multiple,selectionCalls};
      }finally{URL.revokeObjectURL(componentUrl);URL.revokeObjectURL(runtimeUrl);}
    },{runtime,component});
    assert.deepEqual(result,{boundIdentity:true,cleared:true,ordered:true,reselected:true,emptySafe:true,compatible:true,strictError:'Initial state photo requires File or null',uploadsContinued:true,emptyHost:true,listenersBalanced:true,staleSafe:true,multiple:true,selectionCalls:3});assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
