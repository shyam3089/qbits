// Firefox-only correctness probes; never included in production output.

export async function verifyDependentOverflow({runtime,child,parent,keyed}) {
  const urls=[];
  const url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  try {
    const api=await import(url(runtime)),childURL=url(child);
    const sources=[parent.replace(JSON.stringify('./Child.qb'),JSON.stringify(childURL)),keyed];
    const failures=[];let checked=0;
    for(const source of sources)for(const direction of [1,-1]){
      const {default:mount}=await import(url(source)),host=document.createElement('main');document.body.append(host);
      const errors=[],onError=event=>{errors.push(event.message);event.preventDefault();};window.addEventListener('error',onError);
      const dispose=mount(host,api,{start:direction*(Number.MAX_SAFE_INTEGER-1),step:direction});
      const before=host.textContent,retained=[...host.querySelectorAll('p,span')],buttons=host.querySelectorAll('button');
      const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,childList:true,characterData:true});
      buttons[0].click();buttons[0].click();
      if(host.textContent!==before||errors.length!==2||observer.takeRecords().length||retained.some((node,index)=>host.querySelectorAll('p,span')[index]!==node))failures.push('dependent overflow changed state or DOM');
      buttons[1].click();buttons[0].click();
      const values=[...host.querySelectorAll('p,span')].map(node=>node.textContent);
      const expected=source===sources[0]?[String(direction),String(direction),String(2*direction)]:[String(direction),String(direction)];
      if(JSON.stringify(values)!==JSON.stringify(expected)||errors.length!==2)failures.push('dependent graph did not recover');
      dispose();buttons[0].click();if(host.childNodes.length||errors.length!==2)failures.push('dependent cleanup failed');
      observer.disconnect();window.removeEventListener('error',onError);host.remove();checked++;
    }
    return {checked,failures};
  } finally {urls.forEach(value=>URL.revokeObjectURL(value));}
}

export async function verifyLists({runtime,code}) {

      const urls=[runtime,code].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      try {
        const api=await import(urls[0]),{model}=await import(urls[1]);
        const literal=(value)=>({kind:'literal',value}),ref=(name)=>({kind:'reference',name});
        const failures=[];let checked=0;
        const cases=[];
        for(const method of ['append','remove','move']){
          const args=method==='move'?[literal(1),literal(0)]:[literal(1)];
          for(const target of [ref('derived'),{kind:'list',items:[literal(1)]},{kind:'member',object:ref('item'),name:'values'},ref('n'),ref('missing')])cases.push({kind:'call',target,method,arguments:args});
          cases.push({kind:'call',target:ref('items'),method,arguments:[]});
          cases.push({kind:'call',target:ref('items'),method,arguments:method==='move'?[literal('bad'),literal(0)]:[literal('bad')]});
        }
        for(const value of ['first',0.5,Infinity,NaN,9007199254740992])cases.push({kind:'call',target:ref('items'),method:'move',arguments:[literal(1),literal(value)]});
        cases.push({kind:'call',target:ref('items'),method:'clear',arguments:[]});
        for(const args of [[literal(1)],[literal('wrong')],[]])cases.push({kind:'call',target:ref('items'),method:'append',arguments:[{kind:'construct',name:'Item',arguments:args}]});
        for(const invalid of cases){
          const current=structuredClone(model),host=document.createElement('main');document.body.append(host);
          const errors=[];const onError=(event)=>{errors.push(event.message);event.preventDefault();};window.addEventListener('error',onError);
          const handler=current.roots[0].handler;
          handler.statements=[{kind:'call',target:ref('items'),method:'append',arguments:[literal(4)]},invalid];
          const dispose=api.mountComponent(host,current,[]),button=host.querySelector('button'),retained=[...host.querySelectorAll('span')];
          const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,childList:true,characterData:true});
          button.click();
          const snapshot=[...host.querySelectorAll('p')].map(p=>p.textContent).join('|'),mutations=observer.takeRecords().length;
          if(errors.length!==1||snapshot!=='1,2|1,2|2'||mutations)failures.push('failed validation changed state/DOM: '+JSON.stringify({invalid,errors,snapshot,mutations}));
          handler.statements=[{kind:'call',target:ref('items'),method:'append',arguments:[literal(3)]}];button.click();
          handler.statements=[{kind:'call',target:ref('items'),method:'move',arguments:[literal(2),literal(0)]}];button.click();
          if(host.querySelectorAll('span')[0]!==retained[1]||host.querySelectorAll('span')[1]!==retained[0])failures.push('lost identity');
          handler.statements=[{kind:'call',target:ref('items'),method:'remove',arguments:[literal(1)]}];button.click();
          const recovered=[...host.querySelectorAll('p')].map(p=>p.textContent).join('|');
          if(recovered!=='2,3|2,3|2')failures.push('valid recovery failed: '+recovered);
          observer.takeRecords();dispose();dispose();observer.takeRecords();button.click();
          if(errors.length!==1||host.childNodes.length||observer.takeRecords().length)failures.push('cleanup failed');
          observer.disconnect();window.removeEventListener('error',onError);host.remove();checked++;
        }
        return {checked,failures};
      }finally{urls.forEach(url=>URL.revokeObjectURL(url));}

}

export async function verifyNumbers({runtime,codes}) {

      const urls=[runtime,...codes].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));const failures=[];
      try {
        const api=await import(urls[0]);let checked=0;
        for(let variant=0;variant<codes.length;variant++)for(const direction of [1,-1]){
          const {default:mount}=await import(urls[variant+1]),host=document.createElement('main');document.body.append(host);
          const start=direction*(Number.MAX_SAFE_INTEGER-1),errors=[];const onError=(event)=>{errors.push(event.message);event.preventDefault();};window.addEventListener('error',onError);
          const dispose=mount(host,api,{start,step:direction}),buttons=host.querySelectorAll('button');const original=host.textContent;
          if(variant===0)buttons[0].click(); // A valid increment reaches the boundary.
          const valid=host.textContent,retained=[...host.querySelectorAll('p,span')],observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,childList:true,characterData:true});
          buttons[0].click();buttons[0].click();
          if(errors.length!==2||errors.some(error=>!error.includes('safe integer range'))||host.textContent!==valid||observer.takeRecords().length)failures.push(`overflow changed state: ${variant}/${direction}`);
          if(variant!==0&&valid!==original)failures.push('derived initial state changed');
          buttons[1].click();
          const values=[...host.querySelectorAll('p')].map(p=>p.textContent);
          const expected=variant===0?['0','0','1']:['0',String(direction)];
          if(JSON.stringify(values)!==JSON.stringify(expected)||retained.slice(0,2).some((node,index)=>host.querySelectorAll('p')[index]!==node))failures.push('reset or identity failed');
          buttons[0].click();
          if(host.querySelector('p').textContent!==String(direction)||errors.length!==2)failures.push('reactivity did not recover');
          dispose();dispose();buttons[0].click();if(host.childNodes.length||errors.length!==2)failures.push('disposed handler survived');
          observer.disconnect();window.removeEventListener('error',onError);host.remove();checked++;
        }
        const {default:mount}=await import(urls[1]);
        for(const start of [Infinity,NaN,0.5,Number.MAX_SAFE_INTEGER+1,Number.MIN_SAFE_INTEGER-1]){
          const host=document.createElement('main');let rejected=false;try{mount(host,api,{start});}catch(error){rejected=error instanceof RangeError;}
          if(!rejected||host.childNodes.length)failures.push('invalid initial number accepted');
        }
        for(const direction of [1,-1]){
          const host=document.createElement('main');document.body.append(host);const errors=[];
          const onError=event=>{errors.push(event.message);event.preventDefault();};window.addEventListener('error',onError);
          const dispose=api.mountCounter(host,{initial:direction*(Number.MAX_SAFE_INTEGER-1),step:direction,prefix:''}),button=host.querySelector('button');
          button.click();button.click();button.click();
          if(button.textContent!==String(direction*Number.MAX_SAFE_INTEGER)||errors.length!==2)failures.push('legacy counter overflow corrupted state');
          dispose();button.click();if(host.childNodes.length||errors.length!==2)failures.push('legacy counter cleanup failed');
          window.removeEventListener('error',onError);host.remove();
        }
        return {checked,failures};
      }finally{urls.forEach(url=>URL.revokeObjectURL(url));}

}
