import type { Component, ElementNode, Expression } from './ast.js';
export function generate(ast:Component):string {
  // Strip source spans so whitespace/comments never change emitted behavior.
  function expression(e:Expression):unknown {
    if(e.kind==='literal')return {kind:e.kind,value:e.value};
    if(e.kind==='reference')return {kind:e.kind,name:e.name};
    if(e.kind==='str')return {kind:e.kind,argument:expression(e.argument)};
    return {kind:e.kind,left:expression(e.left),right:expression(e.right)};
  }
  const componentImports=ast.imports.filter(i=>i.name);
  function handler(value:NonNullable<ElementNode['handler']>):unknown {
    if(value.kind==='input'||value.kind==='change') return {kind:value.kind,target:value.target.value};
    if(value.kind==='clickBoolean') return {kind:value.kind,target:value.target.value,value:value.value.value};
    return {kind:value.kind,target:value.target.value,operand:value.operand.value,step:value.step.value};
  }
  function node(n:ElementNode):unknown {
    return {tag:n.tag.value,component:componentImports.findIndex(i=>i.name!.value===n.tag.value),attributes:Object.fromEntries(Object.entries(n.attributes).map(([k,v])=>[k,expression(v)])),children:n.children.map(node),...(n.handler?{handler:handler(n.handler)}:{})};
  }
  const imports=ast.imports.map(i=>i.name?`import c${componentImports.indexOf(i)} from ${JSON.stringify(i.path.value)};`:`import ${JSON.stringify(i.path.value)};`).join('\n');
  const model={props:Object.fromEntries(ast.props.map(p=>[p.name.value,p.initial.value])),states:Object.fromEntries(ast.states.map(s=>[s.name.value,s.initial.value])),roots:ast.roots.map(node)};
  return `${imports}\nexport const componentName = ${JSON.stringify(ast.name.value)};\nexport const model = JSON.parse(${JSON.stringify(JSON.stringify(model))});\nexport default function mount(target, runtime, props = {}) { return runtime.mountComponent(target, model, [${componentImports.map((_,i)=>`c${i}`).join(',')}], props); }\n`;
}
