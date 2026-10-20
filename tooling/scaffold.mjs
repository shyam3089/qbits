#!/usr/bin/env node
import { mkdir, writeFile, readFile, lstat, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import raw from '../identity.json' with { type: 'json' };
import { validateIdentity } from './identity.mjs';
import { applicationFiles } from './project.mjs';
import { managerCommands } from './package-manager.mjs';
import { spawnSync } from 'node:child_process';
const identity = validateIdentity(raw);
try {
  const [name, ...args] = process.argv.slice(2);
  if (!name || name.startsWith('-')) throw new Error(`Local usage: ${identity.createPackageName} myapp --framework <local.tgz> [--vite <local.tgz>] [--package-manager npm|pnpm]`);
  let frameworkSpec; let viteSpec; let manager = 'npm';
  for (let i = 0; i < args.length; i += 2) {
    if (!['--framework','--vite','--package-manager'].includes(args[i]) || !args[i + 1]) throw new Error('Expected --framework/--vite <local.tgz> or --package-manager npm|pnpm');
    if (args[i] === '--package-manager') { manager = args[i + 1]; managerCommands(manager); continue; }
    const file = resolve(args[i + 1]);
    if (!file.endsWith('.tgz') || !(await lstat(file)).isFile()) throw new Error('Local dependency override must be a .tgz file');
    if (args[i] === '--framework') frameworkSpec = `file:${file.replaceAll('\\','/')}`; else viteSpec = `file:${file.replaceAll('\\','/')}`;
  }
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (manifest.private && !frameworkSpec) throw new Error('Private scaffolding requires --framework <local.tgz>; registry availability is not verified');
  frameworkSpec ??= manifest.version;
  viteSpec ??= manifest.frameworkViteRange;
  const target = resolve(name);
  // mkdir without recursive refuses any existing directory, symlink or file.
  await mkdir(target);
  try {
    for (const [path, text] of Object.entries(applicationFiles(identity, manifest.version, frameworkSpec, viteSpec, manager))) {
      const file = resolve(target, path); await mkdir(dirname(file), {recursive:true}); await writeFile(file, text, {flag:'wx'});
    }
  } catch (error) { await rm(target, {recursive:true, force:true}); throw error; }
  const commands = managerCommands(manager);
  console.log(`${identity.displayName}: created ${target}. Next: cd ${JSON.stringify(name)}, ${commands.install}, ${commands.run('dev')}. Installation generates ${commands.lockfile}. No dependencies were installed.`);
  if (manager === 'pnpm' && spawnSync('pnpm',['--version'],{shell:process.platform === 'win32',windowsHide:true,stdio:'ignore',timeout:10000}).status !== 0) console.log('pnpm is unavailable on PATH. Opt in to a non-global tool download with npm exec --package=pnpm -- pnpm install, or scaffold a new app with --package-manager npm. No global tool was installed.');
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
