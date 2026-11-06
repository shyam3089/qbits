import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';
import {compileFile} from '../tooling/modules.js';
import {identity} from '../tooling/config.js';

test('module graph validates routed component props and dynamic root forwarding',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'qbits-router-')),ext=identity.sourceExtension;
  try{
    await writeFile(join(directory,'Leaf'+ext),'component Leaf(id = ""):\n    p text=id');
    await writeFile(join(directory,'Routes'+ext),`import Leaf from "./Leaf${ext}"\ncomponent Routes:\n    router:\n        route "/<id>":\n            Leaf id=id\n        route "*":\n            p text="404"`);
    const file=join(directory,'App'+ext),source=`import Routes from "./Routes${ext}"\ncomponent App:\n    Routes`;
    await writeFile(file,source);assert.doesNotThrow(()=>compileFile(file));
    assert.throws(()=>compileFile(file,source+' class="page"'),/Ambiguous class forwarding/);
    const routes=join(directory,'Routes'+ext),text=await readFile(routes,'utf8');
    await writeFile(routes,text.replace('Leaf id=id','Leaf id=1'));assert.throws(()=>compileFile(file),/Prop id requires string/);
  }finally{assert.ok(relative(resolve(tmpdir()),resolve(directory)).startsWith('qbits-router-'));await rm(directory,{recursive:true,force:true});}
});

test('routing syntax validates patterns, scopes, fallbacks and navigation',()=>{
  const code=compile(`component App:
    router:
        route "/":
            button text="Open":
                on click:
                    navigate "/products/1"
        route "/products/<id>":
            p text=id
            if id != "":
                p text="Product"
        route "*":
            p text="Not found"`).code;
  assert.match(code,/"kind":"router"/);assert.match(code,/"kind":"navigate"/);
  assert.match(code,/"path":"\/products\/<id>"/);
  const legacy='component App:\n    router:\n        route "/products/:id":\n            p text="legacy"\n        route "*":\n            p text="404"';
  assert.throws(()=>compile(legacy,'legacy.qb'),error=>error instanceof CompileError&&error.diagnostic.line===3&&/Legacy :name.*use <name>/.test(error.message));
  assert.doesNotThrow(()=>compile('component Existing:\n    navigate = ""\n    button:\n        on click:\n            navigate = "value"\n    p text=navigate'));
  const rejects=(body:string,pattern:RegExp)=>assert.throws(()=>compile('component App:\n'+body,'routes.qb'),error=>error instanceof CompileError&&pattern.test(error.message));
  for(const path of ['products','//host','/a/','/a?b','/a/../b','/a/%2f','/a/<__proto__>','/a/<id>/<id>','/a/<not>','/a/<id','/a/id>','/a/<>','/a/<id>suffix','/a/<<id>>','/a/prefix<id>'])
    rejects(`    router:\n        route "${path}":\n            p text="bad"\n        route "*":\n            p text="404"`,/Route|route/);
  rejects('    router:\n        route "/":\n            p text="home"',/final route/);
  rejects('    router:\n        route "*":\n            p text="404"\n        route "/":\n            p text="home"',/must be last/);
  rejects('    router:\n        route "/a/<id>":\n            p text=id\n        route "/a/<name>":\n            p text=name\n        route "*":\n            p text="404"',/ambiguous/);
  rejects('    route "/":\n        p text="home"',/directly inside router/);
  rejects('    router:\n        route "/<id>":\n            button:\n                on click:\n                    id = "changed"\n        route "*":\n            p text="404"',/read-only/);
  rejects('    id = "state"\n    router:\n        route "/<id>":\n            p text=id\n        route "*":\n            p text="404"',/shadowed/);
  rejects('    button:\n        on click:\n            navigate 1',/string path/);
  for(const path of ['//evil.test','javascript:alert(1)','/a/../b','/a/%2f','/a/%zz'])rejects(`    button:\n        on click:\n            navigate "${path}"`,/absolute path|URL/);
  rejects('    on init:\n        navigate "/"\n    p text="home"',/only in event handlers/);
  rejects('    router:\n        route "/<id>":\n            p text=id\n        route "*":\n            p text="404"\n    p text=id',/Unknown state or prop/);
  rejects('    enabled = true\n    if enabled:\n        router:\n            route "*":\n                p text="404"',/static router/);
  rejects('    router:\n        route "*":\n            router:\n                route "*":\n                    p text="404"',/nested or dynamic/);
  const many=Array.from({length:256},(_,i)=>`        route "/p${i}":\n            p text="x"`).join('\n');
  rejects(`    router:\n${many}\n        route "*":\n            p text="404"`,/256 routes/);
});

test('router preserves identity, rolls back navigation and cleans up in Firefox',async()=>{
  const product=compile(`component Product(id = ""):
    count = 0
    on init:
        emit lifecycle("init:" + id)
    on cleanup:
        emit lifecycle("cleanup:" + id)
    section:
        h2 text=id
        input:
            value=id
        button class="count" text=str(count):
            on click:
                count = count + 1`);
  const broken=compile('component Broken:\n    p text="broken"');
  const app=compile(`import Product from "./Product.qb"
import Broken from "./Broken.qb"
component App:
    destination = "/"
    attempts = 0
    p class="attempts" text=str(attempts)
    button class="go" text="Go":
        on click:
            attempts = attempts + 1
            navigate destination
    router:
        route "/":
            p class="home" text="Home"
        route "/products/<id>":
            Product id=id:
                on lifecycle(message):
                    emit lifecycle(message)
        route "/products/new":
            p class="new" text="New product"
        route "/pair/<first>/<second>":
            p class="pair" text=first + ":" + second
        route "/broken":
            Broken
        route "*":
            p class="missing" text="Not found"`,'App.qb',{components:new Map([['Product',product.ast],['Broken',broken.ast]])}).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();await page.route('http://router.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://router.test/');
    const helper=await readFile('tests/helpers/router-browser.mjs','utf8');
    const initial=await page.evaluate(async({runtime,product,app,helper})=>{const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));try{return await (await import(url)).initializeRouting({runtime,product,app});}finally{URL.revokeObjectURL(url);}},{runtime,product:product.code,app,helper});
    assert.equal(initial.isolated,true);assert.deepEqual(initial.retained,{identity:true,count:'1',id:'2',focus:true});assert.equal(initial.mountRollback,true);assert.equal(initial.historyRollback,true);assert.equal(initial.invalidRollback,true);
    assert.equal(initial.errors.length,12);assert.match(initial.errors[0],/mount blocked/);assert.match(initial.errors[1],/history blocked/);
    await page.goBack();assert.equal(new URL(page.url()).pathname,'/products/2');
    assert.deepEqual(await page.evaluate(()=>{const p=(globalThis as any).routingProbe;return [p.host.querySelector('h2').textContent,p.host.querySelector('.count')===p.child,p.child.textContent];}),['2',true,'1']);
    await page.goForward();assert.equal(new URL(page.url()).pathname,'/products/3');
    await page.evaluate(()=>{const p=(globalThis as any).routingProbe;p.disposeSecond();history.pushState(null,'','/broken');history.pushState(null,'','/products/3');});
    await page.goBack();
    await page.waitForFunction(()=>location.pathname==='/products/3'&&(globalThis as any).routingProbe.errors.length===13);
    assert.equal(await page.evaluate(()=>{const p=(globalThis as any).routingProbe;return p.host.querySelector('.count')===p.child&&p.child.textContent==='1';}),true);
    const final=await page.evaluate(()=>{
      const p=(globalThis as any).routingProbe;p.flags.failCleanup=true;
      p.go('/products/new');const staticWins=!!p.host.querySelector('.new'),postCommit=location.pathname==='/products/new'&&p.errors.at(-1).includes('committed but cleanup failed');
      p.go('/pair/one/two');const multiple=p.host.querySelector('.pair').textContent;
      p.go('/unmatched');const missing=!!p.host.querySelector('.missing');
      p.go('/products/%3Cscript%3E');const safe=p.host.querySelector('h2').textContent==='<script>'&&!p.host.querySelector('script');
      p.go('/');const lifecycle=[...p.events];p.dispose();const clean=p.host.childNodes.length===0&&p.second.childNodes.length===0&&p.listeners.size===0;
      p.urls.forEach(URL.revokeObjectURL);return {staticWins,postCommit,multiple,missing,safe,lifecycle,clean};
    });
    assert.equal(final.staticWins,true);assert.equal(final.missing,true);assert.equal(final.safe,true);assert.equal(final.clean,true);
    assert.equal(final.postCommit,true);
    assert.equal(final.multiple,'one:two');
    assert.deepEqual(final.lifecycle,['init:1','cleanup:3','init:<script>','cleanup:<script>']);
    const failures=await page.evaluate(async({runtime,helper})=>{const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));try{return await (await import(url)).validateRouteModels(runtime);}finally{URL.revokeObjectURL(url);}},{runtime,helper});
    assert.equal(failures.length,20);assert.ok(failures.every((failure:string)=>failure!=='accepted'));assert.match(failures[9],/DOM nodes/);assert.match(failures[10],/effects/);assert.match(failures[11],/work/);assert.match(failures[12],/one router/);assert.match(failures[13],/Legacy :name.*use <name>/);
    const recovery=await page.evaluate(async({runtime,helper})=>{const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));try{return await (await import(url)).verifyHistoryRecoveryFailure(runtime);}finally{URL.revokeObjectURL(url);}},{runtime,helper});
    assert.deepEqual(recovery,{message:'Route history recovery failed',errors:['mount blocked','recovery blocked'],disabled:true});
    // Initial malformed URLs use the explicit fallback; no exception or execution.
    await page.goto('http://router.test/products/%zz');
    const fallback=await page.evaluate(async({runtime,app,product})=>{const urls=[runtime,product,'export default function(){}'].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));const appUrl=URL.createObjectURL(new Blob([app.replace('./Product.qb',urls[1]).replace('./Broken.qb',urls[2])],{type:'text/javascript'}));try{const api=await import(urls[0]),module=await import(appUrl),host=document.createElement('main'),dispose=module.default(host,api);const result=host.textContent;dispose();return result;}finally{[...urls,appUrl].forEach(URL.revokeObjectURL);}},{runtime,app,product:product.code});
    assert.match(fallback,/Not found/);
  }finally{await browser.close();}
});
