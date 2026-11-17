import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import test from 'node:test';
import type {IGrammar, IToken} from 'vscode-textmate';

const require = createRequire(import.meta.url);
const {parseRawGrammar,Registry} = require('vscode-textmate') as typeof import('vscode-textmate');
const {createOnigScanner,createOnigString,loadWASM} = require('vscode-oniguruma') as typeof import('vscode-oniguruma');

async function loadGrammar():Promise<IGrammar> {
  const wasm = await readFile(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const path = join(process.cwd(),'editor','qbits.tmLanguage.json');
  const source = await readFile(path,'utf8');
  const raw = parseRawGrammar(source,path);
  const registry = new Registry({
    onigLib: Promise.resolve({createOnigScanner,createOnigString}),
    loadGrammar: async scope => scope === 'source.qbits' ? raw : null
  });
  const grammar = await registry.loadGrammar('source.qbits');
  assert.ok(grammar,'source.qbits grammar loads');
  return grammar;
}

const grammarPromise = loadGrammar();

function tokenText(line:string,token:IToken):string {
  return line.slice(token.startIndex,token.endIndex);
}

async function scopesFor(source:string):Promise<Array<{text:string;scopes:string[]}>> {
  const grammar = await grammarPromise;
  let stack = null;
  const result:Array<{text:string;scopes:string[]}>=[];
  for(const line of source.split(/\r\n|\r|\n/)) {
    const tokenized = grammar.tokenizeLine(line,stack);
    stack = tokenized.ruleStack;
    result.push(...tokenized.tokens.map(token=>({text:tokenText(line,token),scopes:token.scopes})));
  }
  return result;
}

function hasScope(tokens:Array<{text:string;scopes:string[]}>,text:string,scope:string):boolean {
  return tokens.some(token=>token.text===text&&token.scopes.includes(scope));
}

test('source.qbits tokenizes every shipped .qb example with the TextMate engine',async()=>{
  const roots = ['composition','counter','events','http-basics','http-commerce','lifecycle','shared-cart'];
  let files = 0;
  for(const root of roots) {
    for(const name of await readdir(join('examples',root))) {
      if(!name.endsWith('.qb'))continue;
      const source = await readFile(join('examples',root,name),'utf8');
      const tokens = await scopesFor(source);
      assert.ok(tokens.length>0,`${root}/${name} produces tokens`);
      assert.ok(tokens.every(token=>token.scopes[0]==='source.qbits'),`${root}/${name} retains the root scope`);
      files++;
    }
  }
  assert.equal(files,20);
});

test('real examples cover declarations, resources, events, directives, types, durations, and operators',async()=>{
  const sources = await Promise.all([
    readFile('examples/http-commerce/Commerce.qb','utf8'),
    readFile('examples/http-commerce/Storefront.qb','utf8'),
    readFile('examples/counter/Catalog.qb','utf8'),
    readFile('examples/counter/HtmlForm.qb','utf8'),
    readFile('examples/counter/SvgChart.qb','utf8'),
    readFile('examples/lifecycle/Connection.qb','utf8')
  ]);
  const tokens = await scopesFor(sources.join('\n'));
  for(const [text,scope] of [
    ['class','storage.type.class.qbits'],
    ['CartSummary','entity.name.type.class.qbits'],
    ['service','storage.type.qbits'],
    ['Commerce','entity.name.type.qbits'],
    ['name','variable.parameter.qbits'],
    ['query','storage.type.qbits'],
    ['cart','entity.name.function.qbits'],
    ['action','storage.type.function.qbits'],
    ['add','entity.name.function.qbits'],
    ['socket','storage.type.qbits'],
    ['on','keyword.control.event.qbits'],
    ['data','variable.parameter.qbits'],
    ['for','keyword.control.loop.qbits'],
    ['product','variable.other.loop.qbits'],
    ['key','keyword.other.directive.qbits'],
    ['bind','keyword.other.directive.qbits'],
    ['multiple','keyword.other.directive.qbits'],
    ['text','variable.other.property.qbits'],
    ['input','entity.name.tag.qbits'],
    ['qbits-status','entity.name.tag.qbits'],
    ['data-stage','variable.other.property.qbits'],
    ['viewBox','variable.other.property.qbits'],
    ['stroke-width','variable.other.property.qbits'],
    ['File','support.type.primitive.qbits'],
    ['60','constant.numeric.integer.qbits'],
    ['s','keyword.other.unit.duration.qbits'],
    ['+','keyword.operator.qbits']
  ]) assert.ok(hasScope(tokens,text,scope),`${JSON.stringify(text)} has ${scope}`);
});

test('keywords are bounded and strings and comments take precedence',async()=>{
  const line = 'stateful = "if query action 20ms" # router shared component';
  const tokens = await scopesFor(line);
  const identifier = tokens.find(token=>token.text.includes('stateful'));
  const string = tokens.find(token=>token.text.includes('if query action 20ms'));
  const comment = tokens.find(token=>token.text.includes('router shared component'));
  assert.ok(identifier&&!identifier.scopes.some(scope=>scope.startsWith('keyword.')||scope.startsWith('storage.')));
  assert.ok(string?.scopes.includes('string.quoted.double.qbits'));
  assert.ok(comment?.scopes.includes('comment.line.number-sign.qbits'));
});

test('language configuration describes Qbits comments, brackets, pairs, and indentation',async()=>{
  const config = JSON.parse(await readFile('editor/language-configuration.json','utf8'));
  assert.equal(config.comments.lineComment,'#');
  assert.deepEqual(config.brackets,[["(",")"],["[","]"]]);
  assert.ok(config.autoClosingPairs.some((pair:{open:string;close:string})=>pair.open==='"'&&pair.close==='"'));
  assert.match('component App:',new RegExp(config.indentationRules.increaseIndentPattern));
});
