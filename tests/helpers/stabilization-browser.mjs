// Diagnostic instrumentation only; production latency is measured separately.
export async function profile({runtimeSource,modules}) {
  const NativeSet=globalThis.Set,NativeMap=globalThis.Map,labels=new WeakMap(),stats=Object.create(null),stack=[];
  let phase='import';
  const count=(name,amount=1)=>{const key=phase+':'+name;stats[key]=(stats[key]??0)+amount;};
  globalThis.__qbProbe={enter(name){count('calls.'+name);stack.push({name,start:performance.now(),children:0});},exit(){const frame=stack.pop(),elapsed=performance.now()-frame.start;count('selfMs.'+frame.name,elapsed-frame.children);if(stack.length)stack[stack.length-1].children+=elapsed;}};
  globalThis.Set=class extends NativeSet {
    constructor(values){super(values);const label=stack.at(-1)?.name??'outside';labels.set(this,label);count('new.Set.'+label);}
    add(value){count('Set.add.'+(labels.get(this)??'constructor'));return super.add(value);}
    delete(value){count('Set.delete.'+(labels.get(this)??'constructor'));return super.delete(value);}
  };
  globalThis.Map=class extends NativeMap {constructor(values){super(values);count('new.Map.'+(stack.at(-1)?.name??'outside'));}};
  const urls=[];let dispose;
  try{
    const load=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
    const runtime=await import(load(runtimeSource)),resolved=Object.create(null);let root;
    for(const [name,source] of Object.entries(modules)){let code=source;for(const [path,url] of Object.entries(resolved))code=code.split(JSON.stringify(path)).join(JSON.stringify(url));resolved[name]=load(code);if(name==='./Bench.qb')root=await import(resolved[name]);}
    const host=document.createElement('main');document.body.append(host);
    phase='mount';dispose=root.default(host,runtime);
    const buttons=Object.fromEntries([...host.querySelectorAll('button')].map(button=>[button.textContent,button]));
    phase='update';for(let i=0;i<100;i++)buttons.Update.click();
    if(buttons.Chain){phase='chain';for(let i=0;i<100;i++)buttons.Chain.click();}if(buttons.Pull){phase='pull';for(let i=0;i<100;i++)buttons.Pull.click();}
    phase='reorder';buttons.First.click();
    phase='cleanup';dispose();host.remove();return stats;
  }finally{dispose?.();globalThis.Set=NativeSet;globalThis.Map=NativeMap;delete globalThis.__qbProbe;urls.forEach(url=>URL.revokeObjectURL(url));}
}

export async function measure({runtimeSource,appSource,size,samples,events,warmups}) {
  const urls=[runtimeSource,appSource].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
  let dispose,listeners=0,errors=0;const handler=event=>{errors++;event.preventDefault();};window.addEventListener('error',handler);const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener=function(...args){if(this instanceof Element)listeners++;return add.apply(this,args);};
  EventTarget.prototype.removeEventListener=function(...args){if(this instanceof Element)listeners--;return remove.apply(this,args);};
  try{
    const moduleStarted=performance.now(),runtime=await import(urls[0]),root=await import(urls[1]),moduleLoadMs=performance.now()-moduleStarted;
    const host=document.createElement('main');document.body.append(host);const mountMs=[],disposeMs=[];
    for(let i=0;i<warmups+samples;i++){const start=performance.now();dispose=root.default(host,runtime);const mounted=performance.now();dispose();const ended=performance.now();if(i>=warmups){mountMs.push(mounted-start);disposeMs.push(ended-mounted);}}
    dispose=root.default(host,runtime);const rows=[...host.querySelectorAll('li')],elements=host.querySelectorAll('*').length,buttons=Object.fromEntries([...host.querySelectorAll('button')].map(button=>[button.textContent,button]));
    const firstSection=host.querySelector('section'),childButton=rows[0]?.querySelector('button')??firstSection?.querySelector('button');childButton?.click();
    const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,characterData:true,childList:true});
    const updateMs=[],chainMs=[],pullMs=[],reorderMs=[];
    for(let i=0;i<warmups;i++)for(let j=0;j<events;j++)buttons.Update.click();observer.takeRecords();
    for(let sample=0;sample<samples;sample++){const start=performance.now();for(let i=0;i<events;i++)buttons.Update.click();updateMs.push(performance.now()-start);observer.takeRecords();}
    if(buttons.Chain){for(let i=0;i<warmups;i++)for(let j=0;j<events;j++)buttons.Chain.click();observer.takeRecords();for(let sample=0;sample<samples;sample++){const start=performance.now();for(let i=0;i<events;i++)buttons.Chain.click();chainMs.push(performance.now()-start);observer.takeRecords();}}
    if(buttons.Pull){for(let i=0;i<warmups;i++)for(let j=0;j<events;j++)buttons.Pull.click();observer.takeRecords();for(let sample=0;sample<samples;sample++){const start=performance.now();for(let i=0;i<events;i++)buttons.Pull.click();pullMs.push(performance.now()-start);observer.takeRecords();}}
    for(let i=0;i<warmups;i++){buttons.First.click();buttons.Last.click();}observer.takeRecords();
    for(let sample=0;sample<samples;sample++){const start=performance.now();buttons.First.click();reorderMs.push(performance.now()-start);buttons.Last.click();observer.takeRecords();}
    buttons.Update.click();const mutations=observer.takeRecords();
    const identity=[...host.querySelectorAll('li')].every((row,index)=>row===rows[index])&&host.querySelector('section')===firstSection&&(!childButton||host.contains(childButton)&&firstSection.querySelector('button')===childButton&&childButton.textContent==='1');
    const isolated={text:mutations.filter(record=>record.type==='characterData').length,structural:mutations.filter(record=>record.type==='childList').length};
    observer.disconnect();
    if(errors)throw new Error('Unexpected application errors: '+errors);
    const expectedChain=3+4*(warmups+samples)*events;if(buttons.Chain&&host.querySelector('p')?.textContent!==String(expectedChain))throw new Error('Computed chain benchmark value mismatch');
    const selected=3*(warmups+samples)*events;if(buttons.Pull&&host.querySelectorAll('p')[1]?.textContent!==`Selected: ${selected}:${selected}`)throw new Error('Dynamic computed pull benchmark value mismatch');
    dispose();const remaining=host.childNodes.length;host.remove();
    return {size,elements,moduleLoadMs,mountMs,disposeMs,updateMs,chainMs,pullMs,reorderMs,identity,isolated,remaining,listeners};
  }finally{dispose?.();window.removeEventListener('error',handler);EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;urls.forEach(url=>URL.revokeObjectURL(url));}
}

export async function retain({runtimeSource,appSource,cycles=5}) {
  const urls=[runtimeSource,appSource].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
  try{const runtime=await import(urls[0]),root=await import(urls[1]),handles=[],nodes=[],props=[],targets=[],instances=[];
    for(let i=0;i<cycles;i++){const host=document.createElement('main'),input={title:'Products'};document.body.append(host);const dispose=root.default(host,runtime,input);nodes.push(new WeakRef(host.querySelector('li')));props.push(new WeakRef(input));targets.push(new WeakRef(host));
      const effects=new Set();dispose.collect?.(effects);let instance;for(const effect of effects)for(const source of effect.dependencies){const value=Array.isArray(source.value)?source.value[0]:source.value;if(value&&typeof value==='object'&&value.__class){instance=value;break;}}if(instance)instances.push(new WeakRef(instance));
      host.querySelector('button').click();dispose();host.remove();handles.push(dispose);}
    globalThis.__stabilizationRetention={handles,nodes,props,targets,instances};
    let heap={supported:false,reason:'Firefox exposes neither performance.memory nor measureUserAgentSpecificMemory',usedJSHeapSize:null};
    if(typeof performance.measureUserAgentSpecificMemory==='function'){try{heap={supported:true,bytes:(await performance.measureUserAgentSpecificMemory()).bytes};}catch(error){heap={supported:false,reason:error.message};}}
    else if(performance.memory?.usedJSHeapSize!==undefined)heap={supported:true,usedJSHeapSize:performance.memory.usedJSHeapSize};
    return heap;
  }finally{urls.forEach(url=>URL.revokeObjectURL(url));}
}
