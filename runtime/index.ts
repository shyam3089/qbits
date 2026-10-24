export interface CounterModel {initial:number;prefix:string;step:number}
type Primitive=string|number|boolean;
type Value=Primitive|Instance|Value[];
type Expr={kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'str'|'len';argument:Expr}|{kind:'add';left:Expr;right:Expr}|{kind:'construct';name:string;arguments:Expr[]}|{kind:'list';items:Expr[]};
type ConditionExpr={kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'not';argument:ConditionExpr}|{kind:'equal'|'notEqual'|'and';left:ConditionExpr;right:ConditionExpr};
type Statement={kind:'assign';target:Expr;value:Expr}|{kind:'eventAssign';target:Expr;member:'value'|'checked'}|{kind:'call';target:Expr;method:string;arguments:Expr[]};
interface Handler {kind?:string;event:'click'|'input'|'change';statements:Statement[]}
interface ElementView {kind:'element';tag:string;component:number;attributes:Record<string,Expr>;static?:number;children:View[];handler?:Handler}
interface ConditionalView {kind:'conditional';condition:ConditionExpr;consequent:View[];alternate:View[]}
interface IterationView {kind:'iteration';item:string;collection:Expr;key:Expr;children:View[]}
type View=ElementView|ConditionalView|IterationView;
interface ClassModel {fields:{name:string;initial:Expr}[];computed:Record<string,Expr>;actions:Record<string,Statement[]>}
interface Model {props:Record<string,Primitive>;classes:Record<string,ClassModel>;states:Record<string,Expr>;computed:Record<string,Expr>;init:Statement[];cleanup:Statement[];roots:View[]}
interface Signal<T=Value>{value:T;subscribers:Set<ReactiveEffect>;derive?:ReactiveEffect;dirty?:boolean}
interface Instance {__class:string;fields:Record<string,Signal>;computed:Record<string,Expr>;actions:Record<string,Statement[]>;scope:Scope}
type Scope=Record<string,Signal|Instance|(()=>Value)>;
type ReactiveEffect=(()=>void)&{dependencies:Set<Signal>;disposed:boolean;computed?:Signal};
type Dispose=(()=>void)&{refresh?:()=>void};
type Mount=(target:Element,runtime:typeof import('./index.js'),props?:Record<string,Primitive>)=>Dispose;
let activeEffect:ReactiveEffect|undefined;
let batchDepth=0,flushing=false;
const pendingComputed=new Set<ReactiveEffect>(),pendingEffects=new Set<ReactiveEffect>();
let transactionDepth=0;
const changedSignals:Signal[]=[],previousValues:Value[]=[];

function signal<T=Value>(value:T):Signal<T>{return {value,subscribers:new Set()};}
function read<T>(source:Signal<T>):T {if(source.dirty)source.derive!();if(activeEffect&&!activeEffect.disposed){source.subscribers.add(activeEffect);activeEffect.dependencies.add(source as Signal);}return source.value;}
function rememberValue(source:Signal):void {if(!transactionDepth||source.derive||changedSignals.includes(source))return;changedSignals.push(source);previousValues.push(source.value);}
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
  try{while(pendingComputed.size||pendingEffects.size){while(pendingComputed.size)pendingComputed.values().next().value!();if(pendingEffects.size)pendingEffects.values().next().value!();}}
  finally{flushing=false;pendingComputed.clear();pendingEffects.clear();}
}
function batch<T>(run:()=>T):T {batchDepth++;let complete=false;try{const result=run();complete=true;return result;}finally{batchDepth--;if(complete)flush();}}
function untracked<T>(run:()=>T):T {const previous=activeEffect;activeEffect=undefined;try{return run();}finally{activeEffect=previous;}}
function write<T>(source:Signal<T>,value:T):void {if(typeof value==='number'&&!Number.isSafeInteger(value))throw new RangeError('State exceeded safe integer range');if(Object.is(source.value,value))return;rememberValue(source as Signal);source.value=value;for(const subscriber of source.subscribers)enqueue(subscriber);flush();}
function createEffect(run:()=>void,computed?:Signal):ReactiveEffect {
  const effect=(()=>{if(effect.disposed)return;pendingComputed.delete(effect);pendingEffects.delete(effect);if(computed)computed.dirty=false;for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies.clear();const previous=activeEffect;activeEffect=effect;try{run();}finally{activeEffect=previous;}}) as ReactiveEffect;
  effect.dependencies=new Set();effect.disposed=false;effect.computed=computed;
  if(computed){computed.derive=effect;computed.dirty=true;}
  else try{effect();}catch(error){stop(effect);throw error;}
  return effect;
}
function stop(effect:ReactiveEffect):void {if(effect.disposed)return;effect.disposed=true;pendingComputed.delete(effect);pendingEffects.delete(effect);for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies.clear();}

function clearTransaction():void {changedSignals.length=previousValues.length=0;}
function transact<T>(run:()=>T):T {
  if(transactionDepth)return run();
  clearTransaction();transactionDepth=1;batchDepth++;let batched=true;
  try{const result=run();batchDepth--;batched=false;flush();transactionDepth=0;clearTransaction();return result;}
  catch(error){
    if(batched)batchDepth--;
    transactionDepth=0;
    for(let index=changedSignals.length-1;index>=0;index--)changedSignals[index].value=previousValues[index];
    pendingComputed.clear();pendingEffects.clear();
    const recover=[...changedSignals];clearTransaction();
    batchDepth++;try{for(const source of recover)for(const effect of source.subscribers)enqueue(effect);}finally{batchDepth--;try{flush();}catch{/* Preserve the original transaction failure. */}}
    throw error;
  }
}

// Indices of the longest ordered group of retained records. Reconciliation only
// moves records outside this group; new records use the sentinel -1.
function orderedIndices(positions:number[]):Set<number> {
  const tails:number[]=[],previous=new Array<number>(positions.length).fill(-1);
  positions.forEach((position,index)=>{if(position<0)return;let low=0,high=tails.length;while(low<high){const middle=(low+high)>>>1;if(positions[tails[middle]]<position)low=middle+1;else high=middle;}if(low)previous[index]=tails[low-1];tails[low]=index;});
  const result=new Set<number>();let index=tails[tails.length-1];while(index!==undefined&&index>=0){result.add(index);index=previous[index];}return result;
}

export function mountComponent(target:Element,model:Model,components:Mount[],supplied:Record<string,Primitive>={}):Dispose {
  const scope=Object.create(null) as Scope;const ownedEffects:ReactiveEffect[]=[];const cleanups:(()=>void)[]=[];let disposed=false;
  const track=(run:()=>void,bag=ownedEffects)=>{const effect=createEffect(run);bag.push(effect);return effect;};
  for(const key of Object.keys(supplied))if(key!=='class'&&!Object.hasOwn(model.props,key))throw new TypeError(`Unknown prop ${key}`);
  for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);scope[name]=signal(value);}
  const getSignal=(name:string,local:Scope):Signal=>{const value=local[name];if(!value||typeof value==='function'||'__class'in value)throw new TypeError(`Unknown writable value ${name}`);return value;};
  function evaluate(expression:Expr,local=scope):Value {
    if(expression.kind==='literal')return expression.value;
    if(expression.kind==='reference'){const value=local[expression.name];if(!value)throw new TypeError(`Unknown value ${expression.name}`);return typeof value==='function'?value():'__class'in value?value:read(value);}
    if(expression.kind==='member'){const owner=evaluate(expression.object,local);if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner))throw new TypeError('Member access requires a class instance');const field=owner.fields[expression.name];if(field)return read(field);const computed=owner.computed[expression.name];if(computed)return evaluate(computed,owner.scope);throw new TypeError(`Unknown member ${expression.name}`);}
    if(expression.kind==='str')return String(evaluate(expression.argument,local));
    if(expression.kind==='len'){const value=evaluate(expression.argument,local);if(!Array.isArray(value))throw new TypeError('len requires a list');return value.length;}
    if(expression.kind==='add'){const left=evaluate(expression.left,local),right=evaluate(expression.right,local);return typeof left==='number'&&typeof right==='number'?left+right:String(left)+String(right);}
    if(expression.kind==='list')return expression.items.map(item=>evaluate(item,local));
    if(expression.kind==='construct')return instantiate(expression.name,expression.arguments.map(item=>evaluate(item,local)));
    throw new TypeError('Unsupported expression');
  }
  function instantiate(name:string,args:Value[]):Instance {
    const declaration=model.classes[name];if(!declaration)throw new TypeError(`Unknown class ${name}`);const instanceScope=Object.create(null) as Scope;
    const instance:Instance={__class:name,fields:Object.create(null),computed:declaration.computed,actions:declaration.actions,scope:instanceScope};
    declaration.fields.forEach((field,index)=>{const value=args[index]??evaluate(field.initial,instanceScope);const source=signal(value);instance.fields[field.name]=source;instanceScope[field.name]=source;});
    // Class derivations stay lazy: consumers subscribe directly to fields,
    // without a class-level effect that would outlive a removed list record.
    for(const [member,expression] of Object.entries(declaration.computed))instanceScope[member]=()=>evaluate(expression,instanceScope);
    return instance;
  }
  for(const [name,initial] of Object.entries(model.states))scope[name]=signal(evaluate(initial));
  for(const name of Object.keys(model.computed))scope[name]=signal('');
  for(const [name,expression] of Object.entries(model.computed)){const source=getSignal(name,scope);ownedEffects.push(createEffect(()=>write(source,evaluate(expression)),source));}
  function resolveTarget(target:Expr,local:Scope):Signal {
    if(target.kind==='reference')return getSignal(target.name,local);
    if(target.kind==='member'){const owner=evaluate(target.object,local);if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner))throw new TypeError('Member assignment requires an instance');const result=owner.fields[target.name];if(!result)throw new TypeError(`Member ${target.name} is read-only or unknown`);return result;}
    throw new TypeError('Invalid assignment target');
  }
  function execute(statements:Statement[],local=scope,event?:Event):void {
    transact(()=>{for(const statement of statements){
      if(statement.kind==='assign')write(resolveTarget(statement.target,local),evaluate(statement.value,local));
      else if(statement.kind==='eventAssign'){
        const element=event?.currentTarget;if(!(element instanceof HTMLInputElement))throw new TypeError('Event value requires an input element');write(resolveTarget(statement.target,local),statement.member==='value'?element.value:element.checked);
      } else {
        const owner=evaluate(statement.target,local);const args=statement.arguments.map(argument=>evaluate(argument,local));
        if(Array.isArray(owner)){
          const source=resolveTarget(statement.target,local);let next:Value[];
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
  function create(view:View,parent:Element|DocumentFragment,local=scope,forward='',effects=ownedEffects,callbacks=cleanups):void {
    // Dynamic ranges can move out of their staging fragment. Resolve insertion
    // parents from live anchors so nested scopes keep updating in place.
    if(view.kind==='conditional'){
      const anchor=parent.ownerDocument.createComment('if');parent.append(anchor);let selected:boolean|undefined;let branchEffects:ReactiveEffect[]=[];let branchCleanups:(()=>void)[]=[];
      callbacks.push(()=>{try{disposeBag(branchEffects,branchCleanups);}finally{anchor.remove();}});
      const update=createEffect(()=>{const next=Boolean(evaluateCondition(view.condition,local));if(next===selected)return;untracked(()=>{disposeBag(branchEffects,branchCleanups);selected=next;const fragment=parent.ownerDocument.createDocumentFragment();for(const child of next?view.consequent:view.alternate)create(child,fragment,local,forward,branchEffects,branchCleanups);anchor.parentNode!.insertBefore(fragment,anchor);});});effects.push(update);return;
    }
    if(view.kind==='iteration'){
      const document=parent.ownerDocument,anchor=document.createComment('for');parent.append(anchor);
      type Record={start:Comment;end:Comment;item:Signal;index:number;effects:ReactiveEffect[];cleanups:(()=>void)[]};
      const records=new Map<Primitive,Record>(),keyScope=Object.create(local) as Scope,keyItem=signal<Value>('');keyScope[view.item]=keyItem;
      let update:ReactiveEffect|undefined;
      callbacks.push(()=>{if(update)stop(update);try{disposeBag([], [...records.values()].map(record=>()=>disposeBag(record.effects,record.cleanups)));}finally{records.clear();anchor.remove();}});
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
        const collection=evaluate(view.collection,local);if(!Array.isArray(collection))throw new TypeError('Iteration requires a list');
        const desired:{key:Primitive;item:Value}[]=[],seen=new Set<Primitive>();
        for(const item of collection){keyItem.value=item;const key=evaluate(view.key,keyScope) as Primitive;if(seen.has(key))throw new TypeError(`Duplicate iteration key ${String(key)}`);seen.add(key);desired.push({key,item});}
        // Structural setup must not subscribe this list to child props, init
        // statements, or static attributes read while constructing records.
        untracked(()=>{
          for(const [key,record] of records)if(!seen.has(key)){disposeBag(record.effects,record.cleanups);records.delete(key);}
          for(const entry of desired){
            const existing=records.get(entry.key);if(existing){write(existing.item,entry.item);continue;}
            const fragment=document.createDocumentFragment(),start=document.createComment('item'),end=document.createComment('/item');
            const record:Record={start,end,item:signal(entry.item),index:-1,effects:[],cleanups:[]};
            fragment.append(start);record.cleanups.push(()=>{start.remove();end.remove();});
            const itemScope=Object.create(local) as Scope;itemScope[view.item]=record.item;
            try{for(const child of view.children)create(child,fragment,itemScope,'',record.effects,record.cleanups);fragment.append(end);records.set(entry.key,record);}
            catch(error){disposeBag(record.effects,record.cleanups);throw error;}
          }
          const positions=desired.map(entry=>records.get(entry.key)!.index);
          let last=-1,reordered=false;for(const position of positions)if(position>=0){if(position<last)reordered=true;last=position;}
          const stable=reordered?orderedIndices(positions):undefined;
          let before:Node=anchor;
          for(let index=desired.length-1;index>=0;index--){const record=records.get(desired[index].key)!;
            if(record.index<0)before.parentNode!.insertBefore(record.start.parentNode!,before);
            else if(stable&&!stable.has(index)&&record.end.nextSibling!==before)move(record,before);
            before=record.start;record.index=index;
          }
        });
      });effects.push(update);return;
    }
    if(view.component>=0){
      const input=Object.create(null) as Record<string,Primitive>;
      for(const [key,value] of Object.entries(view.attributes))Object.defineProperty(input,key,{enumerable:true,configurable:true,get:()=>evaluate(value,local) as Primitive});
      if(forward)Object.defineProperty(input,'class',{enumerable:true,configurable:true,get:()=>[view.attributes.class?evaluate(view.attributes.class,local):'',forward].filter(Boolean).join(' ')});
      const dispose=untracked(()=>components[view.component](parent as Element,{mountComponent,mountCounter},input));callbacks.push(dispose);
      // Refresh only the child prop signals; the child and its local state stay
      // mounted. Each child binding independently tracks those signals.
      if(dispose.refresh)track(()=>dispose.refresh!(),effects);return;
    }
    const element=parent.ownerDocument.createElement(view.tag),staticBindings=view.static??0;const classValue=view.attributes.class?evaluate(view.attributes.class,local):'';const classes=[String(classValue),forward].join(' ').split(/\s+/).filter(Boolean);if(classes.length)element.classList.add(...new Set(classes));if(view.attributes.type)(element as HTMLInputElement).type=String(evaluate(view.attributes.type,local));
    if(view.attributes.text){const fixed=Boolean(staticBindings&1);const text=parent.ownerDocument.createTextNode(fixed?String(evaluate(view.attributes.text,local)):'');element.append(text);if(!fixed)effects.push(createEffect(()=>{const value=String(evaluate(view.attributes.text,local));if(text.data!==value)text.data=value;}));}
    if(view.attributes.value){const input=element as HTMLInputElement,fixed=Boolean(staticBindings&2);if(fixed)input.value=String(evaluate(view.attributes.value,local));else effects.push(createEffect(()=>{const value=String(evaluate(view.attributes.value,local));if(input.value!==value)input.value=value;}));}
    if(view.attributes.checked){const input=element as HTMLInputElement,fixed=Boolean(staticBindings&4);if(fixed)input.checked=Boolean(evaluate(view.attributes.checked,local));else effects.push(createEffect(()=>{const value=evaluate(view.attributes.checked,local);if(typeof value!=='boolean')throw new TypeError('checked requires boolean');if(input.checked!==value)input.checked=value;}));}
    if(view.handler){const listener=(event:Event)=>execute(view.handler!.statements,local,event);element.addEventListener(view.handler.event,listener);callbacks.push(()=>element.removeEventListener(view.handler!.event,listener));}
    parent.append(element);if(parent===target||parent instanceof DocumentFragment)callbacks.push(()=>element.remove());for(const child of view.children)create(child,element,local,'',effects,callbacks);
  }
  const refresh=()=>{if(disposed)return;transact(()=>{for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);write(getSignal(name,scope),value);}});};
  const dispose:Dispose=()=>{if(disposed)return;disposed=true;try{disposeBag(ownedEffects,cleanups);}finally{try{untracked(()=>execute(model.cleanup));}finally{for(const name of Object.keys(scope))delete scope[name];supplied={};components=[];}}};
  try{execute(model.init);model.roots.forEach(root=>create(root,target,scope,String(supplied.class??'')));}catch(error){try{dispose();}catch{/* Preserve the original mounting error after attempting all cleanups. */}throw error;}dispose.refresh=refresh;return dispose;
}

export function mountCounter(target:Element,model:CounterModel):()=>void {let value=model.initial;const button=target.ownerDocument.createElement('button'),text=target.ownerDocument.createTextNode('');button.append(text);const render=()=>{text.data=model.prefix+String(value);};const click=()=>{const next=value+model.step;if(!Number.isSafeInteger(next))throw new RangeError('State exceeded safe integer range');value=next;render();};render();button.addEventListener('click',click);target.append(button);return()=>{button.removeEventListener('click',click);button.remove();};}
