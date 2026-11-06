import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compile,CompileError,formatCompileError,type CompileOptions} from '../language/index.js';
import {languagePlugin} from '../tooling/vite.js';
import {identity} from '../tooling/config.js';

function failure(source:string,options:CompileOptions={}):CompileError {
  try{compile(source,'Example'+identity.sourceExtension,options);assert.fail('Expected a diagnostic');}
  catch(error){assert.ok(error instanceof CompileError);return error;}
}

test('human diagnostics add source context and targeted remedies without changing diagnostic data',()=>{
  const shared=compile('shared Store:\n    count = 0').ast;
  const child=compile('component Child:\n    button:\n        on click:\n            emit ready').ast;
  const cases:[string,RegExp,RegExp,CompileOptions?][]=[
    ['component C\n',/Expected :/,/End block headers/],
    ['component C:\n    enabled = true\n    if enabled and 1:\n        p text="bad"',/boolean operands/,/not converted to booleans/],
    ['component C:\n    p text=missing',/Unknown state or prop/,/Declare the value/],
    ['component C:\n    button:\n        on hover:\n            emit ready',/Unsupported event/,/click on buttons/],
    ['component C:\n    Unknown',/Unknown element/,/Import the component/],
    [`import Child from "Child${identity.sourceExtension}"\ncomponent C:\n    Child`,/relative module paths/,/relative path, filename case/],
    [`import Child from "./Child${identity.sourceExtension}"\ncomponent C:\n    Child:\n        on missing:\n            emit ready`,/Unknown event/,/event name emitted/,{components:new Map([['Child',child]])}],
    [`import Store from "./Store${identity.sourceExtension}"\ncomponent C:\n    p text=str(Store.missing)`,/Unknown shared value/,/state names declared/,{shared:new Map([['Store',shared]])}],
    ['component C:\n    router:\n        route "/":\n            p text="home"',/final route/,/route "\*":/],
  ];
  for(const [source,message,hint,options] of cases){
    const error=failure(source,options),formatted=formatCompileError(error);
    assert.match(error.message,message);assert.match(error.hint??'',hint,source);assert.match(formatted,/Example.*:\d+:\d+:/);assert.match(formatted,/\d+ \| .*\n *\| .*\^/);assert.match(formatted,/\nHint: /);
    assert.equal(error.message,`${error.diagnostic.filename}:${error.diagnostic.line}:${error.diagnostic.column}: ${error.diagnostic.message}`);
    assert.deepEqual(Object.keys(error.diagnostic).sort(),['column','filename','line','message','span']);
  }
  const conversion=failure('component C:\n    p text=1');assert.match(formatCompileError(conversion),/use str\(value\)/);assert.equal(conversion.hint,undefined);
  const legacy=failure('component C:\n    router:\n        route "/:id":\n            p text="bad"\n        route "*":\n            p text="404"');assert.match(formatCompileError(legacy),/use <name>/);
  const direct=new CompileError({filename:'host',line:1,column:1,span:{start:0,end:0},message:'custom error'});assert.equal(formatCompileError(direct),'host:1:1: custom error');
});

test('frames handle CRLF, EOF, tabs and long lines and escape terminal controls',()=>{
  const crlf=failure('component C:\r\n    p text=missing\r\n');assert.equal(crlf.diagnostic.line,2);assert.equal(crlf.diagnostic.column,12);assert.match(crlf.frame!,/^2 \|     p text=missing\n  \| {12}\^$/);
  const eof=failure('component C');assert.match(eof.frame!,/component C\n *\| .*\^$/);
  const tabs=failure('component C:\n\tp text="bad"');assert.match(tabs.frame!,/\| {5}p text=/);assert.doesNotMatch(tabs.frame!,/\t/);
  const control=failure('component C:\n    p text="\u001b[31m"');assert.doesNotMatch(formatCompileError(control),/\u001b/);assert.match(control.frame!,/\\u001b/);
  const long=failure('component C:\n    p text="'+'a'.repeat(10000)+'" + missing');assert.ok(long.frame!.length<250);assert.match(long.frame!,/\.\.\..*missing/);
  const oversized=failure('x\n'.repeat(100000),{limits:{maxSourceLength:16}});assert.match(oversized.message,/Source exceeds/);assert.ok(oversized.frame!.length<250);
});

test('CLI deduplicates imported errors, prints frames, and preserves JSON for option failures',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'qbits-diagnostics-')),ext=identity.sourceExtension,cli=resolve('dist/lib/tooling/cli.js');
  const invoke=(args:string[])=>{const result=spawnSync(process.execPath,[cli,...args],{cwd:directory,encoding:'utf8'});assert.ifError(result.error);return result;};
  try{
    const leaf=join(directory,'Leaf'+ext),source='component Leaf:\n    p text=missing';await writeFile(leaf,source);
    for(const name of ['A','B'])await writeFile(join(directory,name+ext),`import Leaf from "./Leaf${ext}"\ncomponent ${name}:\n    Leaf`);
    const json=invoke(['check','.',leaf,'--json']);assert.equal(json.status,1);assert.equal(json.stderr,'');const result=JSON.parse(json.stdout);assert.equal(result.filesChecked,3);assert.equal(result.diagnostics.length,1);assert.equal(result.diagnostics[0].filename,leaf);
    const human=invoke(['check','.']);assert.equal(human.status,1);assert.match(human.stdout,/3 file\(s\), 1 error\(s\)/);assert.equal((human.stderr.match(/Unknown state or prop/g)??[]).length,1);assert.match(human.stderr,/2 \|     p text=missing/);assert.match(human.stderr,/Hint: Declare/);assert.doesNotMatch(human.stderr,/at .*cli\.js/);
    const compiled=invoke(['compile',leaf,join(directory,'output.js')]);assert.equal(compiled.status,1);assert.match(compiled.stderr,/2 \|     p text=missing/);
    for(const args of [['check','--max-modules=0','--json'],['check','--json','--max-import-depth=oops']]){const bad=invoke(args);assert.equal(bad.status,1);assert.equal(bad.stderr,'');const parsed=JSON.parse(bad.stdout);assert.equal(parsed.schemaVersion,1);assert.equal(parsed.ok,false);assert.equal(parsed.filesChecked,0);assert.equal(parsed.diagnostics.length,1);assert.match(parsed.diagnostics[0].message,/positive safe integer/);}
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Vite uses the failing transform source and leaves location formatting to Vite',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'qbits-vite-diagnostic-'));
  try{
    const file=join(directory,'App'+identity.sourceExtension);await writeFile(file,'component App:\n    p text="disk version"');
    const transform=languagePlugin().transform;assert.equal(typeof transform,'function');if(typeof transform!=='function')throw new Error('Missing transform');
    let reported:any;try{transform.call({addWatchFile(){},error(value:unknown){throw value;}} as never,'component App:\r\n    p text=missing',file);}catch(error){reported=error;}
    assert.equal(reported.id,file);assert.deepEqual(reported.loc,{file,line:2,column:12});assert.equal(reported.pos,undefined);assert.match(reported.message,/Unknown state or prop/);assert.match(reported.message,/Hint: Declare/);assert.ok(!reported.message.includes(file));assert.match(reported.frame,/p text=missing/);assert.doesNotMatch(reported.frame,/disk version/);
    const child=join(directory,'Child'+identity.sourceExtension);await writeFile(child,'component Child:\n    p text="'+'x'.repeat(600)+'" + missing');
    reported=undefined;try{transform.call({addWatchFile(){},error(value:unknown){throw value;}} as never,`import Child from "./Child${identity.sourceExtension}"\ncomponent App:\n    Child`,file);}catch(error){reported=error;}
    assert.equal(reported.id,child);assert.equal(reported.loc.file,child);assert.ok(reported.loc.column>600);assert.equal(reported.pos,undefined);assert.match(reported.frame,/\.\.\..*missing/);assert.ok(reported.frame.length<250);
  }finally{await rm(directory,{recursive:true,force:true});}
});
