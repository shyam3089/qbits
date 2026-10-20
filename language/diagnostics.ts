import type { Diagnostic, Span } from './ast.js';
export class CompileError extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(`${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`);
    this.name = 'CompileError';
  }
}
export function fail(source: string, filename: string, span: Span, message: string): never {
  const lines = source.slice(0, span.start).split(/\r\n|\r|\n/);
  throw new CompileError({filename, span, line: lines.length, column: lines.at(-1)!.length + 1, message});
}
