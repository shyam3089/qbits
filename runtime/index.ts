export interface CounterModel { initial: number; prefix: string; step: number }
type Value = string | number | boolean;
type Expr = {kind:'literal';value:Value} | {kind:'reference';name:string} | {kind:'str';argument:Expr} | {kind:'add';left:Expr;right:Expr};
type Handler = {kind?:'click';target:string;operand:string;step:number} | {kind:'input';target:string} | {kind:'change';target:string};
interface View {tag:string;component:number;attributes:Record<string,Expr>;children:View[];handler?:Handler}
interface Model {props:Record<string,Value>;states:Record<string,Value>;roots:View[]}
type Dispose = (()=>void) & {refresh?:()=>void};
type Mount = (target:Element,runtime:typeof import('./index.js'),props?:Record<string,Value>)=>Dispose;
export function mountComponent(target:Element,model:Model,components:Mount[],supplied:Record<string,Value>={}):Dispose {
  const props=Object.create(null) as Record<string,Value>;
  const states=Object.assign(Object.create(null),model.states) as Record<string,Value>;
  for(const key of Object.keys(supplied)) if(key!=='class'&&!Object.hasOwn(model.props,key)) throw new TypeError(`Unknown prop ${key}`);
  function readProps() {
    for(const [key,initial] of Object.entries(model.props)) {
      const value=Object.hasOwn(supplied,key)?supplied[key]:initial;
      if(typeof value!==typeof initial) throw new TypeError(`Invalid prop ${key}`);
      props[key]=value;
    }
  }
  readProps();
  if(supplied.class!==undefined&&(typeof supplied.class!=='string'||model.roots.length!==1)) throw new TypeError('class forwarding requires a string and a single root');
  function evaluate(e:Expr):Value {
    if(e.kind==='literal') return e.value;
    if(e.kind==='reference') return Object.hasOwn(states,e.name)?states[e.name]:props[e.name];
    if(e.kind==='str') return String(evaluate(e.argument));
    const left=evaluate(e.left),right=evaluate(e.right);
    return typeof left==='number'&&typeof right==='number'?left+right:String(left)+String(right);
  }
  const updates:(()=>void)[]=[];const cleanups:(()=>void)[]=[];let disposed=false;
  const render=()=>{if(!disposed){readProps();updates.forEach(update=>update());}};
  function create(view:View,parent:Element,forward=''):void {
    if(view.component>=0) {
      const input=Object.create(null) as Record<string,Value>;
      for(const [key,value] of Object.entries(view.attributes)) Object.defineProperty(input,key,{enumerable:true,configurable:true,get:()=>evaluate(value)});
      if(forward) Object.defineProperty(input,'class',{enumerable:true,configurable:true,get:()=>[view.attributes.class?evaluate(view.attributes.class):'',forward].filter(Boolean).join(' ')});
      const dispose=components[view.component](parent,{mountComponent,mountCounter},input);
      cleanups.push(dispose); updates.push(()=>dispose.refresh?.());return;
    }
    const element=parent.ownerDocument.createElement(view.tag);
    const classes=[view.attributes.class?String(evaluate(view.attributes.class)):'',forward].join(' ').split(/\s+/).filter(Boolean);
    if(classes.length) element.classList.add(...new Set(classes));
    if(view.attributes.type) (element as HTMLInputElement).type=String(evaluate(view.attributes.type));
    if(view.attributes.text) {
      const text=parent.ownerDocument.createTextNode('');element.append(text);
      updates.push(()=>{text.data=String(evaluate(view.attributes.text));});
    }
    if(view.attributes.value) {
      const input=element as HTMLInputElement;
      updates.push(()=>{const value=String(evaluate(view.attributes.value));if(input.value!==value)input.value=value;});
    }
    if(view.attributes.checked) {
      const input=element as HTMLInputElement;
      updates.push(()=>{const checked=evaluate(view.attributes.checked);if(typeof checked!=='boolean')throw new TypeError('Input checked requires a boolean');if(input.checked!==checked)input.checked=checked;});
    }
    if(view.handler) {
      const h=view.handler;
      if(h.kind!=='input'&&h.kind!=='change') {
        const click=()=>{const current=states[h.operand];if(typeof current!=='number')throw new TypeError('Click increments require numeric state');const next=current+h.step;if(!Number.isSafeInteger(next))throw new RangeError('State exceeded safe integer range');states[h.target]=next;render();};
        element.addEventListener('click',click);cleanups.push(()=>element.removeEventListener('click',click));
      } else if(h.kind==='input') {
        const input=()=>{states[h.target]=(element as HTMLInputElement).value;render();};
        element.addEventListener('input',input);cleanups.push(()=>element.removeEventListener('input',input));
      } else {
        const change=()=>{states[h.target]=(element as HTMLInputElement).checked;render();};
        element.addEventListener('change',change);cleanups.push(()=>element.removeEventListener('change',change));
      }
    }
    parent.append(element);cleanups.push(()=>element.remove());
    view.children.forEach(child=>create(child,element));
  }
  const dispose:Dispose=()=>{if(disposed)return;disposed=true;for(const cleanup of cleanups.reverse())cleanup();};
  try {model.roots.forEach(root=>create(root,target,String(supplied.class??'')));render();}
  catch(error){dispose();throw error;}
  dispose.refresh=render;return dispose;
}
export function mountCounter(target: Element, model: CounterModel): () => void {
  let value = model.initial;
  const button = target.ownerDocument.createElement('button');
  const text = target.ownerDocument.createTextNode(''); button.append(text);
  const render = () => { text.data = model.prefix + String(value); };
  const click = () => { const next = value + model.step; if (!Number.isSafeInteger(next)) throw new RangeError('State exceeded safe integer range'); value = next; render(); };
  render(); button.addEventListener('click', click); target.append(button);
  return () => { button.removeEventListener('click', click); button.remove(); };
}
