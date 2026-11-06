import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

test('Boolean parsing, folding, bindings, dependency cycles and diagnostics',()=>{
  const source=`component C:
    a = true
    b = false
    c = true
    computed result = not a and b or c
    computed grouped = not (a and (b or c))
    input:
        type="checkbox"
        checked=result and not grouped
    p text=str(result)
    if a and (b or c):
        p text="yes"`;
  const ast=compile(source).ast;
  const result=ast.computed[0].expression;
  assert.equal(result.kind,'or');
  if(result.kind==='or'){assert.equal(result.left.kind,'and');if(result.left.kind==='and')assert.equal(result.left.left.kind,'not');}
  const grouped=ast.computed[1].expression;
  assert.equal(grouped.kind,'not');if(grouped.kind==='not')assert.equal(grouped.argument.kind,'and');
  const folded=compile('component C:\n    a = not false and (false or true)\n    p text=str(a)').code;
  assert.match(folded,/"a":\{"kind":"literal","value":true\}/);
  const dead=compile('component C:\n    a = true\n    if true or a:\n        p text="live"\n    else:\n        p text="dead"').code;
  assert.doesNotMatch(dead,/dead|"kind":"or"/);
  for(const [expression,message] of [
    ['true and 1',/and requires boolean operands/],['false or "x"',/or requires boolean operands/],
    ['not []',/not requires a boolean operand/],['false and missing',/Unknown state or prop/],
    ['true or (1 and false)',/and requires boolean operands/],['true == false == true',/Chained comparisons/],
    ['true && false',/Unexpected character/],['!true',/Expected identifier/],
    ['true or',/Expected identifier/],['(true and false',/Expected \)/],
    ['true xor false',/Expected NEWLINE/],['true or run()',/Unknown class/],
  ] as const){
    assert.throws(()=>compile(`component C:\n    computed bad = ${expression}\n    p text=str(bad)`,'bad.qb'),error=>error instanceof CompileError&&error.diagnostic.line===2&&message.test(error.message),expression);
  }
  assert.throws(()=>compile('component C:\n    computed a = false and b\n    computed b = not a\n    p text=str(a)'),/dependency cycle/);
  assert.doesNotThrow(()=>compile('component C:\n    computed a = b or false\n    computed b = not false\n    p text=str(a)'));
  assert.doesNotThrow(()=>compile('class Flags:\n    enabled = true\n    computed ready = enabled or fallback\n    computed fallback = not enabled\ncomponent C:\n    flags = Flags(true)\n    if not flags.ready or flags.fallback:\n        p text="off"'));
  const child=compile('component Child(ready = false):\n    p text=str(ready)').ast;
  assert.doesNotThrow(()=>compile('import Child from "./Child.qb"\ncomponent C:\n    enabled = true\n    Child ready=enabled and not false','C.qb',{components:new Map([['Child',child]])}));
  for(const expression of ['not '.repeat(12)+'true','('.repeat(12)+'true'+')'.repeat(12),Array(12).fill('true').join(' or ')]){
    assert.throws(()=>compile(`component C:\n    computed a = ${expression}`,'limits.qb',{limits:{maxExpressionDepth:8}}),/Expression nesting exceeds/);
  }
  assert.throws(()=>compile('component C:\n    a = true or false','limits.qb',{limits:{maxExpressionNodes:2}}),/Expression complexity exceeds/);
});

test('Boolean short circuits, reactive bindings and failed transactions preserve identity in Firefox',async()=>{
  const child=compile(`component Child:
    count = 0
    button text=str(count):
        on click:
            count = count + 1`).code;
  const app=compile(`import Child from "./Child.qb"
component C:
    gate = false
    other = false
    third = false
    n = 9007199254740991
    computed safe_and = gate and (n + 1 == 0)
    computed safe_or = not gate or (n + 1 == 0)
    computed selected = gate or other
    computed precedence = not gate and other or third
    computed grouped = not (gate and (other or third))
    input:
        type="checkbox"
        checked=selected and not safe_and
    p text=str(safe_and) + ":" + str(safe_or)
    p class="truth" text=str(precedence) + ":" + str(grouped)
    if not gate and (not other or safe_or):
        Child
    button class="toggle" text="toggle":
        on click:
            other = not other`).code;
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const result=await page.evaluate(async({runtime,child,app})=>{
      const runtimeUrl=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),childUrl=URL.createObjectURL(new Blob([child],{type:'text/javascript'})),appUrl=URL.createObjectURL(new Blob([app.replace('./Child.qb',childUrl)],{type:'text/javascript'}));
      try{
        const api=await import(runtimeUrl),module=await import(appUrl),host=document.createElement('main');document.body.append(host);
        let reads=0;const expression=module.model.computed.safe_and,left=expression.left;
        Object.defineProperty(expression,'left',{get(){reads++;return left;}});
        const dispose=module.default(host,api),input=host.querySelector('input')!,childButton=host.querySelector('button')!,text=host.querySelector('p')!;
        childButton.click();input.focus();
        const initial=text.textContent;
        let overflow='';try{dispose.updateState({gate:true});}catch(error){overflow=(error as Error).message;}
        const rollback={text:text.textContent,child:childButton.textContent,identity:host.querySelector('button')===childButton,focus:document.activeElement===input};
        (host.querySelector('.toggle') as HTMLButtonElement).click();
        const recovered={checked:input.checked,child:childButton.textContent,identity:host.querySelector('button')===childButton};
        dispose.updateState({n:0,gate:true});const activated=text.textContent;
        dispose.updateState({gate:false,n:9007199254740991});const skippedAgain=text.textContent;
        const before=reads;dispose.updateState({n:9007199254740990});const unsubscribed=reads===before;
        let invalid='';try{dispose.updateState({other:1});}catch(error){invalid=(error as Error).message;}
        const truthTable:string[]=[];dispose.updateState({n:0});
        for(const gate of [false,true])for(const other of [false,true])for(const third of [false,true]){
          dispose.updateState({gate,other,third});truthTable.push(host.querySelector('.truth')!.textContent!);
        }
        dispose();const remaining=host.childNodes.length;
        // Direct runtime models must also enforce Boolean types on evaluated operands.
        const failures:string[]=[];
        for(const expression of [
          {kind:'not',argument:{kind:'literal',value:1}},
          {kind:'and',left:{kind:'literal',value:true},right:{kind:'literal',value:'x'}},
          {kind:'or',left:{kind:'literal',value:false},right:{kind:'literal',value:[]}},
          {kind:'or',left:{kind:'literal',value:1},right:{kind:'literal',value:true}},
        ]){
          const target=document.createElement('main');
          try{api.mountComponent(target,{props:{},classes:{},states:{bad:expression},computed:{},init:[],cleanup:[],roots:[]},[]);failures.push('accepted');}
          catch(error){failures.push((error as Error).message);}
          if(target.childNodes.length)throw new Error('Failed mount leaked DOM');
        }
        return {initial,overflow,rollback,recovered,activated,skippedAgain,unsubscribed,truthTable,invalid,remaining,failures};
      }finally{[runtimeUrl,childUrl,appUrl].forEach(URL.revokeObjectURL);}
    },{runtime,child,app});
    assert.equal(result.initial,'false:true');assert.match(result.overflow,/safe integer/);
    assert.deepEqual(result.rollback,{text:'false:true',child:'1',identity:true,focus:true});
    assert.deepEqual(result.recovered,{checked:true,child:'1',identity:true});
    assert.equal(result.activated,'false:false');assert.equal(result.skippedAgain,'false:true');
    assert.equal(result.unsubscribed,true);
    assert.deepEqual(result.truthTable,['false:true','true:true','true:true','true:true','false:true','true:false','false:false','true:false']);
    assert.match(result.invalid,/requires boolean/);assert.equal(result.remaining,0);
    assert.deepEqual(result.failures,['not requires boolean operands','and requires boolean operands','or requires boolean operands','or requires boolean operands']);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
