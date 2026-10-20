import type { Span } from './ast.js';
import { fail } from './diagnostics.js';
export interface Token { kind: 'identifier' | 'number' | 'string' | 'symbol' | 'NEWLINE' | 'INDENT' | 'DEDENT' | 'eof'; value: string; span: Span }
export function tokenize(source: string, filename = '<input>'): Token[] {
  const tokens: Token[] = []; const levels = [0]; let width: number | undefined;
  let followsHeader = false;
  const emit = (kind: Token['kind'], start: number, end: number, value = '') => tokens.push({kind, value, span: {start, end}});
  let offset = 0;
  while (offset < source.length) {
    const start = offset;
    while (offset < source.length && source[offset] !== '\r' && source[offset] !== '\n') offset++;
    const end = offset;
    if (source[offset] === '\r') offset++;
    if (source[offset] === '\n') offset++;
    let i = start;
    while (i < end && source[i] === ' ') i++;
    if (source[i] === '\t') fail(source, filename, {start: i, end: i + 1}, 'Tabs are not allowed; use spaces for indentation');
    if (i === end || source[i] === '#') continue;
    const indent = i - start; const current = levels.at(-1)!;
    if (followsHeader && indent <= current) fail(source, filename, {start: i, end: i}, 'Expected an indented block after colon');
    if (indent > current) {
      if (tokens.length === 0) fail(source, filename, {start, end: i}, 'Unexpected indentation at top level');
      if (!followsHeader) fail(source, filename, {start, end: i}, 'Unexpected indentation: only a colon header opens a block');
      width ??= indent;
      if (indent - current !== width) fail(source, filename, {start, end: i}, `Inconsistent indentation: each block must add ${width} spaces`);
      levels.push(indent); emit('INDENT', start, i);
    } else if (indent < current) {
      if (!levels.includes(indent)) fail(source, filename, {start, end: i}, `Inconsistent dedent: expected an existing indentation level (${levels.join(', ')} spaces)`);
      while (levels.at(-1)! > indent) { levels.pop(); emit('DEDENT', i, i); }
    }
    while (i < end) {
      if (source[i] === ' ') { i++; continue; }
      if (source[i] === '#') break;
      const tokenStart = i; let kind: Token['kind']; let value: string;
      if (source[i] === '\t') fail(source, filename, {start: i, end: i + 1}, 'Tabs are not allowed; use spaces');
      if (/[A-Za-z_]/.test(source[i])) {
        kind = 'identifier'; while (i < end && /[A-Za-z0-9_]/.test(source[i])) i++;
        value = source.slice(tokenStart, i);
      } else if (/[0-9]/.test(source[i])) {
        kind = 'number'; while (i < end && /[0-9]/.test(source[i])) i++;
        value = source.slice(tokenStart, i);
        if (!Number.isSafeInteger(Number(value))) fail(source, filename, {start: tokenStart, end: i}, 'Integer must be a safe integer');
      } else if (source[i] === '"') {
        kind = 'string'; i++;
        while (i < end && source[i] !== '"') { if (source[i] === '\\') i++; i++; }
        if (i >= end) fail(source, filename, {start: tokenStart, end}, 'Unterminated string; strings must stay on one line');
        i++;
        try { value = JSON.parse(source.slice(tokenStart, i)); }
        catch { fail(source, filename, {start: tokenStart, end: i}, 'Invalid JSON string'); }
      } else if (':=+(),.'.includes(source[i])) { kind = 'symbol'; value = source[i++]; }
      else fail(source, filename, {start: i, end: i + 1}, `Unexpected character ${JSON.stringify(source[i])}; use indentation and newlines, not braces or semicolons`);
      emit(kind, tokenStart, i, value);
    }
    followsHeader = tokens.at(-1)?.kind === 'symbol' && tokens.at(-1)?.value === ':';
    emit('NEWLINE', end, offset);
  }
  while (levels.length > 1) { levels.pop(); emit('DEDENT', source.length, source.length); }
  emit('eof', source.length, source.length); return tokens;
}
