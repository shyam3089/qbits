import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import {highlightQbits,qbitsGrammarScope,tokenizeQbits} from '../editor/highlight.js';

test('built-in highlighting reuses source.qbits across every shipped example',async()=>{
  assert.equal(qbitsGrammarScope,'source.qbits');
  const roots=['composition','counter','events','http-basics','http-commerce','lifecycle','shared-cart'];let files=0;
  for(const root of roots)for(const name of await readdir(join('examples',root))){
    if(!name.endsWith('.qb'))continue;
    const lines=await tokenizeQbits(await readFile(join('examples',root,name),'utf8'));
    assert.ok(lines.length>0,`${root}/${name} is highlighted`);
    assert.ok(lines.flatMap(line=>line.tokens).every(token=>token.scopes[0]==='source.qbits'));
    files++;
  }
  assert.equal(files,18);
});

test('built-in highlighting covers declarations, HTTP, connections, values, and comments',async()=>{
  const source=[
    'class Product:',
    '    name = "Qbits"',
    'service Api:',
    '    query products:',
    '        get "/products"',
    '        response list[Product]',
    '    action save(item):',
    '        post "/products"',
    'component App:',
    '    state count = 1',
    '    socket updates:',
    '        connect "/updates"',
    '    sse notices:',
    '        connect "/notices"',
    '    # visible comment'
  ].join('\n');
  const tokens=(await tokenizeQbits(source)).flatMap(line=>line.tokens);
  for(const className of ['qbits-token--type','qbits-token--function','qbits-token--state','qbits-token--keyword','qbits-token--string','qbits-token--number','qbits-token--comment'])assert.ok(tokens.some(token=>token.className===className),className);
});

test('HTML rendering escapes untrusted source and bounds highlighting work',async()=>{
  const html=await highlightQbits('p text="<img src=x onerror=alert(1)>" # <script>');
  assert.doesNotMatch(html,/<img|<script/);
  assert.match(html,/&lt;img/);
  await assert.rejects(()=>tokenizeQbits('x'.repeat(1_000_001)),/exceeds 1000000/);
});

test('highlighting CSS exposes light, dark, and user-overridable theme variables',async()=>{
  const css=await readFile('editor/qbits-highlight.css','utf8');
  assert.match(css,/@media \(prefers-color-scheme: dark\)/);
  assert.match(css,/\[data-qbits-theme="light"\]/);
  assert.match(css,/\[data-qbits-theme="dark"\]/);
  for(const name of ['keyword','type','function','component','state','property','string','number','comment'])assert.match(css,new RegExp(`--qbits-code-${name}:`));
});
