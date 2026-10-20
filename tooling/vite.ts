import type { Plugin } from 'vite';
import { compile } from '../language/index.js';
import { CompileError } from '../language/diagnostics.js';
import { identity, isSource, metadata } from './config.js';
export function languagePlugin(): Plugin {
  return {name: `${identity.languageId}-compiler`, enforce: 'pre',
    handleHotUpdate(context) {
      if (!isSource(context.file)) return;
      for (const module of context.modules) context.server.moduleGraph.invalidateModule(module);
      // Explicit reload also recovers a page whose initial transform failed.
      context.server.ws.send({type: 'full-reload', path: '*'});
      return [];
    },
    transform(source, id) {
      if (!isSource(id)) return;
      try { return {code: metadata() + compile(source, id.split(/[?#]/, 1)[0]).code, map: null}; }
      catch (error) {
        if (!(error instanceof CompileError)) throw error;
        const d = error.diagnostic;
        this.error({message: error.message, id: d.filename, loc: {file: d.filename, line: d.line, column: d.column - 1}, pos: d.span.start});
      }
    }};
}
