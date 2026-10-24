import type {Component,ConditionExpression,Expression,ViewNode} from './ast.js';

/** Symbol/member paths, never executable expressions. Initializer edges are one-shot. */
export type DependencyPath=string[];
export function dependencies(expression:Expression|ConditionExpression):DependencyPath[] {
  const found=new Map<string,DependencyPath>();
  const path=(value:Expression|ConditionExpression):DependencyPath|undefined=>{
    if(value.kind==='reference')return [value.name];
    if(value.kind==='member'){const parent=path(value.object);if(parent)return [...parent,value.name.value];}
    return undefined;
  };
  const visit=(value:Expression|ConditionExpression):void=>{
    const direct=path(value);if(direct){found.set(JSON.stringify(direct),direct);return;}
    if(value.kind==='member')visit(value.object);
    else if(value.kind==='str'||value.kind==='len'||value.kind==='not')visit(value.argument);
    else if('left'in value){visit(value.left);visit(value.right);}
    else if(value.kind==='list')value.items.forEach(visit);
    else if(value.kind==='construct')value.arguments.forEach(visit);
  };
  visit(expression);return [...found.values()];
}
export function analyzeDependencies(ast:Component) {
  const bindings:{kind:string;span:{start:number;end:number};dependencies:DependencyPath[]}[]=[];
  const binding=(kind:string,expression:Expression|ConditionExpression)=>bindings.push({kind,span:expression.span,dependencies:dependencies(expression)});
  const view=(node:ViewNode):void=>{
    if(node.kind==='conditional'){binding('condition',node.condition);node.consequent.forEach(view);node.alternate.forEach(view);}
    else if(node.kind==='iteration'){binding('collection',node.collection);binding('key',node.key);node.children.forEach(view);}
    else {for(const [name,value] of Object.entries(node.attributes))binding(name,value);node.children.forEach(view);}
  };
  ast.roots.forEach(view);
  return {initializers:Object.fromEntries(ast.states.map(state=>[state.name.value,dependencies(state.initial)])),computed:Object.fromEntries(ast.computed.map(item=>[item.name.value,dependencies(item.expression)])),classes:Object.fromEntries(ast.classes.map(declaration=>[declaration.name.value,Object.fromEntries(declaration.computed.map(item=>[item.name.value,dependencies(item.expression)]))])),bindings};
}
