export * from './ast.js';
export * from './diagnostics.js';
export * from './tokenizer.js';
export * from './parser.js';
export * from './validator.js';
export * from './generator.js';
import { parse } from './parser.js';
import { validate } from './validator.js';
import { generate } from './generator.js';
import type { ValidationOptions } from './validator.js';
export function compile(source: string, filename = '<input>', options:ValidationOptions = {}) {
  const ast = parse(source, filename); validate(ast, source, filename, options);
  return {ast, code: generate(ast)};
}
