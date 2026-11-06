export async function initializeRouting({ runtime, product, app }) {
    const urls = [], url = (source) => { const value = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })); urls.push(value); return value; };
    const api = await import(url(runtime)), productUrl = url(product), brokenUrl = url('export default function(){throw new Error("mount blocked")}'), module = await import(url(app.replace('./Product.qb', productUrl).replace('./Broken.qb', brokenUrl)));
    const errors = [], events = [], listeners = new Set(), flags={failCleanup:false};
    window.addEventListener('error', event => { errors.push(event.error?.message ?? event.message); event.preventDefault(); });
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type, listener, options) => { if (type === 'popstate')
        listeners.add(listener); add(type, listener, options); });
    window.removeEventListener = ((type, listener, options) => { if (type === 'popstate')
        listeners.delete(listener); remove(type, listener, options); });
    const host = document.createElement('main'), second = document.createElement('aside');
    document.body.append(host, second);
    const dispose = module.default(host, api, {}, {}, undefined, { lifecycle(message){events.push(message);if(flags.failCleanup&&message.startsWith('cleanup:')){flags.failCleanup=false;throw new Error('cleanup blocked');}} }), disposeSecond = module.default(second, api);
    const go = (path) => { dispose.updateState({ destination: path }); host.querySelector('.go').click(); };
    go('/products/1');
    const child = host.querySelector('.count'), input = host.querySelector('input');
    child.click();
    input.focus();
    const isolated = !!second.querySelector('.home');
    go('/products/2');
    const retained = { identity: host.querySelector('.count') === child, count: child.textContent, id: host.querySelector('h2').textContent, focus: document.activeElement === input };
    const length = history.length, attempts = host.querySelector('.attempts').textContent;
    go('/broken');
    const mountRollback = location.pathname === '/products/2' && history.length === length && host.querySelector('.count') === child && host.querySelector('.attempts').textContent === attempts;
    const push = history.pushState;
    history.pushState = () => { throw new DOMException('history blocked', 'SecurityError'); };
    go('/products/3');
    history.pushState = push;
    const historyRollback = location.pathname === '/products/2' && host.querySelector('.count') === child && child.textContent === '1' && host.querySelector('h2').textContent === '2';
    for (const path of ['https://evil.test/', '//evil.test/', 'javascript:alert(1)', '/a/../b', '/products/%2f', '/products/%5c', '/products/%00', '/products/%zz', '/' + 'x'.repeat(2048), '/products/'+'é'.repeat(400)])
        go(path);
    const invalidRollback = location.pathname === '/products/2' && host.querySelector('.count') === child && host.querySelector('.attempts').textContent === attempts;
    go('/products/3');
    globalThis.routingProbe = { host, second, dispose, disposeSecond, go, child, input, errors, events, listeners, urls, api, module, flags };
    return { isolated, retained, mountRollback, historyRollback, invalidRollback, errors };
}

export async function validateRouteModels(runtime) {
    const url=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'}));
    try {
        const api=await import(url),failures=[];
        const leaf={kind:'element',tag:'p',component:-1,attributes:{text:{kind:'literal',value:'route'}},static:1,children:[]};
        const route=path=>({path,children:[leaf]});
        const tables=[[],[route('/')],[route('*'),route('/')],[route('/<__proto__>'),route('*')],[route('/<id>/<id>'),route('*')],[route('/<a>'),route('/<b>'),route('*')],[route('/a?b'),route('*')],Array.from({length:257},()=>route('/'))];
        const cases=tables.map(routes=>({routes,limits:{}}));
        for(const limits of [{maxCollectionItems:1},{maxDomNodes:1},{maxReactiveEffects:1},{maxWorkPerOperation:1}])cases.push({routes:[route('/'),route('*')],limits});
        cases.push({routes:[{path:'/',children:[{kind:'router',routes:[route('*')]}]},route('*')],limits:{}});
        for(const path of ['/products/:id','/a/<id','/a/id>','/a/<>','/a/<id>suffix','/a/<<id>>','/a/prefix<id>'])cases.push({routes:[route(path),route('*')],limits:{}});
        for(const {routes,limits} of cases){
            const host=document.createElement('main'),sibling=document.createElement('aside');host.append(sibling);
            try{const dispose=api.mountComponent(host,{props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[{kind:'router',routes}]},[],{},limits);dispose();failures.push('accepted');}
            catch(error){failures.push(error.message);}
            if(host.childNodes.length!==1||host.firstChild!==sibling)throw new Error('Route validation failed to preserve host');
        }
        return failures;
    }finally{URL.revokeObjectURL(url);}
}

export async function verifyHistoryRecoveryFailure(runtime) {
    const url=URL.createObjectURL(new Blob([runtime],{type:'text/javascript'})),replace=history.replaceState;
    try {
        const api=await import(url),leaf={kind:'element',tag:'p',component:-1,attributes:{text:{kind:'literal',value:'home'}},static:1,children:[]};
        const host=document.createElement('main'),sibling=document.createElement('aside');host.append(sibling);document.body.append(host);
        const model={props:{},classes:{},states:{},computed:{},init:[],cleanup:[],roots:[{kind:'router',routes:[{path:'/',children:[leaf]},{path:'/broken',children:[{kind:'element',tag:'Broken',component:0,attributes:{},children:[]}]},{path:'*',children:[leaf]}]}]};
        const dispose=api.mountComponent(host,model,[()=>{throw new Error('mount blocked');}]);
        history.pushState(null,'','/broken');history.pushState(null,'','/');
        history.replaceState=()=>{throw new Error('recovery blocked');};
        const result=await new Promise(resolve=>{
            function failed(event){event.preventDefault();window.removeEventListener('error',failed);resolve({message:event.error.message,errors:event.error.errors.map(error=>error.message),disabled:host.childNodes.length===1&&host.firstChild===sibling});}
            window.addEventListener('error',failed);history.back();
        });
        dispose();host.remove();return result;
    }finally{history.replaceState=replace;URL.revokeObjectURL(url);}
}
