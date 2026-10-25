import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, CompileError, tokenize } from '../language/index';
import { identity, isSource } from '../tooling/config';
import { validateIdentity } from '../tooling/identity.mjs';
const source = `component C:
    n = 0
    button text="Count: " + str(n):
        on click:
            n = n + 1`;
function diagnostic(text: string) {
  try { compile(text, 'bad.input'); assert.fail('Expected a compile diagnostic'); }
  catch (error) { assert.ok(error instanceof CompileError); return error.diagnostic; }
}
test('AST spans, explicit conversion and deterministic output', () => {
  const {ast, code} = compile(source, 'counter.input');
  const slice = (span: {start:number; end:number}) => source.slice(span.start, span.end);
  assert.equal(slice(ast.states[0].name.span), 'n');
  assert.equal(slice(ast.states[0].span), 'n = 0');
  const text = ast.roots[0].attributes.text;
  assert.equal(text.kind,'add');
  if(text.kind !== 'add' || text.right.kind !== 'str') throw new Error('Expected conversion');
  assert.equal(slice(text.right.span), 'str(n)');
  assert.equal(slice(text.right.argument.span), 'n');
  assert.equal(slice(ast.roots[0].handler!.span), 'on click:\n            n = n + 1');
  assert.equal(ast.span.end, source.length);
  assert.match(code, /mountComponent/);
  assert.equal(code, compile(source).code);
});
test('NEWLINE/INDENT/DEDENT describe three nested blocks and EOF closes them', () => {
  const structure = tokenize(source).filter(t => ['NEWLINE','INDENT','DEDENT','eof'].includes(t.kind));
  assert.deepEqual(structure.map(t => t.kind), ['NEWLINE','INDENT','NEWLINE','NEWLINE','INDENT','NEWLINE','INDENT','NEWLINE','DEDENT','DEDENT','DEDENT','eof']);
  assert.deepEqual(structure.filter(t => t.kind === 'INDENT').map(t => source.slice(t.span.start,t.span.end).length), [4,8,12]);
  for (const token of structure.slice(-4)) assert.equal(token.span.start, source.length);
  // A following sibling forces dedents before its token, independent of parser subset.
  const tokens = tokenize(source + '\n    sibling\nroot');
  const sibling = tokens.findIndex(t => t.value === 'sibling');
  assert.deepEqual(tokens.slice(sibling - 2, sibling).map(t => t.kind), ['DEDENT','DEDENT']);
  assert.equal(tokens[tokens.findIndex(t => t.value === 'root') - 1].kind, 'DEDENT');
});
test('blank/comment-only lines do not change indentation, trailing comments work', () => {
  const decorated = '# heading\n\n' + source.replace('    n = 0', ' # ignored indentation\n    n = 0 # initial\n\n       # arbitrary comment indentation').replace('        on click:', '  # between blocks\n        on click:') + '\n # trailing comment\n';
  assert.equal(compile(decorated).code, compile(source).code);
  for (const newline of ['\n','\r\n','\r']) {
    assert.equal(compile(source.replaceAll('\n',newline) + newline).code, compile(source).code);
  }
  assert.equal(compile(source.replaceAll('    ','  ')).code, compile(source).code);
  assert.equal(tokenize('# only a comment\n\n').length, 1);
  const text=compile(source.replace('Count: ', '# {literal}; ')).ast.roots[0].attributes.text;
  assert.equal(text.kind==='add'&&text.left.kind==='literal'&&text.left.value, '# {literal}; ');
});
test('invalid indentation has precise, useful diagnostics', () => {
  const cases: [string, number, number, RegExp][] = [
    [source.replace('    n = 0','\tn = 0'),2,1,/Tabs/],
    [source.replace('    n = 0','  \tn = 0'),2,3,/Tabs/],
    [source.replace('        on click:','          on click:'),4,1,/each block must add 4 spaces/],
    [source.replace('    button','  button'),3,1,/Inconsistent dedent/],
    [source.replace('    n = 0','n = 0'),2,1,/indented block/],
    [source.replace('        on click:','    on click:'),4,5,/indented block/],
    [source.replace('            n = n','        n = n'),5,9,/indented block/],
    ['    ' + source,1,1,/top level/],
    [source + '\n\t',6,1,/Tabs/],
    [source.replace('n = 0','n\t= 0'),2,6,/Tabs/],
  ];
  for (const [text,line,column,message] of cases) {
    const d = diagnostic(text); assert.equal(d.filename,'bad.input');
    assert.equal(d.line,line); assert.equal(d.column,column); assert.match(d.message,message);
  }
});
test('reject old grammar, declaration keywords, missing colons and unrelated features', () => {
  for (const text of [
    'component C { n = 0; button "Count: " {n} on click { n = n + 1; } }',
    ...['var','let','const'].map(word => source.replace('n = 0',`${word} n = 0`)),
    source + '\n' + source, source.replace('+ 1','* 1'), source.replace('= 0','= 9007199254740992'),
    source.replace('"Count: "','"bad\\x"'), source.replace('"Count: "','"unterminated'),
    source.replace('C:','C'), source.replace('on click:','on click'), source.replace('n = 0','n = 0;'),
    source.replace('str(n)','{n}'), source.replace('str(n)','n'), source.replace('str(n)','other(n)'),
    source.replace('str(n)','str(1)'), source.replace('n = 0','n = 0 n = 1'),
    source.replace('    n = 0','    str = 0'), '', '# comment only',
    source.replace('            n = n + 1',''),
  ]) assert.throws(() => compile(text,'invalid.input'), CompileError, text);
});
test('unknown state diagnostics preserve CRLF source locations', () => {
  const text = source.replace('str(n)','str(missing)').replaceAll('\n','\r\n');
  const d = diagnostic(text);
  assert.equal(d.line,3); assert.equal(d.column,33); assert.match(d.message,/Unknown state/);
  assert.equal(text.slice(d.span.start,d.span.end),'missing');
  assert.match(diagnostic(source.replace('n = n + 1','missing = n + 1')).message,/Unknown state/);
  assert.match(diagnostic(source.replace('n = n + 1','n = missing + 1')).message,/Unknown state/);
});
test('untrusted text remains literal and generated output mounts via explicit runtime interface', async () => {
  const prefix = '<img src=x onerror=alert(1)>${globalThis.payload=1}';
  const {code} = compile(source.replace('"Count: "', JSON.stringify(prefix)));
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.equal(module.model.roots[0].attributes.text.left.value, prefix); assert.equal((globalThis as any).payload, undefined);
  const target = {}; const dispose = () => {};
  assert.equal(module.default(target, {mountComponent(actual: unknown, model: unknown) {
    assert.equal(actual,target); assert.deepEqual(model,module.model); return dispose;
  }}), dispose);
});
test('generator marks compiler-proven static DOM bindings without emitting executable code',()=>{
  const fixed=compile('component C:\n    p text="Fixed"').code;
  const dynamic=compile('component C:\n    value = "Live"\n    p text=value').code;
  assert.match(fixed,/\\"static\\":1/);
  assert.doesNotMatch(dynamic,/\\"static\\":/);
  assert.doesNotMatch(fixed,/innerHTML|eval\(|Function\(/);
});
test('generator folds safe constants and removes constant branches without executable source expressions',async()=>{
  const code=compile('component C:\n    total = 1 + 2\n    enabled = true\n    p text="A" + "B"\n    if false and enabled:\n        span text="dead"\n    else:\n        span text="live"').code;
  const module=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.equal(module.model.states.total.value,3);
  assert.equal(module.model.roots[0].attributes.text.value,'AB');
  assert.deepEqual(module.model.roots.map((root:{attributes:{text:{value:string}}})=>root.attributes.text.value),['AB','live']);
  assert.doesNotMatch(code,/"dead"|innerHTML|eval\(|Function\(/);
  const overflow=compile('component C:\n    total = 9007199254740991 + 1\n    div').code;
  assert.match(overflow,/\\"kind\\":\\"add\\"/);
});
test('identity is validated and suffix handling is derived', () => {
  assert.equal(isSource('test' + identity.sourceExtension + '?import'), true);
  assert.equal(isSource('test.txt'), false);
  assert.equal(validateIdentity({...identity, displayName:'Orbit', languageId:'orbit', cliName:'ob', packageName:'orbit', createCommand:'ob', createPackageName:'create-ob', sourceExtension:'.orb'}).sourceExtension, '.orb');
  assert.throws(() => validateIdentity({...identity, sourceExtension:'../bad'}));
  assert.throws(() => validateIdentity({...identity, createPackageName:'unrelated'}));
  assert.throws(() => validateIdentity({...identity, packageName:'../unsafe'}));
  assert.throws(() => validateIdentity({...identity, cliName:'postinstall'}));
  assert.throws(() => validateIdentity({...identity, cliName:'check'}));
  assert.throws(() => validateIdentity({...identity, cliName:'pnpm'}));
});
