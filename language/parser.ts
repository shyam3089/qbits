import type { Component, Node } from './ast.js';
import { tokenize, type Token } from './tokenizer.js';
import { fail } from './diagnostics.js';
export function parse(source: string, filename = '<input>'): Component {
  const tokens = tokenize(source, filename); let cursor = 0;
  function take(kind: Token['kind'], value?: string): Token {
    const t = tokens[cursor];
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      const expected = kind === 'INDENT' ? 'an indented block' : kind === 'DEDENT' ? 'dedent to the enclosing block' : value ?? kind;
      const found = t.kind === 'eof' ? 'end of input' : ['NEWLINE', 'INDENT', 'DEDENT'].includes(t.kind) ? t.kind : JSON.stringify(t.value);
      fail(source, filename, t.span, `Expected ${expected}, found ${found}`);
    }
    cursor++; return t;
  }
  const word = (value: string) => take('identifier', value);
  const symbol = (value: string) => take('symbol', value);
  const id = (): Node<string> => {
    const t = take('identifier');
    if (['component', 'button', 'text', 'str', 'on', 'click', 'var', 'let', 'const'].includes(t.value)) fail(source, filename, t.span, `Reserved word ${JSON.stringify(t.value)} cannot be an identifier`);
    return {value: t.value, span: t.span};
  };
  const number = (): Node<number> => { const t = take('number'); return {value: Number(t.value), span: t.span}; };
  const block = () => { symbol(':'); take('NEWLINE'); take('INDENT'); };
  const start = word('component').span.start; const name = id(); block();
  const stateName = id(); symbol('='); const initial = number(); const stateEnd = initial.span.end; take('NEWLINE');
  const buttonStart = word('button').span.start; word('text'); symbol('='); const text = take('string'); symbol('+');
  const conversionStart = word('str').span.start; symbol('('); const reference = id(); const conversionEnd = symbol(')').span.end; block();
  const handlerStart = word('on').span.start; word('click'); block();
  const target = id(); symbol('='); const operand = id(); symbol('+'); const step = number(); take('NEWLINE');
  const end = step.span.end; take('DEDENT'); take('DEDENT'); take('DEDENT'); take('eof');
  return {kind: 'Component', span: {start, end}, name,
    state: {span: {start: stateName.span.start, end: stateEnd}, name: stateName, initial},
    button: {span: {start: buttonStart, end}, prefix: {value: text.value, span: text.span},
      conversion: {kind: 'StringConversion', span: {start: conversionStart, end: conversionEnd}, argument: reference},
      handlerSpan: {start: handlerStart, end}, target, operand, step}};
}
