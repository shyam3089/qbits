import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firefox } from 'playwright';
import { compile } from '../language/index.js';
import { reactiveFixtures } from './helpers/reactivity-fixtures.js';

test('transactions roll back duplicate keys and overflow while preserving subscriptions and cleanup', async () => {
  const [runtime, helper] = await Promise.all([
    readFile('dist/lib/runtime/index.js', 'utf8'), readFile('tests/helpers/reactivity-browser.mjs', 'utf8'),
  ]);
  const browser = await firefox.launch({headless: true});
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const result = await page.evaluate(async ({runtime, helper, modules}) => {
      const url = URL.createObjectURL(new Blob([helper], {type: 'text/javascript'}));
      try {const {verifyEdges} = await import(url); return await verifyEdges(runtime, modules);}
      finally {URL.revokeObjectURL(url);}
    }, {runtime, helper, modules: reactiveFixtures(3)});
    assert.deepEqual(result, {
      retained: true, replaced: 'New!!', childLabel: 'New', childState: '1', sequential: '7:5',
      inactiveText: 'New!!', remounted: 'Renamed!!',
      duplicateErrors: 1, duplicateRetained: true, duplicateRolledBack: true, recovered: true,
      prepend: {inserted: 3, removed: 0, retained: true},
      overflowErrors: 1, overflowRetained: true,
      mountFailure: 'Expected child mount failure', afterFailedMount: {nodes: 0, listeners: 0},
      cleanupFailure: 'Expected child cleanup failure', remainingNodes: 0, listeners: 0,
    });
    assert.deepEqual(errors, []);
  } finally {await browser.close();}
});

test('child events update parent state through keyed component lists in Firefox',async()=>{
  const frame=compile(`component Frame:
    section:
        slot`,'Frame.qb');
  const childModule=compile(`component ProductCard(product_id = 0, title = "Product"):
    section:
        h2 text=title
        button text="Add to cart":
            on click:
                emit add_to_cart(product_id)`,'ProductCard.qb');
  const parent=compile(`import ProductCard from "./ProductCard.qb"
import Frame from "./Frame.qb"
component Store:
    cart = 0
    product_ids = [41, 42]
    Frame:
        h1 text="Cart: " + str(cart)
        for id in product_ids key=id:
            ProductCard product_id=id title="Pack " + str(id):
                on add_to_cart(product_id):
                    cart = cart + product_id
                    product_ids.move(id, 0)`,'Store.qb',{components:new Map([['ProductCard',childModule.ast],['Frame',frame.ast]])}).code.replace('./ProductCard.qb','__CHILD__').replace('./Frame.qb','__FRAME__');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8');
  const browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const result=await page.evaluate(async({runtime,child,frame,parent})=>{const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),childUrl=URL.createObjectURL(new Blob([child],{type:'text/javascript'})),frameUrl=URL.createObjectURL(new Blob([frame],{type:'text/javascript'})),parentUrl=URL.createObjectURL(new Blob([parent.replace('__CHILD__',childUrl).replace('__FRAME__',frameUrl)],{type:'text/javascript'}));try{const api=await import(runtimeUrl),app=await import(parentUrl),host=document.createElement('div');document.body.append(host);const dispose=app.default(host,api),buttons=[...host.querySelectorAll('button')],second=buttons[1];second.click();return {cart:host.querySelector('h1')?.textContent,order:[...host.querySelectorAll('h2')].map(item=>item.textContent),retained:host.querySelectorAll('button')[0]===second,errors:0,dispose:typeof dispose};}finally{URL.revokeObjectURL(parentUrl);URL.revokeObjectURL(frameUrl);URL.revokeObjectURL(childUrl);URL.revokeObjectURL(runtimeUrl);}}, {runtime,child:childModule.code,frame:frame.code,parent});
    assert.deepEqual(result,{cart:'Cart: 42',order:['Pack 42','Pack 41'],retained:true,errors:0,dispose:'function'});assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('structural preparation failures preserve committed identity and post-commit cleanup stays consistent',async()=>{
  const [runtime,helper]=await Promise.all([readFile('dist/lib/runtime/index.js','utf8'),readFile('tests/helpers/reactivity-browser.mjs','utf8')]);
  const browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
    const result=await page.evaluate(async({runtime,helper,modules})=>{const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));try{const {verifyTransactionalFailures}=await import(url);return await verifyTransactionalFailures(runtime,modules);}finally{URL.revokeObjectURL(url);}},{runtime,helper,modules:reactiveFixtures(3)});
    assert.deepEqual(result.transient,{mounts:3,first:{same:true,connected:true,id:'1',state:'1'},retry:{same:false,connected:false,id:'2',state:'0'}});
    assert.deepEqual(result.persistent,{mounts:3,first:{same:true,connected:true,id:'1',state:'1'},retry:{same:true,connected:true,id:'1',state:'1'}});
    assert.deepEqual(result.conditional,{mounts:3,first:{same:true,connected:true,label:'Before',state:'1'},retry:{same:false,connected:false,label:'After',state:'0'}});
    assert.deepEqual(result.cleanup,{removedAfterCommit:true,cleanupCalls:1,restored:true,same:false,id:'1',state:'0'});
    assert.equal(result.nestedRollback,'0');assert.equal(result.nestedRecovered,'1');
    assert.deepEqual(result.fatal,{disabled:true,detached:true});
    assert.equal(result.errors.length,7);assert.match(result.errors[0],/Transient replacement failure/);assert.match(result.errors[1],/Persistent replacement failure/);assert.match(result.errors[2],/Persistent replacement failure/);assert.match(result.errors[3],/Conditional replacement failure/);assert.match(result.errors[4],/committed but cleanup failed/);assert.match(result.errors[5],/Duplicate iteration key/);assert.match(result.errors[6],/recovery was incomplete/);
    assert.deepEqual(pageErrors,[]);
  }finally{await browser.close();}
});

test('all numeric entry paths reject non-finite and unsafe integers before mounting',async()=>{
  const sources=[
    `component Initial:\n    value = 9007199254740991 + 1\n    p text=str(value)`,
    `component Computed:\n    value = 9007199254740991\n    computed next = value + 1\n    p text=str(next)`,
    `class Item:\n    value = 0\ncomponent Constructor:\n    item = Item(9007199254740991 + 1)\n    p text=str(item.value)`,
    `class Item:\n    value = 0\n    computed next = value + 1\ncomponent ClassComputed:\n    item = Item(9007199254740991)\n    p text=str(item.next)`,
    `component HostProp(value = 0):\n    p text=str(value)`,
  ];
  const modules=sources.map(source=>compile(source).code),runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,modules})=>{const urls=[runtime,...modules].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),components=[];for(const value of urls.slice(1))components.push(await import(value));const attempts=[()=>components[0].default(document.createElement('main'),api),()=>components[1].default(document.createElement('main'),api),()=>components[2].default(document.createElement('main'),api),()=>components[3].default(document.createElement('main'),api),()=>components[4].default(document.createElement('main'),api,{value:Number.NaN}),()=>components[4].default(document.createElement('main'),api,{value:Number.POSITIVE_INFINITY}),()=>components[4].default(document.createElement('main'),api,{value:9007199254740992}),()=>api.mountCounter(document.createElement('main'),{initial:Number.NaN,prefix:'',step:1}),()=>api.mountCounter(document.createElement('main'),{initial:0,prefix:'',step:Number.POSITIVE_INFINITY})];return attempts.map(run=>{try{run();return null;}catch(error){return {name:error.name,message:error.message};}});}finally{urls.forEach(value=>URL.revokeObjectURL(value));}},{runtime,modules});
    assert.equal(result.length,9);for(const failure of result)assert.deepEqual(failure,{name:'RangeError',message:'State exceeded safe integer range'});
  }finally{await browser.close();}
});

test('API-fed typed lists preserve keyed identity, updates and safety',async()=>{
  const source=`class Item:
    id = 0
    name = ""
    value = 0
    action increment:
        value = value + 1
component ApiRows:
    items = [Item(0, "schema", 0)]
    section:
        for item in items key=item.id:
            div class="row":
                span class="name" text=item.name
                span class="value" text=str(item.value)
                button class="increment" text="Increase":
                    on click:
                        item.increment()
                button class="move" text="Move first":
                    on click:
                        items.move(item, 0)`;
  const [runtime,moduleCode]=await Promise.all([readFile('dist/lib/runtime/index.js','utf8'),Promise.resolve(compile(source).code)]),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,moduleCode})=>{const urls=[runtime,moduleCode].map(value=>URL.createObjectURL(new Blob([value],{type:'text/javascript'})));try{const api=await import(urls[0]),component=await import(urls[1]),host=document.createElement('main'),dispose=component.default(host,api,{}, {items:[{id:1,name:'One',value:0},{id:2,name:'Two',value:0},{id:3,name:'Three',value:0}]});const retained=host.querySelectorAll('.row')[2];(host.querySelectorAll('.increment')[1] as HTMLButtonElement).click();(host.querySelectorAll('.move')[2] as HTMLButtonElement).click();const snapshot={names:[...host.querySelectorAll('.name')].map(node=>node.textContent),values:[...host.querySelectorAll('.value')].map(node=>node.textContent),retained:host.querySelectorAll('.row')[0]===retained};dispose();const invalid=[];for(const state of [{missing:[]},{items:[{id:1,name:'One',value:0,extra:true}]},{items:[{id:Number.NaN,name:'One',value:0}]}]){const target=document.createElement('main');try{component.default(target,api,{},state);invalid.push('accepted');}catch(error){invalid.push(`${error.name}:${error.message}:${target.childNodes.length}`);}}return {snapshot,invalid};}finally{urls.forEach(value=>URL.revokeObjectURL(value));}},{runtime,moduleCode});
    assert.deepEqual(result.snapshot,{names:['Three','One','Two'],values:['0','0','1'],retained:true});
    assert.match(result.invalid[0],/^TypeError:Unknown initial state missing:0$/);assert.match(result.invalid[1],/^TypeError:Unknown field extra/);assert.match(result.invalid[2],/^RangeError:State exceeded safe integer range:0$/);
  }finally{await browser.close();}
});

test('all four-row permutations use the minimum number of range moves and retain focused child instances', async () => {
  const permutations = (items: number[]): number[][] => items.length ? items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest])) : [[]];
  const source = `import Row from "./Row.qb"
class Item:
    id = 0
component Permutations:
${[0,1,2,3].map(i=>`    item${i} = Item(${i})`).join('\n')}
    items = [item0, item1, item2, item3]
${permutations([0,1,2,3]).map(order=>`    button text="${order.join(',')}":\n        on click:\n${[...order].reverse().map(i=>`            items.move(item${i}, 0)`).join('\n')}`).join('\n')}
    ul:
        for item in items key=item.id:
            li:
                input:
                    value="Text"
                Row label=str(item.id)
`;
  const [runtime, helper] = await Promise.all([readFile('dist/lib/runtime/index.js', 'utf8'), readFile('tests/helpers/reactivity-browser.mjs', 'utf8')]);
  const browser = await firefox.launch({headless: true});
  try {
    const page = await browser.newPage();
    const modules = {...reactiveFixtures(1), './Permutations.qb': compile(source).code};
    const result = await page.evaluate(async ({runtime,helper,modules}) => {
      const url = URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));
      try {const {verifyReorders} = await import(url);return await verifyReorders(runtime,modules);}
      finally {URL.revokeObjectURL(url);}
    }, {runtime,helper,modules});
    assert.deepEqual(result,{checked:24,failures:[],focused:true,remainingNodes:0});
  } finally {await browser.close();}
});

test('1000 keyed rows isolate updates, retain child state and focus, and release repeated mounts', async () => {
  const [runtime, helper] = await Promise.all([
    readFile('dist/lib/runtime/index.js', 'utf8'),
    readFile('tests/helpers/reactivity-browser.mjs', 'utf8'),
  ]);
  const browser = await firefox.launch({headless: true});
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const result = await page.evaluate(async ({runtime, helper, modules}) => {
      const url = URL.createObjectURL(new Blob([helper], {type: 'text/javascript'}));
      try {const {measure} = await import(url); return await measure(runtime, modules, {samples: 3, cycles: 12});}
      finally {URL.revokeObjectURL(url);}
    }, {runtime, helper, modules: reactiveFixtures()});
    assert.equal(result.batchInitial, '3'); assert.equal(result.batchValue, '7');
    assert.equal(result.batchUpdate.textWrites, 1);
    assert.equal(result.isolated.textWrites, 1);
    assert.equal(result.propUpdate.textWrites, 2);
    assert.equal(result.childProp, 'Changed'); assert.equal(result.unrelated, 'Row 01');
    assert.equal(result.childState, '1'); assert.equal(result.identity, true); assert.equal(result.focus, true);
    assert.equal(result.move.fragments, 1); assert.equal(result.move.inserted, 3); assert.equal(result.move.removed, 3);
    assert.equal(result.move.elements, 0); assert.equal(result.move.texts, 0); assert.equal(result.move.comments, 0);
    assert.equal(result.move.adds, 0); assert.equal(result.move.removes, 0); assert.equal(result.move.textWrites, 0);
    assert.equal(result.noop.fragments, 0); assert.equal(result.noop.elements, 0); assert.equal(result.noop.comments, 0); assert.equal(result.noop.textWrites, 0);
    assert.equal(result.append.elements, 10); assert.equal(result.remove.elements, 0);
    assert.equal(result.remove.removes, 6);
    assert.equal(result.detached.textWrites, 0); assert.equal(result.afterDispose.textWrites, 0);
    assert.equal(result.liveListeners, 0); assert.equal(result.remainingNodes, 0); assert.equal(result.empty, true);
    assert.deepEqual(errors, []);
  } finally {await browser.close();}
});

test('nested dynamic ranges update after fragment mounting and retain keyed identity', async () => {
  const code = compile(`class Item:
    id = 0
    name = ""
    enabled = true
component Nested:
    visible = true
    detailed = true
    items = [Item(1, "<img src=x>", true), Item(2, "Coffee", true)]
    button text="Hide":
        on click:
            visible = false
    button text="Show":
        on click:
            visible = true
    button text="Compact":
        on click:
            detailed = false
    if visible:
        if detailed:
            h2 text="Details"
        else:
            h2 text="Compact"
        for item in items key=item.id:
            if item.enabled:
                span text=item.name
            input:
                type="checkbox"
                checked=item.enabled
                on change:
                    item.enabled = event.checked
            button text="Move " + item.name:
                on click:
                    items.move(item, 0)
            button text="Remove " + item.name:
                on click:
                    items.remove(item)
        button text="Add":
            on click:
                items.append(Item(3, "Cocoa", true))
`).code;
  const runtime = await readFile('dist/lib/runtime/index.js', 'utf8');
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const result = await page.evaluate(async ({ code, runtime }) => {
      const urls = [runtime, code].map(source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      try {
        const api = await import(/* @vite-ignore */ urls[0]);
        const { default: mount } = await import(/* @vite-ignore */ urls[1]);
        const host = document.createElement('main'); document.body.append(host);
        const dispose = mount(host, api);
        const actions = { click(text: string) {
          const button = [...host.querySelectorAll('button')].find(node => node.textContent === text);
          if (!button) throw new Error(`Missing button ${text}`);
          button.click();
        } };
        actions.click('Compact');
        const nestedCondition = host.querySelector('h2')?.textContent;
        const coffee = host.querySelectorAll('span')[1];
        const input = host.querySelectorAll('input')[1];
        actions.click('Move Coffee');
        const retained = host.querySelector('span') === coffee && host.querySelector('input') === input;
        input.click(); input.click();
        const nestedAfterMove = host.querySelector('span')?.textContent;
        actions.click('Remove <img src=x>'); actions.click('Add');
        const names = [...host.querySelectorAll('span')].map(node => node.textContent);
        const safe = !host.querySelector('img');
        const removedButton = [...host.querySelectorAll('button')].find(node => node.textContent === 'Remove Coffee')!;
        actions.click('Hide'); removedButton.click(); actions.click('Show');
        const remounted = [...host.querySelectorAll('span')].map(node => node.textContent);
        dispose(); dispose(); input.click(); removedButton.click();
        const empty = host.childNodes.length === 0;
        host.remove();
        return { nestedCondition, retained, nestedAfterMove, names, safe, remounted, empty };
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    }, { code, runtime });
    assert.deepEqual(result, { nestedCondition: 'Compact', retained: true, nestedAfterMove: 'Coffee', names: ['Coffee', 'Cocoa'], safe: true, remounted: ['Coffee', 'Cocoa'], empty: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('slotted parent content stays reactive and preserves keyed identity, rollback, focus and disposal',async()=>{
  const panel=compile(`component Panel(title = ""):
    section class="panel":
        h2 text=title
        slot
`).code,row=compile(`component Row(label = ""):
    count = 0
    li class="row":
        input:
            value=label
        button class="local" text=str(count):
            on click:
                count = count + 1
`).code,wrapper=compile(`import Panel from "./Panel.qb"
component Wrapper(title = ""):
    Panel title=title:
        slot
`).code,app=compile(`import Wrapper from "./Wrapper.qb"
import Row from "./Row.qb"
class Item:
    id = 0
    label = ""
component App:
    first = Item(1, "One")
    second = Item(2, "Two")
    items = [first, second]
    count = 0
    visible = true
    button class="increment" text="Increment":
        on click:
            count = count + 1
    button class="duplicate" text="Duplicate":
        on click:
            items.append(Item(1, "Duplicate"))
    button class="move" text="Move":
        on click:
            items.move(second, 0)
    button class="hide" text="Hide":
        on click:
            visible = false
    button class="show" text="Show":
        on click:
            visible = true
    Wrapper title="Items " + str(count):
        p class="projected" text="Parent " + str(count)
        if visible:
            ul:
                for item in items key=item.id:
                    Row label=item.label
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),failure=page.waitForEvent('pageerror'),result=await page.evaluate(async({runtime,panel,row,wrapper,app})=>{
      const urls=[runtime,panel,row].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),wrapperURL=URL.createObjectURL(new Blob([wrapper.replace(JSON.stringify('./Panel.qb'),JSON.stringify(urls[1]))],{type:'text/javascript'})),appSource=app.replace(JSON.stringify('./Wrapper.qb'),JSON.stringify(wrapperURL)).replace(JSON.stringify('./Row.qb'),JSON.stringify(urls[2])),appURL=URL.createObjectURL(new Blob([appSource],{type:'text/javascript'}));urls.push(wrapperURL,appURL);
      try{
        const api=await import(urls[0]),wrapperModule=await import(wrapperURL),rowModule=await import(urls[2]),component=await import(appURL),host=document.createElement('main'),sibling=document.createElement('aside');host.append(sibling);document.body.append(host);const dispose=component.default(host,api),panelNode=host.querySelector('.panel'),rows=[...host.querySelectorAll('.row')],second=rows[1],input=second.querySelector('input'),local=second.querySelector('.local');
        local.click();input.focus();input.setSelectionRange(1,2);host.querySelector('.increment').click();const reactive={samePanel:host.querySelector('.panel')===panelNode,title:host.querySelector('h2').textContent,projected:host.querySelector('.projected').textContent};
        host.querySelector('.duplicate').click();const afterRollback=[...host.querySelectorAll('.row')];
        host.querySelector('.move').click();const moved=[...host.querySelectorAll('.row')],identity={rollback:afterRollback[1]===second,moved:moved[0]===second,local:second.querySelector('.local').textContent,focused:document.activeElement===input,selection:[input.selectionStart,input.selectionEnd]};
        host.querySelector('.hide').click();const hidden=host.querySelectorAll('.row').length;host.querySelector('.show').click();const shown=[...host.querySelectorAll('.row')].map(node=>node.querySelector('input').value);dispose();dispose();const remaining=host.childNodes.length,owned=host.firstChild===sibling;host.remove();
        const limitHost=document.createElement('main'),limitSibling=document.createElement('aside');limitHost.append(limitSibling);let depthFailure='';try{api.mountComponent(limitHost,component.model,[wrapperModule.default,rowModule.default],{}, {maxComponentDepth:3});}catch(error){depthFailure=error.message;}const depthRollback=limitHost.childNodes.length===1&&limitHost.firstChild===limitSibling;
        const plainHost=document.createElement('main'),plainSibling=document.createElement('aside'),plainModel={props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[{kind:'element',tag:'p',component:-1,static:1,attributes:{text:{kind:'literal',value:'plain'}},children:[]}]};plainHost.append(plainSibling);let plainFailure='';try{api.mountComponentWithContent(plainHost,plainModel,[],{}, {},()=>()=>{});}catch(error){plainFailure=error.message;}const plainRollback=plainHost.childNodes.length===1&&plainHost.firstChild===plainSibling;return{reactive,identity,hidden,shown,remaining,owned,depthFailure,depthRollback,plainFailure,plainRollback};
      }finally{urls.forEach(url=>URL.revokeObjectURL(url));}
    },{runtime,panel,row,wrapper,app});
    assert.equal((await failure).message,'Duplicate iteration key 1');assert.deepEqual(result,{reactive:{samePanel:true,title:'Items 1',projected:'Parent 1'},identity:{rollback:true,moved:true,local:'1',focused:true,selection:[1,2]},hidden:0,shown:['Two','One'],remaining:1,owned:true,depthFailure:'Component nesting exceeds the configured limit of 3',depthRollback:true,plainFailure:'Component does not accept content',plainRollback:true});
  }finally{await browser.close();}
});

test('unchanged text values produce no character data mutations', async () => {
  const code = compile(`component Text:
    items = [1, 1]
    button text="Move":
        on click:
            items.move(1, 1)
    button text="Add":
        on click:
            items.append(3)
    p text=str(items)
`).code;
  const runtime = await readFile('dist/lib/runtime/index.js', 'utf8');
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ code, runtime }) => {
      const urls = [runtime, code].map(source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      try {
        const api = await import(/* @vite-ignore */ urls[0]);
        const { default: mount } = await import(/* @vite-ignore */ urls[1]);
        const host = document.createElement('main'); document.body.append(host);
        const dispose = mount(host, api);
        const text = host.querySelector('p')!.firstChild!;
        const observer = new MutationObserver(() => {});
        observer.observe(text, { characterData: true });
        const buttons = host.querySelectorAll('button');
        buttons[0].click();
        const unchanged = observer.takeRecords().length;
        buttons[1].click();
        const changed = observer.takeRecords().length;
        observer.disconnect(); dispose(); host.remove();
        return { unchanged, changed, text: text.textContent };
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    }, { code, runtime });
    assert.deepEqual(result, { unchanged: 0, changed: 1, text: '1,1,3' });
  } finally { await browser.close(); }
});

test('disposed handles release mount hosts while preserving nested ownership and idempotent disposal', async () => {
  const child=compile(`component Child(label = "Owned"):
    count = 0
    button text=label + str(count):
        on click:
            count = count + 1
`).code,parent=compile(`import Child from "./Child.qb"
component Retained(label = "Owned"):
    section:
        Child label=label
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const behavior=await page.evaluate(async({runtime,child,parent})=>{
      const urls=[runtime,child].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),parentURL=URL.createObjectURL(new Blob([parent.replace(JSON.stringify('./Child.qb'),JSON.stringify(urls[1]))],{type:'text/javascript'}));urls.push(parentURL);
      try{
        const api=await import(urls[0]),component=await import(urls[2]),handles=[],hosts=[],nodes=[],props=[],eventMaps=[];
        for(let cycle=0;cycle<30;cycle++){
          const host=document.createElement('main'),sibling=document.createElement('aside'),supplied={label:'Owned'},eventMap={unused:supplied.toString.bind(supplied)};host.append(sibling);document.body.append(host);
          const dispose=component.default(host,api,supplied,{},undefined,eventMap),root=host.querySelector('section'),button=host.querySelector('button');button.click();
          if(button.textContent!=='Owned1'||host.firstChild!==sibling)throw new Error('Nested ownership changed');
          hosts.push(new WeakRef(host));nodes.push(new WeakRef(root));props.push(new WeakRef(supplied));eventMaps.push(new WeakRef(eventMap));dispose();dispose();dispose.refresh();button.click();
          if(host.childNodes.length!==1||host.firstChild!==sibling||button.textContent!=='Owned1')throw new Error('Disposal was not isolated and idempotent');
          host.remove();handles.push(dispose);
        }
        (globalThis as any).__disposedHostProbe={handles,hosts,nodes,props,eventMaps};return {handles:handles.length};
      }finally{urls.forEach(url=>URL.revokeObjectURL(url));}
    },{runtime,child,parent});
    assert.equal(behavior.handles,30);await page.requestGC();
    const retained=await page.evaluate(()=>{const probe=(globalThis as any).__disposedHostProbe;return {handles:probe.handles.length,hosts:probe.hosts.filter((ref:WeakRef<object>)=>ref.deref()).length,nodes:probe.nodes.filter((ref:WeakRef<object>)=>ref.deref()).length,props:probe.props.filter((ref:WeakRef<object>)=>ref.deref()).length,eventMaps:probe.eventMaps.filter((ref:WeakRef<object>)=>ref.deref()).length};});
    assert.deepEqual(retained,{handles:30,hosts:0,nodes:0,props:0,eventMaps:0});
  }finally{await browser.close();}
});

test('static bindings validate numbers and hostile host values with mount rollback',async()=>{
  const [runtime,helper]=await Promise.all([readFile('dist/lib/runtime/index.js','utf8'),readFile('tests/helpers/reactivity-browser.mjs','utf8')]),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),result=await page.evaluate(async({runtime,helper})=>{const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));try{return await (await import(url)).staticValidationProbe(runtime);}finally{URL.revokeObjectURL(url);}},{runtime,helper});
    assert.equal(result.failures.length,39);assert.equal(result.failures.filter(value=>value==='accepted').length,0);
    assert.ok(result.failures.slice(0,24).every(value=>/^RangeError:State exceeded safe integer range:1:true$/.test(value)),JSON.stringify(result.failures));
    assert.ok(result.failures.slice(24,26).every(value=>/^TypeError:checked requires boolean:1:true$/.test(value)));
    assert.match(result.failures[26],/^TypeError:Invalid prop class:1:true$/);
    assert.match(result.failures[27],/^RangeError:State exceeded safe integer range:1:true$/);
    assert.match(result.failures[28],/^RangeError:State exceeded safe integer range:1:true$/);
    assert.match(result.failures[29],/^TypeError:Class field value requires number:1:true$/);
    assert.match(result.failures[30],/^TypeError:Class field value requires a literal default:1:true$/);
    assert.match(result.failures[31],/^Error:proxy blocked:1:true$/);
    assert.match(result.failures[32],/^Error:getter blocked:1:true$/);
    assert.match(result.failures[33],/^Error:state proxy blocked:1:true$/);
    assert.match(result.failures[34],/^Error:literal getter blocked:1:true$/);
    assert.ok(result.failures.slice(35).every(value=>/^RangeError:State exceeded safe integer range:1:true$/.test(value)),JSON.stringify(result.failures));
    assert.deepEqual(result.exact,{value:'safe',nodes:1});assert.equal(result.empty,true);
  }finally{await browser.close();}
});

test('lifecycle hooks are ordered, exactly once, and safe across slots, keys, failures and repeated disposal',async()=>{
  const leaf=compile(`component Leaf(label = "", value = 0):
    count = 0
    on init:
        emit trace("mount " + label)
        count = value + 1
    on cleanup:
        emit trace("cleanup " + label)
    span text=label`,'Leaf.qb');
  const wrapper=compile(`component Wrapper:
    on init:
        emit trace("mount wrapper")
    on cleanup:
        emit trace("cleanup wrapper")
    section:
        slot`,'Wrapper.qb');
  const appSource=`import Leaf from "./Leaf.qb"
import Wrapper from "./Wrapper.qb"
class Item:
    id = 0
    label = ""
    value = 0
component App:
    one = Item(1, "one", 0)
    two = Item(2, "two", 0)
    bad = Item(3, "bad", 9007199254740991)
    items = [one, two]
    visible = true
    on init:
        emit trace("mount app")
    on cleanup:
        emit trace("cleanup app")
    Wrapper:
        on trace(message):
            emit trace(message)
        if visible:
            for item in items key=item.id:
                Leaf label=item.label value=item.value:
                    on trace(message):
                        emit trace(message)
    button text="move":
        on click:
            items.move(two, 0)
    button text="hide":
        on click:
            visible = false
    button text="show":
        on click:
            visible = true
    button text="remove one":
        on click:
            items.remove(one)
    button text="append bad":
        on click:
            items.append(bad)`;
  const app=compile(appSource,'App.qb',{components:new Map([['Leaf',leaf.ast],['Wrapper',wrapper.ast]])}).code.replace('./Leaf.qb','__LEAF__').replace('./Wrapper.qb','__WRAPPER__');
  const fault=compile(`component Fault:
    count = 0
    on init:
        emit trace("mount fault")
    on cleanup:
        emit trace("cleanup fault")
        count = 9007199254740991
        count = count + 1
    div`,'Fault.qb');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),mountErrors:string[]=[];page.on('pageerror',error=>mountErrors.push(error.message));
    const result=await page.evaluate(async({runtime,leaf,wrapper,app,fault})=>{
      const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),leafUrl=URL.createObjectURL(new Blob([leaf],{type:'text/javascript'})),wrapperUrl=URL.createObjectURL(new Blob([wrapper],{type:'text/javascript'})),appUrl=URL.createObjectURL(new Blob([app.replace('__LEAF__',leafUrl).replace('__WRAPPER__',wrapperUrl)],{type:'text/javascript'})),faultUrl=URL.createObjectURL(new Blob([fault],{type:'text/javascript'})),urls=[runtimeUrl,leafUrl,wrapperUrl,appUrl,faultUrl];
      try{
        const api=await import(runtimeUrl),application=await import(appUrl),faultModule=await import(faultUrl),log:string[]=[],events:any={};events.trace=log.push.bind(log);
        const host=document.createElement('main');document.body.append(host);const dispose=application.default(host,api,{}, {},undefined,events),buttons=[...host.querySelectorAll('button')];
        const initial=[...log];buttons[0].click();const afterMove=[...log];buttons[1].click();const afterHide=[...log];buttons[2].click();const afterShow=[...log];buttons[3].click();const afterRemove=[...log];buttons[4].click();const afterFailure=[...log],labels=[...host.querySelectorAll('span')].map(node=>node.textContent);dispose();dispose();const final=[...log],empty=host.childNodes.length===0;host.remove();
        const faultHost=document.createElement('main'),faultLog:string[]=[],faultEvents:any={};faultEvents.trace=faultLog.push.bind(faultLog);document.body.append(faultHost);const disposeFault=faultModule.default(faultHost,api,{}, {},undefined,faultEvents);let cleanupError='';try{disposeFault();}catch(error){cleanupError=(error as Error).message;}disposeFault();const faultEmpty=faultHost.childNodes.length===0;faultHost.remove();
        return{initial,afterMove,afterHide,afterShow,afterRemove,afterFailure,labels,final,empty,faultLog,cleanupError,faultEmpty};
      }finally{urls.forEach(URL.revokeObjectURL);}
    },{runtime,leaf:leaf.code,wrapper:wrapper.code,app,fault:fault.code});
    assert.deepEqual(result,{initial:['mount app','mount wrapper','mount one','mount two'],afterMove:['mount app','mount wrapper','mount one','mount two'],afterHide:['mount app','mount wrapper','mount one','mount two','cleanup one','cleanup two'],afterShow:['mount app','mount wrapper','mount one','mount two','cleanup one','cleanup two','mount two','mount one'],afterRemove:['mount app','mount wrapper','mount one','mount two','cleanup one','cleanup two','mount two','mount one','cleanup one'],afterFailure:['mount app','mount wrapper','mount one','mount two','cleanup one','cleanup two','mount two','mount one','cleanup one','mount bad','cleanup bad'],labels:['two'],final:['mount app','mount wrapper','mount one','mount two','cleanup one','cleanup two','mount two','mount one','cleanup one','mount bad','cleanup bad','cleanup two','cleanup wrapper','cleanup app'],empty:true,faultLog:['mount fault','cleanup fault'],cleanupError:'State exceeded safe integer range',faultEmpty:true});
    await page.waitForTimeout(0);assert.deepEqual(mountErrors,['State exceeded safe integer range']);
  }finally{await browser.close();}
});

test('shared state is fine-grained, transactional and isolated per app across slotted keyed children',async()=>{
  const cart=compile('shared Cart:\n    count = 0\n    total = 0','Cart.qb');
  const shared=new Map([['Cart',cart.ast]]);
  const summary=compile('import Cart from "./Cart.qb"\ncomponent Summary:\n    p text=str(Cart.count) + ":" + str(Cart.total)','Summary.qb',{shared});
  const add=compile('import Cart from "./Cart.qb"\ncomponent Add(amount = 1, label = "add"):\n    button text=label:\n        on click:\n            Cart.count = Cart.count + 1\n            Cart.total = Cart.total + amount','Add.qb',{shared});
  const frame=compile('component Frame:\n    section:\n        slot','Frame.qb');
  const appSource=`import Summary from "./Summary.qb"
import Add from "./Add.qb"
import Frame from "./Frame.qb"
component App:
    one = 1
    two = 2
    ids = [one, two]
    visible = true
    Summary
    Frame:
        if visible:
            for id in ids key=id:
                Add amount=id label="add " + str(id)
    Add amount=9007199254740991 label="bad"
    button text="move":
        on click:
            ids.move(two, 0)
    button text="hide":
        on click:
            visible = false
    button text="show":
        on click:
            visible = true`;
  const app=compile(appSource,'App.qb',{components:new Map([['Summary',summary.ast],['Add',add.ast],['Frame',frame.ast]])}).code.replace('./Summary.qb','__SUMMARY__').replace('./Add.qb','__ADD__').replace('./Frame.qb','__FRAME__');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const result=await page.evaluate(async({runtime,cart,summary,add,frame,app})=>{
      const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),cartUrl=URL.createObjectURL(new Blob([cart],{type:'text/javascript'})),summaryUrl=URL.createObjectURL(new Blob([summary.replace('./Cart.qb',cartUrl)],{type:'text/javascript'})),addUrl=URL.createObjectURL(new Blob([add.replace('./Cart.qb',cartUrl)],{type:'text/javascript'})),frameUrl=URL.createObjectURL(new Blob([frame],{type:'text/javascript'})),appUrl=URL.createObjectURL(new Blob([app.replace('__SUMMARY__',summaryUrl).replace('__ADD__',addUrl).replace('__FRAME__',frameUrl)],{type:'text/javascript'})),urls=[runtimeUrl,cartUrl,summaryUrl,addUrl,frameUrl,appUrl];
      try{
        const api=await import(runtimeUrl),application=await import(appUrl),first=document.createElement('main'),second=document.createElement('main');document.body.append(first,second);const disposeFirst=application.default(first,api),disposeSecond=application.default(second,api),firstButtons=[...first.querySelectorAll('button')],retained=firstButtons[1];
        firstButtons[0].click();const updated=first.querySelector('p')?.textContent,isolated=second.querySelector('p')?.textContent;firstButtons[3].click();const moved=first.querySelectorAll('button')[0]===retained;firstButtons[2].click();const rolledBack=first.querySelector('p')?.textContent;firstButtons[4].click();retained.click();const hidden=first.querySelector('p')?.textContent;first.querySelectorAll('button')[3].click();const remounted=[...first.querySelectorAll('button')].find(node=>node.textContent==='add 2')!;remounted.click();const afterRemount=first.querySelector('p')?.textContent;disposeFirst();disposeFirst();remounted.click();const empty=first.childNodes.length===0;const secondStill=second.querySelector('p')?.textContent;disposeSecond();first.remove();second.remove();return{updated,isolated,moved,rolledBack,hidden,afterRemount,empty,secondStill};
      }finally{urls.forEach(URL.revokeObjectURL);}
    },{runtime,cart:cart.code,summary:summary.code,add:add.code,frame:frame.code,app});
    await page.waitForTimeout(0);assert.deepEqual(result,{updated:'1:1',isolated:'0:0',moved:true,rolledBack:'1:1',hidden:'1:1',afterRemount:'2:3',empty:true,secondStill:'0:0'});assert.deepEqual(errors,['State exceeded safe integer range']);
  }finally{await browser.close();}
});

test('empty typed shared lists support keyed operations, isolation and runtime type checks',async()=>{
  const store=compile('shared Store:\n    ids = [] as number','Store.qb'),shared=new Map([['Store',store.ast]]);
  const app=compile(`import Store from "./Store.qb"
component App:
    p text=str(len(Store.ids))
    for id in Store.ids key=id:
        span text=str(id)
    button text="one":
        on click:
            Store.ids.append(1)
    button text="two":
        on click:
            Store.ids.append(2)
    button text="move":
        on click:
            Store.ids.move(2, 0)
    button text="remove":
        on click:
            Store.ids.remove(1)`,'App.qb',{shared}).code.replace('./Store.qb','__STORE__');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,store,app})=>{const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),storeUrl=URL.createObjectURL(new Blob([store],{type:'text/javascript'})),appUrl=URL.createObjectURL(new Blob([app.replace('__STORE__',storeUrl)],{type:'text/javascript'})),urls=[runtimeUrl,storeUrl,appUrl];try{const api=await import(runtimeUrl),module=await import(appUrl),first=document.createElement('main'),second=document.createElement('main');document.body.append(first,second);const disposeFirst=module.default(first,api),disposeSecond=module.default(second,api),buttons=[...first.querySelectorAll('button')];buttons[0].click();const retained=first.querySelector('span');buttons[1].click();buttons[2].click();const moved=[...first.querySelectorAll('span')].map(node=>node.textContent).join(','),identity=first.querySelectorAll('span')[1]===retained;buttons[3].click();const removed=[...first.querySelectorAll('span')].map(node=>node.textContent).join(','),isolated=second.querySelector('p').textContent;const model={props:{},shared:[{name:'Store',index:0}],classes:{},states:{},computed:{},init:[],cleanup:[],roots:[]};let missing='',wrong='';try{api.mountComponent(document.createElement('main'),model,[],{}, {},0,{},[{states:{ids:[]}}]);}catch(error){missing=error.message;}try{api.mountComponent(document.createElement('main'),model,[],{}, {},0,{},[{states:{ids:['bad']},types:{ids:'number'}}]);}catch(error){wrong=error.message;}disposeFirst();disposeSecond();first.remove();second.remove();return{moved,identity,removed,isolated,missing,wrong};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,store:store.code,app});assert.deepEqual(result,{moved:'2,1',identity:true,removed:'2',isolated:'0',missing:'Invalid shared list ids',wrong:'Invalid shared list ids'});assert.deepEqual(errors,[]);}finally{await browser.close();}
});

test('typed class-record lists hydrate, mutate and roll back without identity or app leaks',async()=>{
  const store=compile(`class Item:
    id = 0
    name = ""
shared Store:
    items = [] as Item
    seeded = [Item(9, "Seed")]`,'Store.qb'),shared=new Map([['Store',store.ast]]);
  const app=compile(`import Store from "./Store.qb"
class Item:
    id = 0
    name = ""
component App:
    host = [] as Item
    one = Item(1, "One")
    two = Item(2, "Two")
    for item in Store.seeded key=item.id:
        button class="seed" text=item.name:
            on click:
                item.name = item.name + "!"
    for item in Store.items key=item.id:
        span class="record" text=item.name
    for item in host key=item.id:
        button class="host-record" text=item.name:
            on click:
                item.name = item.name + "!"
    button class="add-one" text="one":
        on click:
            Store.items.append(one)
    button class="add-two" text="two":
        on click:
            Store.items.append(two)
    button class="move" text="move":
        on click:
            Store.items.move(two, 0)
    button class="replace" text="replace":
        on click:
            Store.items = [two]`,'App.qb',{shared}).code.replace('./Store.qb','__STORE__');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,store,app})=>{const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),storeUrl=URL.createObjectURL(new Blob([store],{type:'text/javascript'})),appUrl=URL.createObjectURL(new Blob([app.replace('__STORE__',storeUrl)],{type:'text/javascript'})),urls=[runtimeUrl,storeUrl,appUrl];try{const api=await import(runtimeUrl),storeModule=await import(storeUrl),module=await import(appUrl),first=document.createElement('main'),second=document.createElement('main'),hostInput={id:7,name:'Host'};document.body.append(first,second);const disposeFirst=module.default(first,api,{}, {host:[hostInput]}),disposeSecond=module.default(second,api,{}, {host:[hostInput]});first.querySelector('button.seed').click();first.querySelector('button.host-record').click();const isolation={first:first.querySelector('button.seed').textContent,second:second.querySelector('button.seed').textContent,hostFirst:first.querySelector('button.host-record').textContent,hostSecond:second.querySelector('button.host-record').textContent};first.querySelector('button.add-one').click();const retained=first.querySelector('span.record');first.querySelector('button.add-two').click();first.querySelector('button.move').click();const moved=[...first.querySelectorAll('span.record')].map(node=>node.textContent).join(','),identity=first.querySelectorAll('span.record')[1]===retained;first.querySelector('button.replace').click();const replaced=[...first.querySelectorAll('span.record')].map(node=>node.textContent).join(','),hostNode=first.querySelector('button.host-record');disposeFirst.updateState({host:[{id:7,name:'Updated'}]});const hostUpdated={text:hostNode.textContent,identity:first.querySelector('button.host-record')===hostNode};let accessor='',wrong='',prototype='',pollution='',limited='';const bad=Object.create(null);Object.defineProperty(bad,'id',{get(){return 7},enumerable:true});Object.defineProperty(bad,'name',{value:'Bad',enumerable:true});try{disposeFirst.updateState({host:[bad]});}catch(error){accessor=error.message;}try{disposeFirst.updateState({host:[{id:'bad',name:'Bad'}]});}catch(error){wrong=error.message;}const inherited=Object.create({unsafe:true});inherited.id=7;inherited.name='Bad';try{disposeFirst.updateState({host:[inherited]});}catch(error){prototype=error.message;}try{disposeFirst.updateState({host:[JSON.parse('{"id":7,"name":"Bad","__proto__":{"polluted":true}}')]});}catch(error){pollution=error.message;}try{api.mountComponentWithState(document.createElement('main'),module.model,[],{}, {host:[{id:1,name:'One'},{id:2,name:'Two'}]}, {maxCollectionItems:1},0,{},[storeModule.default]);}catch(error){limited=error.message;}const rolledBack={text:hostNode.textContent,identity:first.querySelector('button.host-record')===hostNode,polluted:({}).polluted??null};disposeFirst();disposeSecond();first.remove();second.remove();return{isolation,moved,identity,replaced,hostUpdated,accessor,wrong,prototype,pollution,limited,rolledBack};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,store:store.code,app});assert.deepEqual(result,{isolation:{first:'Seed!',second:'Seed',hostFirst:'Host!',hostSecond:'Host'},moved:'Two,One',identity:true,replaced:'Two',hostUpdated:{text:'Updated',identity:true},accessor:'Initial state host[0].id must be data',wrong:'Initial state host[0].id requires number',prototype:'Initial state host[0] requires a plain object record',pollution:'Unknown field __proto__ in Initial state host[0]',limited:'Collection exceeds the configured limit of 1 items',rolledBack:{text:'Updated',identity:true,polluted:null}});assert.deepEqual(errors,[]);}finally{await browser.close();}
});

test('shared class-record defaults enforce collection limits before hydration',async()=>{
  const store=compile('class Item:\n    id = 0\nshared Store:\n    items = [Item(1), Item(2)]','Store.qb').code,runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const failure=await page.evaluate(async({runtime,store})=>{const urls=[runtime,store].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),definition=(await import(urls[1])).default,model={props:{},shared:[{name:'Store',index:0}],classes:{},states:{},computed:{},init:[],cleanup:[],roots:[]};try{api.mountComponent(document.createElement('main'),model,[],{}, {maxCollectionItems:1},0,{},[definition]);return '';}catch(error){return error.message;}}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,store});assert.equal(failure,'Collection exceeds the configured limit of 1 items');}finally{await browser.close();}
});

test('disposed staged conditionals do not commit after nested keyed lifecycle updates',async()=>{
  const store=compile('shared Store:\n    mounted = 0','Store.qb'),shared=new Map([['Store',store.ast]]);
  const child=compile('import Store from "./Store.qb"\ncomponent Child(label = ""):\n    on init:\n        Store.mounted = Store.mounted + 1\n    on cleanup:\n        Store.mounted = Store.mounted - 1\n    p text=label','Child.qb',{shared});
  const app=compile(`import Store from "./Store.qb"
import Child from "./Child.qb"
class Item:
    id = 0
    label = ""
component App:
    all = true
    items = [Item(1, "One"), Item(2, "Two")]
    span text="Mounted " + str(Store.mounted)
    if all:
        for item in items key=item.id:
            if item.id != 0:
                Child label=item.label
    else:
        for item in items key=item.id:
            if item.id == 1:
                Child label=item.label
    button text="Only one":
        on click:
            all = false
    button text="All":
        on click:
            all = true`,'App.qb',{shared,components:new Map([['Child',child.ast]])}).code.replace('./Store.qb','__STORE__').replace('./Child.qb','__CHILD__');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,store,child,app})=>{const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),storeUrl=URL.createObjectURL(new Blob([store],{type:'text/javascript'})),childUrl=URL.createObjectURL(new Blob([child.replace('./Store.qb',storeUrl)],{type:'text/javascript'})),appUrl=URL.createObjectURL(new Blob([app.replace('__STORE__',storeUrl).replace('__CHILD__',childUrl)],{type:'text/javascript'})),urls=[runtimeUrl,storeUrl,childUrl,appUrl];try{const api=await import(runtimeUrl),module=await import(appUrl),host=document.createElement('main');document.body.append(host);const dispose=module.default(host,api);host.querySelectorAll('button')[0].click();const one={count:host.querySelectorAll('p').length,mounted:host.querySelector('span').textContent};host.querySelectorAll('button')[1].click();const all={count:host.querySelectorAll('p').length,mounted:host.querySelector('span').textContent};dispose();host.remove();return{one,all};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,store:store.code,child:child.code,app});assert.deepEqual(result,{one:{count:1,mounted:'Mounted 1'},all:{count:2,mounted:'Mounted 2'}});assert.deepEqual(errors,[]);}finally{await browser.close();}
});

test('host state updates are transactional and preserve keyed identity on rollback',async()=>{
  const module=compile(`class Item:
    id = 0
    name = ""
component App:
    loading = true
    items = [Item(0, "schema")]
    p text=str(loading)
    for item in items key=item.id:
        span text=item.name`).code,runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,module})=>{const urls=[runtime,module].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),app=await import(urls[1]),host=document.createElement('main');document.body.append(host);const dispose=app.default(host,api,{}, {items:[{id:1,name:'One'},{id:2,name:'Two'}]}),first=host.querySelector('span');dispose.updateState({loading:false,items:[{id:1,name:'One updated'},{id:2,name:'Two'}]});const updated={loading:host.querySelector('p').textContent,text:host.querySelector('span').textContent,identity:host.querySelector('span')===first};let failure='';try{dispose.updateState({loading:true,items:[{id:1,name:'Duplicate A'},{id:1,name:'Duplicate B'}]});}catch(error){failure=error.message;}const rolledBack={loading:host.querySelector('p').textContent,text:host.querySelector('span').textContent,identity:host.querySelector('span')===first};dispose();host.remove();return{updated,failure,rolledBack};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,module});assert.deepEqual(result,{updated:{loading:'false',text:'One updated',identity:true},failure:'Duplicate iteration key 1',rolledBack:{loading:'false',text:'One updated',identity:true}});assert.deepEqual(errors,[]);}finally{await browser.close();}
});
