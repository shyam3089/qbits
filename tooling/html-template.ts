import {parseFragment} from 'parse5';
import {booleanAttributes} from '../dom/standards.js';
import {CompileError,fail,parse,type Component,type ElementNode,type Expression,type Handler,type Span,type Statement,type ViewNode} from '../language/index.js';

interface Location {startOffset:number;endOffset:number;startLine:number;startCol:number;attrs?:Record<string,Location>}
interface HtmlAttribute {name:string;value:string;prefix?:string}
interface HtmlNode {nodeName:string;tagName?:string;value?:string;attrs?:HtmlAttribute[];childNodes?:HtmlNode[];content?:HtmlNode;sourceCodeLocation?:Location|null}

function locateValue(source:string,location:Location):Span {
  const raw=source.slice(location.startOffset,location.endOffset),equals=raw.indexOf('=');
  if(equals<0)return {start:location.startOffset,end:location.endOffset};
  let start=equals+1;while(/\s/.test(raw[start]??''))start++;
  const quote=raw[start];if(quote==='"'||quote==="'")return {start:location.startOffset+start+1,end:location.endOffset-1};
  return {start:location.startOffset+start,end:location.endOffset};
}

function mark(value:unknown,span:Span,source:string,filename:string):void {
  const seen=new Set<object>(),pending:unknown[]=[value];
  while(pending.length){const item=pending.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item);const record=item as Record<string,unknown>;if(record.span&&typeof record.span==='object')record.span={...span,origin:{source,filename}};for(const [key,child] of Object.entries(record))if(key!=='span')pending.push(child);}
}

function expression(value:string,span:Span,source:string,filename:string):Expression {
  try {const ast=parse(`component __Template:\n    p text=${value}\n`,'<external-template-expression>');const result=(ast.roots[0] as ElementNode).attributes.text;mark(result,span,source,filename);return result;}
  catch(error){if(error instanceof CompileError)fail(source,filename,span,`Invalid template expression: ${error.diagnostic.message}`);throw error;}
}

function statements(value:string,event:string,span:Span,source:string,filename:string):Statement[] {
  if(/[\r\n]/.test(value))fail(source,filename,span,'qb-on-* requires one single-line Qbits statement');
  const synthetic=`component __Template:\n    button:\n        on ${event}:\n            ${value}\n`;
  try {const handler=(parse(synthetic,'<external-template-handler>').roots[0] as ElementNode).handler!;if(handler.statements.length!==1)fail(source,filename,span,'qb-on-* requires exactly one Qbits statement');mark(handler.statements,span,source,filename);return handler.statements;}
  catch(error){if(error instanceof CompileError)fail(source,filename,span,`Invalid qb-on-${event} statement: ${error.diagnostic.message}`);throw error;}
}

function rawName(source:string,location:Location|undefined,fallback:string):string {
  if(!location)return fallback;const match=/^\s*([^\s=/>]+)/.exec(source.slice(location.startOffset,location.endOffset));return match?.[1]??fallback;
}

export function compileHtmlTemplate(source:string,filename:string,ast:Component):ViewNode[] {
  let parseFailure:{startOffset:number;endOffset:number;code:string}|undefined;
  const fragment=parseFragment(source,{sourceCodeLocationInfo:true,onParseError:error=>{parseFailure??=error;}}) as unknown as HtmlNode;
  if(parseFailure)fail(source,filename,{start:parseFailure.startOffset,end:parseFailure.endOffset},`Invalid HTML template: ${parseFailure.code}`);
  const components=new Map(ast.imports.filter(item=>item.name).map(item=>[item.name!.value.toLowerCase(),item.name!.value]));
  const origin=(location:Location|undefined):Span=>({start:location?.startOffset??0,end:location?.endOffset??0,origin:{source,filename}});
  const convert=(html:HtmlNode,top=false):ViewNode[]=>{
    if(html.nodeName==='#comment'||html.nodeName==='#documentType')return [];
    if(html.nodeName==='#text'){
      if(top&&!html.value?.trim())return [];const span=origin(html.sourceCodeLocation??undefined);return [{kind:'text',value:{kind:'literal',value:html.value??'',span},span}];
    }
    if(!html.tagName)return [];
    const location=html.sourceCodeLocation??undefined,span=origin(location),tag=components.get(html.tagName.toLowerCase())??html.tagName;
    const attributes:Record<string,Expression>=Object.create(null),handlers:Handler[]=[];let model:Expression|undefined,form:ElementNode['form'],field:ElementNode['field'],condition:Expression|undefined,iteration:{item:string;collection:Expression;key?:Expression;span:Span}|undefined,pendingKey:{value:Expression;span:Span}|undefined,text:Expression|undefined;
    for(const attribute of html.attrs??[]){
      const attrLocation=location?.attrs?.[attribute.name],name=rawName(source,attrLocation,attribute.prefix?`${attribute.prefix}:${attribute.name}`:attribute.name),valueSpan=locateValue(source,attrLocation??location!),directive=name.toLowerCase();
      if(!directive.startsWith('qb-')){
        if(/^on/i.test(name))fail(source,filename,origin(attrLocation),'Inline event-handler attributes are forbidden; use qb-on-*');
        const value:boolean|string=booleanAttributes.has(name.toLowerCase())&&attribute.value===''?true:attribute.value;
        Object.defineProperty(attributes,name,{value:{kind:'literal',value,span:{...valueSpan,origin:{source,filename}}},enumerable:true});continue;
      }
      if(directive==='qb-form'||directive==='qb-field'){
        if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(attribute.value))fail(source,filename,valueSpan,`${name} requires one form or field identifier`);
        const target={value:attribute.value,span:{...valueSpan,origin:{source,filename}}};if(directive==='qb-form')form=target;else field=target;continue;
      }
      if(directive==='qb-text')text=expression(attribute.value,valueSpan,source,filename);
      else if(directive==='qb-model')model=expression(attribute.value,valueSpan,source,filename);
      else if(directive==='qb-if')condition=expression(attribute.value,valueSpan,source,filename);
      else if(directive==='qb-for'){
        const match=/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/.exec(attribute.value.trim());if(!match)fail(source,filename,origin(attrLocation),'qb-for requires "item in collection"');iteration={item:match[1],collection:expression(match[2],valueSpan,source,filename),span:origin(attrLocation)};
      }else if(directive==='qb-key'){pendingKey={value:expression(attribute.value,valueSpan,source,filename),span:origin(attrLocation)};}
      else if(directive.startsWith('qb-bind-')){const target=name.slice('qb-bind-'.length);if(!target||/^on/i.test(target)||['innerhtml','outerhtml','srcdoc'].includes(target.toLowerCase()))fail(source,filename,origin(attrLocation),`Unsafe qb-bind target ${JSON.stringify(target)}`);Object.defineProperty(attributes,target,{value:expression(attribute.value,valueSpan,source,filename),enumerable:true});}
      else if(directive.startsWith('qb-on-')){const event=name.slice('qb-on-'.length).toLowerCase();if(!event)fail(source,filename,origin(attrLocation),'qb-on-* requires an event name');handlers.push({event:{value:event,span:origin(attrLocation)},statements:statements(attribute.value,event,valueSpan,source,filename),span:origin(attrLocation)});}
      else fail(source,filename,origin(attrLocation),`Unknown Qbits template directive ${JSON.stringify(name)}`);
    }
    if(pendingKey&&!iteration)fail(source,filename,pendingKey.span,'qb-key must be used with qb-for on the same element');if(iteration&&pendingKey)iteration.key=pendingKey.value;
    if(iteration&&!iteration.key)fail(source,filename,iteration.span,'qb-for requires qb-key for stable updates');
    if(model&&(Object.hasOwn(attributes,'value')||Object.hasOwn(attributes,'checked')))fail(source,filename,model.span,'qb-model cannot be combined with value or checked bindings');
    const radioValue=tag==='input'&&attributes.type?.kind==='literal'&&attributes.type.value==='radio'&&attributes.value?.kind==='literal';
    if(field&&(model||Object.hasOwn(attributes,'value')&&!radioValue||Object.hasOwn(attributes,'checked')||Object.hasOwn(attributes,'bind')))fail(source,filename,field.span,'qb-field cannot be combined with qb-model, bind, reactive value, or checked bindings');
    const childSource=html.content?.childNodes??html.childNodes??[],children=childSource.flatMap(child=>convert(child));
    if(text&&children.some(child=>child.kind!=='text'||child.value.kind!=='literal'||typeof child.value.value!=='string'||child.value.value.trim()!==''))fail(source,filename,text.span,'qb-text cannot be combined with element content');
    const bareSlot=tag==='slot'&&!Object.keys(attributes).length&&!handlers.length&&!model&&!form&&!field&&!condition&&!iteration&&!children.length;
    let node:ViewNode=bareSlot?{kind:'slot',span}:{kind:'element',tag:{value:tag,span},attributes,indentedAttributes:[],children:text?[]:children,...(text?{attributes:{...attributes,text}}:{}),...(handlers.length?{handlers}:{}),...(model?{model}:{}),...(form?{form}:{}),...(field?{field}:{}),span};
    if(condition)node={kind:'conditional',condition,consequent:[node],alternate:[],span};
    if(iteration)node={kind:'iteration',item:{value:iteration.item,span:iteration.span},collection:iteration.collection,key:iteration.key!,children:[node],span};
    return [node];
  };
  return (fragment.childNodes??[]).flatMap(node=>convert(node,true));
}
