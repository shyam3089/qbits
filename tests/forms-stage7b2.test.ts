import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';
import {compileFile} from '../tooling/modules.js';
import {createHttp,HttpError} from '../runtime/http.js';

const source=`class Account:
    username = ""
class Address:
    id = 0
    city = ""
class RegistrationRequest:
    account = Account("")
    addresses = [] as Address
class FieldError:
    path = ""
    message = ""
component Registration:
    template "./Registration.html"
    account = Account("")
    first = Address(1, "Pune")
    second = Address(2, "Goa")
    addresses = [first, second]
    action usernameAvailable(value):
        get "https://api.test/check"
        param value = value
        response boolean
    action register(payload):
        post "https://api.test/register"
        body payload
        response string
        error 422 response list[FieldError]
    form signup validate on blur:
        field account:
            field username validate on change:
                required
                async usernameAvailable debounce 10 ms
                    msg="Username is already used"
        array addresses:
            field city:
                required
        submit register(RegistrationRequest(account, addresses))
`;

const html=`<form qb-form="signup">
  <input id="username" qb-field="account.username">
  <div class="address" qb-for="address in signup.addresses.items" qb-key="address.key">
    <input class="city" qb-field="address.city"><output class="key" qb-text="str(address.key)"></output><output class="dirty" qb-text="str(address.city.dirty)"></output>
  </div>
  <button id="move" type="button" qb-on-click="addresses.move(second, 0)">Move</button>
  <button id="submit" type="submit">Submit</button><button id="reset" type="reset">Reset</button>
  <output id="pending" qb-text="str(signup.pending)"></output><output id="validationError" qb-text="signup.account.username.validationError"></output><output id="submitError" qb-text="signup.submitError"></output><output id="success" qb-text="str(signup.submitSuccess)"></output>
</form>`;

async function fixture(){const directory=await mkdtemp(join(tmpdir(),'qbits-forms-7b2-')),file=join(directory,'Registration.qb');await writeFile(file,source);await writeFile(join(directory,'Registration.html'),html);return {directory,file};}

test('Stage 7B.2 syntax lowers nested fields, arrays, async validators, typed submit, and 422 errors',async()=>{const value=await fixture();try{const result=compileFile(value.file),form=result.ast.forms[0],action=result.ast.httpActions[1];assert.equal(form.fields[0].fields[0].validators[1].kind,'async');assert.equal(form.fields[1].kind,'array');assert.equal(form.submit?.action.value,'register');assert.equal(action.errorResponse?.status.value,422);assert.match(result.code,/"kind":"array"/);assert.match(result.code,/"errorResponse":\{"status":422/);}finally{await rm(value.directory,{recursive:true,force:true});}
  const inline=source.replace('    template "./Registration.html"\n','').trimEnd()+'\n    div\n';assert.throws(()=>compile(inline.replace('get "https://api.test/check"','post "https://api.test/check"')),/safe GET action/);
  assert.throws(()=>compile(inline.replace('path = ""','path = 0')),/string path and message fields/);
});

test('typed HTTP error responses are recursively validated and remain distinct from transport errors',async()=>{const schema={list:{fields:{path:'string',message:'string'}}} as const,valid=createHttp({fetch:async()=>new Response(JSON.stringify([{path:'/name',message:'Taken'}]),{status:422,headers:{'content-type':'application/json'}})});await assert.rejects(()=>valid.post('/register',{errorResponses:{422:schema}}),(error:unknown)=>error instanceof HttpError&&error.status===422&&Array.isArray(error.data)&&(error.data[0] as {message:string}).message==='Taken');const malformed=createHttp({fetch:async()=>new Response(JSON.stringify([{path:'/name',message:7}]),{status:422,headers:{'content-type':'application/json'}})});await assert.rejects(()=>malformed.post('/register',{errorResponses:{422:schema}}),(error:unknown)=>error instanceof HttpError&&error.status===422&&error.data===undefined&&/Invalid typed/.test(error.message));});

test('Firefox preserves array identity, cancels stale async validation, maps 422 paths, submits typed payloads, and deep-resets',async()=>{const value=await fixture(),runtime=await readFile('dist/lib/runtime/index.js','utf8');try{const component=compileFile(value.file).code,browser=await firefox.launch({headless:true});try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,component})=>{(globalThis as any).__name=(value:unknown)=>value;const urls=[runtime,component].map(code=>URL.createObjectURL(new Blob([code],{type:'text/javascript'}))),wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));try{const api=await import(urls[0]),view=await import(urls[1]);const original=globalThis.fetch,requests:{url:string;body?:string;aborted?:boolean}[]=[];(globalThis as any).fetch=(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input),request:{url:string;body?:string;aborted?:boolean}={url,body:init?.body as string|undefined};requests.push(request);if((init?.method??'GET')==='GET'){const value=new URL(url).searchParams.get('value')??'',delay=value==='old'?60:5;return new Promise<Response>((resolve,reject)=>{const timer=setTimeout(()=>resolve(new Response(JSON.stringify(value!=='old'),{headers:{'content-type':'application/json'}})),delay);init?.signal?.addEventListener('abort',()=>{request.aborted=true;clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});}return Promise.resolve(new Response(JSON.stringify([{path:'/addresses/1/city',message:'Server rejected city'}]),{status:422,headers:{'content-type':'application/json'}}));};const host=document.createElement('main');document.body.append(host);const dispose=view.default(host,api),username=host.querySelector('#username') as HTMLInputElement;username.value='old';username.dispatchEvent(new Event('input',{bubbles:true}));await wait(25);username.value='new';username.dispatchEvent(new Event('input',{bubbles:true}));await wait(80);const asyncState={error:(host.querySelector('[data-qb-error="account.username"]') as HTMLElement).textContent,pending:host.querySelector('#pending')!.textContent,aborted:requests.some(item=>item.url.includes('value=old')&&item.aborted)};const before=[...host.querySelectorAll('.city')] as HTMLInputElement[],first=before[0];first.value='Changed';first.dispatchEvent(new Event('input',{bubbles:true}));(host.querySelector('#move') as HTMLButtonElement).click();const after=[...host.querySelectorAll('.city')] as HTMLInputElement[],identity={moved:after[1]===first,values:after.map(item=>item.value),dirty:[...host.querySelectorAll('.dirty')].map(item=>item.textContent),keys:[...host.querySelectorAll('.key')].map(item=>item.textContent)};(host.querySelector('#submit') as HTMLButtonElement).click();await wait(40);const post=requests.find(item=>item.body),server={body:post?.body,error:(host.querySelectorAll('[data-qb-error="address.city"]')[1] as HTMLElement)?.textContent,success:host.querySelector('#success')!.textContent};(host.querySelector('#reset') as HTMLButtonElement).click();await wait(0);const reset={values:[...host.querySelectorAll('.city')].map(item=>(item as HTMLInputElement).value),same:first===host.querySelectorAll('.city')[0]};dispose();host.remove();(globalThis as any).fetch=original;return {asyncState,identity,server,reset};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.deepEqual(result.asyncState,{error:'',pending:'false',aborted:true});assert.equal(result.identity.moved,true);assert.deepEqual(result.identity.values,['Goa','Changed']);assert.deepEqual(result.identity.dirty,['false','true']);assert.equal(new Set(result.identity.keys).size,2);assert.deepEqual(JSON.parse(result.server.body),{account:{username:'new'},addresses:[{id:2,city:'Goa'},{id:1,city:'Changed'}]});assert.equal(result.server.error,'Server rejected city');assert.equal(result.server.success,'false');assert.deepEqual(result.reset.values,['Pune','Goa']);assert.equal(result.reset.same,true);assert.deepEqual(errors,[]);}finally{await browser.close();}}finally{await rm(value.directory,{recursive:true,force:true});}});
