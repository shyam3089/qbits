import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {firefox} from 'playwright';
import {build,createServer,preview} from 'vite';
import {compile} from '../language/index.js';
import {compileFile} from '../tooling/modules.js';
import {languagePlugin} from '../tooling/vite.js';

async function fixture(qb:string,html:string){const directory=await mkdtemp(join(tmpdir(),'qbits-forms-')),file=join(directory,'Registration.qb');await writeFile(file,qb);await writeFile(join(directory,'Registration.html'),html);return {directory,file};}

const registration=`component Registration:
    template "./Registration.html"
    state email = ""
    state username = ""
    state password = ""
    state confirmPassword = ""
    state newsletter = false

    form signup validate on blur:
        field email:
            required msg="Email is required"
            email msg="Enter a valid email"
            maxLength 254
        field username validate on change:
            required
            minLength 3 msg="Minimum 3 characters"
            maxLength 20
            pattern "^[A-Za-z0-9_]+$"
        field password:
            required
            minLength 12
        field confirmPassword:
            required
            match password msg="Passwords do not match"
        field newsletter
`;

const template=`<form qb-form="signup">
  <label for="email">Email</label><input id="email" type="email" qb-field="email" aria-describedby="email-help"><small id="email-help">Private</small>
  <label for="username">Username</label><input id="username" qb-field="username">
  <label for="password">Password</label><input id="password" type="password" qb-field="password">
  <label for="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" qb-field="confirmPassword">
  <label for="newsletter">Newsletter</label><input id="newsletter" type="checkbox" qb-field="newsletter">
  <button type="submit">Register</button><button type="reset">Reset</button>
  <output id="valid" qb-text="str(signup.valid)"></output><output id="dirty" qb-text="str(signup.dirty)"></output><output id="touched" qb-text="str(signup.touched)"></output>
</form>`;

test('forms parse, compile metadata, support forward match references, and type is a class alias',async()=>{const value=await fixture(registration,template);try{const result=compileFile(value.file);assert.equal(result.ast.forms[0].name.value,'signup');assert.equal(result.ast.forms[0].fields[1].timing?.value,'change');assert.match(result.code,/"forms":\[\{"name":"signup"/);assert.match(result.code,/"fieldForm":"signup"/);}finally{await rm(value.directory,{recursive:true,force:true});}const alias=compile('type Address:\n    id = 0\n    city = ""\ncomponent App:\n    address = Address(1, "Pune")\n    p text=address.city\n');assert.equal(alias.ast.classes[0].name.value,'Address');});

test('form compiler rejects invalid fields, validators, patterns, timing, and conflicting bindings',async()=>{const invalid:[string,RegExp][]=[
  ['component App:\n    missing = ""\n    form f:\n        field absent\n    p\n',/must reference writable component state/],
  ['component App:\n    age = 0\n    form f:\n        field age:\n            email\n    p\n',/email requires string state/],
  ['component App:\n    value = ""\n    form f:\n        field value:\n            pattern "(a+)+$"\n    p\n',/pattern must be at most/],
  ['component App:\n    value = ""\n    form f validate on input:\n        field value\n    p\n',/requires change, blur, or submit/],
  ['component App:\n    a = ""\n    form f:\n        field a:\n            match b\n    p\n',/must be another field/]
];for(const [source,expected] of invalid)assert.throws(()=>compile(source),expected);
  const value=await fixture('component Registration:\n    template "./Registration.html"\n    email = ""\n    form signup:\n        field email\n','<form qb-form="signup"><input qb-field="email" qb-model="email"></form>');try{assert.throws(()=>compileFile(value.file),/qb-field cannot be combined/);}finally{await rm(value.directory,{recursive:true,force:true});}
});

test('Firefox form binding, timing, ARIA, submission focus, programmatic validation, and reset',async()=>{const value=await fixture(registration,template),runtime=await readFile('dist/lib/runtime/index.js','utf8');try{const component=compileFile(value.file).code,browser=await firefox.launch({headless:true});try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),app=await import(urls[1]),host=document.createElement('main');document.body.append(host);const dispose=app.default(host,api),form=host.querySelector('form')!,email=host.querySelector('#email') as HTMLInputElement,username=host.querySelector('#username') as HTMLInputElement,emailError=host.querySelector('[data-qb-error="email"]') as HTMLElement,usernameError=host.querySelector('[data-qb-error="username"]') as HTMLElement;
      const initial={valid:host.querySelector('#valid')!.textContent,emailErrorHidden:emailError.hidden,described:email.getAttribute('aria-describedby')};email.value='bad';email.dispatchEvent(new Event('input',{bubbles:true}));const beforeBlur={hidden:emailError.hidden,valid:host.querySelector('#valid')!.textContent,same:host.querySelector('#email')===email};email.dispatchEvent(new Event('blur'));const afterBlur={hidden:emailError.hidden,text:emailError.textContent,invalid:email.getAttribute('aria-invalid'),described:email.getAttribute('aria-describedby')};username.value='ab';username.dispatchEvent(new Event('input',{bubbles:true}));const change={hidden:usernameError.hidden,text:usernameError.textContent,dirty:host.querySelector('#dirty')!.textContent};
      let prevented=false;form.addEventListener('submit',event=>{prevented=event.defaultPrevented;});form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));const failed={focused:document.activeElement===email,prevented};dispose.updateState?.({email:'valid@example.com'});const programmatic={value:email.value,hidden:emailError.hidden,dirty:host.querySelector('#dirty')!.textContent};(host.querySelector('button[type=reset]') as HTMLButtonElement).click();const reset={email:email.value,username:username.value,dirty:host.querySelector('#dirty')!.textContent,touched:host.querySelector('#touched')!.textContent,hidden:emailError.hidden,described:email.getAttribute('aria-describedby')};dispose();host.remove();return {initial,beforeBlur,afterBlur,change,failed,programmatic,reset,empty:host.childNodes.length};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.deepEqual(result.initial,{valid:'false',emailErrorHidden:true,described:'email-help'});assert.deepEqual(result.beforeBlur,{hidden:true,valid:'false',same:true});assert.equal(result.afterBlur.hidden,false);assert.equal(result.afterBlur.text,'Enter a valid email');assert.equal(result.afterBlur.invalid,'true');assert.match(result.afterBlur.described!,/email-help/);assert.match(result.afterBlur.described!,/qb-error-/);assert.deepEqual(result.change,{hidden:false,text:'Minimum 3 characters',dirty:'true'});assert.deepEqual(result.failed,{focused:true,prevented:true});assert.deepEqual(result.programmatic,{value:'valid@example.com',hidden:true,dirty:'true'});assert.deepEqual(result.reset,{email:'',username:'',dirty:'false',touched:'false',hidden:true,described:'email-help'});assert.equal(result.empty,0);assert.deepEqual(errors,[]);}finally{await browser.close();}}finally{await rm(value.directory,{recursive:true,force:true});}});

test('Firefox supports numeric, checkbox, radio, textarea, multiple select, match reactivity, and conditional cleanup',async()=>{const qb=`component Registration:
    template "./Registration.html"
    age = 0
    agree = false
    plan = "basic"
    bio = ""
    tags = ["a"]
    secret = ""
    copy = ""
    showSecret = true
    form profile validate on change:
        field age:
            min 18
            max 120
        field agree:
            required
        field plan
        field bio:
            minLength 2
        field tags:
            minLength 2
        field secret:
            required
        field copy:
            match secret
`,html=`<form qb-form="profile"><input id="age" type="number" qb-field="age"><input id="agree" type="checkbox" qb-field="agree"><input id="basic" type="radio" value="basic" qb-field="plan"><input id="pro" type="radio" value="pro" qb-field="plan"><textarea id="bio" qb-field="bio"></textarea><select id="tags" multiple qb-field="tags"><option value="a">A</option><option value="b">B</option></select><input id="secret" qb-if="showSecret" qb-field="secret"><input id="copy" qb-field="copy"><button type="submit">Save</button><output id="ageValue" qb-text="str(age)"></output><output id="planValue" qb-text="plan"></output><output id="tagCount" qb-text="str(len(tags))"></output><output id="copyValid" qb-text="str(profile.copy.valid)"></output></form>`,value=await fixture(qb,html),runtime=await readFile('dist/lib/runtime/index.js','utf8');try{const component=compileFile(value.file).code,browser=await firefox.launch({headless:true});try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),app=await import(urls[1]),host=document.createElement('main');document.body.append(host);const dispose=app.default(host,api),age=host.querySelector('#age') as HTMLInputElement,agree=host.querySelector('#agree') as HTMLInputElement,pro=host.querySelector('#pro') as HTMLInputElement,bio=host.querySelector('#bio') as HTMLTextAreaElement,tags=host.querySelector('#tags') as HTMLSelectElement,secret=host.querySelector('#secret') as HTMLInputElement,copy=host.querySelector('#copy') as HTMLInputElement;age.value='21';age.dispatchEvent(new Event('input',{bubbles:true}));agree.click();pro.click();bio.value='ok';bio.dispatchEvent(new Event('input',{bubbles:true}));tags.options[1].selected=true;tags.dispatchEvent(new Event('change',{bubbles:true}));secret.value='same';secret.dispatchEvent(new Event('input',{bubbles:true}));copy.value='same';copy.dispatchEvent(new Event('input',{bubbles:true}));const bound={age:host.querySelector('#ageValue')!.textContent,agree:agree.checked,plan:host.querySelector('#planValue')!.textContent,tags:host.querySelector('#tagCount')!.textContent,copyValid:host.querySelector('#copyValid')!.textContent};secret.value='changed';secret.dispatchEvent(new Event('input',{bubbles:true}));const matched={valid:host.querySelector('#copyValid')!.textContent,error:(host.querySelector('[data-qb-error="copy"]') as HTMLElement).textContent};dispose.updateState?.({showSecret:false});host.querySelector('form')!.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true}));const cleanup={removed:!host.querySelector('#secret'),focused:(document.activeElement as HTMLElement)?.id};dispose();host.remove();return {bound,matched,cleanup};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.deepEqual(result.bound,{age:'21',agree:true,plan:'pro',tags:'2',copyValid:'true'});assert.deepEqual(result.matched,{valid:'false',error:'Values must match secret'});assert.equal(result.cleanup.removed,true);assert.notEqual(result.cleanup.focused,'secret');assert.deepEqual(errors,[]);}finally{await browser.close();}}finally{await rm(value.directory,{recursive:true,force:true});}});

test('Firefox development and production builds run form validation',async()=>{const directory=await mkdtemp(join(resolve('.'),'.qbits-forms-vite-'));await writeFile(join(directory,'index.html'),'<main id="app"></main><script type="module" src="/main.ts"></script>');await writeFile(join(directory,'main.ts'),`import Registration from './Registration.qb';import * as runtime from '@qbits/runtime';Registration(document.querySelector('#app')!,runtime);`);await writeFile(join(directory,'Registration.qb'),registration);await writeFile(join(directory,'Registration.html'),template);const config={root:directory,plugins:[languagePlugin({projectRoot:directory})],resolve:{alias:{'@qbits/runtime':resolve('runtime/index.ts')}},logLevel:'silent' as const},browser=await firefox.launch({headless:true});try{const development=await createServer({...config,server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}});await development.listen();try{const page=await browser.newPage();await page.goto(development.resolvedUrls!.local[0]);await page.getByRole('button',{name:'Register'}).click();await page.locator('[data-qb-error="email"]:not([hidden])').waitFor();assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');await page.close();}finally{await development.close();}await build({...config,build:{outDir:'dist'}});const production=await preview({root:directory,preview:{host:'127.0.0.1',port:0},logLevel:'silent'});try{const page=await browser.newPage();await page.goto(production.resolvedUrls!.local[0]);await page.getByRole('button',{name:'Register'}).click();await page.locator('[data-qb-error="email"]:not([hidden])').waitFor();assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');await page.close();}finally{await production.close();}}finally{await browser.close();await rm(directory,{recursive:true,force:true});}});
