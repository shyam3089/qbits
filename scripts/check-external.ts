import { mkdtemp, readFile, writeFile, readdir, rm, realpath, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { identity } from '../tooling/config.js';
const root = resolve('.');
const npm = process.env.npm_execpath ?? resolve('.tools/package/bin/npm-cli.js');
const manager = process.argv.includes('--manager') ? process.argv[process.argv.indexOf('--manager') + 1] : 'npm';
assert.ok(['npm','pnpm'].includes(manager),'Use --manager npm or --manager pnpm');
const pnpmCLI = process.env.TEST_PNPM_CLI ?? resolve('.tools/pnpm-tool/node_modules/pnpm/bin/pnpm.cjs');
if (manager === 'pnpm') {
  try { await lstat(pnpmCLI); }
  catch { console.log('SKIP pnpm standalone checks: no local pnpm CLI. Set TEST_PNPM_CLI to an installed pnpm JS entry point. No global tools were installed.'); process.exit(0); }
}
const temp = await realpath(await mkdtemp(join(tmpdir(),'framework-external-')));
assert.ok(relative(root,temp).startsWith('..') || isAbsolute(relative(root,temp)),'Generated application must be outside the framework workspace');
const env = {...process.env};
try { if ((await lstat(join(root,'.tools/npm-cache'))).isDirectory()) env.npm_config_cache = join(root,'.tools/npm-cache'); } catch { /* Use npm's configured cache in CI. */ }
function run(cwd: string, args: string[], success = true) {
  const result = spawnSync(process.execPath,[npm,...args],{cwd,encoding:'utf8',env,timeout:120000});
  assert.ifError(result.error);
  if (success) assert.equal(result.status,0,`${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
function appRun(cwd: string, args: string[], success = true) {
  if (manager === 'npm') return run(cwd,args,success);
  // npm alone uses -- between a run-script name and its arguments.
  if (args[0] === 'run') args = args.filter((arg,index) => !(arg === '--' && index === 2));
  if (args[0] === 'exec') args = args.filter(arg => arg !== '--offline' && arg !== '--');
  const result = spawnSync(process.execPath,[pnpmCLI,...args],{cwd,encoding:'utf8',env,timeout:120000});
  assert.ifError(result.error);
  if (success) assert.equal(result.status,0,`pnpm ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}
async function pack(directory: string) {
  const result = run(directory,['pack','--ignore-scripts','--json','--pack-destination',temp]);
  const info = JSON.parse(result.stdout)[0];
  if (directory === root) {
    assert.ok(!info.files.some((file: {path:string}) => /(^|\/)(tests|fixtures|scripts|node_modules)(\/|$)/.test(file.path)));
    assert.ok(info.files.some((file: {path:string}) => file.path === 'docs/agent.md'));
  }
  return join(temp,info.filename);
}
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const browserLog:string[]=[];
async function startServer(app: string, production: boolean) {
  let output = '';
  const child = spawn(process.execPath,[join(app,'node_modules/vite/bin/vite.js'),...(production ? ['preview'] : []),'--host','127.0.0.1','--port','0'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
  server = child;
  return await new Promise<string>((resolveUrl,reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)),30000);
    const consume = (data: Buffer) => { output += data.toString(); const match = output.replace(/\u001b\[[0-9;]*m/g,'').match(/http:\/\/127\.0\.0\.1:\d+\//); if (match) {clearTimeout(timeout); resolveUrl(match[0]);} };
    child.stdout!.on('data',consume); child.stderr!.on('data',consume);
    child.once('error',error => {clearTimeout(timeout); reject(error);});
    child.once('exit',code => {clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`));});
  });
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  await new Promise<void>((done,reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not stop')),10000);
    child.once('exit',() => {clearTimeout(timeout);done();});
    if (process.platform === 'win32') spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else child.kill();
  });
  server = undefined;
}
try {
  const main = await pack(root);
  const creator = await pack(join(root,'packages/create'));
  // Vite also comes from a local tarball. npm may fetch its transitive dependencies.
  const vite = await pack(join(root,'node_modules/vite'));
  const runner = join(temp,'runner');
  const { mkdir } = await import('node:fs/promises'); await mkdir(runner);
  await writeFile(join(runner,'package.json'),'{"private":true}');
  run(runner,['install','--offline','--ignore-scripts','--no-audit','--no-fund',creator]);
  const absentApp = join(temp,'no-registry');
  assert.notEqual(run(runner,['exec','--offline','--',identity.createPackageName,absentApp],false).status,0,'Private scaffolding must require an explicit local main package');
  await assert.rejects(lstat(absentApp),{code:'ENOENT'});
  const app = join(temp,'myapp');
  run(runner,['exec','--offline','--',identity.createPackageName,app,'--framework',main,'--vite',vite,'--package-manager',manager]);
  assert.notEqual(run(runner,['exec','--offline','--',identity.createPackageName,app,'--framework',main],false).status,0,'Scaffolder must refuse an existing target');
  const beforeInstall = await readFile(join(app,'AGENTS.md'),'utf8');
  appRun(app,manager === 'npm' ? ['install','--offline=false','--prefer-offline','--ignore-scripts','--no-audit','--no-fund'] : ['install','--ignore-scripts','--no-frozen-lockfile']);
  const lockfile = manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml';
  const otherLock = manager === 'npm' ? 'pnpm-lock.yaml' : 'package-lock.json';
  const locked = await readFile(join(app,lockfile),'utf8');
  await assert.rejects(lstat(join(app,otherLock)),{code:'ENOENT'});
  assert.ok((await readFile(join(app,'README.md'),'utf8')).includes(`${manager} install`));
  assert.ok(beforeInstall.includes(`${manager} run dev`));
  console.log(`External ${manager} app installed from local tarballs outside the checkout; only ${lockfile} exists.`);
  assert.equal(await readFile(join(app,'AGENTS.md'),'utf8'),beforeInstall,'Installing packages must not modify application instructions');
  const installed = join(app,'node_modules',identity.packageName);
  assert.ok(!(await realpath(installed)).startsWith(root),'Framework must be installed from tarball, not linked to checkout');
  const manifest = JSON.parse(await readFile(join(installed,'package.json'),'utf8'));
  assert.equal(manifest.private,true); assert.equal(manifest.scripts?.postinstall,undefined);
  assert.equal(Object.keys(manifest.bin)[0],identity.cliName);
  assert.equal(JSON.parse(await readFile(join(runner,'node_modules',identity.createPackageName,'package.json'),'utf8')).version,manifest.version);
  for (const topic of ['agent','syntax','examples','commands','security','limitations']) assert.ok((await readFile(join(installed,'docs',topic + '.md'),'utf8')).length);
  for (const link of beforeInstall.matchAll(/\]\(([^)]+)\)/g)) assert.ok((await lstat(resolve(app,link[1]))).isFile(),`Missing installed agent link ${link[1]}`);
  assert.match(appRun(app,['run',identity.cliName,'--','docs','--agent']).stdout,new RegExp(manifest.version.replaceAll('.','\\.')));
  const custom = '# Existing app policies\n\nKeep this exact text.\n\n' + beforeInstall;
  await writeFile(join(app,'AGENTS.md'),custom);
  appRun(app,['exec','--offline','--',identity.cliName,'init']);
  const initialized = await readFile(join(app,'AGENTS.md'),'utf8'); assert.equal(initialized,custom);
  appRun(app,['exec','--offline','--',identity.cliName,'init']); assert.equal(await readFile(join(app,'AGENTS.md'),'utf8'),initialized);
  assert.equal(await readFile(join(app,lockfile),'utf8'),locked,'Onboarding must not change existing resolutions');
  await assert.rejects(lstat(join(app,otherLock)),{code:'ENOENT'});
  assert.equal(JSON.parse(appRun(app,['exec','--offline','--',identity.cliName,'check','src','--json']).stdout).ok,true);
  // The compiler is reusable in Node, while runtime import requires no Node-only tooling.
  const compiler = await import(pathToFileURL(join(installed,'dist/lib/language/index.js')).href);
  const sourcePath = join(app,`src/Counter${identity.sourceExtension}`); const original = await readFile(sourcePath,'utf8');
  assert.ok(compiler.compile(original,sourcePath).code);
  console.log('Installed docs, init, local CLI and compiler checks passed.');
  browser = await chromium.launch({headless:true}); const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror',error => pageErrors.push(error.message));
  page.on('console',message=>browserLog.push(message.text()));
  const url = await startServer(app,false); const pid = server!.pid;
  const first=page.getByRole('button').nth(0),second=page.getByRole('button').nth(1);
  await page.goto(url); await page.getByRole('button',{name:'First: 0',exact:true}).waitFor();
  await first.click(); assert.equal(await first.textContent(),'First: 1');assert.equal(await second.textContent(),'Second: 0');
  assert.equal(await page.locator('.counter').nth(0).getAttribute('class'),'counter compact');
  assert.equal(await first.evaluate(e=>getComputedStyle(e).color),'rgb(20, 80, 160)');
  // Editing source, not the config or process: this must refresh and reset local state.
  await writeFile(sourcePath,original.replace('text=label','text="Updated: " + label'));
  await page.getByRole('button',{name:'Updated: First: 0',exact:true}).waitFor(); assert.equal(server!.pid,pid);
  assert.equal(await second.textContent(),'Updated: Second: 0');
  console.log('Source edit triggered browser reload and reset state.');
  const cssPath=join(app,'src/Counter.css');const css=await readFile(cssPath,'utf8');
  await writeFile(cssPath,css.replace('20, 80, 160','160, 40, 20'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('button')!).color==='rgb(160, 40, 20)');
  await writeFile(cssPath,css);
  const broken = original.replace('str(count)','str(missing)');
  await writeFile(sourcePath,broken);
  await page.waitForFunction(() => {
    const text = document.querySelector('vite-error-overlay')?.shadowRoot?.textContent ?? '';
    return text.includes('Unknown state') && /Counter[^\n]*:6:56/.test(text);
  });
  console.log('Located syntax error appeared in the browser overlay.');
  const failed = appRun(app,['exec','--offline','--',identity.cliName,'check','src','--json'],false);
  assert.equal(failed.status,1); assert.equal(JSON.parse(failed.stdout).diagnostics[0].line,6);
  await writeFile(sourcePath,original.replace('text=label','text="Recovered: " + label'));
  await page.getByRole('button',{name:'Recovered: First: 0',exact:true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('vite-error-overlay'));
  await first.click(); assert.equal(await first.textContent(),'Recovered: First: 1');assert.equal(await second.textContent(),'Recovered: Second: 0');
  assert.equal(server!.pid,pid,'Error recovery must not restart the server');
  // Also recover when the very first request begins with a syntax error.
  await writeFile(sourcePath,broken);
  // A failed dependency can finish before Vite's websocket connects. Wait for
  // the fresh page's connection before asking it to receive an edit notification.
  const connected = page.waitForEvent('websocket').then(socket=>socket.waitForEvent('framereceived'));
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('vite-error-overlay'));
  await connected;
  await writeFile(sourcePath,original);
  await page.getByRole('button',{name:'First: 0',exact:true}).waitFor();
  await page.goto('about:blank'); await stopServer();
  appRun(app,['run','check']); appRun(app,['run','build']);
  const assets = await readdir(join(app,'dist/assets'));
  for (const name of assets.filter(name => name.endsWith('.js'))) {
    const js = await readFile(join(app,'dist/assets',name),'utf8');
    assert.doesNotMatch(js,/node:fs|node:path|readFile|process\.argv|agentBlock|compile\(source|createServer|initialize\(/,'Browser bundle must not contain Node-only tooling');
  }
  const production = await startServer(app,true); await page.goto(production);
  await page.getByRole('button',{name:'First: 0',exact:true}).waitFor(); await first.click();
  assert.equal(await first.textContent(),'First: 1');assert.equal(await second.textContent(),'Second: 0');
  assert.equal(await first.evaluate(e=>getComputedStyle(e).color),'rgb(20, 80, 160)');
  assert.deepEqual(pageErrors,[],'Generated app must have no uncaught browser exceptions');
  console.log(`External ${manager} tarball app passed: ${identity.createPackageName}, local ${identity.cliName}, installed docs/init, full reload, located errors/recovery, production and browser bundle boundaries.`);
} catch (error) {
  console.error('External integration failed:',error);
  console.error('Browser console:',browserLog.slice(-20).join('\n'));
  for (const page of browser?.contexts().flatMap(context => context.pages()) ?? []) console.error('Browser failure detail:',await page.evaluate(() => document.querySelector('vite-error-overlay')?.shadowRoot?.textContent ?? document.body.innerText).catch(() => 'Page unavailable'));
  throw error;
}
finally {
  await browser?.close(); await stopServer();
  // Only remove the exact directory returned by mkdtemp above.
  await rm(temp,{recursive:true,force:true,maxRetries:20,retryDelay:200});
}
