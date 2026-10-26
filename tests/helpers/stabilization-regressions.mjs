export async function verifyEdges({runtime,code}) {
  const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),failures=[];
  const api=await import(urls[0]),root=await import(urls[1]),host=document.createElement('main');document.body.append(host);
  let errors=0;const onError=event=>{errors++;event.preventDefault();};window.addEventListener('error',onError);
  const dispose=root.default(host,api),rows=[...host.querySelectorAll('li')],insert=Node.prototype.insertBefore;
  const click=text=>[...host.querySelectorAll('button')].find(button=>button.textContent===text).click();
  const check=(values,message)=>{if(JSON.stringify([...host.querySelectorAll('p')].map(node=>node.textContent))!==JSON.stringify(values))failures.push(message);};
  const fail=()=>{let failed=false;Node.prototype.insertBefore=function(...args){if(!failed&&this instanceof HTMLUListElement){failed=true;throw new Error('Recoverable reorder failure');}return insert.apply(this,args);};try{click('Swap');}finally{Node.prototype.insertBefore=insert;}};
  try{
    fail();check(['0','2'],'first rollback');click('Original');check(['1','4'],'original subscription after rollback');click('Replacement');check(['1','4'],'stale replacement subscription');
    fail();check(['1','4'],'second rollback');click('Original');check(['2','6'],'repeated dependency rollback');
    click('Swap');check(['1','4'],'successful dependency change');click('Original');check(['1','4'],'old dependency still active');click('Replacement');check(['2','6'],'new dependency missing');
    if(host.querySelectorAll('li')[0]!==rows[1]||host.querySelectorAll('li')[1]!==rows[0])failures.push('retained map reorder identity');
    dispose();return {failures,errors,remaining:host.childNodes.length};
  }finally{Node.prototype.insertBefore=insert;dispose();host.remove();window.removeEventListener('error',onError);urls.forEach(url=>URL.revokeObjectURL(url));}
}

export async function verifyChains({runtime,code}) {
  const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),api=await import(urls[0]),root=await import(urls[1]),calls={left:0,right:0,total:0};
  for(const [name,expression] of Object.entries(root.model.computed)){const left=expression.left;Object.defineProperty(expression,'left',{get(){calls[name]++;return left;}});expression.dependencies=[['staleHint']];}
  const host=document.createElement('main');document.body.append(host);const dispose=root.default(host,api),observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,characterData:true});
  try{const result={};for(const [index,name] of ['sequential','batched'].entries()){for(const key of Object.keys(calls))calls[key]=0;host.querySelectorAll('button')[index].click();result[name]={values:[...host.querySelectorAll('p')].map(node=>node.textContent),calls:{...calls},writes:observer.takeRecords().length};}dispose();result.remaining=host.childNodes.length;return result;}
  finally{observer.disconnect();dispose();host.remove();urls.forEach(url=>URL.revokeObjectURL(url));}
}

export async function verifyInitialProps({runtime,parent,child}) {
  const urls=[],url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  try{const api=await import(url(runtime)),childURL=url(child),childModule=await import(childURL),{model}=await import(url(parent.replace(JSON.stringify('./Child.qb'),JSON.stringify(childURL)))),host=document.createElement('main');document.body.append(host);
    const customMount=(target,runtime,props)=>{const dispose=childModule.default(target,runtime,props);host.querySelector('button').click();return dispose;};
    const dispose=api.mountComponent(host,model,[customMount]);const result={child:host.querySelector('span').textContent,parent:host.querySelector('p').textContent};dispose();result.remaining=host.childNodes.length;host.remove();return result;
  }finally{urls.forEach(value=>URL.revokeObjectURL(value));}
}

export async function verifyBlocks({runtime,code}) {
  const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),api=await import(urls[0]),root=await import(urls[1]),host=document.createElement('main');document.body.append(host);
  let errors=0;const handler=event=>{errors++;event.preventDefault();};window.addEventListener('error',handler);
  const original=root.model.classes.Item.actions.bump,statements=root.model.roots[0].handler.statements,call=statements[1],dispose=root.default(host,api),button=host.querySelector('button'),observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,characterData:true,childList:true});
  try{
    root.model.classes.Item.actions.bump={length:0};button.click();call.method='toString';button.click();
    const failedValues=[...host.querySelectorAll('p')].map(node=>node.textContent),writesOnFailure=observer.takeRecords().length;
    root.model.classes.Item.actions.bump=original;call.method='bump';button.click();const validValues=[...host.querySelectorAll('p')].map(node=>node.textContent);dispose();return {errors,failedValues,writesOnFailure,validValues,remaining:host.childNodes.length};
  }finally{observer.disconnect();dispose();host.remove();window.removeEventListener('error',handler);urls.forEach(url=>URL.revokeObjectURL(url));}
}

export async function verifyDynamicChain({runtime,code}) {
  const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}))),api=await import(urls[0]),root=await import(urls[1]);
  const expression=root.model.computed.total,left=expression.left,constructor=root.model.computed.meter,args=constructor.arguments;let meter=0,total=0;
  Object.defineProperty(expression,'left',{get(){total++;return left;}});Object.defineProperty(constructor,'arguments',{get(){meter++;return args;}});
  const host=document.createElement('main');document.body.append(host);const dispose=root.default(host,api),results=[];
  try{for(let i=0;i<2;i++){meter=0;total=0;host.querySelector('button').click();results.push({values:[...host.querySelectorAll('p')].map(node=>node.textContent),meter,total});}return results;}
  finally{dispose();host.remove();urls.forEach(url=>URL.revokeObjectURL(url));}
}
