import type {HttpClientConfig,HttpEnvironment,HttpErrorInterceptor,HttpMethod,HttpOptions,HttpRequest,HttpRequestInterceptor,HttpResponseInterceptor,HttpResponseSchema} from './http.js';
export interface CounterModel {initial:number;prefix:string;step:number}
export type {HttpClientConfig,HttpEnvironment,HttpOptions,HttpRequest,HttpResponseSchema} from './http.js';
export interface RuntimeLimits {maxCollectionItems:number;maxComponentDepth:number;maxUpdatesPerFlush:number;maxComponentInstances:number;maxListRecords:number;maxDomNodes:number;maxReactiveEffects:number;maxWorkPerOperation:number}
export const defaultRuntimeLimits:Readonly<RuntimeLimits>=Object.freeze({maxCollectionItems:100_000,maxComponentDepth:256,maxUpdatesPerFlush:100_000,maxComponentInstances:100_000,maxListRecords:250_000,maxDomNodes:500_000,maxReactiveEffects:250_000,maxWorkPerOperation:1_000_000});
type Primitive=string|number|boolean;
type PrimitiveType='string'|'number'|'boolean';
type ItemType=PrimitiveType|`class:${string}`;
type Value=Primitive|Instance|SharedInstance|HttpResourceInstance|Value[];
type InitialState=Readonly<Record<string,unknown>>;
type Expr={kind:'not';argument:Expr}|{kind:'equal'|'notEqual'|'and'|'or';left:Expr;right:Expr}|{kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'str'|'len';argument:Expr}|{kind:'contains';left:Expr;right:Expr}|{kind:'count';left:Expr;right:Expr}|{kind:'add';left:Expr;right:Expr}|{kind:'subtract';left:Expr;right:Expr}|{kind:'construct';name:string;arguments:Expr[]}|{kind:'list';items:Expr[];itemType?:string};
type ConditionExpr=Expr;
type Statement={kind:'navigate';path:Expr}|{kind:'assign';target:Expr;value:Expr}|{kind:'eventAssign';target:Expr;member:'value'|'checked'}|{kind:'call';target:Expr;method:string;arguments:Expr[]}|{kind:'emit';event:string;payload?:Expr};
interface Handler {kind?:string;event:string;parameter?:string;payloadType?:'string'|'number'|'boolean'|null;statements:Statement[]}
interface ElementView {kind:'element';tag:string;component:number;attributes:Record<string,Expr>;static?:number;children:View[];handler?:Handler}
interface ConditionalView {kind:'conditional';condition:ConditionExpr;consequent:View[];alternate:View[]}
interface IterationView {kind:'iteration';item:string;collection:Expr;key:Expr;children:View[]}
interface SlotView {kind:'slot'}
interface RouterView {kind:'router';routes:{path:string;children:View[]}[]}
type View=ElementView|ConditionalView|IterationView|SlotView|RouterView;
interface ClassModel {fields:{name:string;initial:Expr}[];computed:Record<string,Expr>;actions:Record<string,Statement[]>}
interface HttpClientModel {base?:Expr;auth?:{scheme:'bearer';provider:string};interceptors:{phase:'request'|'response'|'error';handler:string}[]}
interface QueryModel {name:string;method:'get'|'post'|'put'|'patch'|'delete';url:Expr;params:{name:string;value:Expr}[];headers:{name:string;value:Expr}[];body?:Expr;response:string;responseList:boolean;client?:string}
interface Model {props:Record<string,Primitive>;events?:Record<string,'string'|'number'|'boolean'|null>;shared?:{name:string;index:number}[];classes:Record<string,ClassModel>;states:Record<string,Expr>;computed:Record<string,Expr>;httpClients?:Record<string,HttpClientModel>;queries?:QueryModel[];init:Statement[];cleanup:Statement[];roots:View[]}
interface Signal<T=Value>{value:T;subscribers:Set<ReactiveEffect>;derive?:ReactiveEffect;dirty?:boolean;itemType?:ItemType;itemSchema?:string}
interface Instance {__class:string;__schema:string;__owner:SharedRegistry;fields:Record<string,Signal>;computed:Record<string,Expr>;actions:Record<string,Statement[]>;scope:Scope}
interface SharedDefinition {states:Record<string,Primitive|readonly unknown[]>;types?:Record<string,string>;classes?:Record<string,ClassModel>}
interface SharedInstance {__shared:string;fields:Record<string,Signal>}
interface HttpResourceInstance {__resource:string;fields:Record<string,Signal>;refresh:()=>void}
type SharedRegistry=Map<SharedDefinition,SharedInstance>;
type Scope=Record<string,Signal|Instance|SharedInstance|HttpResourceInstance|(()=>Value)>;
type ResourceName='components'|'records'|'domNodes'|'effects';
interface RoutingContext {window:Window;path:Signal<string>;url:string;ready:boolean;prepare:(path:string)=>(()=>void)}
interface ResourceBudget {limits:RuntimeLimits;components:number;records:number;domNodes:number;effects:number;work:number;workDepth:number;router?:RoutingContext}
interface Reservation {released:boolean}
type ReactiveEffect=(()=>void)&{dependencies:Set<Signal>;disposed:boolean;computed?:Signal;maxUpdates:number;budget:ResourceBudget};
type Dispose=(()=>void)&{refresh?:()=>void;updateState?:(state:InitialState)=>void};
type ContentMount=(target:Element|DocumentFragment,runtime:RuntimeApi)=>Dispose;
type CleanupBag=(()=>void)[]&{nodes?:number};
interface RuntimeApi {mountComponent:(target:Element,model:Model,components:Mount[],props?:Record<string,Primitive>,limits?:Partial<RuntimeLimits>,depth?:number,events?:Record<string,(payload?:Primitive)=>void>,shared?:SharedDefinition[])=>Dispose;mountComponentWithState?:(target:Element,model:Model,components:Mount[],props:Record<string,Primitive>,state:InitialState,limits?:Partial<RuntimeLimits>,depth?:number,events?:Record<string,(payload?:Primitive)=>void>,shared?:SharedDefinition[])=>Dispose;mountComponentWithContent?:(target:Element,model:Model,components:Mount[],props:Record<string,Primitive>,state:InitialState,content:ContentMount,limits?:Partial<RuntimeLimits>,depth?:number,events?:Record<string,(payload?:Primitive)=>void>,shared?:SharedDefinition[])=>Dispose;mountCounter:(target:Element,model:CounterModel)=>()=>void}
type Mount=(target:Element,runtime:RuntimeApi,props?:Record<string,Primitive>,state?:InitialState,content?:ContentMount,events?:Record<string,(payload?:Primitive)=>void>)=>Dispose;
type CommitHook=()=>unknown[]|void;
let activeEffect:ReactiveEffect|undefined;
const instances=new WeakSet<object>();
let batchDepth=0,flushing=false;
const pendingComputed=new Set<ReactiveEffect>(),pendingEffects=new Set<ReactiveEffect>();
let transactionDepth=0;
let committing=false;
export interface HttpApplicationConfig {client?:HttpClientConfig;functions?:Readonly<Record<string,Function>>}
let httpApplication:HttpApplicationConfig=Object.freeze({});
export function configureHttpApplication(config:HttpApplicationConfig):()=>void {if(!config||typeof config!=='object')throw new TypeError('HTTP application configuration must be an object');const previous=httpApplication;httpApplication=Object.freeze({client:config.client,functions:Object.freeze({...config.functions})});return()=>{httpApplication=previous;};}
export class HttpError extends Error {readonly status:number;readonly response?:Response;constructor(message:string,status=0,response?:Response,options?:ErrorOptions){super(message,options);this.name='HttpError';this.status=status;this.response=response;}}
const httpMethods=new Set<HttpMethod>(['GET','POST','PUT','PATCH','DELETE']);
function plainHttpRecord(value:unknown):value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return false;const prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;}
function validateHttpValue(value:unknown,schema:HttpResponseSchema,label:string,maxItems:number,maxDepth:number,depth=0):unknown {if(depth>maxDepth)throw new RangeError(`HTTP response exceeds the maximum validation depth of ${maxDepth}`);if(typeof schema==='string'){if(typeof value!==schema)throw new TypeError(`${label} requires ${schema}`);if(schema==='number'&&(!Number.isFinite(value)||!Number.isSafeInteger(value as number)))throw new RangeError(`${label} requires a finite safe integer`);return value;}if('list'in schema){if(!Array.isArray(value))throw new TypeError(`${label} requires a list`);if(value.length>maxItems)throw new RangeError(`HTTP response exceeds the maximum of ${maxItems} items`);return value.map((item,index)=>validateHttpValue(item,schema.list,`${label}[${index}]`,maxItems,maxDepth,depth+1));}if(!plainHttpRecord(value))throw new TypeError(`${label} requires a plain object`);const names=Object.keys(schema.fields),allowed=new Set(names);for(const key of Object.keys(value))if(!allowed.has(key))throw new TypeError(`Unknown field ${key} in ${label}`);const result=Object.create(null) as Record<string,unknown>;for(const name of names){const descriptor=Object.getOwnPropertyDescriptor(value,name);if(!descriptor||!('value'in descriptor))throw new TypeError(`Missing data field ${name} in ${label}`);result[name]=validateHttpValue(descriptor.value,schema.fields[name],`${label}.${name}`,maxItems,maxDepth,depth+1);}return result;}
function resolveHttpUrl(path:string,base?:string):URL {if(typeof path!=='string'||!path||/[\r\n\0]/.test(path))throw new TypeError('HTTP URL must be a non-empty string without control characters');const fallback=typeof location==='undefined'?'http://localhost/':location.href,baseUrl=base?new URL(base,fallback):new URL(fallback),url=new URL(path,baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new TypeError('HTTP URL must use http(s) without embedded credentials');if(base&&url.origin!==baseUrl.origin)throw new TypeError('HTTP client requests cannot escape the configured base origin');return url;}
export function createHttp(environment:HttpEnvironment={}) {const transport=environment.fetch??globalThis.fetch?.bind(globalThis);if(!transport)throw new TypeError('No Fetch API implementation is available');const clients=environment.clients??Object.freeze(Object.create(null)),maxItems=environment.maxResponseItems??100_000,maxDepth=environment.maxResponseDepth??64;if(!Number.isSafeInteger(maxItems)||maxItems<1||!Number.isSafeInteger(maxDepth)||maxDepth<1)throw new TypeError('HTTP validation limits must be positive safe integers');
  const request=async(method:HttpMethod,path:string,options:HttpOptions={}):Promise<unknown>=>{if(!httpMethods.has(method))throw new TypeError(`Unsupported HTTP method ${method}`);const clientName=options.client??environment.defaultClient,client=clientName?clients[clientName]:undefined;if(clientName&&!client)throw new TypeError(`Unknown HTTP client ${clientName}`);const url=resolveHttpUrl(path,client?.base);for(const [name,value] of Object.entries(options.params??{})){if(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw new TypeError(`Invalid HTTP parameter ${name}`);url.searchParams.set(name,String(value));}let current:HttpRequest={method,url:url.href,headers:new Headers(options.headers),body:options.body,signal:options.signal,response:options.response};current.headers.forEach((value,name)=>{if(/[\r\n\0]/.test(name+value))throw new TypeError(`HTTP header ${name} contains forbidden control characters`);});if(client?.auth){if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new TypeError('Bearer authentication requires HTTPS or a loopback host');if(current.headers.has('authorization'))throw new TypeError('Authorization is controlled by the selected HTTP client');const token=await client.auth();if(token!==null&&token!==undefined){if(typeof token!=='string'||!token||/[\s\0]/.test(token))throw new TypeError('Bearer token must be a non-empty string without whitespace');current.headers.set('authorization',`Bearer ${token}`);}}
    try{for(const interceptor of client?.request??[]){const next=await interceptor(current);if(next!==undefined)current=next;if(!current||!httpMethods.has(current.method)||typeof current.url!=='string'||!(current.headers instanceof Headers))throw new TypeError('Request interceptor returned an invalid request');}const finalUrl=resolveHttpUrl(current.url,client?.base);if(client?.auth&&finalUrl.origin!==url.origin)throw new TypeError('Authenticated request interceptor cannot change request origin');let body:BodyInit|undefined;if(current.body!==undefined){if(current.method==='GET')throw new TypeError('GET requests cannot have a body');if(current.body instanceof FormData||current.body instanceof Blob||current.body instanceof ArrayBuffer||ArrayBuffer.isView(current.body)||typeof current.body==='string')body=current.body as BodyInit;else{body=JSON.stringify(current.body);if(!current.headers.has('content-type'))current.headers.set('content-type','application/json');}}const response=await transport(finalUrl,{method:current.method,headers:current.headers,body,signal:current.signal,credentials:'same-origin',redirect:client?.auth?'error':'follow'});if(!response.ok)throw new HttpError(`HTTP ${response.status} ${response.statusText}`.trim(),response.status,response);let value:unknown;if(response.status===204)value=undefined;else{if(current.response){const contentType=response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();if(contentType!=='application/json'&&!contentType?.endsWith('+json'))throw new HttpError('Typed HTTP response requires JSON content',response.status,response);}value=await response.json();}for(const interceptor of client?.response??[])value=await interceptor(value,response,current);return current.response?validateHttpValue(value,current.response,'response',maxItems,maxDepth):value;}catch(original){let error:unknown=original;for(const interceptor of client?.error??[])try{error=await interceptor(error,current);}catch(next){error=next;}throw error;}};
  return Object.freeze({request,get:(url:string,options?:HttpOptions)=>request('GET',url,options),post:(url:string,options?:HttpOptions)=>request('POST',url,options),put:(url:string,options?:HttpOptions)=>request('PUT',url,options),patch:(url:string,options?:HttpOptions)=>request('PATCH',url,options),delete:(url:string,options?:HttpOptions)=>request('DELETE',url,options)});
}
export const http=createHttp();
let pendingNavigation:{router:RoutingContext;path:string;pop:boolean}|undefined;
const changedSignals:Signal[]=[],previousValues:Value[]=[];
const commitHooks:CommitHook[]=[],rollbackHooks:(()=>void)[]=[],transactionParticipants:(()=>unknown)[]=[];

function assertNumber(value:unknown):void {if(typeof value==='number'&&!Number.isSafeInteger(value))throw new RangeError('State exceeded safe integer range');}
function routeSegments(path:string):string[] {
  if(typeof path!=='string'||path.length>2048||!path.startsWith('/')||path.startsWith('//')||/[\\\u0000-\u0020\u007f]/.test(path))throw new TypeError('Invalid route URL: expected a local absolute path of at most 2048 characters');
  const pathname=path.split(/[?#]/,1)[0];if(pathname==='/')return [];
  return pathname.slice(1).split('/').map(segment=>{let value:string;try{value=decodeURIComponent(segment);}catch{throw new TypeError('Invalid route URL encoding');}if(!value||value==='.'||value==='..'||/[\/\\\u0000-\u001f\u007f]/.test(value))throw new TypeError('Invalid route URL segment');return value;});
}
function navigationPath(value:Value,window:Window):string {
  if(typeof value!=='string')throw new TypeError('navigate requires a string path');routeSegments(value);
  const url=new URL(value,window.location.href);if(url.origin!==window.location.origin||url.username||url.password)throw new TypeError('Navigation requires a same-origin URL');const path=url.pathname+url.search+url.hash;routeSegments(path);return path;
}
function resolveRuntimeLimits(overrides:Partial<RuntimeLimits>):RuntimeLimits {const result={...defaultRuntimeLimits,...overrides};for(const [name,value] of Object.entries(result))if(!Number.isSafeInteger(value)||value<1)throw new TypeError(`Runtime limit ${name} must be a positive safe integer`);return result;}
function reserve(budget:ResourceBudget,name:ResourceName,amount:number,limit:number,label:string):void {if(budget[name]+amount>limit)throw new RangeError(`${label} exceeds the configured limit of ${limit}`);budget[name]+=amount;}
function release(budget:ResourceBudget,name:ResourceName,amount=1):void {budget[name]-=amount;}
function releaseComponent(budget:ResourceBudget,reservation:Reservation):void {if(!reservation.released){reservation.released=true;release(budget,'components');}}
function consumeWork(budget:ResourceBudget,amount=1):void {if(budget.work+amount>budget.limits.maxWorkPerOperation)throw new RangeError(`Framework work exceeds the configured limit of ${budget.limits.maxWorkPerOperation}`);budget.work+=amount;}
function withWork<T>(budget:ResourceBudget,run:()=>T):T {const outer=budget.workDepth++===0;if(outer)budget.work=0;try{return run();}finally{budget.workDepth--;if(outer)budget.work=0;}}
function signal<T=Value>(value:T,itemType?:ItemType,itemSchema?:string):Signal<T>{assertNumber(value);return {value,subscribers:new Set(),...(itemType?{itemType}:{}),...(itemSchema?{itemSchema}:{})};}
function read<T>(source:Signal<T>):T {if(source.dirty)source.derive!();if(activeEffect&&!activeEffect.disposed){source.subscribers.add(activeEffect);activeEffect.dependencies.add(source as Signal);}return source.value;}
function rememberValue(source:Signal):void {
  if(!transactionDepth||source.derive)return;
  if(changedSignals.includes(source))return;
  changedSignals.push(source);previousValues.push(source.value);
}
function enqueue(effect:ReactiveEffect):void {
  if(effect.disposed)return;
  if(!effect.computed){pendingEffects.add(effect);return;}
  if(effect.computed.dirty){pendingComputed.add(effect);return;}
  effect.computed.dirty=true;pendingComputed.add(effect);
  // Invalidate derived descendants now, so reads inside an action see current
  // values. DOM subscribers are queued only if the derived value changes.
  for(const subscriber of effect.computed.subscribers)if(subscriber.computed)enqueue(subscriber);
}
function flush():void {
  if(batchDepth||flushing)return;flushing=true;
  let updates=0;
  try{while(pendingComputed.size||pendingEffects.size){while(pendingComputed.size){const effect=pendingComputed.values().next().value!;if(++updates>effect.maxUpdates)throw new RangeError(`Reactive update limit of ${effect.maxUpdates} exceeded`);effect();}if(pendingEffects.size){const effect=pendingEffects.values().next().value!;if(++updates>effect.maxUpdates)throw new RangeError(`Reactive update limit of ${effect.maxUpdates} exceeded`);effect();}}}
  finally{flushing=false;pendingComputed.clear();pendingEffects.clear();}
}
function batch<T>(run:()=>T):T {batchDepth++;let complete=false;try{const result=run();complete=true;return result;}finally{batchDepth--;if(complete)flush();}}
function untracked<T>(run:()=>T):T {const previous=activeEffect;activeEffect=undefined;try{return run();}finally{activeEffect=previous;}}
function write<T>(source:Signal<T>,value:T):void {assertNumber(value);if(Object.is(source.value,value))return;rememberValue(source as Signal);source.value=value;for(const subscriber of source.subscribers)enqueue(subscriber);flush();}
function createEffect(run:()=>void,budget:ResourceBudget,computed?:Signal,maxUpdates=budget.limits.maxUpdatesPerFlush):ReactiveEffect {
  reserve(budget,'effects',1,budget.limits.maxReactiveEffects,'Reactive effects');
  const effect=(()=>{if(effect.disposed)return;consumeWork(budget);pendingComputed.delete(effect);pendingEffects.delete(effect);if(computed)computed.dirty=false;for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies.clear();const previous=activeEffect;activeEffect=effect;try{run();}finally{activeEffect=previous;}}) as ReactiveEffect;
  effect.dependencies=new Set();effect.disposed=false;effect.computed=computed;effect.maxUpdates=maxUpdates;effect.budget=budget;
  if(computed){computed.derive=effect;computed.dirty=true;}
  else try{effect();}catch(error){stop(effect);throw error;}
  return effect;
}
function stop(effect:ReactiveEffect):void {if(effect.disposed)return;effect.disposed=true;release(effect.budget,'effects');pendingComputed.delete(effect);pendingEffects.delete(effect);for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies.clear();}

function clearTransaction():void {changedSignals.length=previousValues.length=commitHooks.length=rollbackHooks.length=transactionParticipants.length=0;pendingNavigation=undefined;}
function participate(disable:()=>unknown):void {if(!transactionParticipants.includes(disable))transactionParticipants.push(disable);}
function stageStructure(commit:CommitHook,rollback:()=>void):void {if(transactionDepth){commitHooks.push(commit);rollbackHooks.push(rollback);}else{const errors=commit();if(errors?.length)throw new AggregateError(errors,'Structural update committed but cleanup failed');}}
function disableParticipants(participants:(()=>unknown)[],errors:unknown[]):void {for(const disable of participants)try{const failure=disable();if(failure)errors.push(failure);}catch(error){errors.push(error);}}
function rollbackTransaction(original:unknown,batched:boolean,budget:ResourceBudget):never {
  if(batched)batchDepth--;
  const sources=[...changedSignals],values=[...previousValues],rollbacks=[...rollbackHooks].reverse(),participants=[...transactionParticipants];
  transactionDepth=0;pendingComputed.clear();pendingEffects.clear();clearTransaction();
  for(let index=sources.length-1;index>=0;index--)sources[index].value=values[index];
  const recoveryErrors:unknown[]=[];
  for(const rollback of rollbacks)try{rollback();}catch(error){recoveryErrors.push(error);}
  budget.work=0;for(const source of sources)for(const effect of source.subscribers)effect.budget.work=0;
  batchDepth++;try{for(const source of sources)for(const effect of source.subscribers)enqueue(effect);}finally{batchDepth--;try{flush();}catch(error){recoveryErrors.push(error);}}
  if(recoveryErrors.length){disableParticipants(participants,recoveryErrors);throw new AggregateError([original,...recoveryErrors],'Transaction failed and recovery was incomplete',{cause:original});}
  throw original;
}
function transact<T>(run:()=>T,disable:()=>unknown,budget:ResourceBudget):T {return withWork(budget,()=>{
  if(transactionDepth){participate(disable);return run();}
  clearTransaction();transactionDepth=1;participate(disable);batchDepth++;let batched=true;let result:T;
  try{result=run();batchDepth--;batched=false;flush();
    // History may fail. Attempt it after preparation, while rollback is available.
    if(pendingNavigation){const {router,path,pop}=pendingNavigation,accept=router.prepare(path);if(!pop&&path!==router.url)router.window.history.pushState(null,'',path);accept();}
  }
  catch(error){return rollbackTransaction(error,batched,budget);}
  if(!commitHooks.length){transactionDepth=0;clearTransaction();return result;}
  const commits=[...commitHooks],participants=[...transactionParticipants];transactionDepth=0;clearTransaction();
  const previousCommit=committing;committing=true;try{
  if(commits.length){const cleanupErrors:unknown[]=[],fatalErrors:unknown[]=[];for(const commit of commits)try{const errors=commit();if(errors?.length)cleanupErrors.push(...errors);}catch(error){fatalErrors.push(error);}if(fatalErrors.length)disableParticipants(participants,fatalErrors);const errors=[...fatalErrors,...cleanupErrors];if(errors.length)throw new AggregateError(errors,fatalErrors.length?'Structural commit failed; affected components were disabled':'Transaction committed but cleanup failed');}
  }finally{committing=previousCommit;}
  return result;
});
}

// Indices of the longest ordered group of retained records. Reconciliation only
// moves records outside this group; new records use the sentinel -1.
function orderedIndices(positions:number[]):Set<number> {
  const tails:number[]=[],previous=new Array<number>(positions.length).fill(-1);
  positions.forEach((position,index)=>{if(position<0)return;const end=tails[tails.length-1];if(positions[end]<position){previous[index]=end;tails.push(index);return;}let low=0,high=tails.length;while(low<high){const middle=(low+high)>>>1;if(positions[tails[middle]]<position)low=middle+1;else high=middle;}if(low)previous[index]=tails[low-1];tails[low]=index;});
  const result=new Set<number>();let index=tails[tails.length-1];while(index!==undefined&&index>=0){result.add(index);index=previous[index];}return result;
}

export function mountComponent(target:Element,model:Model,components:Mount[],supplied:Record<string,Primitive>={},limitOverrides:Partial<RuntimeLimits>={},componentDepth=0,events:Record<string,(payload?:Primitive)=>void>={},shared:SharedDefinition[]=[]):Dispose {
  return mountComponentWithState(target,model,components,supplied,{},limitOverrides,componentDepth,events,shared);
}

export function mountComponentWithState(target:Element,model:Model,components:Mount[],supplied:Record<string,Primitive>,initialState:InitialState,limitOverrides:Partial<RuntimeLimits>={},componentDepth=0,events:Record<string,(payload?:Primitive)=>void>={},shared:SharedDefinition[]=[]):Dispose {
  const limits=resolveRuntimeLimits(limitOverrides),budget:ResourceBudget={limits,components:0,records:0,domNodes:0,effects:0,work:0,workDepth:0};return mountComponentTree(target,model,components,supplied,initialState,limits,componentDepth,budget,undefined,events,shared,new Map(),true);
}

export function mountComponentWithContent(target:Element,model:Model,components:Mount[],supplied:Record<string,Primitive>,initialState:InitialState,content:ContentMount,limitOverrides:Partial<RuntimeLimits>={},componentDepth=0,events:Record<string,(payload?:Primitive)=>void>={},shared:SharedDefinition[]=[]):Dispose {
  const limits=resolveRuntimeLimits(limitOverrides),budget:ResourceBudget={limits,components:0,records:0,domNodes:0,effects:0,work:0,workDepth:0};return mountComponentTree(target,model,components,supplied,initialState,limits,componentDepth,budget,content,events,shared,new Map(),true);
}

function mountComponentTree(target:Element,model:Model,components:Mount[],supplied:Record<string,Primitive>,initialState:InitialState,limits:RuntimeLimits,componentDepth:number,budget:ResourceBudget,content:ContentMount|undefined,events:Record<string,(payload?:Primitive)=>void>,shared:SharedDefinition[],sharedRegistry:SharedRegistry,ownsSharedRegistry=false):Dispose {
  if(componentDepth>=limits.maxComponentDepth)throw new RangeError(`Component nesting exceeds the configured limit of ${limits.maxComponentDepth}`);
  reserve(budget,'components',1,limits.maxComponentInstances,'Component instances');const reservation:Reservation={released:false};
  try{return withWork(budget,()=>mountComponentInternal(target,model,components,supplied,initialState,limits,componentDepth,budget,reservation,content,events,shared,sharedRegistry,ownsSharedRegistry));}catch(error){releaseComponent(budget,reservation);if(ownsSharedRegistry)sharedRegistry.clear();throw error;}
}

function mountComponentInternal(target:Element|undefined,model:Model,components:Mount[],supplied:Record<string,Primitive>,initialState:InitialState,limits:RuntimeLimits,componentDepth:number,budget:ResourceBudget,componentReservation:Reservation,content:ContentMount|undefined,events:Record<string,(payload?:Primitive)=>void>,shared:SharedDefinition[],sharedRegistry:SharedRegistry,ownsSharedRegistry:boolean):Dispose {
  const scope=Object.create(null) as Scope,classDefaults=new Map<ClassModel,Primitive[]>(),classSchemas=new Map<ClassModel,string>(),ownedEffects:ReactiveEffect[]=[];const cleanups:CleanupBag=[];let disposed=false;
  const track=(run:()=>void,bag=ownedEffects)=>{const effect=createEffect(run,budget,undefined,limits.maxUpdatesPerFlush);bag.push(effect);return effect;};
  for(const key of Object.keys(supplied))if(key!=='class'&&!Object.hasOwn(model.props,key))throw new TypeError(`Unknown prop ${key}`);
  let forwardClass='';if(Object.hasOwn(supplied,'class')){const value=supplied.class;if(typeof value!=='string')throw new TypeError('Invalid prop class');forwardClass=value;}
  for(const [name,initial] of Object.entries(model.props)){consumeWork(budget);const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);scope[name]=signal(value);}
  const primitiveTypes=new Set<PrimitiveType>(['string','number','boolean']);
  const validatePrimitiveList=(value:readonly unknown[],itemType:PrimitiveType,name:string):Primitive[]=>{if(value.length>limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);consumeWork(budget,value.length);return value.map((item,index)=>{if(typeof item!==itemType)throw new TypeError(`${name}[${index}] requires ${itemType}`);if(itemType==='number')assertNumber(item);return item as Primitive;});};
  const validateInstanceList=(value:readonly unknown[],itemType:`class:${string}`,schema:string,name:string):Instance[]=>{if(value.length>limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);consumeWork(budget,value.length);return value.map((item,index)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw new TypeError(`${name}[${index}] requires ${itemType}`);const record=item as Instance;if(!instances.has(record)||record.__owner!==sharedRegistry||record.__class!==itemType.slice(6)||record.__schema!==schema)throw new TypeError(`${name}[${index}] requires ${itemType}`);return record;});};
  const validateTypedList=(value:readonly unknown[],itemType:ItemType,schema:string|undefined,name:string):Value[]=>primitiveTypes.has(itemType as PrimitiveType)?validatePrimitiveList(value,itemType as PrimitiveType,name):validateInstanceList(value,itemType as `class:${string}`,schema!,name);
  const recordClasses:Record<string,ClassModel>=Object.create(null);
  for(const entry of model.shared??[]){
    if(Object.hasOwn(scope,entry.name)||!Number.isSafeInteger(entry.index)||entry.index<0)throw new TypeError(`Invalid shared state ${entry.name}`);
    const definition=shared[entry.index];
    if(!definition||Object.getPrototypeOf(definition)!==Object.prototype||!definition.states||Object.getPrototypeOf(definition.states)!==Object.prototype||definition.types!==undefined&&Object.getPrototypeOf(definition.types)!==Object.prototype||definition.classes!==undefined&&Object.getPrototypeOf(definition.classes)!==Object.prototype)throw new TypeError(`Invalid shared state definition ${entry.name}`);
    let instance=sharedRegistry.get(definition);
    for(const [name,declaration] of Object.entries(definition.classes??{})){const schema=classSchema(declaration,name),local=model.classes[name],existing=recordClasses[name];if(local&&classSchema(local,name)!==schema||existing&&classSchema(existing,name)!==schema)throw new TypeError(`Class ${name} does not match shared record schema`);recordClasses[name]=declaration;}
    if(!instance){
      const fields:Record<string,Signal>=Object.create(null),declarations=definition.classes??{};
      for(const name of Object.keys(definition.types??{})){const declared=definition.types![name];if(!Object.hasOwn(definition.states,name)||!Array.isArray(definition.states[name])||!primitiveTypes.has(declared as PrimitiveType)&&!Object.hasOwn(declarations,declared))throw new TypeError(`Invalid shared list type ${name}`);}
      for(const [name,value] of Object.entries(definition.states)){
        consumeWork(budget);
        if(Array.isArray(value)){
          if(value.length>limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);
          const declared=definition.types?.[name],inferred=value.length&&primitiveTypes.has(typeof value[0] as PrimitiveType)?typeof value[0]:undefined;
          if(!declared&&!inferred)throw new TypeError(`Invalid shared list ${name}`);
          if(declared&&Object.hasOwn(declarations,declared)){consumeWork(budget,value.length);const itemType=`class:${declared}` as const,schema=classSchema(declarations[declared],declared),records=value.map((record,index)=>hydrateRecord(declarations,declared,record,`Shared list ${name}[${index}]`,false));fields[name]=signal(records,itemType,schema);}
          else{const itemType=(declared??inferred) as PrimitiveType;if(!primitiveTypes.has(itemType)||inferred!==undefined&&itemType!==inferred)throw new TypeError(`Invalid shared list ${name}`);fields[name]=signal(validatePrimitiveList(value,itemType,`Shared list ${name}`),itemType);}
        }else{const scalar=value as Primitive;if(!primitiveTypes.has(typeof scalar as PrimitiveType))throw new TypeError(`Invalid shared value ${name}`);assertNumber(scalar);fields[name]=signal(scalar);}
      }
      instance={__shared:entry.name,fields};sharedRegistry.set(definition,instance);
    }
    scope[entry.name]=instance;
  }
  const stateClasses:Record<string,ClassModel>=Object.assign(Object.create(null),recordClasses,model.classes);
  const getSignal=(name:string,local:Scope):Signal=>{const value=local[name];if(!value||typeof value==='function'||'__class'in value||'__shared'in value||'__resource'in value)throw new TypeError(`Unknown writable value ${name}`);return value;};
  function evaluate(expression:Expr,local=scope):Value {
    consumeWork(budget);
    if(expression.kind==='literal'){assertNumber(expression.value);return expression.value;}
    if(expression.kind==='reference'){const value=local[expression.name];if(!value)throw new TypeError(`Unknown value ${expression.name}`);return typeof value==='function'?value():'__class'in value||'__shared'in value||'__resource'in value?value:read(value);}
    if(expression.kind==='member'){const owner=evaluate(expression.object,local);if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner)&&!('__shared'in owner)&&!('__resource'in owner))throw new TypeError('Member access requires a class instance, resource, or shared state');const field=owner.fields[expression.name];if(field)return read(field);if('__class'in owner){const computed=owner.computed[expression.name];if(computed)return evaluate(computed,owner.scope);}throw new TypeError(`Unknown member ${expression.name}`);}
    if(expression.kind==='not')return !boolean(evaluate(expression.argument,local),'not');
    if(expression.kind==='and'){const left=boolean(evaluate(expression.left,local),'and');return left&&boolean(evaluate(expression.right,local),'and');}
    if(expression.kind==='or'){const left=boolean(evaluate(expression.left,local),'or');return left||boolean(evaluate(expression.right,local),'or');}
    if(expression.kind==='equal'||expression.kind==='notEqual'){const left=evaluate(expression.left,local),right=evaluate(expression.right,local);if(typeof left!==typeof right)throw new TypeError('Comparison requires operands of the same type');return expression.kind==='equal'?left===right:left!==right;}
    if(expression.kind==='str')return String(evaluate(expression.argument,local));
    if(expression.kind==='len'){const value=evaluate(expression.argument,local);if(!Array.isArray(value))throw new TypeError('len requires a list');return value.length;}
    if(expression.kind==='contains'){const left=evaluate(expression.left,local),right=evaluate(expression.right,local);if(typeof left!=='string'||typeof right!=='string')throw new TypeError('contains requires strings');return left.toLocaleLowerCase().includes(right.toLocaleLowerCase());}
    if(expression.kind==='count'){const left=evaluate(expression.left,local),right=evaluate(expression.right,local);if(!Array.isArray(left))throw new TypeError('count requires a list');consumeWork(budget,left.length);let total=0;for(const item of left)if(item===right)total++;return total;}
    if(expression.kind==='add'||expression.kind==='subtract'){const left=evaluate(expression.left,local),right=evaluate(expression.right,local);if(typeof left==='number'&&typeof right==='number'){const result=expression.kind==='add'?left+right:left-right;assertNumber(result);return result;}if(expression.kind==='subtract')throw new TypeError('Subtraction requires numbers');return String(left)+String(right);}
    if(expression.kind==='list'){if(expression.items.length>limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);consumeWork(budget,expression.items.length);return expression.items.map(item=>evaluate(item,local));}
    if(expression.kind==='construct')return instantiate(expression.name,expression.arguments.map(item=>evaluate(item,local)),model.classes);
    throw new TypeError('Unsupported expression');
  }
  function classSchema(declaration:ClassModel,name:string):string {
    if(!declaration||Object.getPrototypeOf(declaration)!==Object.prototype||!Array.isArray(declaration.fields)||!declaration.computed||Object.getPrototypeOf(declaration.computed)!==Object.prototype||!declaration.actions||Object.getPrototypeOf(declaration.actions)!==Object.prototype)throw new TypeError(`Invalid class schema ${name}`);
    const cached=classSchemas.get(declaration);if(cached)return cached;const names=new Set<string>();consumeWork(budget,declaration.fields.length);const schema=JSON.stringify(declaration.fields.map(field=>{if(!field||typeof field.name!=='string'||names.has(field.name)||field.initial?.kind!=='literal'||!primitiveTypes.has(typeof field.initial.value as PrimitiveType))throw new TypeError(`Invalid class field schema ${name}`);names.add(field.name);assertNumber(field.initial.value);return [field.name,typeof field.initial.value];}));classSchemas.set(declaration,schema);return schema;
  }
  function instantiate(name:string,args:Value[],declarations:Record<string,ClassModel>):Instance {
    consumeWork(budget);const declaration=declarations[name];if(!declaration)throw new TypeError(`Unknown class ${name}`);const schema=classSchema(declaration,name),instanceScope=Object.create(null) as Scope;
    if(args.length!==declaration.fields.length)throw new TypeError(`${name} requires ${declaration.fields.length} constructor values`);
    let defaults=classDefaults.get(declaration);if(!defaults){defaults=declaration.fields.map(field=>{if(field.initial.kind!=='literal')throw new TypeError(`Class field ${field.name} requires a literal default`);assertNumber(field.initial.value);return field.initial.value;});classDefaults.set(declaration,defaults);}
    const instance:Instance={__class:name,__schema:schema,__owner:sharedRegistry,fields:Object.create(null),computed:declaration.computed,actions:declaration.actions,scope:instanceScope};instances.add(instance);
    declaration.fields.forEach((field,index)=>{consumeWork(budget);const value=args[index],initial=defaults![index];if(typeof value!==typeof initial)throw new TypeError(`Class field ${field.name} requires ${typeof initial}`);const source=signal(value);instance.fields[field.name]=source;instanceScope[field.name]=source;});
    // Class derivations stay lazy: consumers subscribe directly to fields,
    // without a class-level effect that would outlive a removed list record.
    for(const [member,expression] of Object.entries(declaration.computed))instanceScope[member]=()=>evaluate(expression,instanceScope);
    return instance;
  }
  function hydrateRecord(declarations:Record<string,ClassModel>,className:string,input:unknown,label:string,allowMissing=true):Instance {
    const declaration=declarations[className];if(!declaration)throw new TypeError(`Unknown class ${className}`);classSchema(declaration,className);if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError(`${label} requires a plain object record`);const prototype=Object.getPrototypeOf(input);if(prototype!==Object.prototype&&prototype!==null)throw new TypeError(`${label} requires a plain object record`);const fields=new Set(declaration.fields.map(field=>field.name));for(const key of Object.keys(input))if(!fields.has(key))throw new TypeError(`Unknown field ${key} in ${label}`);const args=declaration.fields.map(field=>{const descriptor=Object.getOwnPropertyDescriptor(input,field.name);if(!descriptor){if(!allowMissing)throw new TypeError(`Missing field ${field.name} in ${label}`);return (field.initial as Extract<Expr,{kind:'literal'}>).value;}if(!('value'in descriptor))throw new TypeError(`${label}.${field.name} must be data`);const initial=(field.initial as Extract<Expr,{kind:'literal'}>).value;if(typeof descriptor.value!==typeof initial)throw new TypeError(`${label}.${field.name} requires ${typeof initial}`);if(typeof descriptor.value==='number')assertNumber(descriptor.value);return descriptor.value as Primitive;});return instantiate(className,args,declarations);
  }
  function hydrateInitialList(expression:Expr,input:readonly unknown[],name:string):Value[] {
    if(expression.kind!=='list')throw new TypeError(`Initial state ${name} is not a typed list`);
    if(input.length>limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);consumeWork(budget,input.length);
    const schema=expression.items[0],declared=expression.itemType;
    const primitive=(value:unknown,expected:Primitive,label:string):Primitive=>{if(typeof value!==typeof expected)throw new TypeError(`${label} requires ${typeof expected}`);if(typeof value==='number')assertNumber(value);return value as Primitive;};
    if(declared&&primitiveTypes.has(declared as PrimitiveType))return input.map((value,index)=>{if(typeof value!==declared)throw new TypeError(`Initial state ${name}[${index}] requires ${declared}`);if(declared==='number')assertNumber(value);return value as Primitive;});
    if(schema?.kind==='literal')return input.map((value,index)=>primitive(value,schema.value,`Initial state ${name}[${index}]`));
    const className=declared??(schema?.kind==='construct'?schema.name:undefined);if(!className||!Object.hasOwn(stateClasses,className))throw new TypeError(`Initial state ${name} requires primitive or class records`);
    return input.map((value,index)=>hydrateRecord(stateClasses,className,value,`Initial state ${name}[${index}]`));
  }
  const listMetadata=(expression:Expr):{itemType:ItemType;schema?:string}|undefined=>{if(expression.kind!=='list')return;const declared=expression.itemType;if(declared){if(primitiveTypes.has(declared as PrimitiveType))return {itemType:declared as PrimitiveType};const declaration=stateClasses[declared];if(!declaration)throw new TypeError(`Unknown class ${declared}`);return {itemType:`class:${declared}`,schema:classSchema(declaration,declared)};}const first=expression.items[0];if(first?.kind==='literal')return {itemType:typeof first.value as PrimitiveType};if(first?.kind==='construct'){const declaration=model.classes[first.name];return {itemType:`class:${first.name}`,schema:classSchema(declaration,first.name)};}};
  for(const name of Object.keys(initialState))if(!Object.hasOwn(model.states,name))throw new TypeError(`Unknown initial state ${name}`);
  const hydrateState=(initial:Expr,input:unknown,name:string):Value=>{if(Array.isArray(input))return hydrateInitialList(initial,input,name);const expected=evaluate(initial);if(typeof expected!==typeof input||typeof input==='object')throw new TypeError(`Initial state ${name} requires ${typeof expected}`);assertNumber(input);return input as Primitive;};
  for(const [name,initial] of Object.entries(model.states)){consumeWork(budget);const metadata=listMetadata(initial);scope[name]=signal(Object.hasOwn(initialState,name)?hydrateState(initial,initialState[name],name):evaluate(initial),metadata?.itemType,metadata?.schema);}
  const application=httpApplication,httpFunctions=application.functions??Object.freeze(Object.create(null));
  const resolveHttpFunction=<T extends Function>(name:string,kind:string):T=>{const value=httpFunctions[name];if(typeof value!=='function')throw new TypeError(`Unknown HTTP ${kind} function ${name}`);return value as T;};
  const httpClients:Record<string,HttpClientConfig>=Object.create(null);
  for(const [name,declaration] of Object.entries(model.httpClients??{})){
    const base=declaration.base?evaluate(declaration.base):undefined;if(base!==undefined&&typeof base!=='string')throw new TypeError(`HTTP client ${name} base requires a string`);
    const request:HttpRequestInterceptor[]=[],response:HttpResponseInterceptor[]=[],error:HttpErrorInterceptor[]=[];
    for(const item of declaration.interceptors){const handler=resolveHttpFunction(item.handler,'interceptor');(item.phase==='request'?request:item.phase==='response'?response:error).push(handler as never);}
    httpClients[name]={...(base?{base}:{}),...(declaration.auth?{auth:resolveHttpFunction(declaration.auth.provider,'auth provider') as ()=>string|Promise<string>} :{}),request,response,error};
  }
  if(application.client)httpClients.__application=application.client;
  const serializeHttpBody=(value:Value,depth=0):unknown=>{if(depth>64)throw new RangeError('HTTP body exceeds the maximum serialization depth of 64');if(typeof value!=='object')return value;if(Array.isArray(value)){if(value.length>limits.maxCollectionItems)throw new RangeError(`HTTP body exceeds the maximum of ${limits.maxCollectionItems} items`);return value.map(item=>serializeHttpBody(item,depth+1));}if('__class'in value){const result=Object.create(null) as Record<string,unknown>;for(const [name,field] of Object.entries(value.fields))result[name]=serializeHttpBody(read(field),depth+1);return result;}throw new TypeError('HTTP body supports primitives, lists, and class records');};
  for(const query of model.queries??[]){
    if(Object.hasOwn(scope,query.name))throw new TypeError(`Duplicate query resource ${query.name}`);let generation=0;const controllers=new Set<AbortController>();let activeRead:AbortController|undefined;
    const fields:Record<string,Signal>={data:signal(''),loading:signal(true),refreshing:signal(false),error:signal(''),success:signal(false),empty:signal(true)};
    const resource:HttpResourceInstance={__resource:query.name,fields,refresh:()=>{
      const current=++generation,hadData=read(fields.success)===true;if(query.method==='get')activeRead?.abort();const controller=new AbortController();controllers.add(controller);if(query.method==='get')activeRead=controller;
      batch(()=>{write(fields.error,'');write(fields.loading,!hadData);write(fields.refreshing,hadData);});
      const responseName=query.response;let schema:HttpResponseSchema;if(['string','number','boolean'].includes(responseName))schema=responseName as PrimitiveType;else{const declaration=stateClasses[responseName];if(!declaration)throw new TypeError(`Unknown response class ${responseName}`);classSchema(declaration,responseName);schema={fields:Object.fromEntries(declaration.fields.map(field=>[field.name,typeof (field.initial as Extract<Expr,{kind:'literal'}>).value as PrimitiveType]))};}if(query.responseList)schema={list:schema};
      const selected=query.client??(application.client?'__application':undefined),api=createHttp({clients:httpClients,...(selected?{defaultClient:selected}:{}),maxResponseItems:limits.maxCollectionItems});
      const headers=Object.fromEntries(query.headers.map(item=>{const value=evaluate(item.value);if(typeof value!=='string')throw new TypeError(`HTTP header ${item.name} requires a string`);return [item.name,value];})),params=Object.fromEntries(query.params.map(item=>{const value=evaluate(item.value);if(!['string','number','boolean'].includes(typeof value))throw new TypeError(`HTTP parameter ${item.name} requires a primitive`);return [item.name,value as Primitive];}));
      const options={headers,params,...(query.body?{body:serializeHttpBody(evaluate(query.body))}:{}),response:schema,signal:controller.signal};
      const failRequest=(failure:unknown)=>{if(disposed||current!==generation||controller.signal.aborted)return;const message=failure instanceof Error?failure.message:String(failure);batch(()=>{write(fields.loading,false);write(fields.refreshing,false);write(fields.error,message);write(fields.success,false);});};
      void api[query.method](evaluate(query.url) as string,options).then(value=>{if(disposed||current!==generation)return;try{let data:Value;if(query.responseList)data=(value as unknown[]).map((item,index)=>['string','number','boolean'].includes(responseName)?item as Primitive:hydrateRecord(stateClasses,responseName,item,`${query.name}.data[${index}]`,false));else data=['string','number','boolean'].includes(responseName)?value as Primitive:hydrateRecord(stateClasses,responseName,value,`${query.name}.data`,false);batch(()=>{write(fields.data,data);write(fields.loading,false);write(fields.refreshing,false);write(fields.success,true);write(fields.empty,Array.isArray(data)?data.length===0:false);});}catch(failure){failRequest(failure);}},failRequest).finally(()=>{controllers.delete(controller);if(activeRead===controller)activeRead=undefined;});
    }};
    scope[query.name]=resource;cleanups.push(()=>{generation++;for(const controller of controllers)controller.abort();controllers.clear();activeRead=undefined;});resource.refresh();
  }
  for(const name of Object.keys(model.computed))scope[name]=signal('');
  try{for(const [name,expression] of Object.entries(model.computed)){const source=getSignal(name,scope);ownedEffects.push(createEffect(()=>write(source,evaluate(expression)),budget,source,limits.maxUpdatesPerFlush));}}catch(error){disposeBag(ownedEffects,cleanups);throw error;}
  function resolveTarget(target:Expr,local:Scope):Signal {
    if(target.kind==='reference'){const source=getSignal(target.name,local);if(source.derive)throw new TypeError(`Cannot assign read-only value ${target.name}`);return source;}
    if(target.kind==='member'){const owner=evaluate(target.object,local);if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner)&&!('__shared'in owner))throw new TypeError('Member assignment requires an instance or shared state');const result=owner.fields[target.name];if(!result)throw new TypeError(`Member ${target.name} is read-only or unknown`);return result;}
    throw new TypeError('Invalid assignment target');
  }
  const writeTarget=(target:Signal,value:Value,label:string):void=>{if(target.itemType){if(!Array.isArray(value))throw new TypeError(`${label} requires a list of ${target.itemType}`);write(target,validateTypedList(value,target.itemType,target.itemSchema,label));return;}write(target,value);};
  function execute(statements:Statement[],local=scope,event?:Event):void {
    transact(()=>{consumeWork(budget,statements.length);for(const statement of statements){
      if(statement.kind==='navigate'){
        const router=budget.router;if(!router?.ready)throw new TypeError('navigate requires a mounted router');
        if(flushing||committing)throw new TypeError('Navigation during rendering or lifecycle finalization is unsupported');
        const path=navigationPath(evaluate(statement.path,local),router.window);
        if(pendingNavigation&&pendingNavigation.router!==router)throw new TypeError('A transaction cannot navigate multiple apps');
        pendingNavigation={router,path,pop:false};write(router.path,path);
      }
      else if(statement.kind==='assign'){const target=resolveTarget(statement.target,local),value=evaluate(statement.value,local);writeTarget(target,value,'List assignment');}
      else if(statement.kind==='emit'){
        const expected=model.events?.[statement.event];if(!model.events||!Object.hasOwn(model.events,statement.event))throw new TypeError(`Undeclared event ${statement.event}`);const payload=statement.payload?evaluate(statement.payload,local):undefined;
        if((payload===undefined?null:typeof payload)!==expected)throw new TypeError(`Invalid payload for event ${statement.event}`);if(typeof payload==='number')assertNumber(payload);const listener=events[statement.event];if(listener)listener(payload as Primitive|undefined);
      } else if(statement.kind==='eventAssign'){
        const element=event?.currentTarget;if(!(element instanceof HTMLInputElement))throw new TypeError('Event value requires an input element');writeTarget(resolveTarget(statement.target,local),statement.member==='value'?element.value:element.checked,'Event assignment');
      } else {
        const owner=evaluate(statement.target,local);const args=statement.arguments.map(argument=>evaluate(argument,local));
        if(owner&&typeof owner==='object'&&!Array.isArray(owner)&&'__resource'in owner){if(statement.method!=='refresh'||args.length)throw new TypeError('Resources support only refresh()');owner.refresh();}
        else if(Array.isArray(owner)){
          const source=resolveTarget(statement.target,local);if(source.itemType&&statement.method!=='sort')validateTypedList([args[0]],source.itemType,source.itemSchema,'List operation');let next:Value[];
          if(statement.method==='append'){if(owner.length>=limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);next=[...owner,args[0]];}
          else if(statement.method==='remove'){const index=owner.indexOf(args[0]);if(index<0)continue;next=[...owner];next.splice(index,1);}
          else if(statement.method==='move'){const index=owner.indexOf(args[0]);if(index<0)continue;const requested=args[1];if(typeof requested!=='number'||!Number.isSafeInteger(requested))throw new TypeError('move index must be a safe integer');const destination=Math.max(0,Math.min(owner.length-1,requested));if(index===destination)continue;next=[...owner];const [item]=next.splice(index,1);next.splice(destination,0,item);}
          else if(statement.method==='sort'){if(source.itemType&&primitiveTypes.has(source.itemType as PrimitiveType))throw new TypeError('sort requires class records');const field=args[0],ascending=args[1];if(typeof field!=='string'||typeof ascending!=='boolean')throw new TypeError('sort requires a field and boolean direction');next=owner.map((item,index)=>({item,index})).sort((a,b)=>{if(!a.item||typeof a.item!=='object'||Array.isArray(a.item)||!instances.has(a.item)||!('__class'in a.item)||!b.item||typeof b.item!=='object'||Array.isArray(b.item)||!instances.has(b.item)||!('__class'in b.item))throw new TypeError('sort requires class records');const left=a.item.fields[field],right=b.item.fields[field];if(!left||!right)throw new TypeError(`Unknown sort field ${field}`);const x=read(left),y=read(right),order=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));return (ascending?order:-order)||(a.index-b.index);}).map(entry=>entry.item);}
          else throw new TypeError(`Unsupported list operation ${statement.method}`);write(source,next);
        } else if(owner&&typeof owner==='object'&&'__class'in owner){const body=owner.actions[statement.method];if(!body)throw new TypeError(`Unknown action ${statement.method}`);execute(body,owner.scope);}
        else throw new TypeError('Unsupported call target');
      }
    }},forceDisable,budget);
  }
  function boolean(value:Value,operator:string):boolean {if(typeof value!=='boolean')throw new TypeError(`${operator} requires boolean operands`);return value;}
  function evaluateCondition(expression:ConditionExpr,local:Scope):boolean {return boolean(evaluate(expression,local),'Condition');}
  function disposeBag(effects:ReactiveEffect[],callbacks:CleanupBag):void {for(const effect of effects)stop(effect);effects.length=0;const failures:unknown[]=[];for(const callback of callbacks.reverse())try{untracked(callback);}catch(error){failures.push(error);}callbacks.length=0;if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Multiple cleanup operations failed');}
  function forceDisable():unknown {if(disposed)return;disposed=true;let failure:unknown;try{disposeBag(ownedEffects,cleanups);}catch(error){failure=error;}finally{for(const name of Object.keys(scope))delete scope[name];supplied={};components=[];content=undefined;events={};shared=[];if(ownsSharedRegistry)sharedRegistry.clear();releaseComponent(budget,componentReservation);}return failure;}
  const childRuntime:RuntimeApi={mountComponent:(childTarget,childModel,childComponents,childProps={},_childLimits={},_childDepth=0,childEvents={},childShared=[])=>mountComponentTree(childTarget,childModel,childComponents,childProps,{},limits,componentDepth+1,budget,undefined,childEvents,childShared,sharedRegistry),mountComponentWithState:(childTarget,childModel,childComponents,childProps,state,_childLimits={},_childDepth=0,childEvents={},childShared=[])=>mountComponentTree(childTarget,childModel,childComponents,childProps,state,limits,componentDepth+1,budget,undefined,childEvents,childShared,sharedRegistry),mountComponentWithContent:(childTarget,childModel,childComponents,childProps,state,childContent,_childLimits={},_childDepth=0,childEvents={},childShared=[])=>mountComponentTree(childTarget,childModel,childComponents,childProps,state,limits,componentDepth+1,budget,childContent,childEvents,childShared,sharedRegistry),mountCounter};
  const makeComment=(document:Document,value:string):Comment=>{reserve(budget,'domNodes',1,limits.maxDomNodes,'Framework DOM nodes');try{return document.createComment(value);}catch(error){release(budget,'domNodes');throw error;}};
  const makeElement=(document:Document,tag:string):Element=>{reserve(budget,'domNodes',1,limits.maxDomNodes,'Framework DOM nodes');try{return document.createElement(tag);}catch(error){release(budget,'domNodes');throw error;}};
  const makeText=(document:Document,value:string):Text=>{reserve(budget,'domNodes',1,limits.maxDomNodes,'Framework DOM nodes');try{return document.createTextNode(value);}catch(error){release(budget,'domNodes');throw error;}};
  const trackNodes=(callbacks:CleanupBag,count=1)=>{if(callbacks.nodes===undefined){callbacks.nodes=0;callbacks.push(()=>{release(budget,'domNodes',callbacks.nodes!);callbacks.nodes=0;});}callbacks.nodes+=count;};
  function create(view:View,parent:Element|DocumentFragment,local=scope,forward='',effects=ownedEffects,callbacks:CleanupBag=cleanups,rootOwned=false,componentRuntime=childRuntime):void {
    consumeWork(budget);
    if(view.kind==='router'){
      if(budget.router)throw new TypeError('Only one router is supported per app');
      const window=parent.ownerDocument.defaultView;if(!window)throw new TypeError('Router requires a browser window');
      if(!Array.isArray(view.routes)||!view.routes.length||view.routes.length>Math.min(256,limits.maxCollectionItems))throw new TypeError('Invalid route table: at most 256 routes within the collection limit');consumeWork(budget,view.routes.length);
      const patterns=view.routes.map((route,index)=>{
        if(!route||typeof route.path!=='string'||!Array.isArray(route.children)||!route.children.length)throw new TypeError('Invalid route definition');
        if(route.path==='*'){if(index!==view.routes.length-1)throw new TypeError('Fallback route must be last');return {segments:[],names:[],specificity:-1};}
        if(route.path.length>2048||!route.path.startsWith('/')||route.path.startsWith('//'))throw new TypeError('Invalid route pattern');
        const segments=route.path==='/'?[]:route.path.slice(1).split('/'),names:string[]=[];consumeWork(budget,segments.length);
        for(const segment of segments){if(segment.startsWith(':'))throw new TypeError('Legacy :name route parameters are unsupported; use <name>, for example /products/<id>');if(segment.startsWith('<')){if(!segment.endsWith('>'))throw new TypeError('Route parameters must use <name> as a complete segment');const name=segment.slice(1,-1);if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||['__proto__','prototype','constructor'].includes(name)||names.includes(name)||name in local)throw new TypeError('Invalid or shadowed route parameter');names.push(name);}else if(!/^[A-Za-z0-9_-]+$/.test(segment))throw new TypeError('Invalid route pattern');}
        return {segments,names,specificity:segments.filter(segment=>!segment.startsWith('<')).length};
      });
      if(view.routes.at(-1)!.path!=='*')throw new TypeError('Router requires a final fallback route');
      for(let i=0;i<patterns.length-1;i++)for(let j=0;j<i;j++){const a=patterns[i],b=patterns[j];consumeWork(budget,Math.max(1,a.segments.length));if(a.specificity===b.specificity&&a.segments.length===b.segments.length&&a.segments.every((segment,k)=>segment===b.segments[k]||segment.startsWith('<')||b.segments[k].startsWith('<')))throw new TypeError('Duplicate or ambiguous route pattern');}
      type Match={index:number;params:Record<string,string>};let cachedPath:string|undefined,cached:Match;
      const match=(path:string):Match=>{
        if(path===cachedPath)return cached;consumeWork(budget,patterns.length);let parts:string[]|undefined;try{parts=routeSegments(path);}catch{/* Malformed browser paths select the fallback. */}
        let index=patterns.length-1,specificity=-1,params:Record<string,string>=Object.create(null);
        if(parts)patterns.forEach((pattern,i)=>{if(pattern.specificity<=specificity||pattern.segments.length!==parts!.length)return;consumeWork(budget,pattern.segments.length);if(!pattern.segments.every((segment,k)=>segment.startsWith('<')||segment===parts![k]))return;const next:Record<string,string>=Object.create(null);pattern.segments.forEach((segment,k)=>{if(segment.startsWith('<'))next[segment.slice(1,-1)]=parts![k];});index=i;specificity=pattern.specificity;params=next;});
        cachedPath=path;return cached={index,params};
      };
      const currentUrl=()=>window.location.pathname+window.location.search+window.location.hash;
      const initial=currentUrl(),committed=patterns.map(()=>Object.create(null) as Record<string,string>);
      const router:RoutingContext={window,path:signal(initial),url:initial,ready:false,prepare(path){const selected=match(path);return ()=>{committed[selected.index]=selected.params;router.url=path;};}};
      router.prepare(initial)();budget.router=router;
      const onPop=()=>{
        const previous=router.path.value,path=currentUrl();
        try{transact(()=>{pendingNavigation={router,path,pop:true};write(router.path,path);},forceDisable,budget);}
        catch(error){if(router.path.value===previous)try{window.history.replaceState(window.history.state,'',router.url);}catch(recovery){const disabled=forceDisable();throw new AggregateError([error,recovery,...(disabled?[disabled]:[])],'Route history recovery failed');}throw error;}
      };
      window.addEventListener('popstate',onPop);
      callbacks.push(()=>{router.ready=false;window.removeEventListener('popstate',onPop);if(budget.router===router)budget.router=undefined;});
      view.routes.forEach((route,index)=>{
        const routeScope=Object.create(local) as Scope;
        for(const name of patterns[index].names)routeScope[name]=()=>{const selected=match(read(router.path));return selected.index===index?selected.params[name]:committed[index][name]??'';};
        // Reuse transactional branch staging. Parameter changes retain this branch.
        const key='@route';routeScope[key]=()=>match(read(router.path)).index===index;
        create({kind:'conditional',condition:{kind:'reference',name:key},consequent:route.children,alternate:[]},parent,routeScope,forward,effects,callbacks,rootOwned,componentRuntime);
      });
      router.ready=true;return;
    }
    if(view.kind==='slot'){
      if(contentMounted)throw new TypeError('Component model contains multiple slots');contentMounted=true;if(!content)return;const project=content,dispose=untracked(()=>project(parent,componentRuntime));content=undefined;callbacks.push(dispose);return;
    }
    // Dynamic ranges can move out of their staging fragment. Resolve insertion
    // parents from live anchors so nested scopes keep updating in place.
    if(view.kind==='conditional'){
      const anchor=makeComment(parent.ownerDocument,'if');let selected:boolean|undefined,alive=true;let branchEffects:ReactiveEffect[]=[];let branchCleanups:CleanupBag=[];
      callbacks.push(()=>{alive=false;try{disposeBag(branchEffects,branchCleanups);}finally{anchor.remove();release(budget,'domNodes');}});parent.append(anchor);
      const update=createEffect(()=>{const next=Boolean(evaluateCondition(view.condition,local));if(next===selected)return;untracked(()=>{
        const nextEffects:ReactiveEffect[]=[],nextCleanups:CleanupBag=[],fragment=parent.ownerDocument.createDocumentFragment();
        try{for(const child of next?view.consequent:view.alternate)create(child,fragment,local,forward,nextEffects,nextCleanups,false,componentRuntime);}
        catch(error){try{disposeBag(nextEffects,nextCleanups);}catch(cleanup){throw new AggregateError([error,cleanup],'Conditional preparation and cleanup failed',{cause:error});}throw error;}
        const previousEffects=branchEffects,previousCleanups=branchCleanups;
        stageStructure(()=>{if(!alive){try{disposeBag(nextEffects,nextCleanups);}catch(error){return [error];}return;}if(!anchor.parentNode)throw new TypeError('Conditional anchor is detached');anchor.parentNode.insertBefore(fragment,anchor);selected=next;branchEffects=nextEffects;branchCleanups=nextCleanups;try{disposeBag(previousEffects,previousCleanups);}catch(error){return [error];}},()=>disposeBag(nextEffects,nextCleanups));
      });},budget,undefined,limits.maxUpdatesPerFlush);effects.push(update);return;
    }
    if(view.kind==='iteration'){
      const document=parent.ownerDocument,anchor=makeComment(document,'for');
      type Record={start:Comment;end:Comment;item:Signal;index:number;effects:ReactiveEffect[];cleanups:CleanupBag};
      const records=new Map<Primitive,Record>(),keyScope=Object.create(local) as Scope,keyItem=signal<Value>('');keyScope[view.item]=keyItem;
      let update:ReactiveEffect|undefined,alive=true;
      callbacks.push(()=>{alive=false;if(update)stop(update);const failures:unknown[]=[],ordered=[...records.values()];try{for(let index=ordered.length-1;index>=0;index--)try{disposeBag(ordered[index].effects,ordered[index].cleanups);}catch(error){failures.push(error);}}finally{records.clear();anchor.remove();release(budget,'domNodes');}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Iteration disposal failed');});parent.append(anchor);
      const move=(record:Record,before:Node)=>{
        const fragment=document.createDocumentFragment(),focused=document.activeElement;
        let restore=false,start:number|null=null,end:number|null=null,direction:'forward'|'backward'|'none'|null=null;
        let node:Node|null=record.start;
        while(node){const next:Node|null=node.nextSibling;
          if(focused&&node.contains(focused)){restore=true;if(focused instanceof HTMLInputElement){start=focused.selectionStart;end=focused.selectionEnd;direction=focused.selectionDirection;}}
          fragment.append(node);if(node===record.end)break;node=next;
        }
        before.parentNode!.insertBefore(fragment,before);
        if(restore&&focused instanceof HTMLElement&&document.activeElement!==focused){focused.focus({preventScroll:true});if(focused instanceof HTMLInputElement&&start!==null&&end!==null)focused.setSelectionRange(start,end,direction??undefined);}
      };
      update=createEffect(()=>{
        const collection=evaluate(view.collection,local);if(!Array.isArray(collection))throw new TypeError('Iteration requires a list');if(collection.length>limits.maxCollectionItems)throw new RangeError(`Collection exceeds the configured limit of ${limits.maxCollectionItems} items`);consumeWork(budget,collection.length);
        const keys:Primitive[]=[],items:Value[]=[],seen=new Set<Primitive>();
        for(const item of collection){items.push(keyItem.value=item);const key=evaluate(view.key,keyScope) as Primitive;if(seen.has(key))throw new TypeError(`Duplicate iteration key ${String(key)}`);seen.add(key);keys.push(key);}
        // Structural setup must not subscribe this list to child props, init
        // statements, or static attributes read while constructing records.
        untracked(()=>{
          const prepared:Record[]=[],planned:Record[]=[];
          const disposePrepared=()=>{const failures:unknown[]=[];for(let index=prepared.length-1;index>=0;index--)try{disposeBag(prepared[index].effects,prepared[index].cleanups);}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Prepared record cleanup failed');};
          try{for(let index=0;index<items.length;index++){const key=keys[index],item=items[index];
            const existing=records.get(key);if(existing){write(existing.item,item);planned.push(existing);continue;}
            reserve(budget,'records',1,limits.maxListRecords,'List records');let start:Comment|undefined,end:Comment|undefined;
            try{start=makeComment(document,'item');end=makeComment(document,'/item');}catch(error){if(start)release(budget,'domNodes');release(budget,'records');throw error;}
            const fragment=document.createDocumentFragment(),record:Record={start:start!,end:end!,item:signal(item),index:-1,effects:[],cleanups:[]};
            fragment.append(start);record.cleanups.push(()=>{try{start!.remove();end!.remove();}finally{release(budget,'domNodes',2);release(budget,'records');}});
            const itemScope=Object.create(local) as Scope;Object.defineProperty(itemScope,view.item,{value:record.item,enumerable:true,configurable:true});
            try{for(const child of view.children)create(child,fragment,itemScope,'',record.effects,record.cleanups,false,componentRuntime);fragment.append(end);}
            catch(error){try{disposeBag(record.effects,record.cleanups);}catch(cleanup){throw new AggregateError([error,cleanup],'Record preparation and cleanup failed',{cause:error});}throw error;}
            prepared.push(record);planned.push(record);
          }}catch(error){try{disposePrepared();}catch(cleanup){throw new AggregateError([error,cleanup],'List preparation and cleanup failed',{cause:error});}throw error;}
          const removed:Record[]=[];for(const [key,record] of records)if(!seen.has(key))removed.push(record);
          let last=-1,reordered=false;for(const record of planned)if(record.index>=0){if(record.index<last)reordered=true;last=record.index;}
          const stable=reordered?orderedIndices(planned.map(record=>record.index)):undefined;
          if(!prepared.length&&!removed.length&&!reordered)return;
          stageStructure(()=>{if(!alive){try{disposePrepared();}catch(error){return [error];}return;}const cleanupErrors:unknown[]=[];try{if(!anchor.parentNode)throw new TypeError('Iteration anchor is detached');let before:Node=anchor;for(let index=planned.length-1;index>=0;index--){const record=planned[index];if(record.index<0)before.parentNode!.insertBefore(record.start.parentNode!,before);else if(stable&&!stable.has(index)&&record.end.nextSibling!==before)move(record,before);before=record.start;record.index=index;}}catch(error){try{disposePrepared();}catch(cleanup){throw new AggregateError([error,cleanup],'Structural commit and staged cleanup failed',{cause:error});}throw error;}records.clear();keys.forEach((key,index)=>records.set(key,planned[index]));for(let index=removed.length-1;index>=0;index--)try{disposeBag(removed[index].effects,removed[index].cleanups);}catch(error){cleanupErrors.push(error);}return cleanupErrors;},disposePrepared);
        });
      },budget,undefined,limits.maxUpdatesPerFlush);effects.push(update);return;
    }
    if(view.component>=0){
      const input=Object.create(null) as Record<string,Primitive>;
      for(const [key,value] of Object.entries(view.attributes))Object.defineProperty(input,key,{enumerable:true,configurable:true,get:()=>evaluate(value,local) as Primitive});
      if(forward)Object.defineProperty(input,'class',{enumerable:true,configurable:true,get:()=>[view.attributes.class?evaluate(view.attributes.class,local):'',forward].filter(Boolean).join(' ')});
      const project:ContentMount|undefined=view.children.length?(contentTarget,contentRuntime)=>{const contentEffects:ReactiveEffect[]=[],contentCleanups:CleanupBag=[];let contentDisposed=false;const dispose:Dispose=()=>{if(contentDisposed)return;contentDisposed=true;disposeBag(contentEffects,contentCleanups);};try{for(const child of view.children)create(child,contentTarget,local,'',contentEffects,contentCleanups,true,contentRuntime);}catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Component content mounting and recovery failed',{cause:error});}throw error;}return dispose;}:undefined;
      const childEvents:Record<string,(payload?:Primitive)=>void>=Object.create(null);if(view.handler)Object.defineProperty(childEvents,view.handler.event,{value:(payload?:Primitive)=>{if(view.handler!.parameter){if(payload===undefined||typeof payload!==view.handler!.payloadType)throw new TypeError(`Invalid payload for event ${view.handler!.event}`);const localHandler=Object.create(local) as Scope;localHandler[view.handler!.parameter]=signal(payload);execute(view.handler!.statements,localHandler);}else{if(payload!==undefined)throw new TypeError(`Unexpected payload for event ${view.handler!.event}`);execute(view.handler!.statements,local);}},enumerable:true});
      const dispose=untracked(()=>components[view.component](parent as Element,componentRuntime,input,{},project,childEvents));callbacks.push(dispose);
      // Refresh only the child prop signals; the child and its local state stay
      // mounted. Each child binding independently tracks those signals.
      if(dispose.refresh)track(()=>dispose.refresh!(),effects);return;
    }
    const staticBindings=view.static??0;assertNumber(staticBindings);const element=makeElement(parent.ownerDocument,view.tag),removeOwned=rootOwned||parent instanceof DocumentFragment;trackNodes(callbacks);if(removeOwned)callbacks.push(()=>element.remove());if(view.attributes.class){const classValue=evaluate(view.attributes.class,local);const combined=forward?[...new Set(`${String(classValue)} ${forward}`.split(/\s+/).filter(Boolean))].join(' '):String(classValue);if(combined)element.setAttribute('class',combined);}else if(forward)element.setAttribute('class',forward);if(view.attributes.type)(element as HTMLInputElement).type=String(evaluate(view.attributes.type,local));
    if(view.attributes.text){const fixed=Boolean(staticBindings&1),initial=fixed?String(evaluate(view.attributes.text,local)):'';const text=makeText(parent.ownerDocument,initial);trackNodes(callbacks);element.append(text);if(!fixed)effects.push(createEffect(()=>{const value=String(evaluate(view.attributes.text,local));if(text.data!==value)text.data=value;},budget));}
    if(view.attributes.value){const input=element as HTMLInputElement,fixed=Boolean(staticBindings&2);if(fixed)input.value=String(evaluate(view.attributes.value,local));else effects.push(createEffect(()=>{const value=String(evaluate(view.attributes.value,local));if(input.value!==value)input.value=value;},budget));}
    if(view.attributes.checked){const input=element as HTMLInputElement,fixed=Boolean(staticBindings&4);if(fixed){const value=evaluate(view.attributes.checked,local);if(typeof value!=='boolean')throw new TypeError('checked requires boolean');input.checked=value;}else effects.push(createEffect(()=>{const value=evaluate(view.attributes.checked,local);if(typeof value!=='boolean')throw new TypeError('checked requires boolean');if(input.checked!==value)input.checked=value;},budget));}
    if(view.handler){const listener=(event:Event)=>execute(view.handler!.statements,local,event);element.addEventListener(view.handler.event,listener);callbacks.push(()=>element.removeEventListener(view.handler!.event,listener));}
    parent.append(element);for(const child of view.children)create(child,element,local,'',effects,callbacks,false,componentRuntime);
  }
  const refresh=()=>{if(disposed)return;transact(()=>{for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);write(getSignal(name,scope),value);}},forceDisable,budget);};
  const updateState=(patch:InitialState)=>{if(disposed)return;transact(()=>{for(const [name,value] of Object.entries(patch)){const initial=model.states[name];if(!initial)throw new TypeError(`Unknown state ${name}`);write(getSignal(name,scope),hydrateState(initial,value,name));}},forceDisable,budget);};
  const dispose:Dispose=()=>{if(disposed)return;return withWork(budget,()=>{disposed=true;const failures:unknown[]=[];try{disposeBag(ownedEffects,cleanups);}catch(error){failures.push(error);}try{untracked(()=>execute(model.cleanup));}catch(error){failures.push(error);}finally{for(const name of Object.keys(scope))delete scope[name];classDefaults.clear();supplied={};components=[];content=undefined;events={};shared=[];if(ownsSharedRegistry)sharedRegistry.clear();releaseComponent(budget,componentReservation);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Component disposal failed');});};
  let contentMounted=false;try{execute(model.init);for(const root of model.roots)create(root,target!,scope,forwardClass,ownedEffects,cleanups,true);if(content&&!contentMounted)throw new TypeError('Component does not accept content');}catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Component mounting and recovery failed',{cause:error});}throw error;}finally{target=undefined;}dispose.refresh=refresh;dispose.updateState=updateState;return dispose;
}

export function mountCounter(target:Element,model:CounterModel):()=>void {assertNumber(model.initial);assertNumber(model.step);let value=model.initial;const button=target.ownerDocument.createElement('button'),text=target.ownerDocument.createTextNode('');button.append(text);const render=()=>{text.data=model.prefix+String(value);};const click=()=>{const next=value+model.step;assertNumber(next);value=next;render();};render();button.addEventListener('click',click);target.append(button);return()=>{button.removeEventListener('click',click);button.remove();};}
