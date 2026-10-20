import type { Component } from './ast.js';
export function generate(ast: Component): string {
  // User identifiers never become JavaScript identifiers. Strings are serialized, never evaluated.
  return `export const componentName = ${JSON.stringify(ast.name.value)};\nexport const model = ${JSON.stringify({initial: ast.state.initial.value, prefix: ast.button.prefix.value, step: ast.button.step.value})};\nexport default function mount(target, runtime) { return runtime.mountCounter(target, model); }\n`;
}
