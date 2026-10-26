// Browser-only harness, shared by correctness tests and the optional benchmark.
// Imported as a module; neither application source nor this file is evaluated by
// the compiler. Instrumentation is confined to the benchmark's isolated page.
export async function measure(runtimeSource, modules, {size = 1000, samples = 9, cycles = 30} = {}) {
  const urls = [];
  const url = source => {
    const value = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
    urls.push(value); return value;
  };
  const runtime = await import(url(runtimeSource));
  const rowURL = url(modules['./Row.qb']);
  const list = await import(url(modules['./List.qb'].replace(JSON.stringify('./Row.qb'), JSON.stringify(rowURL))));
  const batch = await import(url(modules['./Batch.qb']));
  const counts = {elements: 0, texts: 0, comments: 0, fragments: 0, adds: 0, removes: 0};
  const restores = [];
  for (const [name, counter] of [['createElement','elements'],['createTextNode','texts'],['createComment','comments'],['createDocumentFragment','fragments']]) {
    const original = Document.prototype[name];
    Document.prototype[name] = function (...args) { counts[counter]++; return original.apply(this, args); };
    restores.push(() => { Document.prototype[name] = original; });
  }
  for (const [name, counter] of [['addEventListener','adds'],['removeEventListener','removes']]) {
    const original = EventTarget.prototype[name];
    EventTarget.prototype[name] = function (...args) { if (this instanceof Element) counts[counter]++; return original.apply(this, args); };
    restores.push(() => { EventTarget.prototype[name] = original; });
  }
  const host = document.createElement('main'); document.body.append(host);
  const observer = new MutationObserver(() => {});
  observer.observe(host, {subtree: true, childList: true, characterData: true, characterDataOldValue: true});
  const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
  const capture = action => {
    observer.takeRecords(); const before = {...counts}, started = performance.now();
    action(); const ms = performance.now() - started;
    const records = observer.takeRecords();
    return {...delta(before, counts), ms,
      inserted: records.reduce((n, record) => n + record.addedNodes.length, 0),
      removed: records.reduce((n, record) => n + record.removedNodes.length, 0),
      textWrites: records.filter(record => record.type === 'characterData').length};
  };
  const click = (root, text) => {
    const button = [...root.querySelectorAll('button')].find(node => node.textContent === text);
    if (!button) throw new Error(`Missing ${text}`);
    button.click();
  };
  const median = rows => {
    const sorted = rows.map(row => row.ms).sort((a,b) => a-b);
    return {...rows[rows.length - 1], ms: sorted[Math.floor(sorted.length / 2)]};
  };
  let dispose;
  try {
    dispose = batch.default(host, runtime);
    const batchInitial = host.querySelector('p').textContent;
    const batchUpdate = capture(() => click(host, 'Update'));
    const batchValue = host.querySelector('p').textContent;
    dispose();
    const mount = capture(() => { dispose = list.default(host, runtime); });
    const rows = [...host.querySelectorAll('li')];
    const last = rows[size - 1], first = rows[0];
    const childButton = last.querySelector('section button'); childButton.click();
    const isolated = capture(() => click(first, 'Increment'));
    const input = last.querySelector('input'); input.focus(); input.setSelectionRange(1, 3);
    const propUpdate = capture(() => {input.value = 'Changed'; input.dispatchEvent(new Event('input'));});
    const childProp = last.querySelector('section span').textContent;
    const unrelated = first.querySelector('span').textContent;
    input.setSelectionRange(1, 3);
    // Warm up and restore outside the measured interval. No correctness timing thresholds.
    for (let i = 0; i < 2; i++) {click(last, 'First'); click(last, 'Last');}
    const moves = [];
    for (let i = 0; i < samples; i++) {
      moves.push(capture(() => click(last, 'First')));
      click(last, 'Last');
    }
    const focus = document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 3;
    const identity = [...host.querySelectorAll('li')].every((node, index) => node === rows[index]);
    const childState = childButton.textContent;
    const noop = capture(() => click(host, 'Noop'));
    const append = capture(() => click(host, 'Append'));
    const appended = host.querySelector('li:last-child');
    const removedInput = appended.querySelector('input');
    const removedIncrement = [...appended.querySelectorAll('button')].find(node => node.textContent === 'Increment');
    const remove = capture(() => click(appended, 'Remove'));
    const detached = capture(() => {removedInput.value = 'Detached'; removedInput.dispatchEvent(new Event('input')); removedIncrement.click();});
    const retained = rows[0].querySelector('input');
    const retainedIncrement = [...rows[0].querySelectorAll('button')].find(node => node.textContent === 'Increment');
    dispose(); dispose();
    const afterDispose = capture(() => {retained.value = 'Disposed'; retained.dispatchEvent(new Event('input')); retainedIncrement.click();});
    const empty = host.childNodes.length === 0;
    const cycleTimes = [];
    for (let i = 0; i < cycles; i++) {
      const started = performance.now(); dispose = list.default(host, runtime); dispose();
      cycleTimes.push(performance.now() - started);
    }
    cycleTimes.sort((a,b) => a-b);
    return {size, samples, cycles, mount, batchInitial, batchUpdate, batchValue,
      isolated, propUpdate, childProp, unrelated, move: median(moves), focus, identity, childState,
      noop, append, remove, detached, afterDispose, empty,
      cycleMedianMs: cycleTimes[Math.floor(cycles / 2)],cycleP95Ms:cycleTimes[Math.min(cycles-1,Math.ceil(cycles*.95)-1)],
      liveListeners: counts.adds - counts.removes, remainingNodes: host.childNodes.length,
      heapBytes: typeof performance.memory?.usedJSHeapSize === 'number' ? performance.memory.usedJSHeapSize : null};
  } finally {
    dispose?.(); observer.disconnect(); host.remove(); restores.reverse().forEach(restore => restore());
    urls.forEach(value => URL.revokeObjectURL(value));
  }
}

export async function verifyEdges(runtimeSource, modules) {
  const urls = [];
  const url = source => {const value = URL.createObjectURL(new Blob([source], {type: 'text/javascript'})); urls.push(value); return value;};
  const host = document.createElement('main'); document.body.append(host);
  const originalAdd = EventTarget.prototype.addEventListener, originalRemove = EventTarget.prototype.removeEventListener;
  let listeners = 0;
  EventTarget.prototype.addEventListener = function (...args) {if (this instanceof Element) listeners++; return originalAdd.apply(this,args);};
  EventTarget.prototype.removeEventListener = function (...args) {if (this instanceof Element) listeners--; return originalRemove.apply(this,args);};
  const disposers = [];
  const duplicateErrors = [], overflowErrors = [];
  const onError = event => {
    if(event.message.includes('Duplicate iteration key'))duplicateErrors.push(event.message);
    else if(event.message.includes('State exceeded safe integer range'))overflowErrors.push(event.message);
    else return;
    event.preventDefault();
  };
  window.addEventListener('error',onError);
  try {
    const runtime = await import(url(runtimeSource));
    const rowURL = url(modules['./Row.qb']), row = await import(rowURL);
    // Use the compiler-produced model with the real child mount. A wrapper also
    // lets us inject a host-JavaScript mounting/cleanup failure, without accepting
    // arbitrary JavaScript in the Qubits language.
    const edges = await import(url(modules['./Edges.qb'].replace(JSON.stringify('./Row.qb'), JSON.stringify(rowURL))));
    const click = text => [...host.querySelectorAll('button')].find(node => node.textContent === text).click();
    const dispose = runtime.mountComponent(host, edges.model, [row.default]); disposers.push(dispose);
    const root = host.querySelector('div'), childButton = root.querySelector('button'); childButton.click();
    click('Replace');
    const retained = host.querySelector('div') === root && root.querySelector('button') === childButton;
    const replaced = root.querySelector('span').textContent;
    const childLabel = root.querySelector('section span').textContent;
    const childState = childButton.textContent;
    const beforeDuplicate = host.querySelector('p').textContent;
    click('Duplicate'); const duplicateRetained = host.querySelector('div') === root;
    const duplicateRolledBack = host.querySelector('p').textContent === beforeDuplicate && host.querySelectorAll('div').length === 1;
    const recovered = host.querySelector('div') === root;
    click('Update'); const sequential = host.querySelector('p').textContent;
    const removedText = root.querySelector('span').firstChild;
    click('Hide'); click('Rename');
    const inactiveText = removedText.textContent;
    click('Show'); const remounted = host.querySelector('div > span').textContent;
    const retainedRow = host.querySelector('div'), observer = new MutationObserver(()=>{});
    observer.observe(host,{childList:true}); click('Prepend');
    const insertions = observer.takeRecords(); observer.disconnect();
    const prepend = {inserted:insertions.reduce((n,record)=>n+record.addedNodes.length,0),
      removed:insertions.reduce((n,record)=>n+record.removedNodes.length,0), retained:host.querySelectorAll('div')[1]===retainedRow};
    dispose(); dispose.refresh();
    let initMounts = 0, mountFailure = '', cleanupFailure = '';
    // Failure after a previous record was mounted must unwind that record too.
    const list = await import(url(modules['./List.qb'].replace(JSON.stringify('./Row.qb'), JSON.stringify(rowURL))));
    try {runtime.mountComponent(host, list.model, [(...args) => {
      if (++initMounts === 2) throw new Error('Expected child mount failure');
      return row.default(...args);
    }]);} catch (error) {mountFailure = error.message;}
    const afterFailedMount = {nodes: host.childNodes.length, listeners};
    const cleanup = runtime.mountComponent(host, edges.model, [(...args) => {
      const childDispose = row.default(...args);
      return () => {childDispose(); throw new Error('Expected child cleanup failure');};
    }]); disposers.push(cleanup);
    try {cleanup();} catch (error) {cleanupFailure = error.message;}
    cleanup();
    const overflow = await import(url(modules['./Overflow.qb']));
    const overflowDispose = overflow.default(host,runtime);disposers.push(overflowDispose);
    const overflowButton = host.querySelector('button'), overflowBefore = overflowButton.textContent;
    overflowButton.click();const overflowRetained = overflowButton.textContent === overflowBefore;
    overflowDispose();
    return {retained, replaced, childLabel, childState, sequential, inactiveText, remounted,
      duplicateErrors: duplicateErrors.length, duplicateRetained, duplicateRolledBack, recovered, prepend,
      overflowErrors: overflowErrors.length, overflowRetained,
      mountFailure, afterFailedMount, cleanupFailure, remainingNodes: host.childNodes.length, listeners};
  } finally {
    for (const dispose of disposers) try {dispose();} catch {}
    EventTarget.prototype.addEventListener = originalAdd; EventTarget.prototype.removeEventListener = originalRemove;
    window.removeEventListener('error',onError);
    host.remove(); urls.forEach(value => URL.revokeObjectURL(value));
  }
}

export async function verifyTransactionalFailures(runtimeSource, modules) {
  const urls=[];const url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  const host=document.createElement('main');document.body.append(host);const errors=[];
  const onError=event=>{errors.push(event.message);event.preventDefault();};window.addEventListener('error',onError);
  const click=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text).click();
  try {
    const runtime=await import(url(runtimeSource)),rowURL=url(modules['./Row.qb']),row=await import(rowURL);
    const imported=async name=>import(url(modules[name].replaceAll(JSON.stringify('./Row.qb'),JSON.stringify(rowURL))));
    const list=await imported('./TransactionalList.qb'),conditional=await imported('./TransactionalConditional.qb');
    const nested=await import(url(modules['./NestedTransaction.qb'])),fatal=await imported('./FatalRecovery.qb');
    const replacementCase=persistent=>{
      let mounts=0;const child=(...args)=>{mounts++;if(mounts>1&&(persistent||mounts===2))throw new Error(persistent?'Persistent replacement failure':'Transient replacement failure');return row.default(...args);};
      const dispose=runtime.mountComponent(host,list.model,[child]),old=host.querySelector('div'),oldButton=old.querySelector('button');oldButton.click();click('Replace');const current=host.querySelector('div'),button=current.querySelector('button');
      const first={same:current===old&&button===oldButton,connected:old.isConnected,id:current.querySelector('span').textContent,state:button.textContent};click('Replace');const retried=host.querySelector('div'),retryButton=retried.querySelector('button');
      const result={mounts,first,retry:{same:retried===old&&retryButton===oldButton,connected:old.isConnected,id:retried.querySelector('span').textContent,state:retryButton.textContent}};dispose();return result;
    };
    const transient=replacementCase(false),persistent=replacementCase(true);
    let conditionalMounts=0;const conditionalChild=(...args)=>{if(++conditionalMounts===2)throw new Error('Conditional replacement failure');return row.default(...args);};
    let dispose=runtime.mountComponent(host,conditional.model,[conditionalChild]);const oldBranch=host.querySelector('div'),oldBranchButton=oldBranch.querySelector('button');oldBranchButton.click();click('Switch');const branch=host.querySelector('div');
    const conditionalFirst={same:branch===oldBranch&&branch.querySelector('button')===oldBranchButton,connected:oldBranch.isConnected,label:branch.querySelector('span').textContent,state:branch.querySelector('button').textContent};click('Switch');const retriedBranch=host.querySelector('div');const conditionalResult={mounts:conditionalMounts,first:conditionalFirst,retry:{same:retriedBranch===oldBranch,connected:oldBranch.isConnected,label:retriedBranch.querySelector('span').textContent,state:retriedBranch.querySelector('button').textContent}};dispose();
    let cleanupCalls=0;const cleanupChild=(...args)=>{const childDispose=row.default(...args);return()=>{cleanupCalls++;childDispose();throw new Error('Child cleanup failure');};};
    dispose=runtime.mountComponent(host,list.model,[cleanupChild]);const removed=host.querySelector('div');removed.querySelector('button').click();click('Remove');const removedAfterCommit=!host.querySelector('div')&&!removed.isConnected;click('Restore');const restored=host.querySelector('div');const cleanupResult={removedAfterCommit,cleanupCalls,restored:Boolean(restored),same:restored===removed,id:restored?.querySelector('span').textContent,state:restored?.querySelector('button').textContent};try{dispose();}catch{}
    dispose=nested.default(host,runtime);click('Fail');const nestedRollback=host.querySelector('p').textContent;click('Increment');const nestedRecovered=host.querySelector('p').textContent;dispose();
    const fatalChild=(...args)=>{const childDispose=row.default(...args);return()=>{childDispose();throw new Error('Rollback cleanup failure');};};
    dispose=runtime.mountComponent(host,fatal.model,[fatalChild]);const fatalButton=host.querySelector('button');fatalButton.click();const fatalResult={disabled:host.childNodes.length===0,detached:!fatalButton.isConnected};try{dispose();}catch{}
    return {transient,persistent,conditional:conditionalResult,cleanup:cleanupResult,nestedRollback,nestedRecovered,fatal:fatalResult,errors};
  } finally {window.removeEventListener('error',onError);host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
}

export async function verifyReorders(runtimeSource, modules) {
  const urls = [];
  const url = source => {const value = URL.createObjectURL(new Blob([source], {type:'text/javascript'})); urls.push(value); return value;};
  const host = document.createElement('main'); document.body.append(host);
  let dispose;
  const observer = new MutationObserver(()=>{});
  try {
    const runtime = await import(url(runtimeSource)), rowURL = url(modules['./Row.qb']);
    const root = await import(url(modules['./Permutations.qb'].replace(JSON.stringify('./Row.qb'),JSON.stringify(rowURL))));
    dispose = root.default(host,runtime);
    const list = host.querySelector('ul'), originals = [...list.children];
    originals.forEach(node=>node.querySelector('button').click());
    const input = originals[1].querySelector('input'); input.focus(); input.setSelectionRange(1,2);
    observer.observe(list,{childList:true});
    let before = [...originals], checked = 0, focused = true;
    const failures = [];
    for(const button of host.querySelectorAll('main > button')) {
      observer.takeRecords(); button.click();
      const after = [...list.children];
      const removed = observer.takeRecords().reduce((n,record)=>n+record.removedNodes.length,0);
      // Independent small reference: enumerate every subsequence, rather than
      // using the runtime's binary-search reconciliation algorithm.
      let longest = 0;
      for(let mask=0;mask<(1<<before.length);mask++) {
        const subsequence = before.filter((_,index)=>mask&(1<<index));
        const positions = subsequence.map(node=>after.indexOf(node));
        if(positions.every((position,index)=>index===0||position>positions[index-1]))longest=Math.max(longest,subsequence.length);
      }
      const desired = button.textContent.split(',').map(Number);
      const actual = after.map(node=>originals.indexOf(node));
      if(JSON.stringify(desired)!==JSON.stringify(actual)||removed!==3*(before.length-longest)||after.some(node=>node.querySelector('button').textContent!=='1')) failures.push({desired,actual,removed,longest});
      focused &&= document.activeElement===input&&input.selectionStart===1&&input.selectionEnd===2;
      before=after;checked++;
    }
    dispose();return {checked,failures,focused,remainingNodes:host.childNodes.length};
  } finally {dispose?.();observer.disconnect();host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
}

// A memory observation, not a GC guarantee: keep disposed handles alive and use
// WeakRefs to see whether their supplied-prop objects and DOM remain reachable.
export async function retentionProbe(runtimeSource, modules) {
  const urls = [runtimeSource, modules['./Row.qb']].map(source => URL.createObjectURL(new Blob([source], {type: 'text/javascript'})));
  try {
    const runtime = await import(urls[0]), row = await import(urls[1]);
    const handles = [], hosts = [], props = [], nodes = [];
    for (let i = 0; i < 30; i++) {
      const supplied = {label: 'Probe'}, host = document.createElement('main');
      document.body.append(host);
      const dispose = row.default(host, runtime, supplied);
      hosts.push(new WeakRef(host)); props.push(new WeakRef(supplied)); nodes.push(new WeakRef(host.firstChild));
      dispose(); host.remove(); handles.push(dispose);
    }
    globalThis.__qubitsRetentionProbe = {handles, hosts, props, nodes};
  } finally {urls.forEach(value => URL.revokeObjectURL(value));}
}

export async function staticValidationProbe(runtimeSource) {
  const url=URL.createObjectURL(new Blob([runtimeSource],{type:'text/javascript'}));
  try {
    const api=await import(url),invalid=[Number.NaN,Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1],attributes=[['text',1],['value',2],['class',8],['type',16]],failures=[];
    const empty=()=>({props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[]});
    const attempt=(model,props={},state={},limits={})=>{const host=document.createElement('main'),sibling=document.createElement('aside');host.append(sibling);try{api.mountComponentWithState(host,model,[],props,state,limits);failures.push('accepted');}catch(error){failures.push(`${error.name}:${error.message}:${host.childNodes.length}:${host.firstChild===sibling}`);}};
    for(const [name,flag] of attributes)for(const value of invalid)for(const staticFlag of [0,flag])attempt({...empty(),roots:[{kind:'element',tag:'input',component:-1,static:staticFlag,attributes:{[name]:{kind:'literal',value}},children:[]}]});
    for(const staticFlag of [0,4])attempt({...empty(),roots:[{kind:'element',tag:'input',component:-1,static:staticFlag,attributes:{checked:{kind:'literal',value:1}},children:[]}]});
    attempt(empty(),{class:Number.NaN});
    attempt({...empty(),states:{value:{kind:'literal',value:Number.NaN}}});
    attempt({...empty(),classes:{Item:{fields:[{name:'value',initial:{kind:'literal',value:0}}],computed:{},actions:{}}},states:{item:{kind:'construct',name:'Item',arguments:[{kind:'literal',value:Number.POSITIVE_INFINITY}]}}});
    attempt({...empty(),classes:{Item:{fields:[{name:'value',initial:{kind:'literal',value:0}}],computed:{},actions:{}}},states:{item:{kind:'construct',name:'Item',arguments:[{kind:'literal',value:'wrong'}]}}});
    attempt({...empty(),classes:{Item:{fields:[{name:'value',initial:{kind:'reference',name:'other'}}],computed:{},actions:{}}},states:{item:{kind:'construct',name:'Item',arguments:[{kind:'literal',value:0}]}}});
    attempt(empty(),new Proxy({},{ownKeys(){throw new Error('proxy blocked');}}));
    attempt(empty(),Object.defineProperty({},'class',{enumerable:true,get(){throw new Error('getter blocked');}}));
    attempt(empty(),{},new Proxy({},{ownKeys(){throw new Error('state proxy blocked');}}));
    const getter={kind:'literal'};Object.defineProperty(getter,'value',{get(){throw new Error('literal getter blocked');}});
    attempt({...empty(),roots:[{kind:'element',tag:'p',component:-1,static:1,attributes:{text:getter},children:[]}]});
    for(const value of invalid)attempt({...empty(),roots:[{kind:'element',tag:'p',component:-1,static:value,attributes:{text:{kind:'literal',value:'safe'}},children:[]}]});
    attempt({...empty(),roots:[{kind:'element',tag:'p',component:-1,static:1,attributes:{text:{kind:'literal',value:'prepared'}},children:[]},{kind:'element',tag:'p',component:-1,static:Number.NaN,attributes:{text:{kind:'literal',value:'invalid'}},children:[]}]});
    const valid={...empty(),roots:[{kind:'element',tag:'input',component:-1,static:2,attributes:{value:{kind:'literal',value:'safe'}},children:[]}]},host=document.createElement('main'),dispose=api.mountComponent(host,valid,[],{}, {maxDomNodes:1});
    const exact={value:host.firstChild.value,nodes:host.childNodes.length};dispose();dispose();dispose.refresh();
    return {failures,exact,empty:host.childNodes.length===0};
  } finally {URL.revokeObjectURL(url);}
}

export async function benchmarkSuite(runtimeSource, modules, mountModules, distinctModules={}, staticCatalogModules={}, {samples=21, operations=1000, reorderSamples=15}={}) {
  const urls=[];
  const url=source=>{const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;};
  const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)],min:sorted[0],max:sorted.at(-1),samples:sorted.length};};
  const timeOperations=(run,count=operations)=>{const values=[];for(let sample=0;sample<samples;sample++){const started=performance.now();for(let index=0;index<count;index++)run(index);values.push((performance.now()-started)*1000/count);}return summary(values);};
  const host=document.createElement('main');document.body.append(host);let dispose;
  try {
    const runtime=await import(url(runtimeSource)),rowURL=url(modules['./Row.qb']);
    const list=await import(url(modules['./List.qb'].replace(JSON.stringify('./Row.qb'),JSON.stringify(rowURL))));
    const batch=await import(url(modules['./Batch.qb']));
    const mounts={};
    for(const [size,source] of Object.entries(mountModules)){
      const module=await import(url(source['./Mount.qb']));
      for(let index=0;index<3;index++){dispose=module.default(host,runtime);dispose();}
      const values=[];for(let sample=0;sample<samples;sample++){const started=performance.now();dispose=module.default(host,runtime);values.push(performance.now()-started);dispose();}
      mounts[size]=summary(values);
    }
    const staticNestedMountMs={};
    for(const [size,source] of Object.entries(staticCatalogModules)){
      const childURL=url(source['./ProductTile.qb']);
      const module=await import(url(source['./Catalog.qb'].replace(JSON.stringify('./ProductTile.qb'),JSON.stringify(childURL))));
      for(let index=0;index<3;index++){dispose=module.default(host,runtime);dispose();}
      const values=[];for(let sample=0;sample<samples;sample++){const started=performance.now();dispose=module.default(host,runtime);values.push(performance.now()-started);dispose();}
      staticNestedMountMs[size]=summary(values);
    }
    dispose=list.default(host,runtime);
    const first=host.querySelector('li'),last=host.querySelector('li:last-child');
    const increment=[...first.querySelectorAll('button')].find(node=>node.textContent==='Increment');
    for(let index=0;index<100;index++)increment.click();
    const isolatedUpdateUs=timeOperations(()=>increment.click());
    const input=last.querySelector('input');let serial=0;
    const updateProp=()=>{input.value=`Value ${serial++}`;input.dispatchEvent(new Event('input'));};
    for(let index=0;index<100;index++)updateProp();
    const nestedComponentUs=timeOperations(updateProp);
    const firstButton=[...last.querySelectorAll('button')].find(node=>node.textContent==='First');
    const lastButton=[...last.querySelectorAll('button')].find(node=>node.textContent==='Last');
    for(let index=0;index<2;index++){firstButton.click();lastButton.click();}
    const reorders=[];for(let index=0;index<reorderSamples;index++){const started=performance.now();firstButton.click();reorders.push(performance.now()-started);lastButton.click();}
    dispose();
    dispose=batch.default(host,runtime);const update=[...host.querySelectorAll('button')].find(node=>node.textContent==='Update');
    for(let index=0;index<100;index++)update.click();
    const computedChainUs=timeOperations(()=>update.click());dispose();
    const distinctWritesUs={};for(const [size,source] of Object.entries(distinctModules)){const module=await import(url(source));dispose=module.default(host,runtime);const button=host.querySelector('button');for(let index=0;index<50;index++)button.click();distinctWritesUs[size]=timeOperations(()=>button.click(),500);dispose();}
    return {mountMs:mounts,staticNestedMountMs,isolatedUpdateUs,computedChainUs,reorderMs:summary(reorders),nestedComponentUs,distinctWritesUs};
  } finally {dispose?.();host.remove();urls.forEach(value=>URL.revokeObjectURL(value));}
}
