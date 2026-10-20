import type { Component, Expression, ElementNode, Span } from './ast.js';
import { fail } from './diagnostics.js';
export const elements = new Set(['main','section','div','h1','h2','h3','h4','h5','h6','p','span','label','button','input']);
export interface ValidationOptions { sourceExtension?:string; components?:Map<string,Component> }
export function validate(ast:Component,source:string,filename='<input>',options:ValidationOptions={}):void {
  const error=(span:Span,message:string):never=>fail(source,filename,span,message);
  const names=new Map<string,string>();const imported=new Set<string>();
  for(const entry of ast.imports) {
    if(!/^\.\.?\//.test(entry.path.value)||/[?#\\]/.test(entry.path.value)) error(entry.path.span,'Imports must use plain relative module paths');
    if(entry.name) {
      if(options.sourceExtension&&!entry.path.value.endsWith(options.sourceExtension)) error(entry.path.span,`Component import must use configured extension ${options.sourceExtension}`);
      if(imported.has(entry.name.value)||elements.has(entry.name.value)) error(entry.name.span,'Duplicate or reserved component import');
      imported.add(entry.name.value);
    } else if(!entry.path.value.endsWith('.css')) error(entry.path.span,'Side-effect imports support external .css files only');
  }
  for(const declaration of [...ast.props,...ast.states]) {
    if(names.has(declaration.name.value)||imported.has(declaration.name.value)||declaration.name.value==='class') error(declaration.name.span,'Duplicate or reserved declaration');
    names.set(declaration.name.value,typeof declaration.initial.value);
  }
  function type(expression:Expression):string {
    if(expression.kind==='literal') return typeof expression.value;
    if(expression.kind==='reference') return names.get(expression.name)??error(expression.span,`Unknown state or prop ${JSON.stringify(expression.name)}`);
    if(expression.kind==='str') {type(expression.argument);return 'string';}
    const left=type(expression.left),right=type(expression.right);
    if(left!==right||!['string','number'].includes(left)) error(expression.span,'Addition requires two strings or two numbers; use str(value) for explicit conversion');
    return left;
  }
  const stateNames=new Set(ast.states.map(s=>s.name.value));
  const stateTypes=new Map(ast.states.map(s=>[s.name.value,typeof s.initial.value]));
  function visit(node:ElementNode):void {
    const native=elements.has(node.tag.value);
    if(!native&&!imported.has(node.tag.value)) error(node.tag.span,`Unknown element or missing component import ${JSON.stringify(node.tag.value)}`);
    const child=options.components?.get(node.tag.value);
    if(!native&&(node.children.length||node.handler)) error(node.span,'Component instances do not accept children or event handlers');
    if(!native&&node.indentedAttributes.length) error(node.attributes[node.indentedAttributes[0]].span,'Indented properties are supported on standard elements only');
    const checkbox=node.attributes.type?.kind==='literal'&&node.attributes.type.value==='checkbox';
    for(const [key,value] of Object.entries(node.attributes)) {
      const actual=type(value);
      if(key==='class') {
        if(value.kind!=='literal'||actual!=='string') error(value.span,'class requires a static string literal');
        if(child) assertSingleRoot(child,value.span);
      } else if(native) {
        if(key==='text') {
          if(actual!=='string') error(value.span,'text requires a string expression; use str(value)');
        } else if(key==='value') {
          if(node.tag.value!=='input'||!node.indentedAttributes.includes(key)) error(value.span,'value is supported only as an indented input property');
          if(checkbox) error(value.span,'value is supported on text inputs only');
          if(actual!=='string') error(value.span,'input value requires a string expression');
        } else if(key==='type') {
          if(node.tag.value!=='input'||!node.indentedAttributes.includes(key)) error(value.span,'type is supported only as an indented input property');
          if(value.kind!=='literal'||actual!=='string'||value.value!=='checkbox') error(value.span,'input type requires the static string literal "checkbox"');
        } else if(key==='checked') {
          if(node.tag.value!=='input'||!node.indentedAttributes.includes(key)) error(value.span,'checked is supported only as an indented input property');
          if(!checkbox) error(value.span,'checked requires input type="checkbox"');
          if(actual!=='boolean') error(value.span,'input checked requires a boolean expression');
        } else error(value.span,`Unsupported element attribute ${JSON.stringify(key)}`);
      } else if(child) {
        const prop=child.props.find(p=>p.name.value===key);
        if(!prop) error(value.span,`Unknown prop ${JSON.stringify(key)} on ${node.tag.value}`);
        if(actual!==typeof prop!.initial.value) error(value.span,`Prop ${key} requires ${typeof prop!.initial.value}, received ${actual}`);
      }
    }
    if(node.handler) {
      const h=node.handler;
      if(ast.props.some(p=>p.name.value===h.target.value)) error(h.target.span,`Cannot assign read-only prop ${h.target.value}`);
      if(h.kind==='click') {
        if(node.tag.value!=='button') error(h.span,'Click handlers are supported on button elements only');
        for(const ref of [h.target,h.operand]) {
          if(!stateNames.has(ref.value)) error(ref.span,`Unknown state ${JSON.stringify(ref.value)}`);
          if(stateTypes.get(ref.value)!=='number') error(ref.span,'Click increments require numeric state');
        }
      } else if(h.kind==='input') {
        if(node.tag.value!=='input'||checkbox) error(h.span,'Input handlers are supported on text inputs only');
        if(!stateNames.has(h.target.value)) error(h.target.span,`Unknown state ${JSON.stringify(h.target.value)}`);
        if(stateTypes.get(h.target.value)!=='string') error(h.target.span,'Input handlers require string state');
      } else {
        if(node.tag.value!=='input'||!checkbox) error(h.span,'Change handlers are supported on checkbox inputs only');
        if(!stateNames.has(h.target.value)) error(h.target.span,`Unknown state ${JSON.stringify(h.target.value)}`);
        if(stateTypes.get(h.target.value)!=='boolean') error(h.target.span,'Change handlers require boolean state');
      }
    }
    node.children.forEach(visit);
  }
  // Transitive forwarding through component roots is checked by Node graph tooling.
  function assertSingleRoot(component:Component,span:Span):void {
    if(component.roots.length!==1) error(span,'Ambiguous class forwarding: component must have a single root element');
  }
  ast.roots.forEach(visit);
}
