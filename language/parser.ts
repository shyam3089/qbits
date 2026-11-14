import type {Action,ClassDecl,Component,Computed,ConditionExpression,ElementNode,Expression,Handler,HttpAction,HttpClient,HttpMethod,Import,IterationNode,Literal,Node,Prop,Query,SlotNode,State,Statement,ViewNode} from './ast.js';
import {tokenize,type Token} from './tokenizer.js';
import {fail} from './diagnostics.js';
import {resolveCompilerLimits,type CompilerLimits} from './limits.js';

export function parse(source:string,filename='<input>',limitOverrides:Partial<CompilerLimits>={}):Component {
  const limits=resolveCompilerLimits(limitOverrides),tokens=tokenize(source,filename,limits);let cursor=0,expressionNodes=0,expressionDepth=0,viewDepth=0;
  const peek=(ahead=0)=>tokens[cursor+ahead];const at=(value:string)=>peek().value===value;
  function take(kind:Token['kind'],value?:string):Token {
    const token=peek();
    if(token.kind!==kind||(value!==undefined&&token.value!==value)) fail(source,filename,token.span,`Expected ${kind==='INDENT'?'an indented block':value??kind}, found ${token.kind==='eof'?'end of input':JSON.stringify(token.value)||token.kind}`);
    cursor++;return token;
  }
  const word=(value:string)=>take('identifier',value);const symbol=(value:string)=>take('symbol',value);
  const expressionNode=<T extends Expression|ConditionExpression>(value:T):T=>{if(++expressionNodes>limits.maxExpressionNodes)fail(source,filename,value.span,`Expression complexity exceeds the configured limit of ${limits.maxExpressionNodes} nodes`);return value;};
  function nestedExpression<T>(span:Token['span'],run:()=>T):T {if(++expressionDepth>limits.maxExpressionDepth)fail(source,filename,span,`Expression nesting exceeds the configured limit of ${limits.maxExpressionDepth} levels`);try{return run();}finally{expressionDepth--;}}
  function id():Node<string> {
    const token=take('identifier');
    if(['component','import','from','text','class','computed','action','state','for','in','key','str','len','on','emit','init','cleanup','if','else','and','or','not','var','let','const','true','false','null','File'].includes(token.value)) fail(source,filename,token.span,`Reserved word ${JSON.stringify(token.value)} cannot be an identifier`);
    return {value:token.value,span:token.span};
  }
  function literal():Node<Literal> {
    const token=peek();
    if(token.kind==='string'||token.kind==='number'){cursor++;return {value:token.kind==='number'?Number(token.value):token.value,span:token.span};}
    if(at('true')||at('false')){cursor++;return {value:token.value==='true',span:token.span};}
    if(at('null')){cursor++;return {value:null,span:token.span};}
    fail(source,filename,token.span,'Expected a string, number, boolean or null literal');
  }
  function argumentsList():{values:Expression[];end:number} {
    symbol('(');const values:Expression[]=[];
    if(!at(')')) do {if(values.length>=limits.maxCollectionItems)fail(source,filename,peek().span,`Argument list exceeds the configured limit of ${limits.maxCollectionItems} items`);values.push(nestedExpression(peek().span,expression));if(!at(','))break;cursor++;} while(true);
    return {values,end:symbol(')').span.end};
  }
  function atom():Expression {
    const token=peek();let value:Expression;
    if(at('(')){symbol('(');value=nestedExpression(token.span,expression);symbol(')');}
    else if(token.kind==='string'||token.kind==='number'||at('true')||at('false')||at('null')) {const item=literal();value=expressionNode({kind:'literal',...item});}
    else if(at('[')) {
      const start=symbol('[').span.start;const items:Expression[]=[];
      if(!at(']')) do {if(items.length>=limits.maxCollectionItems)fail(source,filename,peek().span,`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);items.push(nestedExpression(peek().span,expression));if(!at(','))break;cursor++;}while(true);
      const close=symbol(']');let itemType:Node<string>|undefined;if(at('as')){word('as');if(at('File')){const item=take('identifier');itemType={value:item.value,span:item.span};}else itemType=id();}
      value=expressionNode({kind:'list',items,...(itemType?{itemType}:{}),span:{start,end:itemType?.span.end??close.span.end}});
    } else {
      const name=(at('str')||at('len')||at('contains')||at('count'))?(()=>{const token=take('identifier');return {value:token.value,span:token.span};})():id();
      if(at('(')) {
        const args=argumentsList();
        if(name.value==='str'||name.value==='len') {
          if(args.values.length!==1) fail(source,filename,name.span,`${name.value} requires one argument`);
          value=expressionNode({kind:name.value,argument:args.values[0],span:{start:name.span.start,end:args.end}});
        } else if(name.value==='contains'||name.value==='count') {
          if(args.values.length!==2) fail(source,filename,name.span,`${name.value} requires two arguments`);
          value=expressionNode({kind:name.value,left:args.values[0],right:args.values[1],span:{start:name.span.start,end:args.end}});
        } else value=expressionNode({kind:'construct',name,arguments:args.values,span:{start:name.span.start,end:args.end}});
      } else value=expressionNode({kind:'reference',name:name.value,span:name.span});
    }
    let memberDepth=0;while(at('.')) {if(++memberDepth>limits.maxExpressionDepth)fail(source,filename,peek().span,`Expression nesting exceeds the configured limit of ${limits.maxExpressionDepth} levels`);symbol('.');const member=take('identifier'),name={value:member.value,span:member.span};value=expressionNode({kind:'member',object:value,name,span:{start:value.span.start,end:name.span.end}});}
    return value;
  }
  function addition():Expression {
    let left=atom(),addDepth=0;while(at('+')||at('-')){if(++addDepth>limits.maxExpressionDepth)fail(source,filename,peek().span,`Expression nesting exceeds the configured limit of ${limits.maxExpressionDepth} levels`);const kind=peek().value==='+'?'add':'subtract';cursor++;const right=atom();left=expressionNode({kind,left,right,span:{start:left.span.start,end:right.span.end}});}return left;
  }
  function conditionAtom():ConditionExpression {
    return addition();
  }
  function conditionNot():ConditionExpression {
    if(at('not')){const token=word('not'),start=token.span.start;return nestedExpression(token.span,()=>{const argument=conditionNot();return expressionNode({kind:'not',argument,span:{start,end:argument.span.end}});});}return conditionAtom();
  }
  function conditionComparison():ConditionExpression {
    const left=conditionNot();let kind:'equal'|'notEqual'|undefined;
    if(at('=')&&peek(1).value==='='){symbol('=');symbol('=');kind='equal';}
    else if(at('!')&&peek(1).value==='='){symbol('!');symbol('=');kind='notEqual';}
    if(!kind)return left;const right=conditionNot();
    if((at('=')||at('!'))&&peek(1).value==='=')fail(source,filename,peek().span,'Chained comparisons are unsupported; combine comparisons with and');
    return expressionNode({kind,left,right,span:{start:left.span.start,end:right.span.end}});
  }
  function conjunction():ConditionExpression {
    let left=conditionComparison(),andDepth=0;while(at('and')){if(++andDepth>limits.maxExpressionDepth)fail(source,filename,peek().span,`Expression nesting exceeds the configured limit of ${limits.maxExpressionDepth} levels`);word('and');const right=conditionComparison();left=expressionNode({kind:'and',left,right,span:{start:left.span.start,end:right.span.end}});}return left;
  }
  function expression():Expression {
    let left=conjunction(),depth=0;while(at('or')){if(++depth>limits.maxExpressionDepth)fail(source,filename,peek().span,`Expression nesting exceeds the configured limit of ${limits.maxExpressionDepth} levels`);word('or');const right=conjunction();left=expressionNode({kind:'or',left,right,span:{start:left.span.start,end:right.span.end}});}return left;
  }
  const condition=expression;
  const block=()=>{symbol(':');take('NEWLINE');take('INDENT');};
  function statement(eventKind?:string):Statement {
    if(at('await')||peek().kind==='identifier'&&peek(1).value==='='&&peek(2).value==='await'){
      const binding=at('await')?undefined:id(),start=binding?.span.start??peek().span.start;if(binding)symbol('=');word('await');word('http');symbol('.');const method=take('identifier');if(!['get','post','put','patch','delete'].includes(method.value))fail(source,filename,method.span,'await http requires get, post, put, patch, or delete');const args=argumentsList();let client:Node<string>|undefined,response:Node<string>|undefined,responseList=false,end=args.end;while(peek().kind!=='NEWLINE'){if(at('client')){const token=word('client');if(client)fail(source,filename,token.span,'Imperative HTTP call may select one client');client=id();end=client.span.end;}else if(at('response')){const token=word('response');if(response)fail(source,filename,token.span,'Imperative HTTP call may declare one response type');if(at('list')){word('list');symbol('[');response=id();end=symbol(']').span.end;responseList=true;}else{response=id();end=response.span.end;}}else fail(source,filename,peek().span,'Expected client or response after imperative HTTP call');}take('NEWLINE');return {kind:'awaitHttp',binding,method:{value:method.value as HttpMethod,span:method.span},arguments:args.values,client,response,responseList,span:{start,end}};
    }
    if(at('navigate')&&!['=','.'].includes(peek(1).value)){const start=word('navigate').span.start,path=expression();take('NEWLINE');return {kind:'navigate',path,span:{start,end:path.span.end}};}
    if(at('emit')) {
      const start=word('emit').span.start,event=id(),args=at('(')?argumentsList():{values:[],end:event.span.end};
      if(args.values.length>1)fail(source,filename,event.span,'Emitted events accept at most one payload');
      take('NEWLINE');return {kind:'emit',event,payload:args.values[0],span:{start,end:args.end}};
    }
    if(peek().kind==='identifier'&&peek(1).value==='('){const action=id(),start=action.span.start,args=argumentsList();take('NEWLINE');return {kind:'invoke',action,arguments:args.values,span:{start,end:args.end}};}
    const start=peek().span.start;const target=atom();
    if(at('=')) {
      symbol('=');
      if(at('event')) {
        word('event');symbol('.');const member=take('identifier');
        if(!['value','checked','file','files'].includes(member.value)) fail(source,filename,member.span,eventKind==='input'?'Expected value for input event':eventKind==='change'?'Expected checked for change event':'Expected an approved event member');
        take('NEWLINE');return {kind:'eventAssign',target,member:{value:member.value,span:member.span} as Node<'value'|'checked'|'file'|'files'>,span:{start,end:member.span.end}};
      }
      const value=expression();take('NEWLINE');return {kind:'assign',target,value,span:{start,end:value.span.end}};
    }
    if(target.kind!=='member'||!at('(')) fail(source,filename,peek().span,'Expected assignment or approved action/list call');
    const args=argumentsList();take('NEWLINE');return {kind:'call',target:target.object,method:target.name,arguments:args.values,span:{start,end:args.end}};
  }
  function statements(eventKind?:string):Statement[] {const result:Statement[]=[];while(peek().kind!=='DEDENT'&&peek().kind!=='eof')result.push(statement(eventKind));return result;}
  function handler():Handler {
    const start=word('on').span.start;const event=take('identifier');
    let parameter:Node<string>|undefined;if(at('(')){symbol('(');parameter=id();symbol(')');}
    block();const body=statements(event.value);take('DEDENT');
    if(!body.length)fail(source,filename,event.span,'Event handler requires at least one statement');
    const legacyKind=event.value==='click'&&body.length===1&&body[0].kind==='assign'&&body[0].value.kind==='literal'&&typeof body[0].value.value==='boolean'?'clickBoolean':event.value;
    return {event:{value:event.value,span:event.span},parameter,kind:legacyKind as Handler['kind'],statements:body,span:{start,end:body.at(-1)!.span.end}};
  }
  function element():ElementNode {
    const tag=id();const attributes:Record<string,Expression>={};const indentedAttributes:string[]=[];const children:ViewNode[]=[];
    function attribute(indented=false):void {const key=take('identifier');symbol('=');if(Object.hasOwn(attributes,key.value))fail(source,filename,key.span,`Duplicate attribute ${key.value}`);Object.defineProperty(attributes,key.value,{value:expression(),enumerable:true});if(indented){indentedAttributes.push(key.value);take('NEWLINE');}}
    while(peek().kind==='identifier'){
      if(peek(1).value==='='){attribute();continue;}
      if(peek().value==='multiple'){const flag=take('identifier');if(Object.hasOwn(attributes,flag.value))fail(source,filename,flag.span,`Duplicate attribute ${flag.value}`);Object.defineProperty(attributes,flag.value,{value:{kind:'literal',value:true,span:flag.span},enumerable:true});continue;}
      break;
    }
    const node:ElementNode={kind:'element',tag,attributes,indentedAttributes,children,span:{start:tag.span.start,end:tokens[cursor-1].span.end}};
    if(at('on')) {
      const inputType=node.attributes.type,inlineStart=word('on').span.start,event=take('identifier');if(tag.value!=='input'||inputType?.kind!=='literal'||inputType.value!=='file'||event.value!=='change')fail(source,filename,event.span,'Inline native handlers are supported only for file-input change actions');const body=[statement(event.value)];if(body[0].kind!=='invoke')fail(source,filename,body[0].span,'Inline file-input change requires a direct action invocation');node.handler={event:{value:event.value,span:event.span},kind:'change',statements:body,span:{start:inlineStart,end:body[0].span.end}};node.span.end=node.handler.span.end;
    } else if(at(':')) {
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
  function slot():SlotNode {const token=word('slot');take('NEWLINE');return {kind:'slot',span:token.span};}
  function router():ViewNode {
    const start=word('router').span.start;block();const routes:Extract<ViewNode,{kind:'router'}>['routes']=[];
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof'){
      if(routes.length>=Math.min(256,limits.maxCollectionItems))fail(source,filename,peek().span,'Route table exceeds 256 routes or the configured collection limit');
      const routeStart=word('route').span.start,token=take('string');block();const children:ViewNode[]=[];
      while(peek().kind!=='DEDENT'&&peek().kind!=='eof')children.push(view());take('DEDENT');
      if(!children.length)fail(source,filename,token.span,'Route requires a view block');
      routes.push({path:{value:token.value,span:token.span},children,span:{start:routeStart,end:children.at(-1)!.span.end}});
    }
    take('DEDENT');if(!routes.length)fail(source,filename,{start,end:start},'Router requires routes');return {kind:'router',routes,span:{start,end:routes.at(-1)!.span.end}};
  }
  function view():ViewNode {
    if(++viewDepth>limits.maxNestingDepth)fail(source,filename,peek().span,`View nesting exceeds the configured limit of ${limits.maxNestingDepth} levels`);
    try{if(at('else'))fail(source,filename,peek().span,'else must immediately follow an if block at the same indentation');
    if(at('route'))fail(source,filename,peek().span,'route must be directly inside router');
    if(at('router'))return router();if(at('if'))return conditional();if(at('for'))return iteration();if(at('slot'))return slot();return element();}finally{viewDepth--;}
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
  if(at('shared')){
    if(imports.length)fail(source,filename,imports[0].span,'Shared state modules cannot import other modules');
    const start=word('shared').span.start,name=id();block();const states:State[]=[];
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof'){const state=id();symbol('=');const initial=expression();take('NEWLINE');states.push({name:state,initial,span:{start:state.span.start,end:initial.span.end}});}
    take('DEDENT');take('eof');if(!states.length)fail(source,filename,name.span,'Shared state requires at least one value');
    return {kind:'SharedState',name,span:{start,end:states.at(-1)!.span.end},imports:[],classes,props:[],states,computed:[],httpClients:[],queries:[],httpActions:[],init:[],cleanup:[],roots:[],emits:[]};
  }
  const start=word('component').span.start;const name=id();const props:Prop[]=[];
  if(at('(')){cursor++;if(!at(')'))do{const prop=id();symbol('=');const initial=literal();props.push({name:prop,initial,span:{start:prop.span.start,end:initial.span.end}});if(!at(','))break;cursor++;}while(true);symbol(')');}
  block();const states:State[]=[];const derived:Computed[]=[];const httpClients:HttpClient[]=[];const queries:Query[]=[];const httpActions:HttpAction[]=[];let defaultClient:Node<string>|undefined;const init:Statement[]=[];const cleanup:Statement[]=[];const roots:ViewNode[]=[];
  function httpClient():HttpClient {
    const start=word('http').span.start;word('client');const clientName=id();block();let base:Expression|undefined,auth:HttpClient['auth'];const interceptors:HttpClient['interceptors']=[];
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof'){
      if(at('base')){const token=word('base');if(base)fail(source,filename,token.span,'HTTP client may declare base only once');base=expression();take('NEWLINE');}
      else if(at('auth')){const authStart=word('auth').span.start;word('bearer');const provider=id();take('NEWLINE');if(auth)fail(source,filename,provider.span,'HTTP client may declare auth only once');auth={scheme:'bearer',provider,span:{start:authStart,end:provider.span.end}};}
      else if(at('interceptor')){const interceptorStart=word('interceptor').span.start,first=take('identifier');let phase:'request'|'response'|'error'='request',handler:Node<string>;if(['request','response','error'].includes(first.value)){phase=first.value as typeof phase;handler=id();}else handler={value:first.value,span:first.span};take('NEWLINE');interceptors.push({phase,handler,span:{start:interceptorStart,end:handler.span.end}});}
      else fail(source,filename,peek().span,'Expected base, auth bearer, or interceptor in HTTP client');
    }
    take('DEDENT');return {name:clientName,base,auth,interceptors,span:{start,end:(interceptors.at(-1)?.span.end??auth?.span.end??base?.span.end??clientName.span.end)}};
  }
  function query():Query {
    const start=word('query').span.start;const queryName=id();block();const methodToken=take('identifier');if(!['get','post','put','patch','delete'].includes(methodToken.value))fail(source,filename,methodToken.span,'Query requires get, post, put, patch, or delete');const url=expression();take('NEWLINE');
    const params:Query['params']=[],headers:Query['headers']=[];let body:Expression|undefined,response:Node<string>|undefined,responseList=false,client:Node<string>|undefined,debounce:Node<number>|undefined,timeout:Node<number>|undefined,retry:Node<number>|undefined,cache:Node<number>|undefined,poll:Node<number>|undefined,refreshOnFocus=false,lastEnd=url.span.end;
    const duration=(label:string):Node<number>=>{const number=take('number'),unit=take('identifier');if(unit.value!=='ms'&&unit.value!=='s')fail(source,filename,unit.span,`${label} duration requires ms or s`);const value=Number(number.value)*(unit.value==='s'?1000:1);if(value<1||value>2_147_483_647)fail(source,filename,{start:number.span.start,end:unit.span.end},`${label} duration must be between 1ms and 2147483647ms`);return {value,span:{start:number.span.start,end:unit.span.end}};};
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof'){
      if(at('param')){const lineStart=word('param').span.start,name=id();symbol('=');const value=expression();take('NEWLINE');params.push({name,value,span:{start:lineStart,end:value.span.end}});lastEnd=value.span.end;}
      else if(at('header')){const lineStart=word('header').span.start,nameToken=take('string');symbol('=');const value=expression();take('NEWLINE');headers.push({name:{value:nameToken.value,span:nameToken.span},value,span:{start:lineStart,end:value.span.end}});lastEnd=value.span.end;}
      else if(at('body')){const token=word('body');if(body)fail(source,filename,token.span,'Query may declare body only once');body=expression();take('NEWLINE');lastEnd=body.span.end;}
      else if(at('response')){const token=word('response');if(response)fail(source,filename,token.span,'Query may declare response only once');if(at('list')){word('list');symbol('[');response=id();const close=symbol(']');lastEnd=close.span.end;responseList=true;}else{response=id();lastEnd=response.span.end;}take('NEWLINE');}
      else if(at('client')){const token=word('client');if(client)fail(source,filename,token.span,'Query may override client only once');client=id();take('NEWLINE');lastEnd=client.span.end;}
      else if(at('debounce')){const token=word('debounce');if(debounce)fail(source,filename,token.span,'Query may declare debounce only once');debounce=duration('debounce');take('NEWLINE');lastEnd=debounce.span.end;}
      else if(at('timeout')){const token=word('timeout');if(timeout)fail(source,filename,token.span,'Query may declare timeout only once');timeout=duration('timeout');take('NEWLINE');lastEnd=timeout.span.end;}
      else if(at('retry')){const token=word('retry');if(retry)fail(source,filename,token.span,'Query may declare retry only once');const count=take('number'),value=Number(count.value);if(value>10)fail(source,filename,count.span,'retry must be between 0 and 10');retry={value,span:count.span};take('NEWLINE');lastEnd=count.span.end;}
      else if(at('cache')){const token=word('cache');if(cache)fail(source,filename,token.span,'Query may declare cache only once');cache=duration('cache');take('NEWLINE');lastEnd=cache.span.end;}
      else if(at('refresh')){const token=word('refresh');if(refreshOnFocus)fail(source,filename,token.span,'Query may declare refresh on-focus only once');word('on');symbol('-');const focus=word('focus');refreshOnFocus=true;take('NEWLINE');lastEnd=focus.span.end;}
      else if(at('poll')){const token=word('poll');if(poll)fail(source,filename,token.span,'Query may declare poll only once');poll=duration('poll');take('NEWLINE');lastEnd=poll.span.end;}
      else fail(source,filename,peek().span,'Unsupported query configuration');
    }
    take('DEDENT');if(!response)fail(source,filename,queryName.span,'Query requires a typed response');return {name:queryName,method:methodToken.value as HttpMethod,url,params,headers,body,response,responseList,client,debounce,timeout,retry,cache,refreshOnFocus,poll,dependencies:[],span:{start,end:lastEnd}};
  }
  function httpAction():HttpAction {
    const start=word('action').span.start,actionName=id(),parameters:Node<string>[]=[];symbol('(');if(!at(')'))do{const parameter=id();if(parameters.some(item=>item.value===parameter.value))fail(source,filename,parameter.span,`Duplicate action parameter ${JSON.stringify(parameter.value)}`);parameters.push(parameter);if(!at(','))break;symbol(',');}while(true);symbol(')');block();const methodToken=take('identifier');if(!['get','post','put','patch','delete'].includes(methodToken.value))fail(source,filename,methodToken.span,'Action requires get, post, put, patch, or delete');const url=expression();take('NEWLINE');const params:HttpAction['params']=[],headers:HttpAction['headers']=[],refresh:Node<string>[]=[],instant:HttpAction['instant']=[],uploads:HttpAction['uploads']=[];let body:Expression|undefined,response:Node<string>|undefined,responseList=false,client:Node<string>|undefined,download:Node<string>|undefined,lastEnd=url.span.end;
    while(peek().kind!=='DEDENT'&&peek().kind!=='eof'){
      if(at('param')){const lineStart=word('param').span.start,name=id();symbol('=');const value=expression();take('NEWLINE');params.push({name,value,span:{start:lineStart,end:value.span.end}});lastEnd=value.span.end;}
      else if(at('header')){const lineStart=word('header').span.start,nameToken=take('string');symbol('=');const value=expression();take('NEWLINE');headers.push({name:{value:nameToken.value,span:nameToken.span},value,span:{start:lineStart,end:value.span.end}});lastEnd=value.span.end;}
      else if(at('body')){const token=word('body');if(body)fail(source,filename,token.span,'Action may declare body only once');body=expression();take('NEWLINE');lastEnd=body.span.end;}
      else if(at('upload')){const lineStart=word('upload').span.start,nameToken=take('string');symbol('=');const value=expression();take('NEWLINE');uploads.push({name:{value:nameToken.value,span:nameToken.span},value,span:{start:lineStart,end:value.span.end}});lastEnd=value.span.end;}
      else if(at('download')){const token=word('download');if(download)fail(source,filename,token.span,'Action may declare download only once');const filenameToken=take('string');download={value:filenameToken.value,span:filenameToken.span};take('NEWLINE');lastEnd=filenameToken.span.end;}
      else if(at('response')){const token=word('response');if(response)fail(source,filename,token.span,'Action may declare response only once');if(at('list')){word('list');symbol('[');response=id();lastEnd=symbol(']').span.end;responseList=true;}else{response=id();lastEnd=response.span.end;}take('NEWLINE');}
      else if(at('client')){const token=word('client');if(client)fail(source,filename,token.span,'Action may override client only once');client=id();take('NEWLINE');lastEnd=client.span.end;}
      else if(at('refresh')){word('refresh');const resource=id();if(refresh.some(item=>item.value===resource.value))fail(source,filename,resource.span,`Duplicate refresh target ${JSON.stringify(resource.value)}`);refresh.push(resource);take('NEWLINE');lastEnd=resource.span.end;}
      else if(at('instant')){const instantStart=word('instant').span.start,resource=id();block();const assignments:HttpAction['instant'][number]['assignments']=[];while(peek().kind!=='DEDENT'&&peek().kind!=='eof'){const field=id();symbol('=');const value=expression();take('NEWLINE');assignments.push({field,value,span:{start:field.span.start,end:value.span.end}});}take('DEDENT');if(!assignments.length)fail(source,filename,resource.span,'instant requires at least one field assignment');const instantEnd=assignments.at(-1)!.span.end;instant.push({resource,assignments,span:{start:instantStart,end:instantEnd}});lastEnd=instantEnd;}
      else fail(source,filename,peek().span,'Unsupported action configuration');
    }
    take('DEDENT');if(!response&&!uploads.length&&!download)fail(source,filename,actionName.span,'Action requires a typed response or transfer directive');return {name:actionName,parameters,method:methodToken.value as HttpMethod,url,params,headers,body,response,responseList,client,refresh,instant,uploads,download,span:{start,end:lastEnd}};
  }
  while(peek().kind!=='DEDENT'&&peek().kind!=='eof') {
    if(at('http')&&peek(1).value==='client'){if(roots.length)fail(source,filename,peek().span,'HTTP client declarations must precede elements');httpClients.push(httpClient());}
    else if(at('client')&&peek(1).kind==='identifier'&&peek(2).kind==='NEWLINE'){if(roots.length)fail(source,filename,peek().span,'Client selection must precede elements');const token=word('client');if(defaultClient)fail(source,filename,token.span,'Client may be declared once per component');defaultClient=id();take('NEWLINE');}
    else if(at('query')&&peek(1).kind==='identifier'&&peek(2).value===':'){if(roots.length)fail(source,filename,peek().span,'Query declarations must precede elements');queries.push(query());}
    else if(at('action')&&peek(1).kind==='identifier'&&peek(2).value==='('){if(roots.length)fail(source,filename,peek().span,'Action declarations must precede elements');httpActions.push(httpAction());}
    else if(at('computed')) {if(roots.length)fail(source,filename,peek().span,'Computed declarations must precede elements');derived.push(computed());}
    else if(at('on')&&(peek(1).value==='init'||peek(1).value==='cleanup')) {
      if(roots.length)fail(source,filename,peek().span,'Lifecycle declarations must precede elements');word('on');const phase=take('identifier');block();const body=statements();take('DEDENT');(phase.value==='init'?init:cleanup).push(...body);
    } else if(at('state')||peek(1)?.value==='=') {
      if(roots.length)fail(source,filename,peek().span,'State declarations must precede elements');const start=at('state')?word('state').span.start:peek().span.start,state=id();symbol('=');const initial=expression();states.push({name:state,initial,span:{start,end:initial.span.end}});take('NEWLINE');
    } else roots.push(view());
  }
  take('DEDENT');take('eof');if(!roots.length)fail(source,filename,name.span,'Component requires at least one root element');
  return {kind:'Component',name,span:{start,end:roots.at(-1)!.span.end},imports,classes,props,states,computed:derived,httpClients,client:defaultClient,queries,httpActions,init,cleanup,roots,emits:[]};
}
