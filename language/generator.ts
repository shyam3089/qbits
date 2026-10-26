import type {Component,ConditionExpression,Expression,Statement,ViewNode} from './ast.js';
import {dependencies} from './dependencies.js';

export function generate(ast:Component):string {
  function expression(value:Expression):unknown {
    if(value.kind==='literal')return {kind:value.kind,value:value.value};
    if(value.kind==='reference')return {kind:value.kind,name:value.name};
    if(value.kind==='member')return {kind:value.kind,object:expression(value.object),name:value.name.value};
    if(value.kind==='str'||value.kind==='len')return {kind:value.kind,argument:expression(value.argument)};
    if(value.kind==='add')return {kind:value.kind,left:expression(value.left),right:expression(value.right)};
    if(value.kind==='construct')return {kind:value.kind,name:value.name.value,arguments:value.arguments.map(expression)};
    if(value.kind==='list')return {kind:value.kind,items:value.items.map(expression)};
    throw new Error(`Unsupported expression ${(value as {kind:string}).kind}`);
  }
  function condition(value:ConditionExpression):unknown {
    if(value.kind==='literal')return {kind:value.kind,value:value.value};
    if(value.kind==='reference')return {kind:value.kind,name:value.name};
    if(value.kind==='member')return {kind:value.kind,object:expression(value.object),name:value.name.value};
    if(value.kind==='not')return {kind:value.kind,argument:condition(value.argument)};
    return {kind:value.kind,left:condition(value.left),right:condition(value.right)};
  }
  const statement=(value:Statement):unknown=>value.kind==='assign'?{kind:value.kind,target:expression(value.target),value:expression(value.value)}:value.kind==='eventAssign'?{kind:value.kind,target:expression(value.target),member:value.member.value}:{kind:value.kind,target:expression(value.target),method:value.method.value,arguments:value.arguments.map(expression)};
  const componentImports=ast.imports.filter(item=>item.name);
  function node(value:ViewNode):unknown {
    if(value.kind==='conditional')return {kind:value.kind,condition:{...condition(value.condition) as object,dependencies:dependencies(value.condition)},consequent:value.consequent.map(node),alternate:value.alternate.map(node)};
    if(value.kind==='iteration')return {kind:value.kind,item:value.item.value,collection:binding(value.collection),key:binding(value.key),children:value.children.map(node)};
    const flags:Record<string,number>={text:1,value:2,checked:4};
    const staticBindings=Object.entries(value.attributes).reduce((mask,[key,item])=>mask|(item.kind==='literal'?(flags[key]??0):0),0);
    return {kind:'element',tag:value.tag.value,component:componentImports.findIndex(item=>item.name!.value===value.tag.value),attributes:Object.fromEntries(Object.entries(value.attributes).map(([key,item])=>[key,binding(item)])),...(staticBindings?{static:staticBindings}:{}),children:value.children.map(node),...(value.handler?{handler:{kind:value.handler.kind,event:value.handler.event.value,statements:value.handler.statements.map(statement)}}:{})};
  }
  const binding=(value:Expression)=>value.kind==='literal'?expression(value):({...expression(value) as object,dependencies:dependencies(value)});
  const classes=Object.fromEntries(ast.classes.map(declaration=>[declaration.name.value,{fields:declaration.fields.map(field=>({name:field.name.value,initial:expression(field.initial)})),computed:Object.fromEntries(declaration.computed.map(item=>[item.name.value,binding(item.expression)])),actions:Object.fromEntries(declaration.actions.map(action=>[action.name.value,action.statements.map(statement)]))}]));
  const imports=ast.imports.map(item=>item.name?`import c${componentImports.indexOf(item)} from ${JSON.stringify(item.path.value)};`:`import ${JSON.stringify(item.path.value)};`).join('\n');
  const model={props:Object.fromEntries(ast.props.map(prop=>[prop.name.value,prop.initial.value])),classes,states:Object.fromEntries(ast.states.map(state=>[state.name.value,expression(state.initial)])),computed:Object.fromEntries(ast.computed.map(item=>[item.name.value,binding(item.expression)])),init:ast.init.map(statement),cleanup:ast.cleanup.map(statement),roots:ast.roots.map(node)};
  return `${imports}\nexport const componentName = ${JSON.stringify(ast.name.value)};\nexport const model = JSON.parse(${JSON.stringify(JSON.stringify(model))});\nexport default function mount(target, runtime, props = {}) { return runtime.mountComponent(target, model, [${componentImports.map((_,index)=>`c${index}`).join(',')}], props); }\n`;
}
