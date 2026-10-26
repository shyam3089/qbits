import type {ClassDecl,Component,ConditionExpression,Expression,Prop,Statement,ViewNode,Span} from './ast.js';
import {fail} from './diagnostics.js';
import {resolveCompilerLimits,type CompilerLimits} from './limits.js';

export const elements=new Set(['main','section','div','h1','h2','h3','h4','h5','h6','p','span','label','button','input','ul','ol','li']);
export interface ValidationOptions {sourceExtension?:string;components?:Map<string,Component>;limits?:Partial<CompilerLimits>}
type Type='string'|'number'|'boolean'|'unknown'|`class:${string}`|`list:${string}`;

export function validate(ast:Component,source:string,filename='<input>',options:ValidationOptions={}):void {
  const limits=resolveCompilerLimits(options.limits);
  const error=(span:Span,message:string):never=>fail(source,filename,span,message);
  const imported=new Set<string>();
  for(const entry of ast.imports) {
    if(!/^\.\.?\//.test(entry.path.value)||/[?#\\]/.test(entry.path.value))error(entry.path.span,'Imports must use plain relative module paths');
    if(entry.name){if(options.sourceExtension&&!entry.path.value.endsWith(options.sourceExtension))error(entry.path.span,`Component import must use configured extension ${options.sourceExtension}`);if(imported.has(entry.name.value)||elements.has(entry.name.value))error(entry.name.span,'Duplicate or reserved component import');imported.add(entry.name.value);}
    else if(!entry.path.value.endsWith('.css'))error(entry.path.span,'Side-effect imports support external .css files only');
  }
  const classes=new Map<string,ClassDecl>();
  for(const declaration of ast.classes){if(classes.has(declaration.name.value)||imported.has(declaration.name.value)||elements.has(declaration.name.value))error(declaration.name.span,`Duplicate class ${declaration.name.value}`);classes.set(declaration.name.value,declaration);}
  const primitive=(value:unknown):Type=>typeof value as Type;
  function classEnvironment(declaration:ClassDecl):Map<string,Type>{
    const env=new Map<string,Type>();
    for(const field of declaration.fields){if(field.initial.kind!=='literal')error(field.initial.span,'Class field defaults must be literals');const initial=field.initial;if(initial.kind!=='literal')throw new Error('unreachable');if(env.has(field.name.value))error(field.name.span,'Duplicate class member');env.set(field.name.value,primitive(initial.value));}
    for(const item of declaration.computed){if(env.has(item.name.value))error(item.name.span,'Duplicate class member');env.set(item.name.value,'unknown');}
    const actionCounts=new Map<string,number>();for(const item of declaration.actions)actionCounts.set(item.name.value,(actionCounts.get(item.name.value)??0)+1);
    for(const item of declaration.actions)if(env.has(item.name.value)||actionCounts.get(item.name.value)!>1)error(item.name.span,'Duplicate class member');
    return env;
  }
  const classEnvs=new Map([...classes].map(([name,value])=>[name,classEnvironment(value)]));
  const constants=new WeakMap<Expression,number|undefined>();
  function constantNumber(expression:Expression):number|undefined {
    if(constants.has(expression))return constants.get(expression);
    let value:number|undefined;
    if(expression.kind==='literal'&&typeof expression.value==='number')value=expression.value;
    if(expression.kind==='add'){const left=constantNumber(expression.left),right=constantNumber(expression.right);if(left!==undefined&&right!==undefined)value=left+right;}
    constants.set(expression,value);return value;
  }
  const classFields=new Map([...classes].map(([name,value])=>[name,new Set(value.fields.map(field=>field.name.value))]));
  const classActions=new Map([...classes].map(([name,value])=>[name,new Set(value.actions.map(action=>action.name.value))]));
  const componentProps=new Map<string,Map<string,Prop>>([...options.components??[]].map(([name,value])=>[name,new Map(value.props.map(prop=>[prop.name.value,prop]))]));
  const componentRootCounts=new Map<string,number|null>([...options.components??[]].map(([name,value])=>[name,staticRootCount(value.roots)]));
  function type(expression:Expression,env:Map<string,Type>):Type {
    if(expression.kind==='literal'){if(typeof expression.value==='number'&&!Number.isSafeInteger(expression.value))error(expression.span,'Numeric values must be safe integers');return primitive(expression.value);}
    if(expression.kind==='reference')return env.get(expression.name)??error(expression.span,`Unknown state or prop ${JSON.stringify(expression.name)}`);
    if(expression.kind==='member'){
      const owner=type(expression.object,env);if(!owner.startsWith('class:'))error(expression.object.span,'Member access requires a class instance');
      const member=classEnvs.get(owner.slice(6))?.get(expression.name.value);return member??error(expression.name.span,`Unknown member ${JSON.stringify(expression.name.value)} on ${owner.slice(6)}`);
    }
    if(expression.kind==='construct'){
      const declaration=classes.get(expression.name.value);if(!declaration)return error(expression.name.span,`Unknown class ${JSON.stringify(expression.name.value)}`);
      if(expression.arguments.length!==declaration.fields.length)error(expression.span,`${expression.name.value} requires ${declaration.fields.length} constructor values, received ${expression.arguments.length}`);
      const fields=classEnvs.get(expression.name.value)!;expression.arguments.forEach((argument,index)=>{const actual=type(argument,env),expected=fields.get(declaration.fields[index].name.value)!;if(actual!==expected)error(argument.span,`Class field ${declaration.fields[index].name.value} requires ${expected}, received ${actual}`);});return `class:${expression.name.value}`;
    }
    if(expression.kind==='list'){
      if(!expression.items.length)return 'list:unknown';const first=type(expression.items[0],env);for(let index=1;index<expression.items.length;index++){const item=expression.items[index],actual=type(item,env);if(actual!==first)error(item.span,`List items must share one type; expected ${first}, received ${actual}`);}return `list:${first}`;
    }
    if(expression.kind==='str'){if(expression.argument.kind!=='reference'&&expression.argument.kind!=='member')error(expression.argument.span,'str requires a state, prop, computed value, or instance member');type(expression.argument,env);return 'string';}
    if(expression.kind==='len'){const actual=type(expression.argument,env);if(!actual.startsWith('list:'))error(expression.argument.span,'len requires a list');return 'number';}
    if(expression.kind==='add'){const left=type(expression.left,env),right=type(expression.right,env);if(left!==right||!['string','number'].includes(left))error(expression.span,'Addition requires two strings or two numbers; use str(value) for explicit conversion');const constant=constantNumber(expression);if(constant!==undefined&&!Number.isSafeInteger(constant))error(expression.span,'Constant arithmetic result exceeds the safe integer range');return left;}
    return error(expression.span,'Unsupported expression');
  }
  function validateComputed(items:Component['computed'],env:Map<string,Type>):void {
    const pending=new Map(items.map(item=>[item.name.value,item]));const resolving=new Set<string>();
    const names=(expression:Expression,result=new Set<string>()):Set<string>=>{if(expression.kind==='reference')result.add(expression.name);else if(expression.kind==='member')names(expression.object,result);else if(expression.kind==='str'||expression.kind==='len')names(expression.argument,result);else if(expression.kind==='add'){names(expression.left,result);names(expression.right,result);}else if(expression.kind==='construct')expression.arguments.forEach(item=>names(item,result));else if(expression.kind==='list')expression.items.forEach(item=>names(item,result));return result;};
    const resolve=(name:string):Type=>{const item=pending.get(name);if(!item)return env.get(name)!;if(resolving.has(name))error(item.name.span,`Computed dependency cycle involving ${JSON.stringify(name)}`);if(resolving.size>=limits.maxNestingDepth)error(item.name.span,`Computed dependency depth exceeds the configured limit of ${limits.maxNestingDepth}`);resolving.add(name);for(const dependency of names(item.expression))if(pending.has(dependency))resolve(dependency);const result=type(item.expression,env);if(result==='unknown')error(item.expression.span,'Computed type could not be inferred');env.set(name,result);pending.delete(name);resolving.delete(name);return result;};
    for(const name of [...pending.keys()])resolve(name);
  }
  for(const declaration of classes.values()){const classEnv=classEnvs.get(declaration.name.value)!;validateComputed(declaration.computed,classEnv);for(const action of declaration.actions)validateStatements(action.statements,classEnv,new Set(declaration.fields.map(field=>field.name.value)),undefined,true);}
  const env=new Map<string,Type>();const writable=new Set<string>();
  for(const prop of ast.props){if(env.has(prop.name.value)||prop.name.value==='class')error(prop.name.span,'Duplicate or reserved declaration');env.set(prop.name.value,primitive(prop.initial.value));}
  for(const state of ast.states){if(env.has(state.name.value)||classes.has(state.name.value)||imported.has(state.name.value)||state.name.value==='class')error(state.name.span,'Duplicate or reserved declaration');const actual=type(state.initial,env);if(actual==='list:unknown')error(state.initial.span,'Empty list state needs an item to infer its type');env.set(state.name.value,actual);writable.add(state.name.value);}
  for(const item of ast.computed){if(env.has(item.name.value))error(item.name.span,'Duplicate or reserved declaration');env.set(item.name.value,'unknown');}
  validateComputed(ast.computed,env);
  function targetType(target:Expression,scope:Map<string,Type>,write:Set<string>):Type {
    if(target.kind==='reference'){if(!scope.has(target.name))error(target.span,`Unknown state ${JSON.stringify(target.name)}`);if(!write.has(target.name))error(target.span,`Cannot assign read-only value ${JSON.stringify(target.name)}`);return scope.get(target.name)!;}
    if(target.kind==='member'){const owner=type(target.object,scope);if(!owner.startsWith('class:'))error(target.span,'Assignment target must be state or an instance field');const className=owner.slice(6);if(!classFields.get(className)!.has(target.name.value))error(target.name.span,'Computed values and actions are read-only');return classEnvs.get(className)!.get(target.name.value)!;}
    return error(target.span,'Assignment target must be state or an instance field');
  }
  function validateStatements(statements:Statement[],scope:Map<string,Type>,write:Set<string>,event?:'click'|'input'|'change',insideClass=false):void {
    for(const statement of statements){
      if(statement.kind==='assign'){
        const expected=targetType(statement.target,scope,write);
        if(event==='click'&&statement.value.kind==='literal'&&typeof statement.value.value==='boolean'&&expected!=='boolean')error(statement.target.span,'Boolean click assignments require boolean state');
        if(event==='click'&&statement.value.kind==='add'){const left=type(statement.value.left,scope),right=type(statement.value.right,scope);if(left!==right)error(statement.value.span,'Click increments require numeric state');}
        const actual=type(statement.value,scope);
        if(actual!==expected){if(event==='click')error(statement.value.span,'Click handlers require a boolean literal assignment or numeric state increment with a matching state type');error(statement.value.span,`Assignment requires ${expected}, received ${actual}`);}
      }
      else if(statement.kind==='eventAssign'){
        if(!event)error(statement.span,'event values are available only inside event handlers');const expected=statement.member.value==='value'?'string':'boolean';if(event==='input'&&statement.member.value!=='value')error(statement.member.span,'Expected value for input event');if(event==='change'&&statement.member.value!=='checked')error(statement.member.span,'Expected checked for change event');if(event==='click')error(statement.member.span,'click events do not expose a value');const actual=targetType(statement.target,scope,write);if(actual!==expected)error(statement.target.span,`event.${statement.member.value} requires ${expected} state`);
      } else {
        const owner=type(statement.target,scope);
        if(owner.startsWith('list:')){
          if(statement.target.kind!=='reference'||!write.has(statement.target.name))error(statement.target.span,'List mutations require existing writable list state');
          const item=owner.slice(5) as Type;if(!['append','remove','move'].includes(statement.method.value))error(statement.method.span,`Unsupported list operation ${statement.method.value}`);
          const expected=statement.method.value==='move'?2:1;if(statement.arguments.length!==expected)error(statement.span,`${statement.method.value} requires ${expected} argument(s)`);
          if(statement.arguments[0]&&type(statement.arguments[0],scope)!==item)error(statement.arguments[0].span,`List operation requires ${item}`);
          if(statement.method.value==='move'&&type(statement.arguments[1],scope)!=='number')error(statement.arguments[1].span,'move index must be a number');
        } else if(owner.startsWith('class:')){
          if(statement.arguments.length)error(statement.span,'Class actions do not accept arguments');if(!classActions.get(owner.slice(6))!.has(statement.method.value))error(statement.method.span,`Unknown action ${statement.method.value}`);
        } else error(statement.target.span,'Calls are limited to class actions and list append/remove/move operations');
      }
    }
  }
  validateStatements(ast.init,env,writable);validateStatements(ast.cleanup,env,writable);
  function conditionType(expression:ConditionExpression,scope:Map<string,Type>):Type {
    if(expression.kind==='literal')return primitive(expression.value);if(expression.kind==='reference'){if(!scope.has(expression.name))error(expression.span,`Unknown name ${JSON.stringify(expression.name)} in condition`);return type(expression as Expression,scope);}if(expression.kind==='member')return type(expression as Expression,scope);
    if(expression.kind==='not'){const actual=conditionType(expression.argument,scope);if(actual!=='boolean')error(expression.argument.span,`not requires a boolean operand, received ${actual}`);return 'boolean';}
    const left=conditionType(expression.left,scope),right=conditionType(expression.right,scope);if(expression.kind==='and'){if(left!=='boolean')error(expression.left.span,`and requires boolean operands, received ${left}`);if(right!=='boolean')error(expression.right.span,`and requires boolean operands, received ${right}`);return 'boolean';}if(left!==right)error(expression.span,`Comparison requires operands of the same type, received ${left} and ${right}`);return 'boolean';
  }
  function reactiveConditionReference(expression:ConditionExpression,reactive:Set<string>):boolean {
    if(expression.kind==='reference')return reactive.has(expression.name);
    if(expression.kind==='member')return true;
    if(expression.kind==='literal')return false;
    if(expression.kind==='not')return reactiveConditionReference(expression.argument,reactive);
    return reactiveConditionReference(expression.left,reactive)||reactiveConditionReference(expression.right,reactive);
  }
  function visit(view:ViewNode,scope=env,scopeWritable=writable):void {
    if(view.kind==='conditional'){const actual=conditionType(view.condition,scope),reactive=new Set([...scopeWritable,...ast.computed.map(item=>item.name.value)]);if(!reactiveConditionReference(view.condition,reactive))error(view.condition.span,'Conditional condition must reference local state or a computed value');if(actual!=='boolean')error(view.condition.span,`Conditional condition must evaluate to boolean, received ${actual}`);view.consequent.forEach(child=>visit(child,scope,scopeWritable));view.alternate.forEach(child=>visit(child,scope,scopeWritable));return;}
    if(view.kind==='iteration'){
      const collection=type(view.collection,scope);if(!collection.startsWith('list:'))error(view.collection.span,'Iteration source must be a list');const itemType=collection.slice(5) as Type;const childScope=new Map(scope);childScope.set(view.item.value,itemType);const keyType=type(view.key,childScope);if(!['string','number','boolean'].includes(keyType))error(view.key.span,'Iteration key must be a string, number, or boolean');if(!references(view.key,view.item.value))error(view.key.span,'Iteration key must reference the iteration item');const childWritable=new Set(scopeWritable);childWritable.delete(view.item.value);view.children.forEach(child=>visit(child,childScope,childWritable));return;
    }
    const node=view,native=elements.has(node.tag.value);if(!native&&!imported.has(node.tag.value))error(node.tag.span,`Unknown element or missing component import ${JSON.stringify(node.tag.value)}`);const child=options.components?.get(node.tag.value);if(!native&&(node.children.length||node.handler))error(node.span,'Component instances do not accept children or event handlers');if(!native&&node.indentedAttributes.length)error(node.attributes[node.indentedAttributes[0]].span,'Indented properties are supported on standard elements only');const checkbox=node.attributes.type?.kind==='literal'&&node.attributes.type.value==='checkbox';
    for(const [key,value] of Object.entries(node.attributes)){const actual=type(value,scope);if(key==='class'){if(value.kind!=='literal'||actual!=='string')error(value.span,'class requires a static string literal');if(child&&componentRootCounts.get(node.tag.value)!==1)error(value.span,'Ambiguous class forwarding: component must have a single resolved root element');}else if(native){if(key==='text'){if(actual!=='string')error(value.span,'text requires a string expression; use str(value)');}else if(key==='value'){if(node.tag.value!=='input'||!node.indentedAttributes.includes(key))error(value.span,'value is supported only as an indented input property');if(checkbox)error(value.span,'value is supported on text inputs only');if(actual!=='string')error(value.span,'input value requires a string expression');}else if(key==='type'){if(node.tag.value!=='input'||!node.indentedAttributes.includes(key))error(value.span,'type is supported only as an indented input property');if(value.kind!=='literal'||value.value!=='checkbox')error(value.span,'input type requires the static string literal "checkbox"');}else if(key==='checked'){if(node.tag.value!=='input'||!node.indentedAttributes.includes(key))error(value.span,'checked is supported only as an indented input property');if(!checkbox)error(value.span,'checked requires input type="checkbox"');if(actual!=='boolean')error(value.span,'input checked requires a boolean expression');}else error(value.span,`Unsupported element attribute ${JSON.stringify(key)}`);}else if(child){const prop=componentProps.get(node.tag.value)?.get(key);if(!prop)error(value.span,`Unknown prop ${JSON.stringify(key)} on ${node.tag.value}`);const resolvedProp=prop!;if(actual!==primitive(resolvedProp.initial.value))error(value.span,`Prop ${key} requires ${primitive(resolvedProp.initial.value)}, received ${actual}`);}}
    if(node.handler){const event=node.handler.event.value;if(event==='click'&&node.tag.value!=='button')error(node.handler.span,'Click handlers are supported on button elements only');if(event==='input'&&(node.tag.value!=='input'||checkbox))error(node.handler.span,'Input handlers are supported on text inputs only');if(event==='change'&&(node.tag.value!=='input'||!checkbox))error(node.handler.span,'Change handlers are supported on checkbox inputs only');validateStatements(node.handler.statements,scope,scopeWritable,event);}
    node.children.forEach(childView=>visit(childView,scope,scopeWritable));
  }
  ast.roots.forEach(root=>visit(root));
  function references(expression:Expression,name:string):boolean {if(expression.kind==='reference')return expression.name===name;if(expression.kind==='literal')return false;if(expression.kind==='member'||expression.kind==='str'||expression.kind==='len')return references(expression.kind==='member'?expression.object:expression.argument,name);if(expression.kind==='add')return references(expression.left,name)||references(expression.right,name);if(expression.kind==='construct')return expression.arguments.some(item=>references(item,name));if(expression.kind==='list')return expression.items.some(item=>references(item,name));return false;}
  function staticRootCount(nodes:ViewNode[]):number|null {let count=0;for(const node of nodes){if(node.kind==='iteration')return null;if(node.kind==='element'){count++;continue;}const consequent=staticRootCount(node.consequent),alternate=node.alternate.length?staticRootCount(node.alternate):0;if(consequent===null||alternate===null||consequent!==alternate)return null;count+=consequent;}return count;}
}
