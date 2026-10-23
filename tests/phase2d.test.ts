import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,CompileError} from '../language/index.js';
import {catalogSource} from '../tooling/project.mjs';

function rejects(source:string,message:RegExp):void {
  assert.throws(()=>compile(source,'phase2d.qb'),(error:unknown)=>error instanceof CompileError&&error.diagnostic.line>0&&message.test(error.message));
}

test('classes provide typed fields, computed values, and closed actions',()=>{
  const {ast,code}=compile(catalogSource());
  assert.equal(ast.classes.length,1);assert.equal(ast.classes[0].name.value,'Product');
  assert.deepEqual(ast.classes[0].fields.map(field=>field.name.value),['id','name','quantity']);
  assert.equal(ast.classes[0].computed[0].name.value,'label');assert.equal(ast.classes[0].actions[0].name.value,'increment');
  assert.deepEqual(ast.computed.map(item=>item.name.value),['productCount']);
  assert.match(code,/\\"classes\\"/);assert.match(code,/\\"iteration\\"/);assert.doesNotMatch(code,/eval\(|new Function|innerHTML/);
});

test('class, computed, and action errors retain source locations',()=>{
  rejects('class Item:\n    id = other\ncomponent C:\n    div',/field defaults must be literals/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    item = Item("bad")\n    div',/field id requires number/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    item = Item()\n    div',/requires 1 constructor values/);
  rejects('component C:\n    a = 1\n    computed first = second\n    computed second = first\n    p text=str(first)',/Computed dependency cycle/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    items = [Item(1)]\n    for item in items key=items:\n        p text="bad"',/key must be a string, number, or boolean/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    items = [Item(1)]\n    button:\n        on click:\n            items.clear()\n    div',/Unsupported list operation/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    item = Item(1)\n    button:\n        on click:\n            item.missing()\n    div',/Unknown action/);
  rejects('component C:\n    items = []\n    div',/Empty list state needs an item/);
  rejects('component C:\n    value = ""\n    on init:\n        value = event.value\n    div',/event values are available only inside event handlers/);
});

test('iteration requires stable item-derived keys and typed list operations',()=>{
  rejects('class Item:\n    id = 0\ncomponent C:\n    items = [Item(1)]\n    for item in items key=1:\n        p text="bad"',/key must reference the iteration item/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    items = [Item(1)]\n    button:\n        on click:\n            items.append("bad")\n    div',/List operation requires class:Item/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    items = [Item(1)]\n    for item in items key=item.id:\n        button:\n            on click:\n                items.move(item, "first")',/move index must be a number/);
  rejects('class Item:\n    id = 0\ncomponent C:\n    items = [Item(1)]\n    for item in items key=item.id:\n        button:\n            on click:\n                item = Item(2)',/read-only value/);
});

test('all list mutations require existing writable list state, including in nested scopes',()=>{
  for(const [method,args] of [['append','2'],['remove','1'],['move','1, 0']]) {
    for(const target of ['derived','[1]','item.values','1','"text"','missing']) {
      const source=`class Item:
    id = 0
    computed values = [id]
component C:
    items = [1]
    item = Item(1)
    computed derived = items
    button:
        on click:
            ${target}.${method}(${args})`;
      rejects(source,/writable list state|Calls are limited|Unknown state or prop/);
    }
    compile(`component C:\n    items = [1]\n    button:\n        on click:\n            items.${method}(${args})`);
    rejects(`component C:\n    items = [[1]]\n    for items in items key=len(items):\n        button:\n            on click:\n                items.${method}(${args})`,/writable list state/);
    rejects(`component C:\n    items = [1]\n    computed derived = items\n    on init:\n        derived.${method}(${args})\n    div`,/writable list state/);
    rejects(`component C:\n    items = [1]\n    computed derived = items\n    on cleanup:\n        derived.${method}(${args})\n    div`,/writable list state/);
  }
});

test('constant arithmetic overflow is rejected with source-located diagnostics',()=>{
  for(const expression of ['9007199254740991 + 1','1 + 9007199254740990 + 1']) {
    rejects(`component C:\n    n = ${expression}\n    p text=str(n)`,/Constant arithmetic result exceeds the safe integer range/);
    rejects(`component C:\n    computed n = ${expression}\n    p text=str(n)`,/safe integer range/);
    rejects(`component C:\n    n = 0\n    button:\n        on click:\n            n = ${expression}`,/safe integer range/);
  }
  compile('component C:\n    n = 9007199254740990 + 1\n    p text=str(n)');
});
