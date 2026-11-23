import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {firefox} from 'playwright';
import {build,createServer} from 'vite';
import {compile,CompileError} from '../language/index.js';
import {languagePlugin} from '../tooling/vite.js';

const syntax=`import Reports from "./Reports.qb"
component App:
    allowed = false
    action canOpen():
        get "/allowed"
        response boolean
    button text="Back":
        on click:
            navigate back
    button text="Forward":
        on click:
            navigate forward
    button text="Login":
        on click:
            navigate replace "/login"
    router:
        scroll:
            restore = true
        loading:
            p text="Loading"
        error:
            p text=navigation.error
        route "/reports":
            guard async:
                if not canOpen():
                    navigate replace "/login"
            lazy:
                Reports
            loading:
                p text="Reports loading"
            error:
                p text=navigation.error
        route "/old":
            navigate replace "/reports"
        route "/login":
            p text="Login"
        route "*":
            p text="Missing"`;

test('Stages 7C.2-7C.4 lower only the approved routing declarations',()=>{
  const result=compile(syntax),router=result.ast.roots.at(-1);
  assert.equal(router?.kind,'router');
  assert.match(result.code,/"mode":"back"/);
  assert.match(result.code,/"scroll":true/);
  assert.match(result.code,/"guard":\{"async":true/);
  assert.match(result.code,/"lazy":\{"views":/);
  assert.match(result.code,/\(\)=>import\("\.\/Reports\.qb"\)/);
  assert.doesNotMatch(result.code,/import c0 from "\.\/Reports\.qb"/);
});

test('Stages 7C.2-7C.4 reject unsafe guard and route configurations',()=>{
  const rejects=(source:string,pattern:RegExp)=>assert.throws(()=>compile(source,'stage7c234.qb'),error=>error instanceof CompileError&&pattern.test(error.message));
  rejects(syntax.replace('guard async:','guard:').replace('not canOpen()','canOpen()'),/guard async/i);
  rejects(syntax.replace('response boolean','response string'),/boolean response/i);
  rejects(syntax.replace('route "/old":\n            navigate replace "/reports"','route "/old":\n            navigate back'),/redirect-only|Guards support/i);
  rejects(syntax.replace('lazy:\n                Reports','lazy:\n                p text="not imported"'),/lazy requires exactly one imported component/i);
});

test('Vite emits a lazy-only route component as a separate production chunk',async()=>{
  const directory=await mkdtemp(join(resolve('.'),'.qbits-stage7c4-build-')),write=(name:string,value:string)=>writeFile(join(directory,name),value);
  try{
    await write('index.html','<main id="app"></main><script type="module" src="/main.ts"></script>');
    await write('main.ts',"import App from './App.qb';import * as runtime from '@qbits/runtime';App(document.querySelector('#app')!,runtime);");
    await write('Reports.qb','component Reports:\n    template "./Reports.html"');
    await write('Reports.html','<p>Lazy reports marker</p>');
    await write('App.qb','import Reports from "./Reports.qb"\ncomponent App:\n    router:\n        route "/reports":\n            lazy:\n                Reports\n        route "*":\n            p text="Missing"');
    await build({root:directory,plugins:[languagePlugin({projectRoot:directory})],resolve:{alias:{'@qbits/runtime':resolve('runtime/index.ts')}},build:{outDir:'dist'},logLevel:'silent'});
    const assets=join(directory,'dist','assets'),files=(await readdir(assets)).filter(file=>file.endsWith('.js'));assert.ok(files.length>=2);
    const chunks=await Promise.all(files.map(file=>readFile(join(assets,file),'utf8')));assert.equal(chunks.filter(chunk=>chunk.includes('Lazy reports marker')).length,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Firefox coordinates native links, history, guards, stale results, and a real lazy chunk',async()=>{
  const directory=await mkdtemp(join(resolve('.'),'.qbits-stage7c234-')),write=(name:string,value:string)=>writeFile(join(directory,name),value);
  await write('index.html','<main id="app"></main><script type="module" src="/main.ts"></script>');
  await write('main.ts',"import App from './App.qb';import * as runtime from '@qbits/runtime';globalThis.disposeApp=App(document.querySelector('#app')!,runtime);");
  await write('Reports.qb','component Reports:\n    p id="reports" text="Reports loaded"');
  await write('App.qb',`import Reports from "./Reports.qb"
component App:
    action canOpen():
        get "/allowed"
        response boolean
    nav style="position: fixed; top: 0; z-index: 2147483647":
        a id="home-link" href="/" text="Home"
        a id="reports-link" href="/reports" text="Reports"
        a id="loop-link" href="/loop-one" text="Loop"
        a id="external-link" href="https://example.com/" target="_blank" text="External"
    output id="pending" text=str(navigation.pending)
    output id="nav-error" text=navigation.error
    button id="replace" text="Replace":
        on click:
            navigate replace "/login"
    button id="back" text="Back":
        on click:
            navigate back
    router:
        scroll:
            restore = true
        loading:
            p id="global-loading" text="Loading"
        error:
            p id="global-error" text=navigation.error
        route "/":
            div style="height: 2000px":
                p id="home" text="Home page"
        route "/reports":
            guard async:
                if not canOpen():
                    navigate replace "/login"
            lazy:
                Reports
            loading:
                p id="reports-loading" text="Reports loading"
            error:
                p id="reports-error" text=navigation.error
        route "/old":
            navigate replace "/reports"
        route "/login":
            p id="login" text="Login"
        route "/loop-one":
            navigate replace "/loop-two"
        route "/loop-two":
            navigate replace "/loop-one"
        route "*":
            p id="missing" text="Missing"`);
  const server=await createServer({root:directory,plugins:[languagePlugin({projectRoot:directory})],resolve:{alias:{'@qbits/runtime':resolve('runtime/index.ts')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.'),directory]}},build:{outDir:join(directory,'dist'),emptyOutDir:true},logLevel:'silent'}),browser=await firefox.launch({headless:true});
  try{
    await server.listen();const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let calls=0;const responders:((allowed:boolean,status?:number)=>void)[]=[];await page.route('**/allowed',route=>{calls++;responders.push((allowed,status=200)=>route.fulfill({status,body:JSON.stringify(allowed),contentType:'application/json'}));});await page.goto(server.resolvedUrls!.local[0]);await page.locator('#home').waitFor();
    const originalState=await page.evaluate(()=>{history.replaceState({host:'kept'},'',location.href);scrollTo(0,300);return {state:history.state,y:scrollY,restoration:history.scrollRestoration};});assert.deepEqual(originalState,{state:{host:'kept'},y:300,restoration:'manual'});
    await page.locator('#reports-link').click();await page.locator('#reports-loading').waitFor();assert.equal(await page.locator('#pending').textContent(),'true');assert.equal(await page.locator('#home').count(),1);assert.equal(await page.locator('[data-qb-route-status="loading"]').getAttribute('aria-live'),'polite');assert.equal(await page.locator('#home').evaluate(element=>{const rectangle=element.parentElement!.getBoundingClientRect(),top=document.elementFromPoint(Math.max(0,rectangle.left)+1,Math.max(80,rectangle.top+1));return Boolean(top?.closest('[data-qb-route-status="loading"]'));}),true);
    await page.locator('#home-link').click();await page.locator('#home').waitFor();responders.shift()!(true);await page.waitForTimeout(50);assert.equal(await page.locator('#reports').count(),0);assert.equal(await page.evaluate(()=>scrollY),300);
    await page.locator('#reports-link').click();await page.locator('#reports-loading').waitFor();responders.shift()!(true);await page.locator('#reports').waitFor();assert.equal(await page.locator('#pending').textContent(),'false');assert.deepEqual(await page.evaluate(()=>history.state),{host:'kept'});assert.equal(await page.evaluate(()=>scrollY),0);
    await page.locator('#replace').click();await page.locator('#login').waitFor();assert.equal(new URL(page.url()).pathname,'/login');await page.locator('#back').click();await page.locator('#home').waitFor();await page.waitForTimeout(20);assert.equal(await page.evaluate(()=>scrollY),300);
    await page.locator('#reports-link').click();await page.locator('#reports-loading').waitFor();responders.shift()!(false,503);await page.locator('#reports-error').waitFor();assert.match(await page.locator('#nav-error').textContent()??'',/HTTP 503/);assert.equal(await page.locator('#home').count(),1);
    await page.goto(new URL('/old',server.resolvedUrls!.local[0]).href);await page.locator('#reports-loading').waitFor();responders.shift()!(false);await page.locator('#login').waitFor({timeout:5000}).catch(async error=>{throw new Error(`${error}; url=${page.url()}; body=${await page.locator('body').textContent()}; calls=${calls}; queued=${responders.length}; errors=${errors.join('|')}`);});assert.equal(new URL(page.url()).pathname,'/login');assert.equal(calls,4);
    await page.locator('#home-link').click();await page.locator('#home').waitFor();await page.locator('#loop-link').click();assert.match(await page.locator('#nav-error').textContent()??'',/redirect limit/i);assert.equal(await page.locator('#home').count(),1);
    await page.locator('#reports-link').click();await page.locator('#reports-loading').waitFor();await page.evaluate(()=>(globalThis as any).disposeApp());responders.shift()!(true);await page.waitForTimeout(50);assert.equal(await page.locator('#app').textContent(),'');assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();await rm(directory,{recursive:true,force:true});}
});
