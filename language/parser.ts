import type {Action,ClassDecl,Component,Computed,ConditionExpression,ElementNode,Expression,Handler,Import,IterationNode,Literal,Node,Prop,State,Statement,ViewNode} from './ast.js';
import {tokenize,type Token} from './tokenizer.js';
import {fail} from './diagnostics.js';

export function parse(source:string,filename='<input>'):Component {
  const tokens=tokenize(source,filename);let cursor=0;
  const peek=(ahead=0)=>tokens[cursor+ahead];const at=(value:string)=>peek().value===value;
  function take(kind:Token['kind'],value?:string):Token {
    const token=peek();
    if(token.kind!==kind||(value!==undefined&&token.value!==value)) fail(source,filename,token.span,`Expected ${kind==='INDENT'?'an indented block':value??kind}, found ${token.kind==='eof'?'end of input':JSON.stringify(token.value)||token.kind}`);
    cursor++;return token;
  }
  const word=(value:string)=>take('identifier',value);const symbol=(value:string)=>take('symbol',value);
  function id():Node<string> {
    const token=take('identifier');
    if(['component','import','from','text','class','computed','action','for','in','key','str','len','on','init','cleanup','if','else','and','not','var','let','const','true','false'].includes(token.value)) fail(source,filename,token.span,`Reserved word ${JSON.stringify(token.value)} cannot be an identifier`);
    return {value:token.value,span:token.span};
  }
  function literal():Node<Literal> {
    const token=peek();
    if(token.kind==='string'||token.kind==='number'){cursor++;return {value:token.kind==='number'?Number(token.value):token.value,span:token.span};}
    if(at('true')||at('false')){cursor++;return {value:token.value==='true',span:token.span};}
    fail(source,filename,token.span,'Expected a string, number or boolean literal');
  }
  function argumentsList():{values:Expression[];end:number} {
    symbol('(');const values:Expression[]=[];
    if(!at(')')) do {values.push(expression());if(!at(','))break;cursor++;} while(true);
    return {values,end:symbol(')').span.end};
  }
  function atom():Expression {
    const token=peek();let value:Expression;
    if(token.kind==='string'||token.kind==='number'||at('true')||at('false')) {const item=literal();value={kind:'literal',...item};}
    else if(at('[')) {
      const start=symbol('[').span.start;const items:Expression[]=[];
      if(!at(']')) do {items.push(expression());if(!at(','))break;cursor++;}while(true);
      value={kind:'list',items,span:{start,end:symbol(']').span.end}};
    } else {
      const name=(at('str')||at('len'))?(()=>{const token=take('identifier');return {value:token.value,span:token.span};})():id();
      if(at('(')) {
        const args=argumentsList();
        if(name.value==='str'||name.value==='len') {
          if(args.values.length!==1) fail(source,filename,name.span,`${name.value} requires one argument`);
          value={kind:name.value,argument:args.values[0],span:{start:name.span.start,end:args.end}};
        } else value={kind:'construct',name,arguments:args.values,span:{start:name.span.start,end:args.end}};
      } else value={kind:'reference',name:name.value,span:name.span};
    }
    while(at('.')) {symbol('.');const name=id();value={kind:'member',object:value,name,span:{start:value.span.start,end:name.span.end}};}
    return value;
  }
  function expression():Expression {
    let left=atom();while(at('+')){cursor++;const right=atom();left={kind:'add',left,right,span:{start:left.span.start,end:right.span.end}};}return left;
  }
  function conditionAtom():ConditionExpression {
    const value=atom();
    if(!['literal','reference','member'].includes(value.kind)) fail(source,filename,value.span,'Conditions support literals, state names, and instance fields');
    return value as ConditionExpression;
  }
  function conditionNot():ConditionExpression {
    if(at('not')){const start=word('not').span.start;const argument=conditionNot();return {kind:'not',argument,span:{start,end:argument.span.end}};}return conditionAtom();
  }
  function conditionComparison():ConditionExpression {
    const left=conditionNot();let kind:'equal'|'notEqual'|undefined;
    if(at('=')&&peek(1).value==='='){symbol('=');symbol('=');kind='equal';}
    else if(at('!')&&peek(1).value==='='){symbol('!');symbol('=');kind='notEqual';}
    if(!kind)return left;const right=conditionNot();return {kind,left,right,span:{start:left.span.start,end:right.span.end}};
  }
  function condition():ConditionExpression {
    let left=conditionComparison();while(at('and')){word('and');const right=conditionComparison();left={kind:'and',left,right,span:{start:left.span.start,end:right.span.end}};}return left;
  }
  const block=()=>{symbol(':');take('NEWLINE');take('INDENT');};
  function statement(eventKind?:string):Statement {
    const start=peek().span.start;const target=atom();
    if(at('=')) {
      symbol('=');
      if(at('event')) {
        word('event');symbol('.');const member=take('identifier');
        if(member.value!=='value'&&member.value!=='checked') fail(source,filename,member.span,`Expected ${eventKind==='change'?'checked':'value'} event member`);
        take('NEWLINE');return {kind:'eventAssign',target,member:{value:member.value,span:member.span} as Node<'value'|'checked'>,span:{start,end:member.span.end}};
      }
      const value=expression();take('NEWLINE');return {kind:'assign',target,value,span:{start,end:value.span.end}};
    }
    if(target.kind!=='member'||!at('(')) fail(source,filename,peek().span,'Expected assignment or approved action/list call');
    const args=argumentsList();take('NEWLINE');return {kind:'call',target:target.object,method:target.name,arguments:args.values,span:{start,end:args.end}};
  }
  function statements(eventKind?:string):Statement[] {const result:Statement[]=[];while(peek().kind!=='DEDENT'&&peek().kind!=='eof')result.push(statement(eventKind));return result;}
  function handler():Handler {
    const start=word('on').span.start;const event=take('identifier');
    if(!['click','input','change'].includes(event.value))fail(source,filename,event.span,`Unsupported event ${JSON.stringify(event.value)}`);
    block();const body=statements(event.value);take('DEDENT');
    if(!body.length)fail(source,filename,event.span,'Event handler requires at least one statement');
    const legacyKind=event.value==='click'&&body.length===1&&body[0].kind==='assign'&&body[0].value.kind==='literal'&&typeof body[0].value.value==='boolean'?'clickBoolean':event.value;
    return {event:{value:event.value,span:event.span} as Node<'click'|'input'|'change'>,kind:legacyKind as Handler['kind'],statements:body,span:{start,end:body.at(-1)!.span.end}};
  }
  function element():ElementNode {
    const tag=id();const attributes:Record<string,Expression>={};const indentedAttributes:string[]=[];const children:ViewNode[]=[];
    function attribute(indented=false):void {const key=take('identifier');symbol('=');if(Object.hasOwn(attributes,key.value))fail(source,filename,key.span,`Duplicate attribute ${key.value}`);Object.defineProperty(attributes,key.value,{value:expression(),enumerable:true});if(indented){indentedAttributes.push(key.value);take('NEWLINE');}}
    while(peek().kind==='identifier'&&peek(1).value==='=')attribute();
    const node:ElementNode={kind:'element',tag,attributes,indentedAttributes,children,span:{start:tag.span.start,end:tokens[cursor-1].span.end}};
    if(at(':')) {
      block();while(peek().kind!=='DEDENT'&&peek().kind!=='eof') {
        if(at('on')) {if(node.handler)fail(source,filename,peek().span,'Duplicate event handler');node.handler=handler();node.span.end=node.handler.span.end;}
        else if(peek().kind==='identifier'&&peek(1).value==='='){attribute(true);node.span.end=tokens[cursor-2].span.end;}
        else {const child=view();children.push(child);node.span.end=child.span.end;}
      }take('DEDENT');
    } else take('NEWLINE');return node;
  }
  function conditional():ViewNode {
    const start=word('if').span.start;const test=condition();block();const consequent:ViewNode[]=[];
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof')consequent.push(view());take('DEDENT');
    let end=consequent.at(-1)?.span.end??test.span.end;const alternate:ViewNode[]=[];
    if(at('else')){word('else');block();while(peek().kind!=='DEDENT'&&peek().kind!=='eof')alternate.push(view());take('DEDENT');end=alternate.at(-1)?.span.end??end;}
    return {kind:'conditional',condition:test,consequent,alternate,span:{start,end}};
  }
  function iteration():IterationNode {
    const start=word('for').span.start;const item=id();word('in');const collection=expression();word('key');symbol('=');const key=expression();block();const children:ViewNode[]=[];
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof')children.push(view());take('DEDENT');
    if(!children.length)fail(source,filename,item.span,'Iteration requires a view block');
    return {kind:'iteration',item,collection,key,children,span:{start,end:children.at(-1)!.span.end}};
  }
  function view():ViewNode {
    if(at('else'))fail(source,filename,peek().span,'else must immediately follow an if block at the same indentation');
    if(at('if'))return conditional();if(at('for'))return iteration();return element();
  }
  function computed():Computed {const start=word('computed').span.start;const name=id();symbol('=');const value=expression();take('NEWLINE');return {name,expression:value,span:{start,end:value.span.end}};}
  function action():Action {const start=word('action').span.start;const name=id();block();const body=statements();take('DEDENT');if(!body.length)fail(source,filename,name.span,'Action requires at least one statement');return {name,statements:body,span:{start,end:body.at(-1)!.span.end}};}
  function classDecl():ClassDecl {
    const start=word('class').span.start;const name=id();block();const fields:State[]=[];const derived:Computed[]=[];const actions:Action[]=[];
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof') {
      if(at('computed'))derived.push(computed());else if(at('action'))actions.push(action());else {const field=id();symbol('=');const initial=expression();take('NEWLINE');fields.push({name:field,initial,span:{start:field.span.start,end:initial.span.end}});}
    }take('DEDENT');const end=[...fields,...derived,...actions].at(-1)?.span.end??name.span.end;return {name,fields,computed:derived,actions,span:{start,end}};
  }
  const imports:Import[]=[];
  while(at('import')){const start=word('import').span.start;let name:Node<string>|undefined;if(peek().kind!=='string'){name=id();word('from');}const path=take('string');take('NEWLINE');imports.push({name,path:{value:path.value,span:path.span},span:{start,end:path.span.end}});}
  const classes:ClassDecl[]=[];while(at('class'))classes.push(classDecl());
  const start=word('component').span.start;const name=id();const props:Prop[]=[];
  if(at('(')){cursor++;if(!at(')'))do{const prop=id();symbol('=');const initial=literal();props.push({name:prop,initial,span:{start:prop.span.start,end:initial.span.end}});if(!at(','))break;cursor++;}while(true);symbol(')');}
  block();const states:State[]=[];const derived:Computed[]=[];const init:Statement[]=[];const cleanup:Statement[]=[];const roots:ViewNode[]=[];
  while(peek().kind!=='DEDENT'&&peek().kind!=='eof') {
    if(at('computed')) {if(roots.length)fail(source,filename,peek().span,'Computed declarations must precede elements');derived.push(computed());}
    else if(at('on')&&(peek(1).value==='init'||peek(1).value==='cleanup')) {
      if(roots.length)fail(source,filename,peek().span,'Lifecycle declarations must precede elements');word('on');const phase=take('identifier');block();const body=statements();take('DEDENT');(phase.value==='init'?init:cleanup).push(...body);
    } else if(peek(1)?.value==='=') {
      if(roots.length)fail(source,filename,peek().span,'State declarations must precede elements');const state=id();symbol('=');const initial=expression();states.push({name:state,initial,span:{start:state.span.start,end:initial.span.end}});take('NEWLINE');
    } else roots.push(view());
  }
  take('DEDENT');take('eof');if(!roots.length)fail(source,filename,name.span,'Component requires at least one root element');
  return {kind:'Component',name,span:{start,end:roots.at(-1)!.span.end},imports,classes,props,states,computed:derived,init,cleanup,roots};
}
