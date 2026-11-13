import type {Component,Expression,Statement,ViewNode} from './ast.js';

export function generate(ast:Component):string {
  function expression(value:Expression):unknown {
    if(value.kind==='literal')return {kind:value.kind,value:value.value};
    if(value.kind==='reference')return {kind:value.kind,name:value.name};
    if(value.kind==='member')return {kind:value.kind,object:expression(value.object),name:value.name.value};
    if(value.kind==='str'){
      const argument=expression(value.argument) as {kind:string;value?:unknown};
      return argument.kind==='literal'?{kind:'literal',value:String(argument.value)}:{kind:value.kind,argument};
    }
    if(value.kind==='len')return {kind:value.kind,argument:expression(value.argument)};
    if(value.kind==='contains'||value.kind==='count')return {kind:value.kind,left:expression(value.left),right:expression(value.right)};
    if(value.kind==='add'||value.kind==='subtract'){
      const left=expression(value.left) as {kind:string;value?:unknown},right=expression(value.right) as {kind:string;value?:unknown};
      if(left.kind==='literal'&&right.kind==='literal'){
        if(typeof left.value==='number'&&typeof right.value==='number'){
          const result=value.kind==='add'?(left.value as number)+(right.value as number):(left.value as number)-(right.value as number);
          if(Number.isSafeInteger(result))return {kind:'literal',value:result};
        } else if(value.kind==='add')return {kind:'literal',value:String(left.value)+String(right.value)};
      }
      return {kind:value.kind,left,right};
    }
    if(value.kind==='construct')return {kind:value.kind,name:value.name.value,arguments:value.arguments.map(expression)};
    if(value.kind==='list')return {kind:value.kind,items:value.items.map(expression),...(value.itemType?{itemType:value.itemType.value}:{})};
    if(value.kind==='not'){
      const argument=expression(value.argument) as {kind:string;value?:unknown};
      return argument.kind==='literal'?{kind:'literal',value:!argument.value}:{kind:value.kind,argument};
    }
    if(value.kind==='and'||value.kind==='or'||value.kind==='equal'||value.kind==='notEqual'){
      const left=expression(value.left) as {kind:string;value?:unknown};
      if(value.kind==='and'&&left.kind==='literal'&&left.value===false)return {kind:'literal',value:false};
      if(value.kind==='or'&&left.kind==='literal'&&left.value===true)return {kind:'literal',value:true};
      const right=expression(value.right) as {kind:string;value?:unknown};
      if(left.kind==='literal'&&right.kind==='literal')return {kind:'literal',value:value.kind==='and'?left.value===true&&right.value===true:value.kind==='or'?left.value===true||right.value===true:value.kind==='equal'?left.value===right.value:left.value!==right.value};
      return {kind:value.kind,left,right};
    }
    throw new Error(`Unsupported expression ${(value as {kind:string}).kind}`);
  }
  const condition=expression;
  const statement=(value:Statement):unknown=>value.kind==='navigate'?{kind:value.kind,path:expression(value.path)}:value.kind==='assign'?{kind:value.kind,target:expression(value.target),value:expression(value.value)}:value.kind==='eventAssign'?{kind:value.kind,target:expression(value.target),member:value.member.value}:value.kind==='emit'?{kind:value.kind,event:value.event.value,...(value.payload?{payload:expression(value.payload)}:{})}:value.kind==='invoke'?{kind:value.kind,action:value.action.value,arguments:value.arguments.map(expression)}:value.kind==='awaitHttp'?{kind:value.kind,method:value.method.value,arguments:value.arguments.map(expression),...(value.client||ast.client?{client:(value.client??ast.client)!.value}:{}),...(value.response?{response:value.response.value,responseList:value.responseList}:{})}:{kind:value.kind,target:expression(value.target),method:value.method.value,arguments:value.arguments.map(expression)};
  const componentImports=ast.imports.filter(item=>item.name&&item.kind!=='shared'),sharedImports=ast.imports.filter(item=>item.name&&item.kind==='shared');
  function nodes(values:ViewNode[]):unknown[]{
    const result:unknown[]=[];
    for(const value of values)if(value.kind==='conditional'){
      const test=condition(value.condition) as {kind:string;value?:unknown};
      if(test.kind==='literal')result.push(...nodes(test.value?value.consequent:value.alternate));
      else result.push({kind:value.kind,condition:test,consequent:nodes(value.consequent),alternate:nodes(value.alternate)});
    }else result.push(node(value));
    return result;
  }
  function node(value:Exclude<ViewNode,{kind:'conditional'}>):unknown {
    if(value.kind==='router')return {kind:value.kind,routes:value.routes.map(route=>({path:route.path.value,children:nodes(route.children)}))};
    if(value.kind==='slot')return {kind:value.kind};
    if(value.kind==='iteration')return {kind:value.kind,item:value.item.value,collection:expression(value.collection),key:expression(value.key),children:nodes(value.children)};
    const attributes:Record<string,unknown>={};
    const flags:Record<string,number>={text:1,value:2,checked:4,class:8,type:16};
    let staticBindings=0;
    for(const [key,item] of Object.entries(value.attributes)){const generated=expression(item) as {kind:string};attributes[key]=generated;if(generated.kind==='literal')staticBindings|=flags[key]??0;}
    return {kind:'element',tag:value.tag.value,component:componentImports.findIndex(item=>item.name!.value===value.tag.value),attributes,...(staticBindings?{static:staticBindings}:{}),children:nodes(value.children),...(value.handler?{handler:{kind:value.handler.kind,event:value.handler.event.value,...(value.handler.parameter?{parameter:value.handler.parameter.value}:{}),...(value.handler.payloadType!==undefined?{payloadType:value.handler.payloadType}:{}),statements:value.handler.statements.map(statement)}}:{})};
  }
  const classes=Object.fromEntries(ast.classes.map(declaration=>[declaration.name.value,{fields:declaration.fields.map(field=>({name:field.name.value,initial:expression(field.initial)})),computed:Object.fromEntries(declaration.computed.map(item=>[item.name.value,expression(item.expression)])),actions:Object.fromEntries(declaration.actions.map(action=>[action.name.value,action.statements.map(statement)]))}]));
  if(ast.kind==='SharedState'){
    const initial=(value:Expression):unknown=>{if(value.kind==='literal')return value.value;if(value.kind==='list')return value.items.map(initial);if(value.kind==='construct'){const declaration=ast.classes.find(item=>item.name.value===value.name.value)!;return Object.fromEntries(declaration.fields.map((field,index)=>[field.name.value,initial(value.arguments[index])]));}return undefined;};
    const typeEntries:[string,string][]=[];for(const state of ast.states)if(state.initial.kind==='list'){const first=state.initial.items[0],itemType=state.initial.itemType?.value??(first?.kind==='construct'?first.name.value:undefined);if(itemType)typeEntries.push([state.name.value,itemType]);}
    const states=JSON.stringify(Object.fromEntries(ast.states.map(state=>[state.name.value,initial(state.initial)]))).replaceAll('"__proto__":','["__proto__"]:'),types=JSON.stringify(Object.fromEntries(typeEntries)).replaceAll('"__proto__":','["__proto__"]:'),serializedClasses=JSON.stringify(classes).replaceAll('"__proto__":','["__proto__"]:');
    return `export const sharedName=${JSON.stringify(ast.name.value)};\nexport default Object.freeze({states:Object.freeze(${states})${types==='{}'?'':`,types:Object.freeze(${types})`}${serializedClasses==='{}'?'':`,classes:Object.freeze(${serializedClasses})`}});\n`;
  }
  const imports=ast.imports.map(item=>item.name?(item.kind==='shared'?`import s${sharedImports.indexOf(item)} from ${JSON.stringify(item.path.value)};`:`import c${componentImports.indexOf(item)} from ${JSON.stringify(item.path.value)};`):`import ${JSON.stringify(item.path.value)};`).join('\n');
  const httpClients=Object.fromEntries(ast.httpClients.map(client=>[client.name.value,{...(client.base?{base:expression(client.base)}:{}),...(client.auth?{auth:{scheme:client.auth.scheme,provider:client.auth.provider.value}}:{}),interceptors:client.interceptors.map(item=>({phase:item.phase,handler:item.handler.value}))}]));
  const queries=ast.queries.map(query=>({name:query.name.value,method:query.method,url:expression(query.url),params:query.params.map(item=>({name:item.name.value,value:expression(item.value)})),headers:query.headers.map(item=>({name:item.name.value,value:expression(item.value)})),...(query.body?{body:expression(query.body)}:{}),response:query.response.value,responseList:query.responseList,...(query.client||ast.client?{client:(query.client??ast.client)!.value}:{}),...(query.debounce?{debounce:query.debounce.value}:{}),...(query.timeout?{timeout:query.timeout.value}:{}),...(query.retry?{retry:query.retry.value}:{}),...(query.cache?{cache:query.cache.value}:{}),...(query.refreshOnFocus?{refreshOnFocus:true}:{}),...(query.poll?{poll:query.poll.value}:{}),dependencies:query.dependencies.map(item=>item.value)}));
  const httpActions=ast.httpActions.map(action=>({name:action.name.value,parameters:action.parameters.map(item=>item.value),method:action.method,url:expression(action.url),params:action.params.map(item=>({name:item.name.value,value:expression(item.value)})),headers:action.headers.map(item=>({name:item.name.value,value:expression(item.value)})),...(action.body?{body:expression(action.body)}:{}),response:action.response.value,responseList:action.responseList,...(action.client||ast.client?{client:(action.client??ast.client)!.value}:{}),refresh:action.refresh.map(item=>item.value),instant:action.instant.map(block=>({resource:block.resource.value,assignments:block.assignments.map(item=>({field:item.field.value,value:expression(item.value)}))}))}));
  const model={props:Object.fromEntries(ast.props.map(prop=>[prop.name.value,prop.initial.value])),events:Object.fromEntries(ast.emits.map(event=>[event.name,event.payload])),shared:sharedImports.map((item,index)=>({name:item.name!.value,index})),classes,states:Object.fromEntries(ast.states.map(state=>[state.name.value,expression(state.initial)])),computed:Object.fromEntries(ast.computed.map(item=>[item.name.value,expression(item.expression)])),httpClients,queries,httpActions,init:ast.init.map(statement),cleanup:ast.cleanup.map(statement),roots:nodes(ast.roots)};
  const serialized=JSON.stringify(model).replaceAll('"__proto__":','["__proto__"]:');
  return `${imports}\nexport const componentName=${JSON.stringify(ast.name.value)};\nexport const model=${serialized};\nexport default function mount(target,runtime,props={},state={},content,events={}){const components=[${componentImports.map((_,index)=>`c${index}`).join(',')}],shared=[${sharedImports.map((_,index)=>`s${index}`).join(',')}];if(content){if(!runtime.mountComponentWithContent)throw new TypeError('Runtime does not support component content');return runtime.mountComponentWithContent(target,model,components,props,state,content,{},0,events,shared)}return Object.keys(state).length?runtime.mountComponentWithState(target,model,components,props,state,{},0,events,shared):runtime.mountComponent(target,model,components,props,{},0,events,shared)}\n`;
}
