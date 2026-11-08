// npm lifecycle entry point. Never executes package-manager commands or approves scripts.
import {readdir,readFile,realpath,lstat,mkdir,open,unlink,rmdir} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {helloWorldFiles} from './project.mjs';
import {validateIdentity} from './identity.mjs';

const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;

// npm unpacks the dependency tree before running its install scripts. A hoisted
// transitive copy has an incoming dependency in that tree, even before npm saves
// the new application's package.json. Unknown/linked trees fail closed.
async function hasDependent(modules,name){
  const pending=[modules];let count=0;
  while(pending.length){
    const directory=pending.pop();
    for(const entry of await readdir(directory,{withFileTypes:true})){
      if(entry.name.startsWith('.'))continue;
      const path=join(directory,entry.name);
      if(entry.isSymbolicLink())return true;
      if(!entry.isDirectory())continue;
      if(entry.name.startsWith('@')){pending.push(path);continue;}
      if(++count>2000)return true;
      let manifest;
      try{manifest=JSON.parse(await readFile(join(path,'package.json'),'utf8'));}
      catch(error){
        // npm can leave empty directories for platform-excluded optional packages.
        if(error.code==='ENOENT'&&(await readdir(path)).length===0)continue;
        throw error;
      }
      if(['dependencies','optionalDependencies','peerDependencies'].some(kind=>Object.hasOwn(manifest[kind]??{},name)))return true;
      try{const nested=join(path,'node_modules');const stat=await lstat(nested);if(stat.isSymbolicLink())return true;if(stat.isDirectory())pending.push(nested);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
  return false;
}

async function install(){
  const initial=process.env.INIT_CWD,prefix=process.env.npm_config_local_prefix;
  if(!initial||!prefix||process.env.npm_command!=='install'||process.env.npm_config_global==='true')return;
  const root=await realpath(initial),local=await realpath(prefix);
  if(!samePath(root,local)||root.split(sep).some(part=>part.toLowerCase()==='node_modules'))return;
  const own=await realpath(fileURLToPath(new URL('../',import.meta.url)));
  const identity=validateIdentity(JSON.parse(await readFile(new URL('../identity.json',import.meta.url),'utf8')));
  const packagePath=join(root,'node_modules',identity.packageName);
  if(!samePath(resolve(packagePath),own)||(await lstat(packagePath)).isSymbolicLink())return;
  if((await readdir(root)).some(name=>name!=='node_modules'))return;
  if(await hasDependent(join(root,'node_modules'),identity.packageName))return;
  const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  // --omit=optional may intentionally omit the dev-server dependency.
  try{createRequire(import.meta.url).resolve('vite/package.json');}catch{return;}
  const files=helloWorldFiles(identity,manifest.version),created=[],directories=[];
  // Recheck after inspecting the tree. Every file and directory uses exclusive creation.
  if((await readdir(root)).some(name=>name!=='node_modules'))return;
  try{
    for(const [relative,text] of Object.entries(files)){
      const path=join(root,relative),parent=dirname(path);
      if(parent!==root&&!directories.includes(parent)){await mkdir(parent);directories.push(parent);}
      const handle=await open(path,'wx');
      try{const stat=await handle.stat();created.push({path,text,ino:stat.ino,dev:stat.dev});await handle.writeFile(text,'utf8');}finally{await handle.close();}
    }
    console.log(`${identity.displayName}: created Hello World. Run npm run dev.`);
  }catch(error){
    // Remove only our unchanged files; retain anything another process changed.
    for(const file of created.reverse()){
      try{const stat=await lstat(file.path);if(stat.isFile()&&stat.ino===file.ino&&stat.dev===file.dev&&(await readFile(file.path,'utf8'))===file.text)await unlink(file.path);}catch{}
    }
    for(const directory of directories.reverse())try{await rmdir(directory);}catch{}
    throw error;
  }
}

install().catch(error=>{console.warn(`Qbits: automatic Hello World setup skipped: ${error.message}`);});
