import { readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { identity } from './config.js';
import { agentBlock, mergeAgentInstructions } from './project.mjs';
import { existingManager } from './package-manager.mjs';
export async function initialize(root = process.cwd()): Promise<void> {
  const manifestPath = resolve(root,'package.json');
  const manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error('init requires a regular package.json in the application root');
  const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
  const manager = await existingManager(root,manifest);
  const command = identity.cliName;
  const wanted = {[command]:command, check:`${command} check src --json`};
  manifest.scripts ??= {};
  const conflicts: string[] = [];
  for (const [key,value] of Object.entries(wanted)) {
    if (Object.hasOwn(manifest.scripts,key) && manifest.scripts[key] !== value) conflicts.push(key);
    else manifest.scripts[key] = value;
  }
  const agentPath = resolve(root,'AGENTS.md');
  let existing = '';
  try {
    const info = await lstat(agentPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing to overwrite a non-regular AGENTS.md');
    existing = await readFile(agentPath,'utf8');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const docs = JSON.parse(await readFile(new URL('../../../docs/manifest.json',import.meta.url),'utf8'));
  const next = mergeAgentInstructions(existing, agentBlock(identity, docs.version, manager));
  // Validate merges before either write. This command runs only on explicit invocation.
  if (next !== existing) await writeFile(agentPath,next);
  const before = await readFile(manifestPath,'utf8'); const after = JSON.stringify(manifest,null,2) + '\n';
  if (before !== after) await writeFile(manifestPath,after);
  console.log(`${identity.displayName}: guidance initialized. Existing instructions and script conflicts preserved${conflicts.length ? ` (${conflicts.join(', ')})` : ''}. Add languagePlugin() from ${identity.packageName}/vite to your Vite config and use docs --agent for commands. Default check scans src; pass another path for other layouts.`);
}
