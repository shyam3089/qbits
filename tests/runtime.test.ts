import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firefox } from 'playwright';
import { compile, generate, parse } from '../language/index.js';
import { reactiveFixtures } from './helpers/reactivity-fixtures.js';

test('runtime rejects invalid list mutations atomically and retains bindings and keyed DOM', async () => {
  const code=compile(`class Item:
    id = 0
    computed values = [id]
component Lists:
    items = [1, 2]
    n = 0
    item = Item(1)
    computed derived = items
    computed size = len(items)
    button text="Run":
        on click:
            items.append(3)
    p text=str(items)
    p text=str(derived)
    p text=str(size)
    for item in items key=item:
        span text=str(item)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8');const browser=await firefox.launch({headless:true});
  try {
    const page=await browser.newPage();
    const helper=await readFile('tests/helpers/phase2d-safety-browser.mjs','utf8');
    const result=await page.evaluate(async({runtime,code,helper})=>{
      const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));
      try {const checks=await import(url);return await checks.verifyLists({runtime,code});}
      finally {URL.revokeObjectURL(url);}
    },{runtime,code,helper});
    assert.equal(result.checked,30);assert.deepEqual(result.failures,[]);
  }finally{await browser.close();}
});

test('safe-integer errors roll back state, list writes and computed dependencies in Firefox', async()=>{
  const source=`component Numbers(start = 0, step = 1):
    n = start
    items = [1]
    computed echo = n + 0
    button text="Update":
        on click:
            items.append(2)
            n = n + step
    button text="Reset":
        on click:
            n = 0
            items.remove(2)
    p text=str(n)
    p text=str(echo)
    p text=str(items)
    for item in items key=item:
        span text=str(item)
`;
  const derived=`component Derived(start = 0, step = 1):
    n = start
    computed total = n + step
    button text="Update":
        on click:
            n = n + step
    button text="Reset":
        on click:
            n = 0
    p text=str(n)
    p text=str(total)
`;
  const instance=`class Meter:
    value = 0
    step = 1
    computed next = value + step
    action increase:
        value = value + step
component ClassNumbers(start = 0, step = 1):
    meter = Meter(start, step)
    button text="Update":
        on click:
            meter.increase()
    button text="Reset":
        on click:
            meter.value = 0
    p text=str(meter.value)
    p text=str(meter.next)
`;
  const codes=[source,derived,instance].map(text=>compile(text).code),runtime=await readFile('dist/lib/runtime/index.js','utf8');
  const browser=await firefox.launch({headless:true});
  try {
    const page=await browser.newPage();
    const helper=await readFile('tests/helpers/phase2d-safety-browser.mjs','utf8');
    const result=await page.evaluate(async({runtime,codes,helper})=>{
      const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));
      try {const checks=await import(url);return await checks.verifyNumbers({runtime,codes});}
      finally {URL.revokeObjectURL(url);}
    },{runtime,codes,helper});
    assert.deepEqual(result,{checked:6,failures:[]});
  }finally{await browser.close();}
});

test('overflow validation preserves child props and iteration keys before DOM changes',async()=>{
  const child=compile(`component Child(amount = 0, step = 1):
    computed total = amount + step
    p text=str(amount)
    span text=str(total)
`).code;
  const parent=compile(`import Child from "./Child.qb"
component Parent(start = 0, step = 1):
    n = start
    button text="Update":
        on click:
            n = n + step
    button text="Reset":
        on click:
            n = 0
    p text=str(n)
    Child amount=n step=step
`).code;
  const keyed=compile(`class Item:
    id = 0
component Keyed(start = 0, step = 1):
    item = Item(start)
    items = [item]
    button text="Update":
        on click:
            item.id = item.id + step
    button text="Reset":
        on click:
            item.id = 0
    p text=str(item.id)
    for entry in items key=entry.id + step:
        span text=str(entry.id)
`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),helper=await readFile('tests/helpers/phase2d-safety-browser.mjs','utf8');
  const browser=await firefox.launch({headless:true});
  try {
    const page=await browser.newPage();
    const result=await page.evaluate(async(payload)=>{
      const url=URL.createObjectURL(new Blob([payload.helper],{type:'text/javascript'}));
      try {const checks=await import(url);return await checks.verifyDependentOverflow(payload);}
      finally {URL.revokeObjectURL(url);}
    },{runtime,helper,child,parent,keyed});
    assert.deepEqual(result,{checked:4,failures:[]});
  }finally{await browser.close();}
});

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
  // Bypass semantic validation only here to exercise runtime defense in depth:
  // constant overflow is already rejected by the merged compiler.
  const modules=sources.map(source=>generate(parse(source))),runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,modules})=>{const urls=[runtime,...modules].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));try{const api=await import(urls[0]),components=[];for(const value of urls.slice(1))components.push(await import(value));const attempts=[()=>components[0].default(document.createElement('main'),api),()=>components[1].default(document.createElement('main'),api),()=>components[2].default(document.createElement('main'),api),()=>components[3].default(document.createElement('main'),api),()=>components[4].default(document.createElement('main'),api,{value:Number.NaN}),()=>components[4].default(document.createElement('main'),api,{value:Number.POSITIVE_INFINITY}),()=>components[4].default(document.createElement('main'),api,{value:9007199254740992}),()=>api.mountCounter(document.createElement('main'),{initial:Number.NaN,prefix:'',step:1}),()=>api.mountCounter(document.createElement('main'),{initial:0,prefix:'',step:Number.POSITIVE_INFINITY})];return attempts.map(run=>{try{run();return null;}catch(error){return {name:error.name,message:error.message};}});}finally{urls.forEach(value=>URL.revokeObjectURL(value));}},{runtime,modules});
    assert.equal(result.length,9);for(const failure of result)assert.deepEqual(failure,{name:'RangeError',message:'State exceeded safe integer range'});
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
    assert.equal(result.move.elements, 0); assert.equal(result.move.textWrites, 0);
    assert.equal(result.noop.fragments, 0); assert.equal(result.noop.textWrites, 0);
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
