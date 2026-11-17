import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firefox} from 'playwright';
import {compile,CompileError} from '../language/index.js';

const source=`component Stage7A:
    label = "Safe"
    radius = 12
    article data-stage="7A" aria-label=label:
        my-card data-value=label
        input id="name" value=label:
            on input:
                label = event.value
        svg viewBox="0 0 40 40" role="img":
            defs:
                linearGradient id="g":
                    stop offset="0%" stop-color="#fff"
                symbol id="dot":
                    circle r=1
            use xlink:href="#dot"
            circle id="interactive" cx=20 cy=20 r=radius fill="url(#g)" stroke-width=2:
                on click:
                    radius = radius + 1
            foreignObject x=0 y=0 width=10 height=10:
                div text=label:
                    svg viewBox="0 0 2 2":
                        circle class="nested" r=1`;

test('Stage 7A parses HTML5, custom elements, qualified attributes and SVG casing',()=>{
  const {ast,code}=compile(source,'Stage7A.qb');
  const article=ast.roots[0];assert.equal(article.kind,'element');if(article.kind!=='element')return;
  assert.deepEqual(Object.keys(article.attributes),['data-stage','aria-label']);
  const svg=article.children[2];assert.equal(svg.kind,'element');if(svg.kind!=='element')return;
  assert.equal(svg.tag.value,'svg');assert.ok(Object.hasOwn(svg.attributes,'viewBox'));
  assert.doesNotMatch(code,/innerHTML|eval\(|Function\(/);
});

test('Stage 7A rejects executable markup, unsafe handlers and unsafe URLs',()=>{
  for(const [text,message] of [
    ['component C:\n    script text="alert(1)"',/script elements are forbidden/],
    ['component C:\n    img onclick="alert(1)"',/Unsafe element attribute/],
    ['component C:\n    iframe srcdoc="<script>bad<\/script>"',/Unsafe element attribute/],
    ['component C:\n    a href="javascript:alert(1)" text="bad"',/Unsafe URL scheme/],
    ['component C:\n    img:\n        span text="bad"',/Void element img cannot have children/],
  ] as const)assert.throws(()=>compile(text,'unsafe.qb'),(error:unknown)=>error instanceof CompileError&&message.test(error.message));
});

test('Stage 7A renders and updates HTML/SVG safely in Firefox',async()=>{
  const [runtime,moduleCode]=await Promise.all([readFile('dist/lib/runtime/index.js','utf8'),Promise.resolve(compile(source).code)]);
  const unsafe=compile('component Unsafe:\n    target = "javascript:alert(1)"\n    a href=target text="blocked"').code;
  const browser=await firefox.launch({headless:true});
  try{const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const result=await page.evaluate(async({runtime,moduleCode,unsafe})=>{const urls=[runtime,moduleCode,unsafe].map(value=>URL.createObjectURL(new Blob([value],{type:'text/javascript'})));try{const api=await import(urls[0]),component=await import(urls[1]),bad=await import(urls[2]),host=document.createElement('main');document.body.append(host);const dispose=component.default(host,api);const input=host.querySelector('input')!,circle=host.querySelector('#interactive')!,foreign=host.querySelector('foreignObject div')!,custom=host.querySelector('my-card')!,nested=host.querySelector('.nested')!,use=host.querySelector('use')!;input.focus();input.value='<img src=x>';input.setSelectionRange(2,2);input.dispatchEvent(new Event('input',{bubbles:true}));circle.dispatchEvent(new MouseEvent('click',{bubbles:true}));const snapshot={htmlNamespace:host.querySelector('article')!.namespaceURI,svgNamespace:circle.namespaceURI,foreignNamespace:foreign.namespaceURI,nestedNamespace:nested.namespaceURI,xlink:use.getAttributeNS('http://www.w3.org/1999/xlink','href'),custom:custom.getAttribute('data-value'),aria:host.querySelector('article')!.getAttribute('aria-label'),text:foreign.firstChild?.textContent,images:host.querySelectorAll('img').length,r:circle.getAttribute('r'),identity:host.querySelector('input')===input,focused:document.activeElement===input,selection:input.selectionStart};let unsafeError='',unsafeChildren=-1;const unsafeHost=document.createElement('div');try{bad.default(unsafeHost,api);}catch(error){unsafeError=(error as Error).message;unsafeChildren=unsafeHost.childNodes.length;}let scriptError='',scriptChildren=-1;const scriptHost=document.createElement('div');try{api.mountComponent(scriptHost,{props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[{kind:'element',tag:'script',component:-1,attributes:{text:{kind:'literal',value:'globalThis.pwned=1'}},children:[]}]},[]);}catch(error){scriptError=(error as Error).message;scriptChildren=scriptHost.childNodes.length;}dispose();host.remove();return{snapshot,unsafeError,unsafeChildren,scriptError,scriptChildren,pwned:(globalThis as any).pwned??null};}finally{urls.forEach(URL.revokeObjectURL);}}, {runtime,moduleCode,unsafe});assert.deepEqual(result.snapshot,{htmlNamespace:'http://www.w3.org/1999/xhtml',svgNamespace:'http://www.w3.org/2000/svg',foreignNamespace:'http://www.w3.org/1999/xhtml',nestedNamespace:'http://www.w3.org/2000/svg',xlink:'#dot',custom:'<img src=x>',aria:'<img src=x>',text:'<img src=x>',images:0,r:'13',identity:true,focused:true,selection:2});assert.match(result.unsafeError,/Unsafe URL/);assert.equal(result.unsafeChildren,0);assert.match(result.scriptError,/script elements are forbidden/);assert.equal(result.scriptChildren,0);assert.equal(result.pwned,null);assert.deepEqual(errors,[]);}finally{await browser.close();}
});
