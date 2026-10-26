export interface CounterModel {initial:number;prefix:string;step:number}
type Primitive=string|number|boolean;
type Value=Primitive|Instance|Value[];
type DependencyPath=string[];
type Expr=({kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'str'|'len';argument:Expr}|{kind:'add';left:Expr;right:Expr}|{kind:'construct';name:string;arguments:Expr[]}|{kind:'list';items:Expr[]})&{dependencies?:DependencyPath[]};
type ConditionExpr=({kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'not';argument:ConditionExpr}|{kind:'equal'|'notEqual'|'and';left:ConditionExpr;right:ConditionExpr})&{dependencies?:DependencyPath[]};
type Statement={kind:'assign';target:Expr;value:Expr}|{kind:'eventAssign';target:Expr;member:'value'|'checked'}|{kind:'call';target:Expr;method:string;arguments:Expr[]};
interface Handler {kind?:string;event:'click'|'input'|'change';statements:Statement[]}
interface ElementView {kind:'element';tag:string;component:number;attributes:Record<string,Expr>;children:View[];handler?:Handler}
interface ConditionalView {kind:'conditional';condition:ConditionExpr;consequent:View[];alternate:View[]}
interface IterationView {kind:'iteration';item:string;collection:Expr;key:Expr;children:View[]}
type View=ElementView|ConditionalView|IterationView;
interface ClassModel {fields:{name:string;initial:Expr}[];computed:Record<string,Expr>;actions:Record<string,Statement[]>}
interface Model {props:Record<string,Primitive>;classes:Record<string,ClassModel>;states:Record<string,Expr>;computed:Record<string,Expr>;init:Statement[];cleanup:Statement[];roots:View[]}
interface Signal<T=Value>{value:T;subscribers:Set<ReactiveEffect>;derive?:ReactiveEffect;dirty?:boolean;validate?:()=>void}
interface Instance {__class:string;fields:Record<string,Signal>;computed:Record<string,Expr>;actions:Record<string,Statement[]>;scope:Scope;cache:Map<string,{value:Value;inputs?:Map<Signal,Value>;running:boolean;valid:boolean}>}
type Scope=Record<string,Signal|Instance|(()=>Value)>;
interface RenderPlan {commit:()=>void;rollback:()=>void;finish?:()=>void;fail?:()=>void}
type ReactiveEffect=(()=>void)&{dependencies:Set<Signal>;disposed:boolean;computed?:Signal;propagate?:boolean;structural?:boolean;running:boolean;epoch:number;runs:number;reads:Signal[];cursor:number;changed:boolean;fixed:boolean;connected:boolean};
type Dispose=(()=>void)&{refresh?:()=>void;collect?:(effects:Set<ReactiveEffect>)=>void};
type Mount=(target:Element,runtime:typeof import('./index.js'),props?:Record<string,Primitive>)=>Dispose;
let activeEffect:ReactiveEffect|undefined;
let executingEffect:ReactiveEffect|undefined;
let capturedReads:Map<Signal,Value>|undefined;
let epoch=0;
let batchDepth=0,flushing=false;
const emptyDependencies=new Set<Signal>(),emptyReads:Signal[]=[];
const pendingComputed=new Set<ReactiveEffect>(),pendingRegions=new Set<ReactiveEffect>(),pendingEffects=new Set<ReactiveEffect>();
interface UpdateJournal {values?:Map<Signal,Value>;dependencies?:Map<ReactiveEffect,Set<Signal>>;dirty?:Map<Signal,boolean|undefined>;checks?:Set<()=>void>;checking:boolean;plans?:Map<ReactiveEffect,RenderPlan>;excluded?:Map<ReactiveEffect,number>}
let updateJournal:UpdateJournal|undefined;
function safeInteger(value:number):number {if(!Number.isSafeInteger(value))throw new RangeError('Numeric value exceeds the safe integer range (-9007199254740991 to 9007199254740991)');return value;}
function rememberDirty(source:Signal):void {if(updateJournal&&!updateJournal.dirty?.has(source))(updateJournal.dirty??=new Map()).set(source,source.dirty);}

function signal<T=Value>(value:T):Signal<T>{if(typeof value==='number')safeInteger(value);return {value,subscribers:new Set()};}
function read<T>(source:Signal<T>):T {if(source.derive?.running)throw new TypeError('Circular reactive dependency');if(source.dirty)source.derive!();capturedReads?.set(source as Signal,source.value as Value);if(activeEffect&&!activeEffect.disposed){const effect=activeEffect,index=effect.cursor++;if(effect.reads[index]!==source){effect.reads[index]=source as Signal;effect.changed=true;}if(!effect.dependencies.has(source as Signal))source.subscribers.add(effect);}return source.value;}
function enqueue(effect:ReactiveEffect):void {
  // Computed expressions are pure: refreshing an input while deriving cannot
  // invalidate the same derivation again. Circular reads are guarded by read().
  if(effect.disposed||effect.running&&effect.computed)return;
  if(effect.propagate){pendingComputed.add(effect);return;}
  if(effect.structural){pendingRegions.add(effect);return;}
  if(!effect.computed){pendingEffects.add(effect);return;}
  if(effect.computed.dirty){pendingComputed.add(effect);return;}
  rememberDirty(effect.computed);effect.computed.dirty=true;pendingComputed.add(effect);
  // Invalidate derived descendants now, so reads inside an action see current
  // values. DOM subscribers are queued only if the derived value changes.
  for(const subscriber of effect.computed.subscribers)if(subscriber.computed)enqueue(subscriber);
}
// Bound scheduler feedback, not legitimate sequential computed reads in actions.
function scheduled(effect:ReactiveEffect):void {if(effect.epoch!==epoch){effect.epoch=epoch;effect.runs=0;}if(++effect.runs>64)throw new TypeError('Reactive update loop detected');effect();}
function flush():void {
  if(batchDepth||flushing)return;flushing=true;
  try{while(pendingComputed.size||pendingRegions.size||pendingEffects.size){while(pendingComputed.size)scheduled(pendingComputed.values().next().value!);const effect=pendingRegions.values().next().value??pendingEffects.values().next().value;if(effect)scheduled(effect);}}
  finally{flushing=false;pendingComputed.clear();pendingRegions.clear();pendingEffects.clear();}
}
function batch<T>(run:()=>T):T {
  if(updateJournal){batchDepth++;try{return run();}finally{batchDepth--;}}
  // Allocate undo containers only for work that actually occurs in this batch.
  const journal:UpdateJournal={values:undefined,dependencies:undefined,dirty:undefined,checks:undefined,checking:false,plans:undefined,excluded:undefined};
  epoch++;
  const computedBefore=pendingComputed.size?[...pendingComputed]:undefined,regionsBefore=pendingRegions.size?[...pendingRegions]:undefined,effectsBefore=pendingEffects.size?[...pendingEffects]:undefined;
  updateJournal=journal;batchDepth++;let result:T;
  try {
    result=run();
    // Validate and settle derivations/child props before any DOM effect commits.
    do {
      while(journal.checks?.size||pendingComputed.size){
        journal.checking=true;
        try {if(journal.checks)for(const check of journal.checks){journal.checks.delete(check);untracked(check);}}
        finally {journal.checking=false;}
        while(pendingComputed.size)scheduled(pendingComputed.values().next().value!);
      }
      if(pendingRegions.size||pendingEffects.size){
        const effect=pendingRegions.values().next().value??pendingEffects.values().next().value!;
        if(journal.excluded?.has(effect)){pendingEffects.delete(effect);pendingRegions.delete(effect);continue;}
        scheduled(effect);
      }
    } while(journal.checks?.size||pendingComputed.size||pendingRegions.size||pendingEffects.size);
    if(journal.plans)for(const [effect,plan] of journal.plans)if(!effect.disposed&&!journal.excluded?.has(effect))plan.commit();
  } catch(error) {
    const failed=new Set<()=>void>();
    for(const plan of [...(journal.plans?.values()??[])].reverse())try{plan.rollback();}catch{if(plan.fail)failed.add(plan.fail);}
    for(const [source,value] of journal.values??[])source.value=value;
    for(const [effect,dependencies] of journal.dependencies??[]){if(effect.disposed)continue;for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies=dependencies;for(const source of dependencies)source.subscribers.add(effect);effect.reads.length=0;effect.cursor=0;}
    for(const [source,dirty] of journal.dirty??[])source.dirty=dirty;
    pendingComputed.clear();for(const effect of computedBefore??[])pendingComputed.add(effect);
    pendingRegions.clear();for(const effect of regionsBefore??[])pendingRegions.add(effect);
    pendingEffects.clear();for(const effect of effectsBefore??[])pendingEffects.add(effect);
    for(const dispose of failed)try{dispose();}catch{/* Fail closed if host DOM operations cannot be restored. */}
    throw error;
  } finally {updateJournal=undefined;batchDepth--;}
  let failure:unknown;
  if(journal.plans)for(const [effect,plan] of journal.plans)try{if(effect.disposed||journal.excluded?.has(effect))plan.rollback();else plan.finish?.();}catch(error){failure??=error;}
  flush();if(failure)throw failure;return result;
}
function untracked<T>(run:()=>T):T {const previous=activeEffect;activeEffect=undefined;try{return run();}finally{activeEffect=previous;}}
function write<T>(source:Signal<T>,value:T):void {if(typeof value==='number')safeInteger(value);if(Object.is(source.value,value))return;if(updateJournal){if(!updateJournal.values?.has(source as Signal))(updateJournal.values??=new Map()).set(source as Signal,source.value as Value);if(source.validate)(updateJournal.checks??=new Set()).add(source.validate);}source.value=value;for(const subscriber of source.subscribers)enqueue(subscriber);flush();}
function createEffect(run:()=>void,computed?:Signal,sources?:Set<Signal>):ReactiveEffect {
  const effect=(()=>{
    if(effect.disposed)return;if(effect.running)throw new TypeError('Circular reactive dependency');
    if(computed||effect.propagate)pendingComputed.delete(effect);else if(effect.structural)pendingRegions.delete(effect);else pendingEffects.delete(effect);
    if(computed){rememberDirty(computed);computed.dirty=false;}
    // Keep the old set immutable: it becomes undo data only when edges change.
    // Stable read traces avoid Set allocation and unsubscribe/resubscribe.
    // Changed traces are deduplicated before replacing subscription edges.
    const previousDependencies=effect.dependencies;effect.cursor=0;effect.changed=false;
    const previous=activeEffect,executing=executingEffect;activeEffect=effect.fixed?undefined:effect;executingEffect=effect;effect.running=true;
    try{run();}finally{
      if(!effect.disposed&&effect.fixed&&!effect.connected){for(const source of effect.dependencies)source.subscribers.add(effect);effect.connected=true;}
      if(!effect.disposed&&!effect.fixed){
        if(effect.reads.length!==effect.cursor){effect.reads.length=effect.cursor;effect.changed=true;}
        if(effect.changed){
          const next=new Set(effect.reads);let changed=next.size!==previousDependencies.size;
          if(!changed)for(const source of next)if(!previousDependencies.has(source)){changed=true;break;}
          if(changed){
            if(updateJournal&&!updateJournal.dependencies?.has(effect))(updateJournal.dependencies??=new Map()).set(effect,previousDependencies);
            for(const source of previousDependencies)if(!next.has(source))source.subscribers.delete(effect);
            effect.dependencies=next;
          }
        }
      }
      activeEffect=previous;executingEffect=executing;effect.running=false;
    }
  }) as ReactiveEffect;
  effect.dependencies=sources??emptyDependencies;effect.fixed=!!sources;effect.connected=false;effect.reads=sources?emptyReads:[];effect.cursor=0;effect.changed=false;effect.disposed=false;effect.computed=computed;
  effect.running=false;effect.epoch=-1;effect.runs=0;
  if(computed){computed.derive=effect;computed.dirty=true;}
  else try{effect();}catch(error){stop(effect);throw error;}
  return effect;
}
function stop(effect:ReactiveEffect):void {if(effect.disposed)return;effect.disposed=true;pendingComputed.delete(effect);pendingRegions.delete(effect);pendingEffects.delete(effect);for(const source of effect.dependencies)source.subscribers.delete(effect);if(effect.running&&!effect.fixed)for(let index=0;index<effect.cursor;index++)effect.reads[index].subscribers.delete(effect);if(effect.dependencies!==emptyDependencies)effect.dependencies.clear();effect.reads.length=0;effect.cursor=0;}


// Indices of the longest ordered group of retained records. Reconciliation only
// moves records outside this group; new records use the sentinel -1.
function orderedIndices(positions:number[]):Set<number> {
  const tails:number[]=[],previous=new Array<number>(positions.length).fill(-1);
  positions.forEach((position,index)=>{if(position<0)return;let low=0,high=tails.length;while(low<high){const middle=(low+high)>>>1;if(positions[tails[middle]]<position)low=middle+1;else high=middle;}if(low)previous[index]=tails[low-1];tails[low]=index;});
  const result=new Set<number>();let index=tails[tails.length-1];while(index!==undefined&&index>=0){result.add(index);index=previous[index];}return result;
}

export function mountComponent(target:Element,model:Model,components:Mount[],supplied?:Record<string,Primitive>):Dispose;
export function mountComponent(target:Element|undefined,model:Model,components:Mount[],supplied:Record<string,Primitive>={}):Dispose {
  if(!target)throw new TypeError('A mount target is required');
  const scope=Object.create(null) as Scope;const ownedEffects:ReactiveEffect[]=[];const cleanups:(()=>void)[]=[];let disposed=false;
  const writable=new WeakSet<Signal>(),listTypes=new WeakMap<Signal,string>();
  const valueType=(value:Value):string=>Array.isArray(value)?`list:${value.length?valueType(value[0]):'unknown'}`:typeof value==='object'?`class:${value.__class}`:typeof value;
  const matches=(value:Value,type:string):boolean=>type.startsWith('list:')?Array.isArray(value)&&value.every(item=>matches(item,type.slice(5))):valueType(value)===type;
  for(const key of Object.keys(supplied))if(key!=='class'&&!Object.hasOwn(model.props,key))throw new TypeError(`Unknown prop ${key}`);
  for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);scope[name]=signal(value);}
  const getSignal=(name:string,local:Scope):Signal=>{const value=local[name];if(!value||typeof value==='function'||'__class'in value)throw new TypeError(`Unknown writable value ${name}`);return value;};
  // Only actual closed ASTs containing root signal reads qualify. Member paths
  // and conditions stay dynamic; metadata alone cannot authorize this fast path.
  function fixedSources(expressions:Expr[],local:Scope):Set<Signal>|undefined {
    let sources:Set<Signal>|undefined;
    const visit=(expression:Expr):boolean=>{
      if(expression.kind==='literal')return true;
      if(expression.kind==='reference'){const source=local[expression.name];if(!source||typeof source==='function'||'__class'in source)return false;(sources??=new Set()).add(source);return true;}
      if(expression.kind==='str'||expression.kind==='len')return visit(expression.argument);
      if(expression.kind==='add')return visit(expression.left)&&visit(expression.right);
      if(expression.kind==='list')return expression.items.every(visit);
      return false;
    };
    return expressions.every(visit)?(sources??emptyDependencies):undefined;
  }
  function derived(instance:Instance,name:string):Value {
    let cache=instance.cache.get(name);
    if(!cache){cache={value:'',running:false,valid:false};instance.cache.set(name,cache);}
    if(cache.running)throw new TypeError(`Circular reactive dependency in ${instance.__class}.${name}`);
    let valid=cache.valid;if(valid)for(const [source,value] of cache.inputs!)if(!Object.is(source.value,value)){valid=false;break;}
    if(valid){for(const source of cache.inputs!.keys())read(source);return cache.value;}
    const previous=capturedReads,inputs=new Map<Signal,Value>();capturedReads=inputs;cache.running=true;
    try {const value=evaluate(instance.computed[name],instance.scope);cache.value=value;cache.inputs=inputs;cache.valid=true;return value;}
    finally {capturedReads=previous;for(const [source,value] of inputs)previous?.set(source,value);cache.running=false;}
  }
  function member(owner:Value,name:string):Value {
    if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner))throw new TypeError('Member access requires a class instance');
    const field=owner.fields[name];if(field)return read(field);if(Object.hasOwn(owner.computed,name))return derived(owner,name);throw new TypeError(`Unknown member ${name}`);
  }
  function evaluate(expression:Expr,local=scope):Value {
    if(expression.kind==='literal')return typeof expression.value==='number'?safeInteger(expression.value):expression.value;
    if(expression.kind==='reference'){const value=local[expression.name];if(!value)throw new TypeError(`Unknown value ${expression.name}`);return typeof value==='function'?value():'__class'in value?value:read(value);}
    if(expression.kind==='member')return member(evaluate(expression.object,local),expression.name);
    if(expression.kind==='str')return String(evaluate(expression.argument,local));
    if(expression.kind==='len'){const value=evaluate(expression.argument,local);if(!Array.isArray(value))throw new TypeError('len requires a list');return value.length;}
    if(expression.kind==='add'){const left=evaluate(expression.left,local),right=evaluate(expression.right,local);if(typeof left==='number'&&typeof right==='number')return safeInteger(safeInteger(left)+safeInteger(right));if(typeof left==='string'&&typeof right==='string')return left+right;throw new TypeError('Addition requires two strings or two safe integers');}
    if(expression.kind==='list')return expression.items.map(item=>evaluate(item,local));
    if(expression.kind==='construct')return instantiate(expression.name,expression.arguments.map(item=>evaluate(item,local)));
    throw new TypeError('Unsupported expression');
  }
  function instantiate(name:string,args:Value[]):Instance {
    const declaration=model.classes[name];if(!declaration)throw new TypeError(`Unknown class ${name}`);if(args.length!==declaration.fields.length)throw new TypeError(`Class ${name} requires ${declaration.fields.length} field values`);const instanceScope=Object.create(null) as Scope;
    const instance:Instance={__class:name,fields:Object.create(null),computed:declaration.computed,actions:declaration.actions,scope:instanceScope,cache:new Map()};
    const validate=()=>{for(const name of Object.keys(declaration.computed))derived(instance,name);};
    declaration.fields.forEach((field,index)=>{const initial=evaluate(field.initial,instanceScope),value=args[index];if(typeof value!==typeof initial)throw new TypeError(`Invalid class field ${field.name}`);const source=signal(value);source.validate=validate;writable.add(source);instance.fields[field.name]=source;instanceScope[field.name]=source;});
    // Class derivations stay lazy: consumers subscribe directly to fields,
    // without a class-level effect that would outlive a removed list record.
    for(const name of Object.keys(declaration.computed))instanceScope[name]=()=>derived(instance,name);
    if(updateJournal&&!updateJournal.checking)(updateJournal.checks??=new Set()).add(validate);
    return instance;
  }
  for(const [name,initial] of Object.entries(model.states)){const value=evaluate(initial),source=signal(value);scope[name]=source;writable.add(source);if(Array.isArray(value)){if(!value.length)throw new TypeError('List state requires an initial item type');const itemType=valueType(value[0]);if(!value.every(item=>matches(item,itemType)))throw new TypeError('List state must have homogeneous items');listTypes.set(source,itemType);}}
  for(const name of Object.keys(model.computed))scope[name]=signal('');
  for(const [name,expression] of Object.entries(model.computed)){const source=getSignal(name,scope);if(expression.kind==='literal'||expression.dependencies?.length===0)write(source,evaluate(expression));else ownedEffects.push(createEffect(()=>write(source,evaluate(expression)),source,fixedSources([expression],scope)));}
  function resolveTarget(target:Expr,local:Scope):Signal {
    if(target.kind==='reference'){const source=getSignal(target.name,local);if(!writable.has(source))throw new TypeError(`Cannot assign read-only value ${target.name}`);return source;}
    if(target.kind==='member'){const owner=evaluate(target.object,local);if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner))throw new TypeError('Member assignment requires an instance');const result=owner.fields[target.name];if(!result)throw new TypeError(`Member ${target.name} is read-only or unknown`);return result;}
    throw new TypeError('Invalid assignment target');
  }
  function execute(statements:Statement[],local=scope,event?:Event):void {
    if(statements.length===0&&Array.isArray(statements))return;
    const assign=(target:Expr,value:Value)=>{const source=resolveTarget(target,local),itemType=listTypes.get(source);if(itemType?(!Array.isArray(value)||!value.every(item=>matches(item,itemType))):!matches(value,valueType(source.value)))throw new TypeError('Assignment value does not match its state type');write(source,value);};
    batch(()=>{for(const statement of statements){
      if(statement.kind==='assign')assign(statement.target,evaluate(statement.value,local));
      else if(statement.kind==='eventAssign'){
        const element=event?.currentTarget;if(!(element instanceof HTMLInputElement))throw new TypeError('Event value requires an input element');assign(statement.target,statement.member==='value'?element.value:element.checked);
      } else {
        const owner=evaluate(statement.target,local);const args=statement.arguments.map(argument=>evaluate(argument,local));
        if(Array.isArray(owner)){
          if(statement.target.kind!=='reference')throw new TypeError('List mutations require existing writable list state');
          const source=resolveTarget(statement.target,local),itemType=listTypes.get(source);
          if(!itemType)throw new TypeError('List mutations require existing writable list state');
          if(!['append','remove','move'].includes(statement.method))throw new TypeError(`Unsupported list operation ${statement.method}`);
          if(args.length!==(statement.method==='move'?2:1))throw new TypeError('Invalid list mutation argument count');
          if(!matches(args[0],itemType))throw new TypeError(`List mutation requires ${itemType} items`);
          if(statement.method==='move'){if(typeof args[1]!=='number')throw new TypeError('move index must be a safe integer');safeInteger(args[1]);}
          let next:Value[];
          if(statement.method==='append')next=[...owner,args[0]];
          else if(statement.method==='remove'){const index=owner.indexOf(args[0]);if(index<0)continue;next=[...owner];next.splice(index,1);}
          else if(statement.method==='move'){const index=owner.indexOf(args[0]);if(index<0)continue;const destination=Math.max(0,Math.min(owner.length-1,Math.trunc(args[1] as number)));if(index===destination)continue;next=[...owner];const [item]=next.splice(index,1);next.splice(destination,0,item);}
          else throw new TypeError(`Unsupported list operation ${statement.method}`);write(source,next);
        } else if(owner&&typeof owner==='object'&&'__class'in owner){const body=owner.actions[statement.method];if(!body)throw new TypeError(`Unknown action ${statement.method}`);execute(body,owner.scope);}
        else throw new TypeError('Unsupported call target');
      }
    }});
  }
  function evaluateCondition(expression:ConditionExpr,local:Scope):Primitive {
    if(expression.kind==='literal')return expression.value;if(expression.kind==='reference'||expression.kind==='member')return evaluate(expression as Expr,local) as Primitive;
    if(expression.kind==='not')return !evaluateCondition(expression.argument,local);const left=evaluateCondition(expression.left,local);if(expression.kind==='and')return Boolean(left)&&Boolean(evaluateCondition(expression.right,local));const right=evaluateCondition(expression.right,local);return expression.kind==='equal'?left===right:left!==right;
  }
  function disposeBag(effects:ReactiveEffect[],callbacks:(()=>void)[]):void {for(const effect of effects)stop(effect);effects.length=0;let failure:unknown;for(const callback of callbacks.reverse())try{untracked(callback);}catch(error){failure??=error;}callbacks.length=0;if(failure)throw failure;}
  function collectBag(effects:ReactiveEffect[],callbacks:(()=>void)[],result:Set<ReactiveEffect>):void {for(const effect of effects)result.add(effect);for(const callback of callbacks)(callback as Dispose).collect?.(result);}
  function exclude(effects:ReactiveEffect[],callbacks:(()=>void)[]):()=>void {
    const journal=updateJournal,excluded=new Set<ReactiveEffect>();collectBag(effects,callbacks,excluded);
    if(journal)for(const effect of excluded)(journal.excluded??=new Map()).set(effect,(journal.excluded?.get(effect)??0)+1);
    return ()=>{if(journal)for(const effect of excluded){const count=journal.excluded!.get(effect)!-1;if(count)journal.excluded!.set(effect,count);else journal.excluded!.delete(effect);}};
  }
  // Preparation may create detached scopes, but never discards a live scope.
  // Commit all plans only after validation; teardown follows a successful commit.
  function stage(plan:RenderPlan):void {
    plan.fail=dispose;
    if(updateJournal){const effect=executingEffect!;const previous=updateJournal.plans?.get(effect);if(previous){updateJournal.plans!.delete(effect);previous.rollback();}(updateJournal.plans??=new Map()).set(effect,plan);}
    else {try{plan.commit();}catch(error){try{plan.rollback();}catch{try{plan.fail();}catch{/* Original error wins. */}}throw error;}plan.finish?.();}
  }
  function binding(plan:()=>RenderPlan,expression:Expr|ConditionExpr,local:Scope,effects:ReactiveEffect[],structural=false):void {
    if(!structural&&(expression.kind==='literal'||expression.dependencies?.length===0)){plan().commit();return;}
    // Conditions retain short-circuit read tracking; metadata is conservative.
    const effect=createEffect(()=>stage(plan()),undefined,structural?undefined:fixedSources([expression as Expr],local));effect.structural=structural;if(structural&&pendingEffects.delete(effect))enqueue(effect);effects.push(effect);
  }
  function create(view:View,parent:Element|DocumentFragment,local=scope,forward='',effects=ownedEffects,callbacks=cleanups):void {
    // Dynamic ranges can move out of their staging fragment. Resolve insertion
    // parents from live anchors so nested scopes keep updating in place.
    if(view.kind==='conditional'){
      const document=parent.ownerDocument,start=document.createComment('if'),end=document.createComment('/if');parent.append(start,end);
      let selected:boolean|undefined,branchEffects:ReactiveEffect[]=[],branchCleanups:(()=>void)[]=[];
      const cleanup:Dispose=()=>{try{disposeBag(branchEffects,branchCleanups);}finally{start.remove();end.remove();}};
      cleanup.collect=result=>collectBag(branchEffects,branchCleanups,result);callbacks.push(cleanup);
      binding(()=>{
        const next=Boolean(evaluateCondition(view.condition,local));if(next===selected)return {commit(){},rollback(){}};
        return untracked(()=>{
          const fragment=document.createDocumentFragment(),oldFragment=document.createDocumentFragment(),nextEffects:ReactiveEffect[]=[],nextCleanups:(()=>void)[]=[];
          const oldEffects=branchEffects,oldCleanups=branchCleanups,oldSelected=selected;let touched=false;
          try{for(const child of next?view.consequent:view.alternate)create(child,fragment,local,forward,nextEffects,nextCleanups);}catch(error){try{disposeBag(nextEffects,nextCleanups);}catch{}throw error;}
          const include=exclude(oldEffects,oldCleanups);
          return {commit(){touched=true;while(start.nextSibling&&start.nextSibling!==end)oldFragment.append(start.nextSibling);end.parentNode!.insertBefore(fragment,end);selected=next;branchEffects=nextEffects;branchCleanups=nextCleanups;},
            rollback(){try{disposeBag(nextEffects,nextCleanups);}finally{if(touched){end.parentNode!.insertBefore(oldFragment,end);selected=oldSelected;branchEffects=oldEffects;branchCleanups=oldCleanups;}include();}},
            finish(){disposeBag(oldEffects,oldCleanups);}};
        });
      },view.condition,local,effects,true);return;
    }
    if(view.kind==='iteration'){
      const document=parent.ownerDocument,anchor=document.createComment('for');parent.append(anchor);
      type Record={start:Comment;end:Comment;item:Signal;index:number;effects:ReactiveEffect[];cleanups:(()=>void)[]};
      let records=new Map<Primitive,Record>(),order:Record[]=[];const keyScope=Object.create(local) as Scope,keyItem=signal<Value>('');keyScope[view.item]=keyItem;
      const cleanup:Dispose=()=>{try{disposeBag([],order.map(record=>()=>disposeBag(record.effects,record.cleanups)));}finally{records.clear();order=[];anchor.remove();}};
      cleanup.collect=result=>{for(const record of order)collectBag(record.effects,record.cleanups,result);};callbacks.push(cleanup);
      const extract=(record:Record)=>{const fragment=document.createDocumentFragment();let node:Node|null=record.start;while(node){const next:Node|null=node.nextSibling;fragment.append(node);if(node===record.end)break;node=next;}return fragment;};
      const move=(record:Record,before:Node)=>{
        const focused=document.activeElement,restore=focused&&(()=>{let node:Node|null=record.start;while(node){if(node.contains(focused))return true;if(node===record.end)break;node=node.nextSibling;}return false;})();
        const input=focused instanceof HTMLInputElement?focused:undefined,start=input?.selectionStart,end=input?.selectionEnd,direction=input?.selectionDirection;
        before.parentNode!.insertBefore(extract(record),before);
        if(restore&&focused instanceof HTMLElement&&document.activeElement!==focused){focused.focus({preventScroll:true});if(input&&start!=null&&end!=null)input.setSelectionRange(start,end,direction??undefined);}
      };
      const update=createEffect(()=>{
        const collection=evaluate(view.collection,local);if(!Array.isArray(collection))throw new TypeError('Iteration requires a list');
        const keys:Primitive[]=[],seen=new Set<Primitive>();let sameMembership=collection.length===records.size;
        for(const item of collection){keyItem.value=item;const key=evaluate(view.key,keyScope) as Primitive;if(!['string','number','boolean'].includes(typeof key))throw new TypeError('Iteration keys must be primitive values');if(seen.has(key))throw new TypeError(`Duplicate iteration key ${String(key)}`);seen.add(key);keys.push(key);if(!records.has(key))sameMembership=false;}
        untracked(()=>{
          // Pure reorders retain the lookup map; DOM order has its own immutable
          // array, also used as undo data. Membership changes get a fresh map.
          const old=records,oldOrder=order,next=sameMembership?old:new Map<Primitive,Record>(),nextOrder:Record[]=[],added:Record[]=[],removed:Record[]=[],includes:(()=>void)[]=[];
          if(!sameMembership)for(const [key,record] of old)if(!seen.has(key))removed.push(record);
          let last=-1,reordered=false;
          try{
            for(const record of removed)includes.push(exclude(record.effects,record.cleanups));
            for(let index=0;index<keys.length;index++){
              const key=keys[index],item=collection[index],existing=old.get(key);
              if(existing){write(existing.item,item);if(!sameMembership)next.set(key,existing);nextOrder.push(existing);if(existing.index<last)reordered=true;last=existing.index;continue;}
              const fragment=document.createDocumentFragment(),start=document.createComment('item'),end=document.createComment('/item');
              const record:Record={start,end,item:signal(item),index:-1,effects:[],cleanups:[]};added.push(record);fragment.append(start);record.cleanups.push(()=>{start.remove();end.remove();});
              const itemScope=Object.create(local) as Scope;itemScope[view.item]=record.item;
              for(const child of view.children)create(child,fragment,itemScope,'',record.effects,record.cleanups);fragment.append(end);next.set(key,record);nextOrder.push(record);
            }
          }catch(error){try{disposeBag([],added.map(record=>()=>disposeBag(record.effects,record.cleanups)));}finally{for(const include of includes)include();}throw error;}
          const stable=reordered?orderedIndices(nextOrder.map(record=>record.index)):undefined;let touched=false;
          stage({commit(){touched=true;for(const record of removed)extract(record);let before:Node=anchor;for(let index=nextOrder.length-1;index>=0;index--){const record=nextOrder[index];if(record.index<0)before.parentNode!.insertBefore(record.start.parentNode!,before);else if(stable&&!stable.has(index)&&record.end.nextSibling!==before)move(record,before);before=record.start;}records=next;order=nextOrder;for(let index=0;index<order.length;index++)order[index].index=index;},
            rollback(){let failure:unknown;try{disposeBag([],added.map(record=>()=>disposeBag(record.effects,record.cleanups)));}catch(error){failure=error;}if(touched){let before:Node=anchor;for(let index=oldOrder.length-1;index>=0;index--){const record=oldOrder[index];if(record.end.nextSibling!==before)move(record,before);before=record.start;}records=old;order=oldOrder;for(let index=0;index<order.length;index++)order[index].index=index;}for(const include of includes)include();if(failure)throw failure;},
            finish(){if(removed.length)disposeBag([],removed.map(record=>()=>disposeBag(record.effects,record.cleanups)));}});
        });
      });update.structural=true;if(pendingEffects.delete(update))enqueue(update);effects.push(update);return;
    }
    if(view.component>=0){
      const input=Object.create(null) as Record<string,Primitive>;
      for(const [key,value] of Object.entries(view.attributes))Object.defineProperty(input,key,{enumerable:true,configurable:true,get:()=>evaluate(value,local) as Primitive});
      if(forward)Object.defineProperty(input,'class',{enumerable:true,configurable:true,get:()=>[view.attributes.class?evaluate(view.attributes.class,local):'',forward].filter(Boolean).join(' ')});
      const dispose=untracked(()=>components[view.component](parent as Element,{mountComponent,mountCounter},input));callbacks.push(dispose);
      // Refresh only the child prop signals; the child and its local state stay
      // mounted. Each child binding independently tracks those signals.
      if(dispose.refresh&&Object.values(view.attributes).some(value=>value.kind!=='literal'&&value.dependencies?.length!==0)){const expressions=Object.values(view.attributes),sources=fixedSources(expressions,local);const effect=createEffect(()=>dispose.refresh!(),undefined,sources);effects.push(effect);effect.propagate=true;if(pendingEffects.delete(effect))enqueue(effect);}return;
    }
    const element=parent.ownerDocument.createElement(view.tag);if(view.attributes.class||forward){const classes=[view.attributes.class?String(evaluate(view.attributes.class,local)):'',forward].join(' ').split(/\s+/).filter(Boolean);if(classes.length)element.classList.add(...new Set(classes));}if(view.attributes.type)(element as HTMLInputElement).type=String(evaluate(view.attributes.type,local));
    if(view.attributes.text){const expression=view.attributes.text,text=parent.ownerDocument.createTextNode('');element.append(text);binding(()=>{const value=String(evaluate(expression,local)),previous=text.data;return {commit(){if(text.data!==value)text.data=value;},rollback(){if(text.data!==previous)text.data=previous;}};},expression,local,effects);}
    if(view.attributes.value){const expression=view.attributes.value,input=element as HTMLInputElement;binding(()=>{const value=String(evaluate(expression,local)),previous=input.value;return {commit(){if(input.value!==value)input.value=value;},rollback(){if(input.value!==previous)input.value=previous;}};},expression,local,effects);}
    if(view.attributes.checked){const expression=view.attributes.checked,input=element as HTMLInputElement;binding(()=>{const value=evaluate(expression,local),previous=input.checked;if(typeof value!=='boolean')throw new TypeError('checked requires boolean');return {commit(){if(input.checked!==value)input.checked=value;},rollback(){if(input.checked!==previous)input.checked=previous;}};},expression,local,effects);}
    if(view.handler){const listener=(event:Event)=>execute(view.handler!.statements,local,event);element.addEventListener(view.handler.event,listener);callbacks.push(()=>element.removeEventListener(view.handler!.event,listener));}
    parent.append(element);callbacks.push(()=>element.remove());for(const child of view.children)create(child,element,local,'',effects,callbacks);
  }
  const refresh=()=>{if(disposed)return;batch(()=>{for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);write(getSignal(name,scope),value);}});};
  const dispose:Dispose=()=>{if(disposed)return;disposed=true;try{disposeBag(ownedEffects,cleanups);}finally{try{untracked(()=>execute(model.cleanup));}finally{for(const name of Object.keys(scope))delete scope[name];supplied={};components=[];}}};
  try{execute(model.init);model.roots.forEach(root=>create(root,target!,scope,String(supplied.class??'')));}catch(error){try{dispose();}catch{/* Preserve the original mounting error after attempting all cleanups. */}throw error;}finally{target=undefined;}
  // Drop the target from the shared default-parameter environment after mounting.
  dispose.refresh=refresh;dispose.collect=result=>collectBag(ownedEffects,cleanups,result);return dispose;
}

export function mountCounter(target:Element,model:CounterModel):()=>void {let value=safeInteger(model.initial);const step=safeInteger(model.step),button=target.ownerDocument.createElement('button'),text=target.ownerDocument.createTextNode('');button.append(text);const render=()=>{text.data=model.prefix+String(value);};const click=()=>{value=safeInteger(value+step);render();};render();button.addEventListener('click',click);target.append(button);return()=>{button.removeEventListener('click',click);button.remove();};}
