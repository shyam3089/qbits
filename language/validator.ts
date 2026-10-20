import type { Component } from './ast.js';
import { fail } from './diagnostics.js';
export function validate(ast: Component, source: string, filename = '<input>'): void {
  for (const node of [ast.button.conversion.argument, ast.button.target, ast.button.operand]) {
    if (node.value !== ast.state.name.value) fail(source, filename, node.span, `Unknown state ${JSON.stringify(node.value)}; expected ${JSON.stringify(ast.state.name.value)}`);
  }
}
