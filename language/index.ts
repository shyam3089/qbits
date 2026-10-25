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
import type { CompilerLimits } from './limits.js';
export interface CompileOptions extends ValidationOptions {limits?:Partial<CompilerLimits>}
export function compile(source: string, filename = '<input>', options:CompileOptions = {}) {
  if(typeof source!=='string')throw new TypeError('Compiler source must be a string');
  if(typeof filename!=='string')throw new TypeError('Compiler filename must be a string');
  const ast = parse(source, filename, options.limits); validate(ast, source, filename, options);
  return {ast, code: generate(ast)};
}
