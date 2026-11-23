import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {firefox} from 'playwright';
import {createServer} from 'vite';
import {compile,CompileError} from '../language/index.js';
import {languagePlugin} from '../tooling/vite.js';

const approved=`component App:
    router:
        route "/":
            div:
                route "":
                    p text="Home"
                route "products/<id:number>":
                    query:
                        tab = "details"
                        page = 1
                    button text=tab + str(page):
                        on click:
                            navigate "/products/<id>":
                                id = id
                                tab = "reviews"
                                page = 2
        route "*":
            p text="Not found"`;

test('Stage 7C.1 lowers nested routes, typed parameters, grouped query, and multiline navigation',()=>{
  const result=compile(approved),router=result.ast.roots[0];
  assert.equal(router.kind,'router');
  if(router.kind!=='router')return;
  const layout=router.routes[0].children[0];assert.equal(layout.kind,'element');
  if(layout.kind!=='element')return;
  const product=layout.children[1];assert.equal(product.kind,'route');
  if(product.kind!=='route')return;
  assert.equal(product.path.value,'products/<id:number>');
  assert.deepEqual(product.query.map(item=>[item.name.value,item.initial.value]),[['tab','details'],['page',1]]);
  assert.match(result.code,/"kind":"route"/);
  assert.match(result.code,/"parameters":\[\{"name":"id","type":"number"\}\]/);
  assert.match(result.code,/"query":\[\{"name":"tab","type":"string"\},\{"name":"page","type":"number"\}\]/);
  assert.doesNotThrow(()=>compile(`component Inherited:
    router:
        route "/organizations/<organizationId:number>":
            div:
                route "members/<memberId>":
                    p text=str(organizationId) + memberId
        route "*":
            p text="404"`));
});

test('Stage 7C.1 rejects malformed trees, ambiguous types, and invalid multiline destinations',()=>{
  const rejects=(source:string,pattern:RegExp)=>assert.throws(()=>compile(source,'stage7c1.qb'),error=>error instanceof CompileError&&pattern.test(error.message));
  for(const parameter of ['<id:integer>','<id:number:x>','<:number>','<id:>'])rejects(`component App:\n    router:\n        route "/${parameter}":\n            p text="x"\n        route "*":\n            p text="404"`,/parameter/i);
  rejects('component App:\n    router:\n        route "/a":\n            div:\n                route "/b":\n                    p text="x"\n        route "*":\n            p text="404"',/relative/);
  rejects('component App:\n    router:\n        route "/<id:number>":\n            p text=str(id)\n        route "/<name>":\n            p text=name\n        route "*":\n            p text="404"',/ambiguous/);
  rejects('component App:\n    router:\n        route "/<id>":\n            div:\n                route "<id>":\n                    p text=id\n        route "*":\n            p text="404"',/shadowed/);
  rejects('component App:\n    router:\n        route "/":\n            query:\n                page = 1\n                page = 2\n            p text="x"\n        route "*":\n            p text="404"',/query/);
  rejects(`component App:
    button text="Go":
        on click:
            navigate "/products/<id>":
                tab = "reviews"
    router:
        route "/products/<id:number>":
            p text=str(id)
        route "*":
            p text="404"`,/requires path parameter id/);
  rejects(approved.replace('id = id','id = "42"'),/requires number/);
  rejects(approved.replace('page = 2','unknown = 2'),/Unknown navigation argument/);
  assert.doesNotThrow(()=>compile(`component Compatible:
    router:
        route "/products/<id>":
            button text=id:
                on click:
                    navigate "/"
        route "*":
            p text="404"`));
});

test('Firefox retains nested layouts, applies typed query defaults, encodes navigation, and inherits fallbacks',async()=>{
  const directory=await mkdtemp(join(resolve('.'),'.qbits-stage7c1-'));
  const write=(name:string,value:string)=>writeFile(join(directory,name),value);
  await write('index.html','<main id="app"></main><script type="module" src="/main.ts"></script>');
  await write('main.ts',"import App from './App.qb';import * as runtime from '@qbits/runtime';App(document.querySelector('#app')!,runtime);");
  await write('MainLayout.qb','component MainLayout:\n    template "./MainLayout.html"');
  await write('MainLayout.html','<section id="main-layout"><h1>Main</h1><slot></slot></section>');
  await write('ProductsLayout.qb','component ProductsLayout:\n    template "./ProductsLayout.html"');
  await write('ProductsLayout.html','<section id="products-layout"><h2>Products</h2><slot></slot></section>');
  await write('HomePage.qb','component HomePage:\n    template "./HomePage.html"');
  await write('HomePage.html','<p id="home">Home</p>');
  await write('MissingPage.qb','component MissingPage:\n    p id="section-missing" text="Section missing"');
  await write('GlobalMissing.qb','component GlobalMissing:\n    p id="global-missing" text="Global missing"');
  await write('SearchPage.qb','component SearchPage(term = "", q = ""):\n    p id="search" text=term + "|" + q');
  await write('ProductPage.qb',`component ProductPage(id = 0, tab = "", page = 0, preview = false):
    count = 0
    section id="product-page":
        output id="product-values" text=str(id) + "|" + tab + "|" + str(page) + "|" + str(preview)
        output id="product-count" text=str(count)
        button id="increment" text="Increment":
            on click:
                count = count + 1`);
  await write('App.qb',`import MainLayout from "./MainLayout.qb"
import ProductsLayout from "./ProductsLayout.qb"
import HomePage from "./HomePage.qb"
import ProductPage from "./ProductPage.qb"
import SearchPage from "./SearchPage.qb"
import MissingPage from "./MissingPage.qb"
import GlobalMissing from "./GlobalMissing.qb"
component App:
    button id="open-product" text="Product":
        on click:
            navigate "/products/<id>":
                id = 42
                tab = "reviews"
                page = 2
                preview = true
    button id="change-query" text="Query":
        on click:
            navigate "/products/<id>":
                id = 42
                tab = "shipping"
                page = 3
    button id="encoded" text="Encoded":
        on click:
            navigate "/search/<term>":
                term = "tea & coffee"
                q = "a/b ?"
    router:
        route "/":
            MainLayout:
                route "":
                    HomePage
                route "products":
                    ProductsLayout:
                        route "<id:number>":
                            query:
                                tab = "details"
                                page = 1
                                preview = false
                            ProductPage id=id tab=tab page=page preview=preview
                route "search/<term>":
                    query:
                        q = ""
                    SearchPage term=term q=q
                route "*":
                    MissingPage
        route "*":
            GlobalMissing`);
  const server=await createServer({root:directory,plugins:[languagePlugin({projectRoot:directory})],resolve:{alias:{'@qbits/runtime':resolve('runtime/index.ts')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.'),directory]}},logLevel:'silent'}),browser=await firefox.launch({headless:true});
  try{
    await server.listen();const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(server.resolvedUrls!.local[0]);await page.waitForTimeout(100);if(!await page.locator('#main-layout').count())throw new Error(`Router did not mount: ${errors.join(' | ')}; ${await page.locator('body').textContent()}`);
    const initialLayout=await page.locator('#main-layout').elementHandle();assert.ok(initialLayout);assert.equal(await page.locator('#home').textContent(),'Home');
    await page.locator('#open-product').click();await page.locator('#product-values').waitFor();assert.equal(await page.locator('#product-values').textContent(),'42|reviews|2|true');assert.equal(await page.locator('#main-layout').elementHandle().then(handle=>handle?.evaluate((node,old)=>node===old,initialLayout)),true);
    await page.locator('#increment').click();const historyBefore=await page.evaluate(()=>history.length);assert.equal(await page.locator('#product-count').textContent(),'1');assert.equal(await page.evaluate(()=>history.length),historyBefore);
    const product=await page.locator('#product-page').elementHandle();await page.locator('#change-query').click();await page.waitForFunction(()=>document.querySelector('#product-values')?.textContent==='42|shipping|3|false');assert.equal(await page.locator('#product-page').elementHandle().then(handle=>handle?.evaluate((node,old)=>node===old,product)),true);assert.equal(await page.locator('#product-count').textContent(),'1');
    await page.goto(new URL('/products/7?tab=summary&page=bad&preview=bad',server.resolvedUrls!.local[0]).href);await page.locator('#product-values').waitFor();assert.equal(await page.locator('#product-values').textContent(),'7|summary|1|false');
    await page.goto(new URL('/products/01',server.resolvedUrls!.local[0]).href);await page.locator('#section-missing').waitFor();assert.equal(await page.locator('#products-layout').count(),0);assert.equal(await page.locator('#main-layout').count(),1);
    await page.locator('#encoded').click();await page.locator('#search').waitFor();assert.equal(await page.locator('#search').textContent(),'tea & coffee|a/b ?');assert.equal(decodeURIComponent(new URL(page.url()).pathname),'/search/tea & coffee');assert.equal(new URL(page.url()).searchParams.get('q'),'a/b ?');
    await page.goto(new URL('/bad/%2f',server.resolvedUrls!.local[0]).href);await page.locator('#global-missing').waitFor();assert.deepEqual(errors,[]);
  }finally{await browser.close();await server.close();await rm(directory,{recursive:true,force:true});}
});
