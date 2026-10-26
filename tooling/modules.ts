// Node-only module graph validation. The language compiler remains filesystem-free.
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fail,generate,measureComponentComplexity,parse,resolveModuleGraphLimits,utf8Length,validate,type CompilerLimits,type Component,type Import,type ModuleGraphLimits} from '../language/index.js';
import {identity} from './config.js';

export interface CompileFileOptions {limits?:Partial<CompilerLimits>;graphLimits?:Partial<ModuleGraphLimits>}
interface Dependency {entry:Import;record:ModuleRecord}
interface ModuleRecord {key:string;file:string;text:string;depth:number;ast?:Component;dependencies:Dependency[]}

export function compileFile(filename:string,source?:string,watch?:(path:string)=>void,options:CompileFileOptions={}) {
  const graphLimits=resolveModuleGraphLimits(options.graphLimits),records=new Map<string,ModuleRecord>(),pending:ModuleRecord[]=[];
  let totalBytes=0,totalComplexity=0;
  const add=(file:string,text:string,parent?:ModuleRecord,entry?:Import):ModuleRecord=>{
    const key=realpathSync(file),existing=records.get(key);if(existing)return existing;
    const reject=(message:string):never=>parent&&entry?fail(parent.text,parent.file,entry.path.span,message):fail(text,file,{start:0,end:0},message);
    const depth=parent?parent.depth+1:0;if(depth>graphLimits.maxImportDepth)reject(`Import depth exceeds the configured limit of ${graphLimits.maxImportDepth}`);
    if(records.size>=graphLimits.maxModules)reject(`Module graph exceeds the configured limit of ${graphLimits.maxModules} distinct modules`);
    const bytes=utf8Length(text);if(totalBytes+bytes>graphLimits.maxTotalSourceBytes)reject(`Project source exceeds the configured limit of ${graphLimits.maxTotalSourceBytes} UTF-8 bytes`);
    const record:ModuleRecord={key,file,text,depth,dependencies:[]};records.set(key,record);pending.push(record);totalBytes+=bytes;watch?.(key);return record;
  };
  const rootFile=resolve(filename);let rootSource=source;
  if(rootSource===undefined){const size=statSync(rootFile).size;if(size>graphLimits.maxTotalSourceBytes)fail('',rootFile,{start:0,end:0},`Project source exceeds the configured limit of ${graphLimits.maxTotalSourceBytes} UTF-8 bytes`);rootSource=readFileSync(rootFile,'utf8');}
  const root=add(rootFile,rootSource);
  for(let cursor=0;cursor<pending.length;cursor++){
    const record=pending[cursor],ast=parse(record.text,record.file,options.limits);record.ast=ast;
    const complexity=measureComponentComplexity(ast);if(totalComplexity+complexity>graphLimits.maxAggregateComplexity)fail(record.text,record.file,ast.span,`Project complexity exceeds the configured limit of ${graphLimits.maxAggregateComplexity} AST objects`);totalComplexity+=complexity;
    validate(ast,record.text,record.file,{sourceExtension:identity.sourceExtension,limits:options.limits});
    for(const entry of ast.imports){
      const path=resolve(dirname(record.file),entry.path.value);watch?.(path);let resolved:string;
      try{resolved=realpathSync(path);if(!statSync(resolved).isFile())throw new Error('Not a file');}
      catch{fail(record.text,record.file,entry.path.span,`Missing import ${JSON.stringify(entry.path.value)}`);}
      if(!entry.name)continue;
      let child=records.get(resolved!);if(!child){const nextDepth=record.depth+1;if(nextDepth>graphLimits.maxImportDepth)fail(record.text,record.file,entry.path.span,`Import depth exceeds the configured limit of ${graphLimits.maxImportDepth}`);if(records.size>=graphLimits.maxModules)fail(record.text,record.file,entry.path.span,`Module graph exceeds the configured limit of ${graphLimits.maxModules} distinct modules`);const size=statSync(resolved!).size;if(totalBytes+size>graphLimits.maxTotalSourceBytes)fail(record.text,record.file,entry.path.span,`Project source exceeds the configured limit of ${graphLimits.maxTotalSourceBytes} UTF-8 bytes`);child=add(resolved!,readFileSync(resolved!,'utf8'),record,entry);}record.dependencies.push({entry,record:child});
    }
  }

  const colors=new Map<string,0|1|2>(),path:ModuleRecord[]=[];
  const stack:{record:ModuleRecord;index:number}[]=[{record:root,index:0}];colors.set(root.key,1);path.push(root);
  while(stack.length){const frame=stack.at(-1)!;
    if(frame.index>=frame.record.dependencies.length){colors.set(frame.record.key,2);stack.pop();path.pop();continue;}
    const dependency=frame.record.dependencies[frame.index++],color=colors.get(dependency.record.key)??0;
    if(color===1){const start=path.findIndex(item=>item.key===dependency.record.key),cycle=[...path.slice(start),dependency.record].map(item=>item.file);fail(frame.record.text,frame.record.file,dependency.entry.path.span,`Unsupported component import cycle: ${cycle.join(' -> ')}`);}
    if(color===0){colors.set(dependency.record.key,1);path.push(dependency.record);stack.push({record:dependency.record,index:0});}
  }

  const incoming=new Map<string,number>([...records.keys()].map(key=>[key,0]));
  for(const record of records.values())for(const key of new Set(record.dependencies.map(item=>item.record.key)))incoming.set(key,incoming.get(key)!+1);
  const ready:ModuleRecord[]=[...records.values()].filter(record=>incoming.get(record.key)===0),order:ModuleRecord[]=[],depth=new Map([[root.key,0]]);
  for(let cursor=0;cursor<ready.length;cursor++){
    const record=ready[cursor];order.push(record);const unique=new Map(record.dependencies.map(item=>[item.record.key,item]));
    for(const dependency of unique.values()){
      const next=(depth.get(record.key)??0)+1;if(next>graphLimits.maxImportDepth)fail(record.text,record.file,dependency.entry.path.span,`Import depth exceeds the configured limit of ${graphLimits.maxImportDepth}`);
      depth.set(dependency.record.key,Math.max(depth.get(dependency.record.key)??0,next));const remaining=incoming.get(dependency.record.key)!-1;incoming.set(dependency.record.key,remaining);if(!remaining)ready.push(dependency.record);
    }
  }

  const rootCounts=new Map<Component,number|null>();
  for(let index=order.length-1;index>=0;index--){
    const record=order[index],ast=record.ast!,components=new Map<string,Component>();
    for(const dependency of record.dependencies)components.set(dependency.entry.name!.value,dependency.record.ast!);
    validate(ast,record.text,record.file,{sourceExtension:identity.sourceExtension,components,limits:options.limits});
    function check(nodes:Component['roots']):void {for(const node of nodes){if(node.kind==='slot')continue;if(node.kind==='conditional'){check(node.consequent);check(node.alternate);continue;}if(node.kind==='iteration'){check(node.children);continue;}const child=components.get(node.tag.value);if(child&&node.attributes.class&&rootCounts.get(child)!==1)fail(record.text,record.file,node.attributes.class.span,'Ambiguous class forwarding: component must resolve to a single root element');check(node.children);}}
    function count(nodes:Component['roots']):number|null {let total=0;for(const node of nodes){if(node.kind==='iteration'||node.kind==='slot')return null;if(node.kind==='conditional'){const consequent=count(node.consequent),alternate=node.alternate.length?count(node.alternate):0;if(consequent===null||alternate===null||consequent!==alternate)return null;total+=consequent;continue;}const child=components.get(node.tag.value),resolved=child?rootCounts.get(child):1;if(resolved===undefined||resolved===null)return null;total+=resolved;}return total;}
    check(ast.roots);rootCounts.set(ast,count(ast.roots));
  }
  return {ast:root.ast!,code:generate(root.ast!)};
}
