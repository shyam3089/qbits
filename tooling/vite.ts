import type { Plugin } from 'vite';
import { compileFile } from './modules.js';
import { CompileError } from '../language/diagnostics.js';
import { identity, isSource, metadata } from './config.js';
import { readFileSync } from 'node:fs';
export function languagePlugin(): Plugin {
  return {name: `${identity.languageId}-compiler`, enforce: 'pre',
    handleHotUpdate(context) {
      if (!isSource(context.file) && !context.file.endsWith('.css')) return;
      // A failed parent transform may not yet have registered its dependency
      // edges. Clear cached parent failures as well as successfully loaded children.
      context.server.moduleGraph.invalidateAll();
      // Explicit reload also recovers a page whose initial transform failed.
      context.server.ws.send({type: 'full-reload', path: '*'});
      return [];
    },
    transform(source, id) {
      if (!isSource(id)) return;
      try { return {code: metadata() + compileFile(id.split(/[?#]/, 1)[0],source,path=>this.addWatchFile(path)).code, map: null}; }
      catch (error) {
        if (!(error instanceof CompileError)) throw error;
        const d = error.diagnostic;
        const lines = readFileSync(d.filename,'utf8').split(/\r\n|\r|\n/);
        const frame = `${d.line} | ${lines[d.line-1]}\n${' '.repeat(String(d.line).length)} | ${' '.repeat(d.column-1)}^`;
        this.error({message: error.message, id: d.filename, frame, loc: {file: d.filename, line: d.line, column: d.column - 1}, pos: d.span.start});
      }
    }};
}
