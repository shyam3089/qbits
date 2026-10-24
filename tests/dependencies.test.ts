import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,analyzeDependencies} from '../language/index.js';
import {transactionSource as source} from './helpers/phase3-fixtures.js';

test('dependency analysis distinguishes one-shot initializers and deduplicates member paths',()=>{
  const {ast,code}=compile(source);
  const graph=analyzeDependencies(ast);
  assert.deepEqual(graph.computed.total,[['left'],['right']]);
  assert.deepEqual(graph.classes.Item.doubled,[['count']]);
  assert.deepEqual(graph.initializers.items,[['a'],['b']]);
  assert.deepEqual(graph.bindings.find(binding=>binding.kind==='key')?.dependencies,[['item','id']]);
  assert.deepEqual(graph.bindings.find(binding=>binding.kind==='value')?.dependencies,[['label']]);
  assert.match(code,/dependencies/);
  assert.ok(graph.bindings.every(binding=>binding.span.end>binding.span.start));
});

