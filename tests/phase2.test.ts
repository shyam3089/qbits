import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, CompileError } from '../language/index.js';
import { compileFile } from '../tooling/modules.js';
import { identity } from '../tooling/config.js';
import { counterSource, appSource, counterCSS } from '../tooling/project.mjs';

test('nested elements, typed defaults, imports and class spans',()=>{
  const source='import "./view.css"\ncomponent View(title = "Hello", amount = 2, enabled = true):\n    main class="one two":\n        section:\n            h1 text=title\n            p text=str(amount)\n            span text=str(enabled)\n            label text="safe <b>text</b>"';
  const {ast,code}=compile(source);
  assert.deepEqual(ast.props.map(p=>typeof p.initial.value),['string','number','boolean']);
  assert.equal(ast.roots[0].children[0].children.length,4);
  assert.equal(source.slice(ast.roots[0].attributes.class.span.start,ast.roots[0].attributes.class.span.end),'"one two"');
  assert.match(code,/import "\.\/view.css"/);
  assert.doesNotMatch(code,/innerHTML|eval\(/);
});

test('props are read-only and expressions and class attributes are checked',()=>{
  const invalid:[string,RegExp][]=[
    ['component C(label = "a"):\n    button text=label:\n        on click:\n            label = label + 1',/read-only/],
    ['component C:\n    div class=2',/static string/],
    ['component C:\n    div text=true',/text requires/],
    ['component C:\n    Unknown',/missing component import/],
    ['component C:\n    div onclick="alert(1)"',/Unsupported element attribute/],
    ['component C(label = other):\n    div',/literal/],
    ['component C(n = 1, n = 2):\n    div',/Duplicate/],
    ['component C:\n    button text="a" class="a" class="b"',/Duplicate attribute/],
    ['component C:\n    div:\n        on click:\n            n = n + 1',/button elements only/],
    ['import "module.js"\ncomponent C:\n    div',/relative/],
  ];
  for(const [source,message] of invalid) assert.throws(()=>compile(source,'invalid.input'),(e:unknown)=>e instanceof CompileError&&e.diagnostic.line>0&&message.test(e.message));
});

test('module graph validates props, missing files, suffixes, cycles and transitive root forwarding',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'qubits-modules-'));const ext=identity.sourceExtension;
  const counter=join(temp,'Counter'+ext),app=join(temp,'App'+ext);
  const check=(text:string)=>compileFile(app,text);
  const expect=(text:string,pattern:RegExp)=>assert.throws(()=>check(text),(e:unknown)=>e instanceof CompileError&&e.diagnostic.filename.startsWith(temp)&&pattern.test(e.message));
  const instance=(attributes:string)=>`import Counter from "./Counter${ext}"\ncomponent App:\n    Counter ${attributes}\n`;
  try {
    await writeFile(join(temp,'Counter.css'),counterCSS);await writeFile(counter,counterSource());await writeFile(app,appSource(identity));
    assert.ok(compileFile(app).code);
    expect(instance('unknown="bad"'),/Unknown prop/);
    expect(instance('label=2'),/requires string/);
    expect(instance('label=false'),/requires string/);
    expect('import C from "./Missing'+ext+'"\ncomponent App:\n    C',/Missing import/);
    expect('import C from "./Counter.wrong"\ncomponent App:\n    C',/configured extension/);
    await writeFile(counter,'component Counter(amount = 1, enabled = false):\n    p text=str(amount) + str(enabled)');
    assert.ok(check(instance('amount=2 enabled=true')).code);
    await writeFile(counter,'component Counter:\n    div\n    span');
    expect(instance('class="compact"'),/Ambiguous class forwarding/);
    // Single component root still forwards ambiguously if its child has two roots.
    await writeFile(join(temp,'Pair'+ext),'component Pair:\n    div\n    span');
    await writeFile(counter,`import Pair from "./Pair${ext}"\ncomponent Counter:\n    Pair`);
    expect(instance('class="compact"'),/Ambiguous class forwarding/);
    await writeFile(counter,`import App from "./App${ext}"\ncomponent Counter:\n    App`);
    expect(instance(''),/import cycle/);
    await writeFile(counter,'import "./missing.css"\ncomponent Counter:\n    div');
    assert.throws(()=>check(instance('')),/Missing import/);
  } finally {await rm(temp,{recursive:true,force:true});}
});
