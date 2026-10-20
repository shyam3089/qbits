import { mkdtemp, cp, readFile, writeFile, rename, symlink, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve('.');
const temp = await mkdtemp(join(root, '.rename-check-'));
function run(args: string[]) {
  const result = spawnSync(process.execPath, args, {cwd:temp, stdio:'inherit', env:process.env});
  if (result.status !== 0) throw new Error(`Rename check failed: ${args.join(' ')}`);
}
try {
  for (const path of ['language','runtime','tooling','scripts','tests','examples','docs','package.json','identity.json','tsconfig.json','vite.config.ts','index.html']) await cp(join(root,path), join(temp,path), {recursive:true});
  await symlink(join(root,'node_modules'),join(temp,'node_modules'),process.platform === 'win32' ? 'junction' : 'dir');
  const old = JSON.parse(await readFile(join(temp,'identity.json'),'utf8'));
  await writeFile(join(temp,'identity.json'), JSON.stringify({...old,displayName:'Orbit',languageId:'orbit',sourceExtension:'.orb',cliName:'ob',packageName:'orbit',createCommand:'ob',createPackageName:'create-ob'}));
  await rename(join(temp,`examples/counter/Counter${old.sourceExtension}`),join(temp,'examples/counter/Counter.orb'));
  await rename(join(temp,`examples/counter/App${old.sourceExtension}`),join(temp,'examples/counter/App.orb'));
  run(['scripts/sync.mjs']); run(['scripts/sync.mjs','--check']);
  run(['node_modules/tsx/dist/cli.mjs','scripts/check-docs.ts']);
  run(['node_modules/typescript/bin/tsc']); run(['node_modules/vite/bin/vite.js','build']);
  run(['node_modules/tsx/dist/cli.mjs','--test','tests/compiler.test.ts','tests/phase2.test.ts','tests/browser.test.ts']);
  run(['node_modules/tsx/dist/cli.mjs','--test','tests/tooling.test.ts']);
  run(['node_modules/tsx/dist/cli.mjs','tooling/cli.ts','examples/counter/Counter.orb','dist/counter.js']);
  const output = await readFile(join(temp,'dist/counter.js'),'utf8');
  assert.match(output, /"displayName":"Orbit"/);
  assert.match(output, /"sourceExtension":"\.orb"/);
  assert.equal(JSON.parse(await readFile(join(temp,'package.json'),'utf8')).name, 'orbit');
  assert.equal(Object.keys(JSON.parse(await readFile(join(temp,'package.json'),'utf8')).bin)[0], 'ob');
  assert.equal(JSON.parse(await readFile(join(temp,'packages/create/package.json'),'utf8')).name, 'create-ob');
  run(['dist/lib/tooling/cli.js','docs','--agent']);
  run(['node_modules/tsx/dist/cli.mjs','scripts/check-external.ts']);
  console.log('Temporary rename: compiler, CLI, development browser and production browser passed.');
} finally { await rm(temp,{recursive:true,force:true}); }
