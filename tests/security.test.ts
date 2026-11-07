import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError,defaultCompilerLimits} from '../language/index';

function random(seed:number):()=>number {
  let state=seed>>>0;
  return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x1_0000_0000;};
}

const valid=`component Stress:
    count = 0
    visible = true
    items = [1, 2, 3]
    button text="Count " + str(count):
        on click:
            count = count + 1
    button text="Hide":
        on click:
            visible = false
    button text="Show":
        on click:
            visible = true
    button text="Append":
        on click:
            items.append(4)
    button text="Remove":
        on click:
            items.remove(4)
    button text="Move":
        on click:
            items.move(1, 2)
    if visible:
        section:
            for item in items key=item:
                p text=str(item)`;

test('deterministic malformed-source fuzzing stays bounded and reproducible',()=>{
  const mutate=(seed:number)=>{
    const next=random(seed),results:string[]=[];
    const corpus=[valid,'component C:\n    p text="🙂 é"','component C:\n    n = 9007199254740992\n    p text=str(n)','component C:\n    p text="<img src=x onerror=alert(1)>"'];
    for(let index=0;index<300;index++){
      const base=corpus[Math.floor(next()*corpus.length)];let source=base;
      const edits=1+Math.floor(next()*4);
      for(let edit=0;edit<edits;edit++){
        const at=Math.floor(next()*(source.length+1)),operation=Math.floor(next()*3);
        if(operation===0)source=source.slice(0,at)+['\0','\t','{',';','\ud800','__proto__'][Math.floor(next()*6)]+source.slice(at);
        else if(operation===1&&source.length)source=source.slice(0,at)+source.slice(Math.min(source.length,at+1+Math.floor(next()*5)));
        else source=source.slice(0,at)+source.slice(Math.max(0,at-3),at)+source.slice(at);
      }
      try{const first=compile(source,'fuzz.qb'),second=compile(source,'fuzz.qb');assert.equal(first.code,second.code);assert.doesNotMatch(first.code,/\beval\b|\bFunction\b|innerHTML/);results.push('ok');}
      catch(error){assert.ok(error instanceof CompileError||error instanceof TypeError);results.push(error instanceof CompileError?error.diagnostic.message:error.message);}
    }
    return results;
  };
  assert.deepEqual(mutate(0x3a2f_2026),mutate(0x3a2f_2026));
});

test('compiler limits reject excessive work with explicit diagnostics',()=>{
  assert.equal(defaultCompilerLimits.maxSourceLength,2*1024*1024);
  assert.throws(()=>compile('component C:\n    p text="x"','large.qb',{limits:{maxSourceLength:8}}),/Source exceeds/);
  const nested='component C:\n'+'    '.repeat(1)+'div:\n'+'    '.repeat(2)+'div:\n'+'    '.repeat(3)+'p text="x"';
  assert.throws(()=>compile(nested,'deep.qb',{limits:{maxNestingDepth:2}}),/Nesting exceeds/);
  assert.throws(()=>compile('component C:\n    values = [1, 2, 3]\n    p text=str(len(values))','list.qb',{limits:{maxCollectionItems:2}}),/Collection exceeds/);
  assert.throws(()=>compile('component C:\n    n = 0\n    p text="x" + str(n)','complex.qb',{limits:{maxExpressionNodes:3}}),/Expression complexity exceeds/);
  const longAdd=Array.from({length:600},()=> '1').join(' + ');
  assert.throws(()=>compile(`component C:\n    n = ${longAdd}\n    p text=str(n)`,'deep-expression.qb'),/Expression nesting exceeds/);
  assert.throws(()=>compile(valid,'bad-limit.qb',{limits:{maxNestingDepth:0}}),/positive safe integer/);
  assert.throws(()=>compile(42 as unknown as string),/source must be a string/);
});

test('Unicode text is inert while confusable identifiers remain rejected',()=>{
  const source='component C:\n    p text="🙂 café é <script>alert(1)</script>"';
  const output=compile(source).code;
  assert.match(output,/export const model=\{/);assert.doesNotMatch(output,/JSON\.parse|innerHTML|eval\(|new Function/);
  assert.throws(()=>compile('component Café:\n    p text="x"'),/Unexpected character/);
  assert.throws(()=>compile('component С:\n    p text="x"'),/Unexpected character/);
});

test('generated models preserve prototype-named fields as inert own data',async()=>{
  const component=compile('component C:\n    __proto__ = 1\n    constructor = 2\n    prototype = 3\n    p text=str(__proto__)','prototype-fields.qb').code;
  const shared=compile('shared Store:\n    __proto__ = 1\n    constructor = 2\n    prototype = 3','prototype-shared.qb').code;
  const componentModule=await import(`data:text/javascript,${encodeURIComponent(component)}#component`);
  const sharedModule=await import(`data:text/javascript,${encodeURIComponent(shared)}#shared`);
  for(const values of [componentModule.model.states,sharedModule.default.states]){
    assert.equal(Object.getPrototypeOf(values),Object.prototype);
    assert.deepEqual(Object.keys(values),['__proto__','constructor','prototype']);
    assert.ok(Object.hasOwn(values,'__proto__'));
  }
  assert.deepEqual(componentModule.model.states.__proto__,{kind:'literal',value:1});
  assert.equal(sharedModule.default.states.__proto__,1);
  assert.equal(({} as {polluted?:unknown}).polluted,undefined);
});

test('seeded runtime operations preserve DOM identity and rollback failed list changes',async()=>{
  const runtime=await readFile('dist/lib/runtime/index.js','utf8'),module=compile(valid).code;
  const browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const result=await page.evaluate(async({runtime,module})=>{
      const urls=[runtime,module].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      const errors:string[]=[];window.addEventListener('error',event=>{errors.push(event.error?.message??event.message);event.preventDefault();});
      const host=document.createElement('main');document.body.append(host);
      try{
        const api=await import(urls[0]),root=await import(urls[1]);const dispose=root.default(host,api);const buttons=[...host.querySelectorAll('button')];
        const firstButton=buttons[0],seed=0x3a2f2026;let state=seed>>>0,count=0,hasFour=false,visible=true;
        for(let step=0;step<120;step++){
          state=(Math.imul(state,1664525)+1013904223)>>>0;const operation=Math.floor((state/0x1_0000_0000)*4);
          if(operation===0){buttons[0].click();count++;}
          else if(operation===1){buttons[visible?1:2].click();visible=!visible;}
          else if(operation===2){buttons[hasFour?4:3].click();hasFour=!hasFour;}
          else {if(!visible){buttons[2].click();visible=true;}buttons[3].click();if(!hasFour)hasFour=true;}
        }
        buttons[2].click();
        const beforeDispose={count:buttons[0].textContent,firstSame:host.querySelector('button')===firstButton,rows:[...host.querySelectorAll('p')].map(node=>node.textContent),sections:host.querySelectorAll('section').length,text:host.textContent,expectedCount:`Count ${count}`,errors};
        dispose();return {...beforeDispose,empty:host.childNodes.length===0};
      }finally{host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
    },{runtime,module});
    assert.equal(result.count,result.expectedCount);assert.equal(result.firstSame,true);assert.equal(result.empty,true);
    assert.ok(result.rows.length===3||result.rows.length===4,JSON.stringify(result));assert.ok(result.errors.length>0);assert.ok(result.errors.every(message=>/Duplicate iteration key 4/.test(message)));
  }finally{await browser.close();}
});

test('runtime limits, hostile props, and __proto__ iteration fail without corrupting DOM',async()=>{
  const runtime=await readFile('dist/lib/runtime/index.js','utf8');
  const protoModule=compile(`component C:
    items = [1]
    for __proto__ in items key=__proto__:
        p text=str(__proto__)`).code;
  const recursiveModule=`export const model={props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[{kind:'element',tag:'Loop',component:0,attributes:{},children:[]}]};export default function recursive(target,runtime){return runtime.mountComponent(target,model,[recursive]);}`;
  const browser=await firefox.launch({headless:true});
  try{
    const page=await browser.newPage();
    const result=await page.evaluate(async({runtime,protoModule,recursiveModule})=>{
      const urls=[runtime,protoModule,recursiveModule].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),runtimeUrl=urls[0],protoUrl=urls[1];const host=document.createElement('main');document.body.append(host);
      try{
        const api=await import(runtimeUrl),root=await import(protoUrl);const dispose=root.default(host,api);const protoText=host.textContent;dispose();
        const emptyModel={props:{value:''},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[]};
        let getter='',proxy='',depth='',collection='',invalidLimit='';
        try{api.mountComponent(host,emptyModel,[],Object.defineProperty({},'value',{enumerable:true,get(){throw new Error('getter blocked');}}));}catch(error){getter=error.message;}
        try{api.mountComponent(host,emptyModel,[],new Proxy({value:''},{ownKeys(){throw new Error('proxy blocked');}}));}catch(error){proxy=error.message;}
        const listModel={props:{},classes:{},states:{items:{kind:'list',items:[1,2,3].map(value=>({kind:'literal',value}))}},computed:{},init:[],cleanup:[],roots:[]};
        try{api.mountComponent(host,listModel,[],{}, {maxCollectionItems:2});}catch(error){collection=error.message;}
        try{api.mountComponent(host,emptyModel,[],{}, {maxUpdatesPerFlush:0});}catch(error){invalidLimit=error.message;}
        const recursive=await import(urls[2]);
        try{api.mountComponent(host,recursive.model,[recursive.default],{}, {maxComponentDepth:8});}catch(error){depth=error.message;}
        return{protoText,getter,proxy,collection,invalidLimit,depth,empty:host.childNodes.length===0,polluted:({}).polluted};
      }finally{host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
    },{runtime,protoModule,recursiveModule});
    assert.deepEqual(result,{protoText:'1',getter:'getter blocked',proxy:'proxy blocked',collection:'Collection exceeds the configured limit of 2 items',invalidLimit:'Runtime limit maxUpdatesPerFlush must be a positive safe integer',depth:'Component nesting exceeds the configured limit of 8',empty:true,polluted:undefined});
  }finally{await browser.close();}
});
