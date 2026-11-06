import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { identity } from '../tooling/config.js';
import { mergeAgentInstructions, agentBlock, counterSource, applicationFiles } from '../tooling/project.mjs';
import { existingManager } from '../tooling/package-manager.mjs';
const cli = resolve('dist/lib/tooling/cli.js');
function invoke(cwd: string, args: string[]) { const result = spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'}); assert.ifError(result.error); return result; }
test('check emits stable structured diagnostics and nonzero failure status', async () => {
  const temp = await mkdtemp(join(tmpdir(),'framework-check-'));
  try {
    const source = join(temp,`Counter${identity.sourceExtension}`);
    await writeFile(source,counterSource());
    await writeFile(join(temp,'Counter.css'),'.counter {}');
    const valid = invoke(temp,['check',source,'--json']); assert.equal(valid.status,0); assert.equal(valid.stderr,'');
    assert.deepEqual(JSON.parse(valid.stdout),{schemaVersion:1,ok:true,filesChecked:1,diagnostics:[]});
    await writeFile(source,counterSource().replace('str(count)','str(missing)'));
    const invalid = invoke(temp,['check',source,'--json']); assert.equal(invalid.status,1);
    const result = JSON.parse(invalid.stdout); assert.equal(result.ok,false); assert.equal(result.diagnostics[0].kind,'syntax');
    assert.equal(result.diagnostics[0].filename,source); assert.equal(result.diagnostics[0].line,6); assert.equal(result.diagnostics[0].column,56);
    for (const args of [['check','absent','--json'],['check','--bad','--json']]) {
      const error = invoke(temp,args); assert.equal(error.status,1); assert.equal(JSON.parse(error.stdout).diagnostics[0].kind,'io');
    }
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('init preserves existing instructions/scripts and is idempotent', async () => {
  const temp = await mkdtemp(join(tmpdir(),'framework-init-'));
  try {
    const original = '# Team rules\n\nKeep our formatting.\n';
    await writeFile(join(temp,'AGENTS.md'),original);
    await writeFile(join(temp,'package.json'),JSON.stringify({private:true,scripts:{check:'custom-check',dev:'vite'}}));
    const init = invoke(temp,['init']); assert.equal(init.status,0,init.stderr); assert.match(init.stdout,/conflicts preserved \(check\)/);
    const first = await readFile(join(temp,'AGENTS.md'),'utf8'); assert.ok(first.startsWith(original));
    assert.match(first,new RegExp(`node_modules/${identity.packageName}/docs/agent.md`));
    const packageFirst = await readFile(join(temp,'package.json'),'utf8');
    assert.equal(JSON.parse(packageFirst).scripts.check,'custom-check');
    assert.equal(JSON.parse(packageFirst).scripts[identity.cliName],identity.cliName);
    assert.equal(invoke(temp,['init']).status,0);
    assert.equal(await readFile(join(temp,'AGENTS.md'),'utf8'),first);
    assert.equal(await readFile(join(temp,'package.json'),'utf8'),packageFirst);
    await writeFile(join(temp,'AGENTS.md'),first + '<!-- BEGIN FRAMEWORK GUIDANCE -->');
    assert.equal(invoke(temp,['init']).status,1);
    assert.equal(await readFile(join(temp,'package.json'),'utf8'),packageFirst);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('agent docs identify the installed version and topic files', () => {
  const result = invoke(process.cwd(),['docs','--agent']); assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/installed docs/); assert.match(result.stdout,/syntax.md/); assert.match(result.stdout,/security.md/);
  const api = invoke(process.cwd(),['docs','api']); assert.equal(api.status,0,api.stderr); assert.match(api.stdout,/beta API/);
  assert.equal(invoke(process.cwd(),['docs','../identity']).status,1);
});
test('managed instructions update only their own section', () => {
  const block = agentBlock(identity,'0.1.0'); const previous = 'custom prefix\n' + block + '\ncustom suffix';
  const updated = mergeAgentInstructions(previous,agentBlock(identity,'0.2.0'));
  assert.ok(updated.startsWith('custom prefix\n')); assert.ok(updated.endsWith('\ncustom suffix')); assert.match(updated,/0.2.0/);
});
test('init preserves an explicitly empty script', async () => {
  const temp = await mkdtemp(join(tmpdir(),'framework-init-empty-'));
  try {
    await writeFile(join(temp,'package.json'),JSON.stringify({private:true,scripts:{[identity.cliName]:''}}));
    assert.equal(invoke(temp,['init']).status,0);
    assert.equal(JSON.parse(await readFile(join(temp,'package.json'),'utf8')).scripts[identity.cliName],'');
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('templates select manager commands without fabricating lockfiles', () => {
  for (const manager of ['npm','pnpm']) {
    const files = applicationFiles(identity,'0.1.0','file:framework.tgz','file:vite.tgz',manager);
    assert.equal(JSON.parse(files['package.json']).devEngines.packageManager.name,manager);
    assert.ok(files['README.md'].includes(`${manager} install`));
    for (const script of ['dev','check','build']) assert.ok(files['AGENTS.md'].includes(`${manager} run ${script}`));
    assert.ok(files['README.md'].includes(manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'));
    assert.ok(!Object.keys(files).some(name => name.endsWith('lock.json') || name.endsWith('lock.yaml')));
  }
  assert.equal(JSON.parse(applicationFiles(identity,'0.1.0','local','local')['package.json']).devEngines.packageManager.name,'npm');
  assert.throws(() => applicationFiles(identity,'0.1.0','local','local','other'));
});
test('init retains existing manager declarations and lockfile bytes', async () => {
  for (const manager of ['npm','pnpm']) {
    const temp = await mkdtemp(join(tmpdir(),'framework-lock-'));
    try {
      const manifest = {private:true,packageManager:`${manager}@10.0.0`,scripts:{}};
      await writeFile(join(temp,'package.json'),JSON.stringify(manifest));
      const lock = manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml';
      await writeFile(join(temp,lock),'retained lockfile bytes\n');
      assert.equal(invoke(temp,['init']).status,0);
      assert.equal(await readFile(join(temp,lock),'utf8'),'retained lockfile bytes\n');
      assert.equal(JSON.parse(await readFile(join(temp,'package.json'),'utf8')).packageManager,manifest.packageManager);
      assert.match(await readFile(join(temp,'AGENTS.md'),'utf8'),new RegExp(`${manager} run build`));
      const withoutDeclaration = JSON.parse(await readFile(join(temp,'package.json'),'utf8'));
      delete withoutDeclaration.packageManager;
      await writeFile(join(temp,'package.json'),JSON.stringify(withoutDeclaration));
      assert.equal(invoke(temp,['init']).status,0,'An existing lockfile alone selects its manager');
      assert.match(await readFile(join(temp,'AGENTS.md'),'utf8'),new RegExp(`${manager} run build`));
      assert.equal(JSON.parse(await readFile(join(temp,'package.json'),'utf8')).packageManager,undefined);
      const before = await readFile(join(temp,'package.json'),'utf8'); const agents = await readFile(join(temp,'AGENTS.md'),'utf8');
      await writeFile(join(temp,manager === 'npm' ? 'pnpm-lock.yaml' : 'package-lock.json'),'conflicting lock\n');
      assert.equal(invoke(temp,['init']).status,1);
      assert.equal(await readFile(join(temp,'package.json'),'utf8'),before);
      assert.equal(await readFile(join(temp,'AGENTS.md'),'utf8'),agents);
    } finally { await rm(temp,{recursive:true,force:true}); }
  }
});
test('pnpm selection explains unavailable tool without installing or switching managers', async () => {
  const temp = await mkdtemp(join(tmpdir(),'framework-no-pnpm-'));
  try {
    const archive = join(temp,'framework.tgz'); await writeFile(archive,'test archive placeholder; generator does not unpack');
    const app = join(temp,'app');
    const result = spawnSync(process.execPath,[resolve('tooling/scaffold.mjs'),app,'--framework',archive,'--package-manager','pnpm'],{encoding:'utf8',env:{...process.env,PATH:''}});
    assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/pnpm is unavailable/); assert.match(result.stdout,/--package-manager npm/);
    assert.equal(JSON.parse(await readFile(join(app,'package.json'),'utf8')).devEngines.packageManager.name,'pnpm');
  } finally { await rm(temp,{recursive:true,force:true}); }
});
test('init uses the invoking manager only when declarations and locks are absent', async () => {
  const temp = await mkdtemp(join(tmpdir(),'framework-manager-'));
  try {
    assert.equal(await existingManager(temp,{},'pnpm/10.12.1 npm/? node/v22'),'pnpm');
    assert.equal(await existingManager(temp,{packageManager:'npm@10.9.2'},'pnpm/10.12.1'),'npm');
    await assert.rejects(existingManager(temp,{},'yarn/1.0.0'),/npm or pnpm/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
