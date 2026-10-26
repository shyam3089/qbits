import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, CompileError } from '../language/index.js';
import { compileFile } from '../tooling/modules.js';
import { identity } from '../tooling/config.js';
import { counterSource, greetingSource, notificationSettingSource, catalogSource, appSource, counterCSS } from '../tooling/project.mjs';

test('nested elements, typed defaults, imports and class spans',()=>{
  const source='import "./view.css"\ncomponent View(title = "Hello", amount = 2, enabled = true):\n    main class="one two":\n        section:\n            h1 text=title\n            p text=str(amount)\n            span text=str(enabled)\n            label text="safe <b>text</b>"';
  const {ast,code}=compile(source);
  assert.deepEqual(ast.props.map(p=>typeof p.initial.value),['string','number','boolean']);
  assert.equal(ast.roots[0].children[0].children.length,4);
  assert.equal(source.slice(ast.roots[0].attributes.class.span.start,ast.roots[0].attributes.class.span.end),'"one two"');
  assert.match(code,/import "\.\/view.css"/);
  assert.doesNotMatch(code,/innerHTML|eval\(/);
});

test('one default slot accepts typed parent content without adding expression syntax',()=>{
  const layoutModule=compile('component Layout(title = ""):\n    section:\n        h2 text=title\n        slot'),layout=layoutModule.ast;
  const source='import Layout from "./Layout.qb"\ncomponent App:\n    count = 0\n    Layout title="Count " + str(count):\n        button text=str(count):\n            on click:\n                count = count + 1';
  const {ast,code}=compile(source,'App.qb',{components:new Map([['Layout',layout]])});
  assert.equal(layout.roots[0].kind,'element');
  assert.equal(layout.roots[0].kind==='element'&&layout.roots[0].children[1].kind,'slot');
  assert.equal(ast.roots[0].kind==='element'&&ast.roots[0].children.length,1);
  assert.match(layoutModule.code,/"kind":"slot"/);assert.match(code,/mountComponentWithContent/);
  const plain=compile('component Plain:\n    div').ast;
  assert.throws(()=>compile('import Plain from "./Plain.qb"\ncomponent App:\n    Plain:\n        p text="content"','App.qb',{components:new Map([['Plain',plain]])}),/does not accept content/);
  assert.throws(()=>compile('component Bad:\n    div:\n        slot\n        slot'),/one default slot/);
  assert.throws(()=>compile('component Bad:\n    visible = true\n    if visible:\n        slot'),/cannot be inside if or for/);
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

test('text input binds string state through the approved event.value form',()=>{
  const source='component Greeting:\n    name = ""\n\n    input:\n        value=name\n        on input:\n            name = event.value\n\n    p text="Hello, " + name';
  const {ast,code}=compile(source);
  assert.equal(ast.states[0].initial.value,'');
  assert.deepEqual(ast.roots[0].indentedAttributes,['value']);
  assert.equal(ast.roots[0].handler?.kind,'input');
  assert.match(code,/"kind":"input"/);
  assert.doesNotMatch(code,/innerHTML|eval\(/);
  const invalid:[string,RegExp][]=[
    ['component C:\n    name = ""\n    input value=name',/indented input property/],
    ['component C:\n    name = ""\n    div:\n        value=name',/indented input property/],
    ['component C:\n    input:\n        value=1',/string expression/],
    ['component C:\n    name = ""\n    button:\n        on input:\n            name = event.value',/text inputs only/],
    ['component C:\n    name = ""\n    input:\n        value=name\n        on input:\n            name = event.other',/Expected value/],
    ['component C:\n    name = ""\n    button:\n        on click:\n            name = name + 1',/numeric state/],
  ];
  for(const [text,message] of invalid) assert.throws(()=>compile(text,'invalid.input'),(error:unknown)=>error instanceof CompileError&&message.test(error.message),text);
});

test('checkbox input binds boolean state through the approved event.checked form',()=>{
  const source=notificationSettingSource();
  const {ast,code}=compile(source);
  assert.equal(ast.states[0].initial.value,false);
  assert.equal(ast.roots[0].handler?.kind,'clickBoolean');
  assert.deepEqual(ast.roots[1].indentedAttributes,['type','checked']);
  assert.equal(ast.roots[1].handler?.kind,'change');
  assert.match(code,/"kind":"clickBoolean"/);
  assert.match(code,/"kind":"change"/);
  assert.doesNotMatch(code,/innerHTML|eval\(/);
  const invalid:[string,RegExp][]=[
    ['component C:\n    input type="checkbox"',/indented input property/],
    ['component C:\n    input:\n        type="text"',/static string literal "checkbox"/],
    ['component C:\n    kind = "checkbox"\n    input:\n        type=kind',/static string literal "checkbox"/],
    ['component C:\n    enabled = false\n    input:\n        checked=enabled',/requires input type="checkbox"/],
    ['component C:\n    enabled = "no"\n    input:\n        type="checkbox"\n        checked=enabled',/boolean expression/],
    ['component C:\n    enabled = false\n    input:\n        on change:\n            enabled = event.checked',/checkbox inputs only/],
    ['component C:\n    enabled = ""\n    input:\n        type="checkbox"\n        checked=false\n        on change:\n            enabled = event.checked',/boolean state/],
    ['component C:\n    enabled = false\n    input:\n        type="checkbox"\n        checked=enabled\n        on change:\n            enabled = event.value',/Expected checked/],
    ['component C:\n    enabled = false\n    input:\n        type="checkbox"\n        checked=enabled\n        on input:\n            enabled = event.value',/text inputs only/],
    ['component C:\n    count = 0\n    button:\n        on click:\n            count = false',/boolean state/],
    ['component C:\n    button:\n        on click:\n            missing = false',/Unknown state/],
    ['component C:\n    enabled = false\n    button:\n        on click:\n            enabled = "false"',/boolean literal assignment or numeric state increment/],
  ];
  for(const [text,message] of invalid) assert.throws(()=>compile(text,'invalid.input'),(error:unknown)=>error instanceof CompileError&&message.test(error.message),text);
});

test('conditionals support typed equality, and, not, and an optional else branch',()=>{
  const {ast,code}=compile(notificationSettingSource());const conditional=ast.roots[2];
  assert.equal(conditional.kind,'conditional');
  if(conditional.kind!=='conditional') assert.fail('Expected conditional root');
  assert.equal(conditional.condition.kind,'reference');if(conditional.condition.kind==='reference')assert.equal(conditional.condition.name,'enabled');assert.equal(conditional.consequent.length,1);assert.equal(conditional.alternate.length,1);
  assert.match(code,/"kind":"conditional"/);assert.doesNotMatch(code,/innerHTML|eval\(/);
  const greeting=compile(greetingSource());const [empty,available,unavailable]=greeting.ast.roots.slice(1,4);
  assert.equal(empty.kind,'conditional');if(empty.kind==='conditional')assert.equal(empty.condition.kind,'equal');
  assert.equal(available.kind,'conditional');if(available.kind==='conditional'){assert.equal(available.condition.kind,'and');if(available.condition.kind==='and')assert.equal(available.condition.right.kind,'notEqual');}
  assert.equal(unavailable.kind,'conditional');if(unavailable.kind==='conditional')assert.equal(unavailable.condition.kind,'not');
  assert.match(greeting.code,/"kind":"notEqual"/);assert.doesNotMatch(greeting.code,/innerHTML|eval\(/);
  const precedence=compile('component C:\n    enabled = true\n    if not enabled == false and enabled:\n        p text="yes"').ast.roots[0];
  assert.equal(precedence.kind,'conditional');if(precedence.kind==='conditional'){
    assert.equal(precedence.condition.kind,'and');
    if(precedence.condition.kind==='and'){assert.equal(precedence.condition.left.kind,'equal');if(precedence.condition.left.kind==='equal')assert.equal(precedence.condition.left.left.kind,'not');}
  }
  const withoutElse=compile('component C:\n    enabled = true\n    if enabled:\n        p text="yes"').ast.roots[0];
  assert.equal(withoutElse.kind,'conditional');if(withoutElse.kind==='conditional')assert.deepEqual(withoutElse.alternate,[]);
  const nonBoolean='component C:\n    count = 0\n    if count:\n        p text="bad"';
  assert.throws(()=>compile(nonBoolean,'condition.qb'),(error:unknown)=>{
    if(!(error instanceof CompileError))return false;
    assert.equal(error.diagnostic.line,3);assert.equal(error.diagnostic.column,8);assert.equal(nonBoolean.slice(error.diagnostic.span.start,error.diagnostic.span.end),'count');
    return /must evaluate to boolean, received number/.test(error.message);
  });
  const invalid:[string,RegExp][]=[
    ['component C(enabled = true):\n    if enabled:\n        p text="bad"',/must reference local state/],
    ['component C:\n    if true:\n        p text="bad"',/must reference local state/],
    ['component C:\n    name = ""\n    if not name:\n        p text="bad"',/not requires a boolean operand, received string/],
    ['component C:\n    name = ""\n    enabled = true\n    if name and enabled:\n        p text="bad"',/and requires boolean operands, received string/],
    ['component C:\n    enabled = true\n    if enabled or enabled:\n        p text="bad"',/Expected :/],
    ['component C:\n    count = 1\n    if count < 2:\n        p text="bad"',/Unexpected character/],
  ];
  for(const [text,message] of invalid) assert.throws(()=>compile(text,'invalid.input'),(error:unknown)=>error instanceof CompileError&&message.test(error.message),text);
  const unknown='component C:\n    if missing == "":\n        p text="bad"';
  assert.throws(()=>compile(unknown,'unknown.qb'),(error:unknown)=>{
    if(!(error instanceof CompileError))return false;
    assert.equal(error.diagnostic.line,2);assert.equal(error.diagnostic.column,8);assert.equal(unknown.slice(error.diagnostic.span.start,error.diagnostic.span.end),'missing');
    return /Unknown name "missing" in condition/.test(error.message);
  });
  const mismatch='component C:\n    name = ""\n    if name == 1:\n        p text="bad"';
  assert.throws(()=>compile(mismatch,'mismatch.qb'),(error:unknown)=>{
    if(!(error instanceof CompileError))return false;
    assert.equal(error.diagnostic.line,3);assert.equal(error.diagnostic.column,8);assert.equal(mismatch.slice(error.diagnostic.span.start,error.diagnostic.span.end),'name == 1');
    return /same type, received string and number/.test(error.message);
  });
  const misplaced='component C:\n    p text="before"\n    else:\n        p text="bad"';
  assert.throws(()=>compile(misplaced,'misplaced.qb'),(error:unknown)=>{
    if(!(error instanceof CompileError))return false;
    assert.equal(error.diagnostic.line,3);assert.equal(error.diagnostic.column,5);assert.equal(misplaced.slice(error.diagnostic.span.start,error.diagnostic.span.end),'else');
    return /immediately follow an if block/.test(error.message);
  });
});

test('module graph validates props, missing files, suffixes, cycles and transitive root forwarding',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'qubits-modules-'));const ext=identity.sourceExtension;
  const counter=join(temp,'Counter'+ext),app=join(temp,'App'+ext);
  const check=(text:string)=>compileFile(app,text);
  const expect=(text:string,pattern:RegExp)=>assert.throws(()=>check(text),(e:unknown)=>e instanceof CompileError&&e.diagnostic.filename.startsWith(temp)&&pattern.test(e.message));
  const instance=(attributes:string)=>`import Counter from "./Counter${ext}"\ncomponent App:\n    Counter ${attributes}\n`;
  try {
    await writeFile(join(temp,'Counter.css'),counterCSS);await writeFile(counter,counterSource());await writeFile(join(temp,'Greeting'+ext),greetingSource());await writeFile(join(temp,'NotificationSetting'+ext),notificationSettingSource());await writeFile(join(temp,'Catalog'+ext),catalogSource());await writeFile(app,appSource(identity));
    assert.ok(compileFile(app).code);
    const layout=join(temp,'Layout'+ext);await writeFile(layout,'component Layout(title = ""):\n    section:\n        h2 text=title\n        slot');
    assert.ok(check(`import Layout from "./Layout${ext}"\ncomponent App:\n    Layout title="Reusable":\n        p text="Parent content"`).code);
    expect(`import Counter from "./Counter${ext}"\ncomponent App:\n    Counter:\n        p text="Not accepted"`,/does not accept content/);
    expect(instance('unknown="bad"'),/Unknown prop/);
    expect(instance('label=2'),/requires string/);
    expect(instance('label=false'),/requires string/);
    expect('import C from "./Missing'+ext+'"\ncomponent App:\n    C',/Missing import/);
    expect('import C from "./Counter.wrong"\ncomponent App:\n    C',/configured extension/);
    await writeFile(counter,'component Counter(amount = 1, enabled = false):\n    p text=str(amount) + str(enabled)');
    assert.ok(check(instance('amount=2 enabled=true')).code);
    await writeFile(counter,'component Counter:\n    div\n    span');
    expect(instance('class="compact"'),/Ambiguous class forwarding/);
    await writeFile(counter,'component Counter:\n    enabled = true\n    if enabled:\n        div\n    else:\n        span');
    assert.ok(check(instance('class="compact"')).code);
    await writeFile(counter,'component Counter:\n    enabled = true\n    if enabled:\n        div');
    expect(instance('class="compact"'),/single resolved root/);
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
