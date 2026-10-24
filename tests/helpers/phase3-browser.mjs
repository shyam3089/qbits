// Firefox-only failure injection and effect-count probes. Never shipped as runtime code.
export async function verify({runtime,code,child}) {
  const urls=[],url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  const api=await import(url(runtime)),childModule=await import(url(child));
  const {model}=await import(url(code.replace(JSON.stringify('./Child.qb'),JSON.stringify(url(child)))));
  let failMount=false,failCleanup=false,listeners=0,errors=0;
  const failures=[],check=(condition,message)=>{if(!condition)failures.push(message);};
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener=function(...args){if(this instanceof Element)listeners++;return add.apply(this,args);};
  EventTarget.prototype.removeEventListener=function(...args){if(this instanceof Element)listeners--;return remove.apply(this,args);};
  const onError=event=>{errors++;event.preventDefault();};window.addEventListener('error',onError);
  const host=document.createElement('main');document.body.append(host);let dispose;
  const mount=(target,runtime,props)=>{if(failMount)throw new Error('Injected mount failure');const dispose=childModule.default(target,runtime,props);const wrapped=()=>{dispose();if(failCleanup)throw new Error('Injected cleanup failure');};wrapped.refresh=dispose.refresh;wrapped.collect=dispose.collect;return wrapped;};
  let evaluations=0;const expression=model.classes.Item.computed.doubled,left=expression.left;Object.defineProperty(expression,'left',{get(){evaluations++;return left;}});
  try {
    dispose=api.mountComponent(host,model,[mount]);
    const click=text=>[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();
    const rows=[...host.querySelectorAll('ul li')],sections=[...host.querySelectorAll('ul section')],unaffected=host.querySelector('h2');
    sections[0].querySelector('button').click();
    const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,childList:true,characterData:true});
    const before=host.textContent,beforeListeners=listeners;
    click('Duplicate');click('Collision');
    check(host.textContent===before&&observer.takeRecords().length===0,'invalid keys changed DOM');
    check([...host.querySelectorAll('ul li')].every((node,i)=>node===rows[i]),'invalid keys changed identity');
    failMount=true;click('Append');click('Show');failMount=false;
    check(host.textContent===before&&listeners===beforeListeners&&observer.takeRecords().length===0,'mount failure changed ownership or DOM');
    const insert=Node.prototype.insertBefore;let failed=false;
    Node.prototype.insertBefore=function(...args){if(!failed&&this instanceof HTMLUListElement){failed=true;throw new Error('Injected DOM failure');}return insert.apply(this,args);};
    try{click('Move');}finally{Node.prototype.insertBefore=insert;}
    check(host.textContent===before&&[...host.querySelectorAll('ul li')].every((node,i)=>node===rows[i]),'DOM failure did not restore identity');observer.takeRecords();
    const hidden=[...host.querySelectorAll('p')].find(node=>node.textContent==='Hidden');failed=false;
    Node.prototype.insertBefore=function(...args){if(!failed&&this===host){failed=true;throw new Error('Injected branch DOM failure');}return insert.apply(this,args);};
    try{click('Show');}finally{Node.prototype.insertBefore=insert;}
    check(host.textContent===before&&host.contains(hidden)&&listeners===beforeListeners,'conditional DOM failure did not restore owned branch');observer.takeRecords();
    evaluations=0;click('Update');
    // Observe one operand read per computation, independent of interpreter dispatch;
    // despite validation, two text bindings and a propagated child prop read.
    check(evaluations===1,'class computed evaluated more than once: '+evaluations);
    check(host.querySelector('p').textContent==='7'&&rows[0].querySelector('span').textContent==='4','state or computed subscriptions failed to roll back');
    check(sections[0].querySelector('button').textContent==='1'&&host.querySelector('h2')===unaffected,'unrelated instance recreated');
    check(observer.takeRecords().filter(record=>record.type==='characterData').length===4,'batch had intermediate renders');
    for(let i=0;i<200;i++)click('Update');
    check(host.querySelector('p').textContent==='807'&&rows[0].querySelector('span').textContent==='804','rapid batch updates failed');
    click('Append');click('Move');check(host.querySelector('ul li')===rows[1],'post-failure reconciliation lost identity');
    click('Show');const input=host.querySelector('input');input.value='<img src=x onerror=alert(1)>';input.dispatchEvent(new Event('input',{bubbles:true}));
    check(!host.querySelector('img')&&host.querySelector('p:nth-of-type(2)').textContent===input.value,'event or text safety failed');
    const detached=rows[1].querySelector('button');failCleanup=true;click('Remove');failCleanup=false;
    check(host.querySelectorAll('ul li').length===2&&host.querySelectorAll('ol li').length===2,'cleanup failure left partial reconciliation');
    detached.click();
    click('Hide');click('Update');check(!host.querySelector('main > section'),'conditional cleanup failed');
    observer.disconnect();const oldButton=rows[0].querySelector('button');dispose();dispose();oldButton.click();
    check(host.childNodes.length===0,'dispose left owned DOM');
    return {failures,errors,listeners,remaining:host.childNodes.length,rapidUpdates:200};
  } finally {failCleanup=false;dispose?.();host.remove();window.removeEventListener('error',onError);EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;urls.forEach(value=>URL.revokeObjectURL(value));}
}
export async function retainFailures({runtime,code,child}) {
  const urls=[],url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  const onError=event=>event.preventDefault();window.addEventListener('error',onError);
  try{
    const api=await import(url(runtime)),childURL=url(child),root=await import(url(code.replace(JSON.stringify('./Child.qb'),JSON.stringify(childURL)))),handles=[],nodes=[],props=[];
    for(let i=0;i<5;i++){const host=document.createElement('main'),input={};document.body.append(host);const dispose=root.default(host,api,input);nodes.push(new WeakRef(host.querySelector('li')));props.push(new WeakRef(input));host.querySelector('button').click();dispose();host.remove();handles.push(dispose);}
    globalThis.__failedTransactions={handles,nodes,props};
  }finally{window.removeEventListener('error',onError);urls.forEach(value=>URL.revokeObjectURL(value));}
}
export async function failClosed({runtime,code}) {
  const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
  const api=await import(urls[0]),root=await import(urls[1]),host=document.createElement('main');document.body.append(host);
  let errors=0,listeners=0;const onError=event=>{errors++;event.preventDefault();},add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,insert=Node.prototype.insertBefore;
  window.addEventListener('error',onError);
  EventTarget.prototype.addEventListener=function(...args){if(this instanceof Element)listeners++;return add.apply(this,args);};
  EventTarget.prototype.removeEventListener=function(...args){if(this instanceof Element)listeners--;return remove.apply(this,args);};
  let dispose;
  try{
    dispose=root.default(host,api);const button=host.querySelector('button');
    Node.prototype.insertBefore=function(...args){if(this instanceof HTMLUListElement)throw new Error('Persistent host DOM failure');return insert.apply(this,args);};
    button.click();button.click();dispose();dispose();return {errors,listeners,nodes:host.childNodes.length};
  }finally{Node.prototype.insertBefore=insert;dispose?.();EventTarget.prototype.addEventListener=add;EventTarget.prototype.removeEventListener=remove;window.removeEventListener('error',onError);host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
}
