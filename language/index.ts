export * from './ast.js';
export * from './diagnostics.js';
export * from './tokenizer.js';
export * from './parser.js';
export * from './validator.js';
export * from './generator.js';
export * from './limits.js';
import { parse } from './parser.js';
import { validate } from './validator.js';
import { generate } from './generator.js';
import type { ValidationOptions } from './validator.js';
import {fail} from './diagnostics.js';
import {measureComponentComplexity,resolveModuleGraphLimits,utf8Length,type CompilerLimits,type ModuleGraphLimits} from './limits.js';
export interface CompileOptions extends ValidationOptions {limits?:Partial<CompilerLimits>;graphLimits?:Partial<ModuleGraphLimits>}
export function compile(source: string, filename = '<input>', options:CompileOptions = {}) {
  if(typeof source!=='string')throw new TypeError('Compiler source must be a string');
  if(typeof filename!=='string')throw new TypeError('Compiler filename must be a string');
  const graphLimits=resolveModuleGraphLimits(options.graphLimits);
  if(utf8Length(source)>graphLimits.maxTotalSourceBytes)fail(source,filename,{start:0,end:0},`Project source exceeds the configured limit of ${graphLimits.maxTotalSourceBytes} UTF-8 bytes`);
  const ast = parse(source, filename, options.limits);
  if(measureComponentComplexity(ast)>graphLimits.maxAggregateComplexity)fail(source,filename,ast.span,`Project complexity exceeds the configured limit of ${graphLimits.maxAggregateComplexity} AST objects`);
  validate(ast, source, filename, options);
  return {ast, code: generate(ast)};
}
