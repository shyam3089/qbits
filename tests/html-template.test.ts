import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {firefox} from 'playwright';
import {build,createServer,preview} from 'vite';
import {compile} from '../language/index.js';
import {compileFile} from '../tooling/modules.js';
import {languagePlugin} from '../tooling/vite.js';

async function fixture(qb:string,html:string){const directory=await mkdtemp(join(tmpdir(),'qbits-template-')),file=join(directory,'App.qb');await writeFile(file,qb);await writeFile(join(directory,'App.html'),html);return {directory,file};}

test('external templates lower HTML, SVG, directives, and reactive bindings into the existing model',async()=>{
  const value=await fixture(`component App:\n    template "./App.html"\n    name = "Ada"\n    count = 0\n    enabled = true\n    items = ["a", "b"]\n`,`<main class="shell">\n  <h1 qb-text="name"></h1>\n  <input qb-model="name" aria-label="Name">\n  <button qb-on-click="count = count + 1" qb-bind-aria-label="name">Add</button>\n  <p qb-if="enabled" qb-text="str(count)"></p>\n  <ul><li qb-for="item in items" qb-key="item" qb-text="item"></li></ul>\n  <svg viewBox="0 0 20 20"><circle qb-bind-cx="count" cy="10" r="4"></circle></svg>\n</main>`);
  try{const compiled=compileFile(value.file);assert.equal(compiled.ast.template?.value,'./App.html');assert.match(compiled.code,/"kind":"iteration"/);assert.match(compiled.code,/"viewBox"/);assert.match(compiled.code,/"model"/);}
  finally{await rm(value.directory,{recursive:true,force:true});}
});

test('external template diagnostics preserve HTML filename and reject unsafe or ambiguous markup',async()=>{
  const cases:[string,RegExp][]=[
    ['<button onclick="alert(1)">x</button>',/Inline event-handler attributes are forbidden/],
    ['<a href="javascript:alert(1)">x</a>',/Unsafe URL scheme/],
    ['<script src="./x.js"></script>',/script elements are forbidden/],
    ['<div qb-html="name"></div>',/Unknown Qbits template directive/],
    ['<form qb-form="account"></form>',/Unknown form/],
    ['<input qb-model="name" qb-bind-value="name">',/cannot be combined/]
  ];
  for(const [html,expected] of cases){const value=await fixture('component App:\n    template "./App.html"\n    name = ""\n',html);try{assert.throws(()=>compileFile(value.file),error=>{assert.match(String(error),expected);assert.match(String(error),/App\.html:/);return true;});}finally{await rm(value.directory,{recursive:true,force:true});}}
  assert.throws(()=>compile('component App:\n    template "./App.html"\n'),/require compileFile/);
});

test('external template paths are watched and cannot escape the project root',async()=>{
  const outer=await mkdtemp(join(tmpdir(),'qbits-template-boundary-')),directory=join(outer,'project'),file=join(directory,'App.qb'),outside=join(outer,'outside.html'),watched:string[]=[];await mkdir(directory);await writeFile(file,'component App:\n    template "./App.html"\n');await writeFile(join(directory,'App.html'),'<p>safe</p>');
  try{compileFile(file,undefined,path=>watched.push(path),{projectRoot:directory});assert.ok(watched.some(path=>path.endsWith('App.html')));await writeFile(file,'component App:\n    template "../outside.html"\n');await writeFile(outside,'<p>outside</p>');assert.throws(()=>compileFile(file,undefined,undefined,{projectRoot:directory}),/outside the project root/);}
  finally{await rm(outer,{recursive:true,force:true});}
});

test('Firefox preserves control identity, focus, and caret during external-template updates',async()=>{
  const value=await fixture(`component App:\n    template "./App.html"\n    name = ""\n    count = 0\n`,`<form qb-on-submit="count = count + 1"><label>Name <input qb-model="name"></label><output qb-text="name"></output><button type="submit">Save</button><b qb-text="str(count)"></b></form>`);
  const runtime=await readFile('dist/lib/runtime/index.js','utf8');
  try{const component=compileFile(value.file).code,browser=await firefox.launch({headless:true});try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,component})=>{const urls=[runtime,component].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),app=await import(urls[1]),host=document.createElement('main');document.body.append(host);const dispose=app.default(host,api),input=host.querySelector('input')!;input.focus();input.value='Ada';input.setSelectionRange(2,2);input.dispatchEvent(new Event('input',{bubbles:true}));const same=host.querySelector('input')===input,focused=document.activeElement===input,caret=input.selectionStart,text=host.querySelector('output')?.textContent;host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));const submitted=host.querySelector('b')?.textContent;dispose();host.remove();return {same,focused,caret,text,submitted,empty:host.childNodes.length};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,component});assert.deepEqual(result,{same:true,focused:true,caret:2,text:'Ada',submitted:'1',empty:0});assert.deepEqual(errors,[]);}finally{await browser.close();}}
  finally{await rm(value.directory,{recursive:true,force:true});}
});

test('Firefox development reload and production build consume external templates',async()=>{
  const directory=await mkdtemp(join(resolve('.'),'.qbits-template-vite-'));await writeFile(join(directory,'index.html'),'<main id="app"></main><script type="module" src="/main.ts"></script>');await writeFile(join(directory,'main.ts'),`import App from './App.qb';import * as runtime from '@qbits/runtime';App(document.querySelector('#app')!,runtime);`);await writeFile(join(directory,'App.qb'),'component App:\n    template "./App.html"\n    title = "Development"\n');await writeFile(join(directory,'App.html'),'<h1 qb-text="title"></h1>');
  const config={root:directory,plugins:[languagePlugin({projectRoot:directory})],resolve:{alias:{'@qbits/runtime':resolve('runtime/index.ts')}},logLevel:'silent' as const};const browser=await firefox.launch({headless:true});
  try{const development=await createServer({...config,server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}});await development.listen();try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});await page.goto(development.resolvedUrls!.local[0]);await page.waitForTimeout(1000);assert.equal(await page.locator('body').textContent(),'Development',`development errors: ${errors.join('; ')}`);await writeFile(join(directory,'App.html'),'<h1>Reloaded template</h1>');await page.getByRole('heading',{name:'Reloaded template'}).waitFor();await page.close();}finally{await development.close();}
    await build({...config,build:{outDir:'dist'}});const production=await preview({root:directory,preview:{host:'127.0.0.1',port:0},logLevel:'silent'});try{const page=await browser.newPage();await page.goto(production.resolvedUrls!.local[0]);await page.getByRole('heading',{name:'Reloaded template'}).waitFor();await page.close();}finally{await production.close();}}
  finally{await browser.close();await rm(directory,{recursive:true,force:true});}
});
