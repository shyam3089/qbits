// Node-only module graph validation. The language compiler remains filesystem-free.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse, validate, generate, fail, type Component } from '../language/index.js';
import { identity } from './config.js';
export function compileFile(filename:string,source=readFileSync(filename,'utf8'),watch?:(path:string)=>void) {
  const active=new Set<string>();const done=new Map<string,Component>();const rootCounts=new Map<Component,number|null>();
  function visit(file:string,text:string):Component {
    const key=realpathSync(file);active.add(key);watch?.(key);
    const ast=parse(text,file);const components=new Map<string,Component>();
    // Validate import forms before attempting filesystem resolution.
    validate(ast,text,file,{sourceExtension:identity.sourceExtension});
    for(const entry of ast.imports) {
      const path=resolve(dirname(file),entry.path.value);watch?.(path);
      let resolved:string;
      try {resolved=realpathSync(path);if(!statSync(resolved).isFile())throw new Error('Not a file');}
      catch {fail(text,file,entry.path.span,`Missing import ${JSON.stringify(entry.path.value)}`);}
      if(!entry.name)continue;
      if(active.has(resolved!)) fail(text,file,entry.path.span,`Unsupported component import cycle: ${[...active,resolved!].join(' -> ')}`);
      const child=done.get(resolved!)??visit(resolved!,readFileSync(resolved!,'utf8'));
      components.set(entry.name.value,child);
    }
    validate(ast,text,file,{sourceExtension:identity.sourceExtension,components});
    function check(nodes:Component['roots']):void {
      for(const node of nodes) {
        if(node.kind==='conditional') {check(node.consequent);check(node.alternate);continue;}
        if(node.kind==='iteration') {check(node.children);continue;}
        const child=components.get(node.tag.value);
        if(child&&node.attributes.class&&rootCounts.get(child)!==1) fail(text,file,node.attributes.class.span,'Ambiguous class forwarding: component must resolve to a single root element');
        check(node.children);
      }
    }
    function count(nodes:Component['roots']):number|null {
      let total=0;
      for(const node of nodes) {
        if(node.kind==='iteration') return null;
        if(node.kind==='conditional') {
          const consequent=count(node.consequent),alternate=node.alternate.length?count(node.alternate):0;
          if(consequent===null||alternate===null||consequent!==alternate)return null;
          total+=consequent;continue;
        }
        const child=components.get(node.tag.value),resolved=child?rootCounts.get(child):1;
        if(resolved===undefined||resolved===null)return null;
        total+=resolved;
      }
      return total;
    }
    check(ast.roots);
    rootCounts.set(ast,count(ast.roots));
    active.delete(key);done.set(key,ast);return ast;
  }
  const ast=visit(resolve(filename),source);return {ast,code:generate(ast)};
}
