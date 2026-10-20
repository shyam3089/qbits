import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
export function managerCommands(manager = 'npm') {
  if (!['npm','pnpm'].includes(manager)) throw new Error('Package manager must be npm or pnpm');
  return {
    install: `${manager} install`,
    run: script => `${manager} run ${script}`,
    cli: (name, args) => `${manager} run ${name}${manager === 'npm' ? ' --' : ''} ${args}`,
    lockfile: manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml',
  };
}
export async function existingManager(root, manifest, userAgent = process.env.npm_config_user_agent) {
  async function exists(name) {
    try { await lstat(join(root,name)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  const locks = [];
  for (const [file,manager] of [['package-lock.json','npm'],['npm-shrinkwrap.json','npm'],['pnpm-lock.yaml','pnpm'],['yarn.lock','yarn'],['bun.lock','bun'],['bun.lockb','bun']]) if (await exists(file)) locks.push(manager);
  const declared = [manifest.packageManager?.split('@')[0], manifest.devEngines?.packageManager?.name].filter(Boolean);
  const choices = new Set([...locks,...declared]);
  if (choices.size > 1) throw new Error('Conflicting package manager declarations/lockfiles; resolve explicitly before init. No files were changed.');
  const invoked = userAgent?.split(/[ /]/)[0];
  const manager = [...choices][0] ?? (['pnpm','yarn','bun'].includes(invoked) ? invoked : 'npm');
  managerCommands(manager); // Refuse unsupported managers rather than silently migrating.
  return manager;
}
