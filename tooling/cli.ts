#!/usr/bin/env node
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompileError, type Diagnostic } from '../language/index.js';
import { identity, isSource, metadata } from './config.js';
import { initialize } from './onboarding.js';
import { compileFile } from './modules.js';
const args = process.argv.slice(2);
const docsRoot = new URL('../../../docs/', import.meta.url);
const usage = `Usage: ${identity.cliName} compile <input${identity.sourceExtension}> <output.js> | check [path ...] [--json] | init | docs [--agent|topic]`;
type CheckDiagnostic = Diagnostic & {kind: 'syntax' | 'io'};
async function check(paths: string[]): Promise<void> {
  const json = paths.includes('--json'); const files: string[] = []; const diagnostics: CheckDiagnostic[] = [];
  const io = (filename: string, message: string) => diagnostics.push({kind:'io',filename,line:1,column:1,span:{start:0,end:0},message});
  async function visit(path: string, explicit = false): Promise<void> {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) { if (explicit) io(path,'Symbolic links are not scanned'); return; }
      if (info.isDirectory()) {
        for (const item of (await readdir(path)).sort()) if (!['node_modules','dist','.git'].includes(item) && !item.startsWith('.')) await visit(join(path,item));
      } else if (isSource(path)) files.push(path);
      else if (explicit) io(path,`Expected a ${identity.sourceExtension} source file or directory`);
    } catch (error) { io(path,error instanceof Error ? error.message : String(error)); }
  }
  const inputs = paths.filter(p => p !== '--json');
  for (const input of inputs.length ? inputs : ['src']) {
    if (input.startsWith('-')) io(input,'Unknown check option'); else await visit(resolve(input),true);
  }
  for (const file of [...new Set(files)]) {
    try { compileFile(file); }
    catch (error) { if (error instanceof CompileError) diagnostics.push({...error.diagnostic,kind:'syntax'}); else io(file,error instanceof Error ? error.message : String(error)); }
  }
  if (!files.length && !diagnostics.length) io(resolve(inputs[0] ?? 'src'),`No ${identity.sourceExtension} source files found`);
  const result = {schemaVersion:1, ok:diagnostics.length === 0, filesChecked:new Set(files).size, diagnostics};
  if (json) console.log(JSON.stringify(result));
  else { for (const d of diagnostics) console.error(`${d.filename}:${d.line}:${d.column}: ${d.message}`); console.log(`${identity.displayName}: checked ${result.filesChecked} file(s), ${diagnostics.length} error(s)`); }
  if (!result.ok) process.exitCode = 1;
}
try {
  const [command,...rest] = args;
  if (command === 'check') await check(rest);
  else if (command === 'init') { if (rest.length) throw new Error(usage); await initialize(); }
  else if (command === 'docs') {
    const topic = rest[0] === '--agent' ? 'agent' : rest[0] ?? 'agent';
    if (rest.length > 1 || !['agent','syntax','examples','security','commands','limitations','package-managers','reactivity'].includes(topic)) throw new Error(usage);
    const manifest = JSON.parse(await readFile(new URL('manifest.json',docsRoot),'utf8'));
    console.log(`${identity.displayName} ${manifest.version} — installed docs: ${fileURLToPath(docsRoot)}\n` + await readFile(new URL(`${topic}.md`,docsRoot),'utf8'));
  } else {
    // Retain the earlier local two-argument compile invocation for compatibility.
    const [input,output,...extra] = command === 'compile' ? rest : args;
    if (!input || !output || extra.length || !isSource(input)) throw new Error(usage);
    const result = compileFile(input);
    await writeFile(output,metadata() + result.code);
    console.log(`${identity.displayName}: compiled ${input} -> ${output}`);
  }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
