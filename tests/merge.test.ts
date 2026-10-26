import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile} from '../language/index.js';

test('shared limits preserve cached dependencies and child identity after failed instance/list transactions',async()=>{
  const child=compile(`component Child(amount = 0):
    clicks = 0
    button text=str(amount) + ":" + str(clicks):
        on click:
            clicks = clicks + 1
`).code;
  const code=compile(`import Child from "./Child.qb"
class Item:
    id = 0
    value = 0
    computed doubled = value + value
    action increase:
        value = value + 1
component Combined:
    original = Item(1, 0)
    replacement = Item(1, 10)
    second = Item(2, 0)
    third = Item(3, 0)
    fourth = Item(4, 0)
    selected = original
    items = [selected, second]
    computed total = selected.doubled
    button text="Fail":
        on click:
            selected = replacement
            items.remove(original)
            items.append(selected)
            items.append(third)
            items.append(fourth)
    button text="Original":
        on click:
            original.increase()
    button text="Current":
        on click:
            selected.increase()
    button text="Replace":
        on click:
            selected = replacement
            items.remove(original)
            items.append(selected)
    button text="Add":
        on click:
            items.append(third)
    button text="Remove":
        on click:
            items.remove(third)
    p text=str(total)
    for item in items key=item.id:
        Child amount=item.doubled
`).code;
  const helper=await readFile('tests/helpers/merge-browser.mjs','utf8');
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const result=await page.evaluate(async({runtime,child,code,helper})=>{
    const url=URL.createObjectURL(new Blob([helper],{type:'text/javascript'}));
    try{return await (await import(url)).verify({runtime,child,code});}finally{URL.revokeObjectURL(url);}
  },{runtime,child,code,helper});
  assert.deepEqual(result,{rollback:{same:true,total:'0',child:'0:1',focused:true},oldEdge:{total:'2',child:'2:1'},replaced:{total:'22',child:'22:1',same:true},noStaleEdge:'22',capacity:9,errors:['List records exceeds the configured limit of 3','List records exceeds the configured limit of 3'],remaining:0});
  }finally{await browser.close();}
});
