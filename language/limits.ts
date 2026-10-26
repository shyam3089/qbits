import type {Component} from './ast.js';

export interface CompilerLimits {
  /** Maximum UTF-16 code units accepted from one source file. */
  maxSourceLength:number;
  /** Maximum indentation/view nesting levels in one source file. */
  maxNestingDepth:number;
  /** Maximum expression nodes parsed across one source file. */
  maxExpressionNodes:number;
  /** Maximum recursively nested expression levels. */
  maxExpressionDepth:number;
  /** Maximum items in one list literal or call argument list. */
  maxCollectionItems:number;
}

export interface ModuleGraphLimits {
  /** Maximum distinct Qubits modules reachable from one entry. */
  maxModules:number;
  /** Maximum import edges on any acyclic path from the entry module. */
  maxImportDepth:number;
  /** Maximum cumulative UTF-8 source bytes across distinct modules. */
  maxTotalSourceBytes:number;
  /** Maximum cumulative AST objects across distinct modules. */
  maxAggregateComplexity:number;
}

export const defaultCompilerLimits:Readonly<CompilerLimits>=Object.freeze({
  maxSourceLength:2*1024*1024,
  maxNestingDepth:256,
  maxExpressionNodes:100_000,
  maxExpressionDepth:512,
  maxCollectionItems:100_000
});

export const defaultModuleGraphLimits:Readonly<ModuleGraphLimits>=Object.freeze({
  maxModules:10_000,
  maxImportDepth:256,
  maxTotalSourceBytes:64*1024*1024,
  maxAggregateComplexity:2_000_000
});

export function resolveCompilerLimits(overrides:Partial<CompilerLimits>={}):CompilerLimits {
  const resolved={...defaultCompilerLimits,...overrides};
  for(const [name,value] of Object.entries(resolved))if(!Number.isSafeInteger(value)||value<1)throw new TypeError(`Compiler limit ${name} must be a positive safe integer`);
  return resolved;
}

export function resolveModuleGraphLimits(overrides:Partial<ModuleGraphLimits>={}):ModuleGraphLimits {
  const resolved={...defaultModuleGraphLimits,...overrides};
  for(const [name,value] of Object.entries(resolved))if(!Number.isSafeInteger(value)||value<1)throw new TypeError(`Module graph limit ${name} must be a positive safe integer`);
  return resolved;
}

export function utf8Length(value:string):number {
  let bytes=0;
  for(let index=0;index<value.length;index++){
    const code=value.charCodeAt(index);
    if(code<=0x7f)bytes++;
    else if(code<=0x7ff)bytes+=2;
    else if(code>=0xd800&&code<=0xdbff&&index+1<value.length){const next=value.charCodeAt(index+1);if(next>=0xdc00&&next<=0xdfff){bytes+=4;index++;}else bytes+=3;}
    else bytes+=3;
  }
  return bytes;
}

export function measureComponentComplexity(ast:Component):number {
  let total=0;const pending:unknown[]=[ast];
  while(pending.length){const value=pending.pop();if(Array.isArray(value)){for(const item of value)if(item&&typeof item==='object')pending.push(item);continue;}if(!value||typeof value!=='object')continue;total++;for(const [key,item] of Object.entries(value))if(key!=='span'&&item&&typeof item==='object')pending.push(item);}
  return total;
}
