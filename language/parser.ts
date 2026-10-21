import type { Component, Node, Literal, Expression, ElementNode, Import, Prop, State } from './ast.js';
import { tokenize, type Token } from './tokenizer.js';
import { fail } from './diagnostics.js';
export function parse(source:string, filename='<input>'):Component {
  const tokens=tokenize(source,filename); let cursor=0;
  const peek=()=>tokens[cursor];
  const at=(value:string)=>peek().value===value;
  function take(kind:Token['kind'],value?:string):Token {
    const t=peek();
    if(t.kind!==kind || (value!==undefined && t.value!==value)) fail(source,filename,t.span,`Expected ${kind==='INDENT'?'an indented block':value??kind}, found ${t.kind==='eof'?'end of input':JSON.stringify(t.value)||t.kind}`);
    cursor++; return t;
  }
  const word=(v:string)=>take('identifier',v);
  const sym=(v:string)=>take('symbol',v);
  function id():Node<string> {
    const t=take('identifier');
    if(['component','import','from','text','class','str','on','click','var','let','const','true','false'].includes(t.value)) fail(source,filename,t.span,`Reserved word ${JSON.stringify(t.value)} cannot be an identifier`);
    return {value:t.value,span:t.span};
  }
  function literal():Node<Literal> {
    const t=peek();
    if(t.kind==='string'||t.kind==='number') {cursor++; return {value:t.kind==='number'?Number(t.value):t.value,span:t.span};}
    if(at('true')||at('false')) {cursor++;return {value:t.value==='true',span:t.span};}
    fail(source,filename,t.span,'Expected a string, number or boolean literal');
  }
  function atom():Expression {
    const t=peek();
    if(t.kind==='string'||t.kind==='number'||at('true')||at('false')) { const l=literal(); return {kind:'literal',...l}; }
    if(at('str')) {cursor++;sym('(');const name=id(); const argument:Expression={kind:'reference',name:name.value,span:name.span};const end=sym(')').span.end;return {kind:'str',argument,span:{start:t.span.start,end}};}
    const name=id();return {kind:'reference',name:name.value,span:name.span};
  }
  function expression():Expression {
    let left=atom();
    while(at('+')) {cursor++;const right=atom();left={kind:'add',left,right,span:{start:left.span.start,end:right.span.end}};}
    return left;
  }
  const block=()=>{sym(':');take('NEWLINE');take('INDENT');};
  function element():ElementNode {
    const tag=id();const attributes:Record<string,Expression>={};const indentedAttributes:string[]=[];const children:ElementNode[]=[];
    function attribute(indented=false):void {
      const key=take('identifier');sym('=');
      if(Object.hasOwn(attributes,key.value)) fail(source,filename,key.span,`Duplicate attribute ${key.value}`);
      const value=expression();Object.defineProperty(attributes,key.value,{value,enumerable:true});
      if(indented) {indentedAttributes.push(key.value);take('NEWLINE');}
    }
    while(peek().kind==='identifier'&&tokens[cursor+1]?.value==='=') attribute();
    const node:ElementNode={tag,attributes,indentedAttributes,children,span:{start:tag.span.start,end:tokens[cursor-1].span.end}};
    if(at(':')) {
      block();
      while(peek().kind!=='DEDENT'&&peek().kind!=='eof') {
        if(at('on')) {
          const start=word('on').span.start;const event=take('identifier');block();const target=id();sym('=');
          if(node.handler) fail(source,filename,target.span,'Duplicate event handler');
          if(event.value==='click') {
            if(peek().kind==='identifier'&&(at('true')||at('false'))) {
              const value=peek();cursor++;
              node.handler={kind:'clickBoolean',target,value:{value:value.value==='true',span:value.span},span:{start,end:value.span.end}};
              take('NEWLINE');take('DEDENT');node.span.end=value.span.end;
            } else {
              if(peek().kind!=='identifier') fail(source,filename,peek().span,'Click handlers require a boolean literal assignment or numeric state increment');
              const operand=id();sym('+');const value=take('number');
              node.handler={kind:'click',target,operand,step:{value:Number(value.value),span:value.span},span:{start,end:value.span.end}};
              take('NEWLINE');take('DEDENT');node.span.end=value.span.end;
            }
          } else if(event.value==='input') {
            const sourceStart=word('event').span.start;sym('.');const sourceEnd=word('value').span.end;
            node.handler={kind:'input',target,eventValue:{value:'event.value',span:{start:sourceStart,end:sourceEnd}},span:{start,end:sourceEnd}};
            take('NEWLINE');take('DEDENT');node.span.end=sourceEnd;
          } else if(event.value==='change') {
            const sourceStart=word('event').span.start;sym('.');const sourceEnd=word('checked').span.end;
            node.handler={kind:'change',target,eventChecked:{value:'event.checked',span:{start:sourceStart,end:sourceEnd}},span:{start,end:sourceEnd}};
            take('NEWLINE');take('DEDENT');node.span.end=sourceEnd;
          } else fail(source,filename,event.span,`Unsupported event ${JSON.stringify(event.value)}`);
        } else if(peek().kind==='identifier'&&tokens[cursor+1]?.value==='=') {
          attribute(true);node.span.end=tokens[cursor-2].span.end;
        } else {const child=element();children.push(child);node.span.end=child.span.end;}
      }
      take('DEDENT');
    } else take('NEWLINE');
    return node;
  }
  const imports:Import[]=[];
  while(at('import')) {
    const start=word('import').span.start;let name:Node<string>|undefined;
    if(peek().kind!=='string') {name=id();word('from');}
    const path=take('string');take('NEWLINE');imports.push({name,path:{value:path.value,span:path.span},span:{start,end:path.span.end}});
  }
  const start=word('component').span.start;const name=id();const props:Prop[]=[];
  if(at('(')) {
    cursor++;
    if(!at(')')) do {const name=id();sym('=');const initial=literal();props.push({name,initial,span:{start:name.span.start,end:initial.span.end}});if(!at(','))break;cursor++;}while(true);
    sym(')');
  }
  block();const states:State[]=[];const roots:ElementNode[]=[];
  while(peek().kind!=='DEDENT'&&peek().kind!=='eof') {
    if(tokens[cursor+1]?.value==='=') {
      if(roots.length) fail(source,filename,peek().span,'State declarations must precede elements');
      const name=id();sym('=');const initial=literal();
      states.push({name,initial,span:{start:name.span.start,end:initial.span.end}});take('NEWLINE');
    } else roots.push(element());
  }
  take('DEDENT');take('eof');
  if(!roots.length) fail(source,filename,name.span,'Component requires at least one root element');
  return {kind:'Component',name,span:{start,end:roots.at(-1)!.span.end},imports,props,states,roots};
}
