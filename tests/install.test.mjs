// Packed installation regression. Set QBITS_INSTALL_NPM_CLI to a lifecycle-enabled
// npm CLI and QBITS_INSTALL_TMP to a directory outside any ancestor npm project.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {firefox} from 'playwright';

test('packed direct installation scaffolds safely and starts Hello World', {timeout:180000}, async()=>{
  const cli=process.env.QBITS_INSTALL_NPM_CLI;
  assert.ok(cli,'Set QBITS_INSTALL_NPM_CLI to the npm CLI under test');
  const base=resolve(process.env.QBITS_INSTALL_TMP??tmpdir());
  for(let path=base;;path=dirname(path)){
    assert.ok(!(await readdir(path)).includes('package.json'),`Ancestor npm project at ${path}; choose another test directory`);
    if(dirname(path)===path)break;
  }
  const root=await mkdtemp(join(base,'qbits-install-'));
  console.log(`Installation fixtures: ${root}`);
  function npm(cwd,args,npmCli=cli){
    const result=spawnSync(process.execPath,[npmCli,...args],{cwd,encoding:'utf8',timeout:60000,windowsHide:true});
    assert.ifError(result.error);
    assert.equal(result.status,0,`${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  const pack=JSON.parse(npm(resolve('.'),['pack','--ignore-scripts','--json','--pack-destination',root]))[0];
  for(const name of ['tooling/install.mjs','tooling/project.mjs','identity.json','dist/lib/runtime/index.js'])assert.ok(pack.files.some(file=>file.path===name),name);
  const tar=join(root,pack.filename),args=['install',tar,'--offline','--no-audit','--no-fund'];
  const fresh=join(root,'fresh');await mkdir(fresh);npm(fresh,args);
  for(const name of ['src/App.qb','src/main.ts','vite.config.ts','index.html'])assert.ok((await readFile(join(fresh,name),'utf8')).length,name);
  assert.match(await readFile(join(fresh,'src/App.qb'),'utf8'),/Hello World/);
  const manifest=JSON.parse(await readFile(join(fresh,'package.json'),'utf8'));
  assert.match(manifest.scripts.dev,/vite/);
  const app=await readFile(join(fresh,'src/App.qb'),'utf8');npm(fresh,args);
  assert.equal(await readFile(join(fresh,'src/App.qb'),'utf8'),app);
  const server=spawn(process.execPath,[cli,'run','dev','--','--port','5198','--strictPort'],{cwd:fresh,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
  let browser;
  try{
    for(let attempt=0;attempt<100&&!output.includes('http://127.0.0.1:5198');attempt++)await new Promise(done=>setTimeout(done,100));
    assert.match(output,/http:\/\/127\.0\.0\.1:5198/,output);
    browser=await firefox.launch({headless:true});const page=await browser.newPage();
    await page.goto('http://127.0.0.1:5198');
    await page.locator('#app h1').waitFor();assert.equal(await page.locator('#app h1').textContent(),'Hello World');
  }finally{
    await browser?.close();
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else server.kill();
  }
  const existing=join(root,'existing');await mkdir(existing);
  const original=JSON.stringify({name:'existing',private:true,scripts:{dev:'echo preserved'}});
  await writeFile(join(existing,'package.json'),original);await writeFile(join(existing,'index.html'),'preserved');npm(existing,args);
  assert.equal(await readFile(join(existing,'index.html'),'utf8'),'preserved');
  assert.equal(JSON.parse(await readFile(join(existing,'package.json'),'utf8')).scripts.dev,'echo preserved');
  assert.ok(!(await readdir(existing)).includes('src'));assert.ok(!(await readdir(existing)).includes('vite.config.ts'));
  const wrapper=join(root,'wrapper');await mkdir(wrapper);
  await writeFile(join(wrapper,'package.json'),JSON.stringify({name:'qbits-transitive-fixture',version:'1.0.0',dependencies:{qbits:`file:${tar.replaceAll('\\','/')}`}}));
  const wrapped=JSON.parse(npm(wrapper,['pack','--ignore-scripts','--json','--pack-destination',root]))[0];
  const transitive=join(root,'transitive');await mkdir(transitive);npm(transitive,['install',join(root,wrapped.filename),'--offline','--no-audit','--no-fund']);
  assert.ok(!(await readdir(transitive)).includes('src'));assert.equal(JSON.parse(await readFile(join(transitive,'package.json'),'utf8')).scripts,undefined);
  const blocked=join(root,'scripts-disabled');await mkdir(blocked);npm(blocked,[...args,'--ignore-scripts']);
  assert.ok(!(await readdir(blocked)).includes('src'));
  assert.equal(JSON.parse(await readFile(join(blocked,'package.json'),'utf8')).scripts,undefined);
});
