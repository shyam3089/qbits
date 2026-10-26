import type {Component,ConditionExpression,Expression,Statement,ViewNode} from './ast.js';

export function generate(ast:Component):string {
  function expression(value:Expression):unknown {
    if(value.kind==='literal')return {kind:value.kind,value:value.value};
    if(value.kind==='reference')return {kind:value.kind,name:value.name};
    if(value.kind==='member')return {kind:value.kind,object:expression(value.object),name:value.name.value};
    if(value.kind==='str'){
      const argument=expression(value.argument) as {kind:string;value?:unknown};
      return argument.kind==='literal'?{kind:'literal',value:String(argument.value)}:{kind:value.kind,argument};
    }
    if(value.kind==='len')return {kind:value.kind,argument:expression(value.argument)};
    if(value.kind==='add'){
      const left=expression(value.left) as {kind:string;value?:unknown},right=expression(value.right) as {kind:string;value?:unknown};
      if(left.kind==='literal'&&right.kind==='literal'){
        if(typeof left.value==='number'&&typeof right.value==='number'){
          const result=left.value+right.value;
          if(Number.isSafeInteger(result))return {kind:'literal',value:result};
        } else return {kind:'literal',value:String(left.value)+String(right.value)};
      }
      return {kind:value.kind,left,right};
    }
    if(value.kind==='construct')return {kind:value.kind,name:value.name.value,arguments:value.arguments.map(expression)};
    if(value.kind==='list')return {kind:value.kind,items:value.items.map(expression)};
    throw new Error(`Unsupported expression ${(value as {kind:string}).kind}`);
  }
  function condition(value:ConditionExpression):unknown {
    if(value.kind==='literal')return {kind:value.kind,value:value.value};
    if(value.kind==='reference')return {kind:value.kind,name:value.name};
    if(value.kind==='member')return {kind:value.kind,object:expression(value.object),name:value.name.value};
    if(value.kind==='not'){
      const argument=condition(value.argument) as {kind:string;value?:unknown};
      return argument.kind==='literal'?{kind:'literal',value:!argument.value}:{kind:value.kind,argument};
    }
    const left=condition(value.left) as {kind:string;value?:unknown};
    if(value.kind==='and'&&left.kind==='literal'&&!left.value)return {kind:'literal',value:false};
    const right=condition(value.right) as {kind:string;value?:unknown};
    if(left.kind==='literal'&&right.kind==='literal')return {kind:'literal',value:value.kind==='and'?Boolean(left.value)&&Boolean(right.value):value.kind==='equal'?left.value===right.value:left.value!==right.value};
    return {kind:value.kind,left,right};
  }
  const statement=(value:Statement):unknown=>value.kind==='assign'?{kind:value.kind,target:expression(value.target),value:expression(value.value)}:value.kind==='eventAssign'?{kind:value.kind,target:expression(value.target),member:value.member.value}:{kind:value.kind,target:expression(value.target),method:value.method.value,arguments:value.arguments.map(expression)};
  const componentImports=ast.imports.filter(item=>item.name);
  function nodes(values:ViewNode[]):unknown[]{
    const result:unknown[]=[];
    for(const value of values)if(value.kind==='conditional'){
      const test=condition(value.condition) as {kind:string;value?:unknown};
      if(test.kind==='literal')result.push(...nodes(test.value?value.consequent:value.alternate));
      else result.push({kind:value.kind,condition:test,consequent:nodes(value.consequent),alternate:nodes(value.alternate)});
    }else result.push(node(value));
    return result;
  }
  function node(value:Exclude<ViewNode,{kind:'conditional'}>):unknown {
    if(value.kind==='iteration')return {kind:value.kind,item:value.item.value,collection:expression(value.collection),key:expression(value.key),children:nodes(value.children)};
    const attributes:Record<string,unknown>={};
    const flags:Record<string,number>={text:1,value:2,checked:4,class:8,type:16};
    let staticBindings=0;
    for(const [key,item] of Object.entries(value.attributes)){const generated=expression(item) as {kind:string};attributes[key]=generated;if(generated.kind==='literal')staticBindings|=flags[key]??0;}
    return {kind:'element',tag:value.tag.value,component:componentImports.findIndex(item=>item.name!.value===value.tag.value),attributes,...(staticBindings?{static:staticBindings}:{}),children:nodes(value.children),...(value.handler?{handler:{kind:value.handler.kind,event:value.handler.event.value,statements:value.handler.statements.map(statement)}}:{})};
  }
  const classes=Object.fromEntries(ast.classes.map(declaration=>[declaration.name.value,{fields:declaration.fields.map(field=>({name:field.name.value,initial:expression(field.initial)})),computed:Object.fromEntries(declaration.computed.map(item=>[item.name.value,expression(item.expression)])),actions:Object.fromEntries(declaration.actions.map(action=>[action.name.value,action.statements.map(statement)]))}]));
  const imports=ast.imports.map(item=>item.name?`import c${componentImports.indexOf(item)} from ${JSON.stringify(item.path.value)};`:`import ${JSON.stringify(item.path.value)};`).join('\n');
  const model={props:Object.fromEntries(ast.props.map(prop=>[prop.name.value,prop.initial.value])),classes,states:Object.fromEntries(ast.states.map(state=>[state.name.value,expression(state.initial)])),computed:Object.fromEntries(ast.computed.map(item=>[item.name.value,expression(item.expression)])),init:ast.init.map(statement),cleanup:ast.cleanup.map(statement),roots:nodes(ast.roots)};
  const serialized=JSON.stringify(model).replaceAll('"__proto__":','["__proto__"]:');
  return `${imports}\nexport const componentName=${JSON.stringify(ast.name.value)};\nexport const model=${serialized};\nexport default function mount(target,runtime,props={},state={}){const components=[${componentImports.map((_,index)=>`c${index}`).join(',')}];return Object.keys(state).length?runtime.mountComponentWithState(target,model,components,props,state):runtime.mountComponent(target,model,components,props)}\n`;
}
