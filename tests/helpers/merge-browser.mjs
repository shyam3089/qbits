// Firefox regression for reconciled transaction/dependency/budget ownership.
export async function verify({runtime,child,code}) {
    const urls=[runtime,child].map(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
    urls.push(URL.createObjectURL(new Blob([code.replace(JSON.stringify('./Child.qb'),JSON.stringify(urls[1]))],{type:'text/javascript'})));
    const errors=[]=[],onError=(event)=>{errors.push(event.error.message);event.preventDefault();};window.addEventListener('error',onError);
    const host=document.createElement('main');document.body.append(host);
    try{const api=await import(urls[0]),component=await import(urls[2]),dispose=api.mountComponent(host,component.model,[ (await import(urls[1])).default ],{},{maxListRecords:3});
      const controls=host.querySelectorAll('button'),first=controls[6],second=controls[7];first.click();first.focus();
      controls[0].click();controls[0].click();
      const rollback={same:host.querySelectorAll('button')[6]===first&&host.querySelectorAll('button')[7]===second,total:host.querySelector('p').textContent,child:first.textContent,focused:document.activeElement===first};
      controls[1].click();const oldEdge={total:host.querySelector('p').textContent,child:first.textContent};
      controls[3].click();controls[2].click();const replaced={total:host.querySelector('p').textContent,child:first.textContent,same:host.querySelectorAll('button')[7]===first};
      controls[1].click();const noStaleEdge=host.querySelector('p').textContent;
      controls[4].click();controls[5].click();controls[4].click();const capacity=host.querySelectorAll('button').length;dispose();dispose();
      return{rollback,oldEdge,replaced,noStaleEdge,capacity,errors,remaining:host.childNodes.length};
    }finally{window.removeEventListener('error',onError);host.remove();urls.forEach(url=>URL.revokeObjectURL(url));}
}
