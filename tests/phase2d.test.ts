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
  assert.match(code,/"classes"/);assert.match(code,/"iteration"/);assert.doesNotMatch(code,/eval\(|new Function|innerHTML/);
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
