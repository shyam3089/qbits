// Browser-only benchmark. No instrumentation is shipped in production packages.
export async function measure({runtimeSource,modules,size,samples,events}) {
  const urls=[];
  const url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  const runtime=await import(url(runtimeSource)),childURL=url(modules.child);
  const root=await import(url(modules.root.replace(JSON.stringify('./Child.qb'),JSON.stringify(childURL))));
  const host=document.createElement('main');document.body.append(host);
  let listeners=0,dispose;
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener=function(...args){if(this instanceof Element)listeners++;return add.apply(this,args);};
  EventTarget.prototype.removeEventListener=function(...args){if(this instanceof Element)listeners--;return remove.apply(this,args);};
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  try {
    const started=performance.now();dispose=root.default(host,runtime);
    const mountMs=performance.now()-started,elementCount=host.querySelectorAll('*').length;
    const countNodes=node=>1+[...node.childNodes].reduce((total,child)=>total+countNodes(child),0);
    const domNodeCount=countNodes(host)-1;
    const controls=Object.fromEntries([...host.querySelectorAll('button')].map(button=>[button.textContent,button]));
    const rows=[...host.querySelectorAll('li')],child=host.querySelector('section'),childButton=child.querySelector('button');
    childButton.click();
    const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,childList:true,characterData:true});
    controls.Update.click();const isolated=observer.takeRecords();
    const isolatedMutations={text:isolated.filter(record=>record.type==='characterData').length,structural:isolated.filter(record=>record.type==='childList').length};
    for(let i=0;i<30;i++)controls.Update.click();
    const updateBatches=[];
    for(let sample=0;sample<samples;sample++){const start=performance.now();for(let i=0;i<events;i++)controls.Update.click();updateBatches.push(performance.now()-start);observer.takeRecords();}
    controls.First.click();controls.Last.click();observer.takeRecords();
    const reorders=[];
    for(let sample=0;sample<samples;sample++){const start=performance.now();controls.First.click();reorders.push(performance.now()-start);controls.Last.click();observer.takeRecords();}
    controls.First.click();const moved=observer.takeRecords();controls.Last.click();observer.takeRecords();
    const reorderMutations={inserted:moved.reduce((n,r)=>n+r.addedNodes.length,0),removed:moved.reduce((n,r)=>n+r.removedNodes.length,0),text:moved.filter(r=>r.type==='characterData').length};
    controls.Append.click();controls.Remove.click();observer.takeRecords();
    const identity=[...host.querySelectorAll('li')].every((node,index)=>node===rows[index])&&host.querySelector('section')===child&&childButton.textContent==='1';
    dispose();dispose();const disposedNodes=host.childNodes.length;observer.disconnect();
    const cycleMs=[];
    for(let i=0;i<3;i++){const start=performance.now();dispose=root.default(host,runtime);dispose();cycleMs.push(performance.now()-start);}
    const updateBatchMedianMs=median(updateBatches);
    return {size,elementCount,domNodeCount,samples,eventsPerBatch:events,mountMs,updateBatchMs:updateBatches,updateBatchMedianMs,updateMicroseconds:updateBatchMedianMs*1000/events,updatesPerSecond:updateBatchMedianMs?events*1000/updateBatchMedianMs:null,reorderMs:reorders,reorderMedianMs:median(reorders),cycleMedianMs:median(cycleMs),isolatedMutations,reorderMutations,identity,disposedNodes,liveListeners:listeners};
  } finally {dispose?.();host.remove();EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;urls.forEach(value=>URL.revokeObjectURL(value));}
}

export async function retain({runtimeSource,modules}) {
  const urls=[];const url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  try {
    const runtime=await import(url(runtimeSource)),childURL=url(modules.child),root=await import(url(modules.root.replace(JSON.stringify('./Child.qb'),JSON.stringify(childURL))));
    const handles=[],props=[],nodes=[];
    for(let i=0;i<5;i++){const host=document.createElement('main'),input={title:'sample'};document.body.append(host);const dispose=root.default(host,runtime,input);props.push(new WeakRef(input));nodes.push(new WeakRef(host.querySelector('li')));dispose();host.remove();handles.push(dispose);}
    globalThis.__phase3Retention={handles,props,nodes};
  }finally{urls.forEach(value=>URL.revokeObjectURL(value));}
}
