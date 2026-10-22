export interface CounterModel {initial:number;prefix:string;step:number}
type Primitive=string|number|boolean;
type Value=Primitive|Instance|Value[];
type Expr={kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'str'|'len';argument:Expr}|{kind:'add';left:Expr;right:Expr}|{kind:'construct';name:string;arguments:Expr[]}|{kind:'list';items:Expr[]};
type ConditionExpr={kind:'literal';value:Primitive}|{kind:'reference';name:string}|{kind:'member';object:Expr;name:string}|{kind:'not';argument:ConditionExpr}|{kind:'equal'|'notEqual'|'and';left:ConditionExpr;right:ConditionExpr};
type Statement={kind:'assign';target:Expr;value:Expr}|{kind:'eventAssign';target:Expr;member:'value'|'checked'}|{kind:'call';target:Expr;method:string;arguments:Expr[]};
interface Handler {kind?:string;event:'click'|'input'|'change';statements:Statement[]}
interface ElementView {kind:'element';tag:string;component:number;attributes:Record<string,Expr>;children:View[];handler?:Handler}
interface ConditionalView {kind:'conditional';condition:ConditionExpr;consequent:View[];alternate:View[]}
interface IterationView {kind:'iteration';item:string;collection:Expr;key:Expr;children:View[]}
type View=ElementView|ConditionalView|IterationView;
interface ClassModel {fields:{name:string;initial:Expr}[];computed:Record<string,Expr>;actions:Record<string,Statement[]>}
interface Model {props:Record<string,Primitive>;classes:Record<string,ClassModel>;states:Record<string,Expr>;computed:Record<string,Expr>;init:Statement[];cleanup:Statement[];roots:View[]}
interface Signal<T=Value>{value:T;subscribers:Set<ReactiveEffect>}
interface Instance {__class:string;fields:Record<string,Signal>;computed:Record<string,Expr>;actions:Record<string,Statement[]>;scope:Scope}
type Scope=Record<string,Signal|Instance>;
type ReactiveEffect=(()=>void)&{dependencies:Set<Signal>;disposed:boolean};
type Dispose=(()=>void)&{refresh?:()=>void};
type Mount=(target:Element,runtime:typeof import('./index.js'),props?:Record<string,Primitive>)=>Dispose;
let activeEffect:ReactiveEffect|undefined;

function signal<T=Value>(value:T):Signal<T>{return {value,subscribers:new Set()};}
function read<T>(source:Signal<T>):T {if(activeEffect&&!activeEffect.disposed){source.subscribers.add(activeEffect);activeEffect.dependencies.add(source as Signal);}return source.value;}
function write<T>(source:Signal<T>,value:T):void {if(Object.is(source.value,value))return;source.value=value;for(const subscriber of [...source.subscribers])subscriber();}
function createEffect(run:()=>void):ReactiveEffect {
  const effect=(()=>{if(effect.disposed)return;for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies.clear();const previous=activeEffect;activeEffect=effect;try{run();}finally{activeEffect=previous;}}) as ReactiveEffect;
  effect.dependencies=new Set();effect.disposed=false;effect();return effect;
}
function stop(effect:ReactiveEffect):void {if(effect.disposed)return;effect.disposed=true;for(const source of effect.dependencies)source.subscribers.delete(effect);effect.dependencies.clear();}

export function mountComponent(target:Element,model:Model,components:Mount[],supplied:Record<string,Primitive>={}):Dispose {
  const scope=Object.create(null) as Scope;const ownedEffects:ReactiveEffect[]=[];const cleanups:(()=>void)[]=[];let disposed=false;
  const track=(run:()=>void,bag=ownedEffects)=>{const effect=createEffect(run);bag.push(effect);return effect;};
  for(const key of Object.keys(supplied))if(key!=='class'&&!Object.hasOwn(model.props,key))throw new TypeError(`Unknown prop ${key}`);
  for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);scope[name]=signal(value);}
  const getSignal=(name:string,local:Scope):Signal=>{const value=local[name];if(!value||'__class'in value)throw new TypeError(`Unknown writable value ${name}`);return value;};
  function evaluate(expression:Expr,local=scope):Value {
    if(expression.kind==='literal')return expression.value;
    if(expression.kind==='reference'){const value=local[expression.name];if(!value)throw new TypeError(`Unknown value ${expression.name}`);return '__class'in value?value:read(value);}
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
    return instance;
  }
  for(const [name,initial] of Object.entries(model.states))scope[name]=signal(evaluate(initial));
  for(const name of Object.keys(model.computed))scope[name]=signal('');
  for(const [name,expression] of Object.entries(model.computed))track(()=>write(getSignal(name,scope),evaluate(expression)));
  function resolveTarget(target:Expr,local:Scope):Signal {
    if(target.kind==='reference')return getSignal(target.name,local);
    if(target.kind==='member'){const owner=evaluate(target.object,local);if(!owner||typeof owner!=='object'||Array.isArray(owner)||!('__class'in owner))throw new TypeError('Member assignment requires an instance');const result=owner.fields[target.name];if(!result)throw new TypeError(`Member ${target.name} is read-only or unknown`);return result;}
    throw new TypeError('Invalid assignment target');
  }
  function execute(statements:Statement[],local=scope,event?:Event):void {
    for(const statement of statements){
      if(statement.kind==='assign')write(resolveTarget(statement.target,local),evaluate(statement.value,local));
      else if(statement.kind==='eventAssign'){
        const element=event?.currentTarget;if(!(element instanceof HTMLInputElement))throw new TypeError('Event value requires an input element');write(resolveTarget(statement.target,local),statement.member==='value'?element.value:element.checked);
      } else {
        const owner=evaluate(statement.target,local);const args=statement.arguments.map(argument=>evaluate(argument,local));
        if(Array.isArray(owner)){
          const source=resolveTarget(statement.target,local);const next=[...owner];
          if(statement.method==='append')next.push(args[0]);
          else if(statement.method==='remove'){const index=next.indexOf(args[0]);if(index>=0)next.splice(index,1);}
          else if(statement.method==='move'){const index=next.indexOf(args[0]);if(index>=0){const [item]=next.splice(index,1);const destination=Math.max(0,Math.min(next.length,args[1] as number));next.splice(destination,0,item);}}
          else throw new TypeError(`Unsupported list operation ${statement.method}`);write(source,next);
        } else if(owner&&typeof owner==='object'&&'__class'in owner){const body=owner.actions[statement.method];if(!body)throw new TypeError(`Unknown action ${statement.method}`);execute(body,owner.scope);}
        else throw new TypeError('Unsupported call target');
      }
    }
  }
  execute(model.init);
  function evaluateCondition(expression:ConditionExpr,local:Scope):Primitive {
    if(expression.kind==='literal')return expression.value;if(expression.kind==='reference'||expression.kind==='member')return evaluate(expression as Expr,local) as Primitive;
    if(expression.kind==='not')return !evaluateCondition(expression.argument,local);const left=evaluateCondition(expression.left,local);if(expression.kind==='and')return Boolean(left)&&Boolean(evaluateCondition(expression.right,local));const right=evaluateCondition(expression.right,local);return expression.kind==='equal'?left===right:left!==right;
  }
  function disposeBag(effects:ReactiveEffect[],callbacks:(()=>void)[]):void {for(const effect of effects)stop(effect);for(const callback of callbacks.reverse())callback();effects.length=0;callbacks.length=0;}
  function create(view:View,parent:Element|DocumentFragment,local=scope,forward='',effects=ownedEffects,callbacks=cleanups):void {
    if(view.kind==='conditional'){
      const anchor=parent.ownerDocument.createComment('if');parent.append(anchor);let selected:boolean|undefined;let branchEffects:ReactiveEffect[]=[];let branchCleanups:(()=>void)[]=[];
      const update=createEffect(()=>{const next=Boolean(evaluateCondition(view.condition,local));if(next===selected)return;disposeBag(branchEffects,branchCleanups);selected=next;const fragment=parent.ownerDocument.createDocumentFragment();for(const child of next?view.consequent:view.alternate)create(child,fragment,local,forward,branchEffects,branchCleanups);parent.insertBefore(fragment,anchor);});effects.push(update);callbacks.push(()=>{disposeBag(branchEffects,branchCleanups);anchor.remove();});return;
    }
    if(view.kind==='iteration'){
      const anchor=parent.ownerDocument.createComment('for');parent.append(anchor);type Record={start:Comment;end:Comment;effects:ReactiveEffect[];cleanups:(()=>void)[]};const records=new Map<Primitive,Record>();
      const move=(record:Record,before:Node)=>{const fragment=parent.ownerDocument.createDocumentFragment();let node:Node|null=record.start;while(node){const next:Node|null=node.nextSibling;fragment.append(node);if(node===record.end)break;node=next;}parent.insertBefore(fragment,before);};
      const update=createEffect(()=>{const collection=evaluate(view.collection,local);if(!Array.isArray(collection))throw new TypeError('Iteration requires a list');const desired:{key:Primitive;item:Value}[]=[];const seen=new Set<Primitive>();for(const item of collection){const itemScope=Object.create(local) as Scope;itemScope[view.item]=item&&typeof item==='object'&&!Array.isArray(item)&&'__class'in item?item:signal(item);const key=evaluate(view.key,itemScope) as Primitive;if(seen.has(key))throw new TypeError(`Duplicate iteration key ${String(key)}`);seen.add(key);desired.push({key,item});}
        for(const [key,record] of records)if(!seen.has(key)){disposeBag(record.effects,record.cleanups);records.delete(key);}
        for(const entry of desired)if(!records.has(entry.key)){const fragment=parent.ownerDocument.createDocumentFragment(),start=parent.ownerDocument.createComment('item'),end=parent.ownerDocument.createComment('/item'),record:Record={start,end,effects:[],cleanups:[]};fragment.append(start);record.cleanups.push(()=>{start.remove();end.remove();});const itemScope=Object.create(local) as Scope;itemScope[view.item]=entry.item&&typeof entry.item==='object'&&!Array.isArray(entry.item)&&'__class'in entry.item?entry.item:signal(entry.item);for(const child of view.children)create(child,fragment,itemScope,'',record.effects,record.cleanups);fragment.append(end);parent.insertBefore(fragment,anchor);records.set(entry.key,record);}
        let before:Node=anchor;for(let index=desired.length-1;index>=0;index--){const record=records.get(desired[index].key)!;if(record.end.nextSibling!==before)move(record,before);before=record.start;}
      });effects.push(update);callbacks.push(()=>{stop(update);for(const record of records.values())disposeBag(record.effects,record.cleanups);records.clear();anchor.remove();});return;
    }
    if(view.component>=0){const input=Object.create(null) as Record<string,Primitive>;for(const [key,value] of Object.entries(view.attributes))Object.defineProperty(input,key,{enumerable:true,configurable:true,get:()=>evaluate(value,local) as Primitive});if(forward)Object.defineProperty(input,'class',{enumerable:true,configurable:true,get:()=>[view.attributes.class?evaluate(view.attributes.class,local):'',forward].filter(Boolean).join(' ')});const dispose=components[view.component](parent as Element,{mountComponent,mountCounter},input);callbacks.push(dispose);return;}
    const element=parent.ownerDocument.createElement(view.tag);const classes=[view.attributes.class?String(evaluate(view.attributes.class,local)):'',forward].join(' ').split(/\s+/).filter(Boolean);if(classes.length)element.classList.add(...new Set(classes));if(view.attributes.type)(element as HTMLInputElement).type=String(evaluate(view.attributes.type,local));
    if(view.attributes.text){const text=parent.ownerDocument.createTextNode('');element.append(text);effects.push(createEffect(()=>{text.data=String(evaluate(view.attributes.text,local));}));}
    if(view.attributes.value){const input=element as HTMLInputElement;effects.push(createEffect(()=>{const value=String(evaluate(view.attributes.value,local));if(input.value!==value)input.value=value;}));}
    if(view.attributes.checked){const input=element as HTMLInputElement;effects.push(createEffect(()=>{const value=evaluate(view.attributes.checked,local);if(typeof value!=='boolean')throw new TypeError('checked requires boolean');if(input.checked!==value)input.checked=value;}));}
    if(view.handler){const listener=(event:Event)=>execute(view.handler!.statements,local,event);element.addEventListener(view.handler.event,listener);callbacks.push(()=>element.removeEventListener(view.handler!.event,listener));}
    parent.append(element);callbacks.push(()=>element.remove());for(const child of view.children)create(child,element,local,'',effects,callbacks);
  }
  const refresh=()=>{for(const [name,initial] of Object.entries(model.props)){const value=Object.hasOwn(supplied,name)?supplied[name]:initial;if(typeof value!==typeof initial)throw new TypeError(`Invalid prop ${name}`);write(getSignal(name,scope),value);}};
  const dispose:Dispose=()=>{if(disposed)return;execute(model.cleanup);disposed=true;disposeBag(ownedEffects,cleanups);};
  try{model.roots.forEach(root=>create(root,target,scope,String(supplied.class??'')));}catch(error){dispose();throw error;}dispose.refresh=refresh;return dispose;
}

export function mountCounter(target:Element,model:CounterModel):()=>void {let value=model.initial;const button=target.ownerDocument.createElement('button'),text=target.ownerDocument.createTextNode('');button.append(text);const render=()=>{text.data=model.prefix+String(value);};const click=()=>{const next=value+model.step;if(!Number.isSafeInteger(next))throw new RangeError('State exceeded safe integer range');value=next;render();};render();button.addEventListener('click',click);target.append(button);return()=>{button.removeEventListener('click',click);button.remove();};}
