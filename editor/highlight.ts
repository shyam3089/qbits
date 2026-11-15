import grammar from './qbits.tmLanguage.json' with {type:'json'};
import type {IGrammar,IOnigCaptureIndex,IOnigLib,IOnigMatch,OnigScanner,OnigString,StateStack} from 'vscode-textmate';

export interface QbitsHighlightToken {
  readonly text:string;
  readonly scopes:readonly string[];
  readonly className:string;
}

export interface QbitsHighlightLine {
  readonly tokens:readonly QbitsHighlightToken[];
}

const classes:[string,string][]=[
  ['comment.','qbits-token--comment'],
  ['string.','qbits-token--string'],
  ['constant.numeric.','qbits-token--number'],
  ['constant.','qbits-token--constant'],
  ['storage.type.','qbits-token--type'],
  ['support.type.','qbits-token--type'],
  ['entity.name.type.','qbits-token--type'],
  ['entity.name.function.','qbits-token--function'],
  ['support.function.','qbits-token--function'],
  ['entity.name.tag.','qbits-token--component'],
  ['variable.parameter.','qbits-token--parameter'],
  ['variable.other.property.','qbits-token--property'],
  ['variable.other.readwrite.','qbits-token--state'],
  ['variable.other.loop.','qbits-token--state'],
  ['variable.language.','qbits-token--state'],
  ['keyword.operator.','qbits-token--operator'],
  ['keyword.','qbits-token--keyword']
];

class JavaScriptOnigString implements OnigString {
  constructor(readonly content:string){}
}

function javascriptPattern(source:string):RegExp {
  // TextMate resolves these Oniguruma anchors before scanning. JavaScript has
  // equivalent start/end anchors but no \G token.
  const normalized=source.replaceAll('\\A','^').replaceAll('\\z','$').replaceAll('\\G','(?:)').replaceAll(`\\${String.fromCharCode(0xffff)}`,'(?:)').replaceAll(`\\${String.fromCharCode(0xfffe)}`,'(?!)');
  return new RegExp(normalized,'dgu');
}

class JavaScriptOnigScanner implements OnigScanner {
  private readonly expressions:RegExp[];
  constructor(sources:string[]){this.expressions=sources.map(javascriptPattern);}
  findNextMatchSync(input:string|OnigString,startPosition:number):IOnigMatch|null {
    const content=typeof input==='string'?input:input.content;
    let selected:{index:number;start:number;match:RegExpExecArray}|undefined;
    for(let index=0;index<this.expressions.length;index++){
      const expression=this.expressions[index];expression.lastIndex=startPosition;
      const match=expression.exec(content);if(!match)continue;
      if(!selected||match.index<selected.start||(match.index===selected.start&&index<selected.index))selected={index,start:match.index,match};
    }
    if(!selected)return null;
    const indices=selected.match.indices??[];
    const captureIndices:IOnigCaptureIndex[]=indices.map(index=>index?{start:index[0],end:index[1],length:index[1]-index[0]}:{start:0,end:0,length:0});
    return {index:selected.index,captureIndices};
  }
}

const onigLib:Promise<IOnigLib>=Promise.resolve({
  createOnigScanner:sources=>new JavaScriptOnigScanner(sources),
  createOnigString:value=>new JavaScriptOnigString(value)
});

let grammarPromise:Promise<IGrammar>|undefined;
async function loadGrammar():Promise<IGrammar> {
  if(!grammarPromise)grammarPromise=(async()=>{
    const imported=await import('vscode-textmate'),textmate=((imported as unknown as {default?:typeof import('vscode-textmate')}).default??imported) as typeof import('vscode-textmate');
    const raw=textmate.parseRawGrammar(JSON.stringify(grammar),'qbits.tmLanguage.json');
    const registry=new textmate.Registry({onigLib,loadGrammar:async scope=>scope===grammar.scopeName?raw:null});
    const loaded=await registry.loadGrammar(grammar.scopeName);
    if(!loaded)throw new TypeError(`Unable to load ${grammar.scopeName}`);
    return loaded;
  })();
  return grammarPromise;
}

function tokenClass(scopes:readonly string[]):string {
  for(let index=scopes.length-1;index>=0;index--){
    const scope=scopes[index];
    for(const [prefix,className] of classes)if(scope.startsWith(prefix))return className;
  }
  return '';
}

export async function tokenizeQbits(source:string):Promise<readonly QbitsHighlightLine[]> {
  if(typeof source!=='string')throw new TypeError('Qbits highlighting source must be a string');
  if(source.length>1_000_000)throw new RangeError('Qbits highlighting source exceeds 1000000 UTF-16 code units');
  const loaded=await loadGrammar(),lines=source.split(/\r\n|\r|\n/);let stack:StateStack|null=null;
  return lines.map(line=>{
    const result=loaded.tokenizeLine(line,stack);stack=result.ruleStack;
    return {tokens:result.tokens.map(token=>{const scopes=Object.freeze([...token.scopes]);return Object.freeze({text:line.slice(token.startIndex,token.endIndex),scopes,className:tokenClass(scopes)});})};
  });
}

function escapeHtml(value:string):string {
  return value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
}

export async function highlightQbits(source:string):Promise<string> {
  const lines=await tokenizeQbits(source);
  return lines.map(line=>line.tokens.map(token=>token.className?`<span class="${token.className}">${escapeHtml(token.text)}</span>`:escapeHtml(token.text)).join('')).join('\n');
}

export async function highlightQbitsElement(element:HTMLElement,source=element.textContent??''):Promise<void> {
  const view=element?.ownerDocument?.defaultView;
  if(!view||!(element instanceof view.HTMLElement))throw new TypeError('Qbits highlighting target must be an HTML element');
  const lines=await tokenizeQbits(source),fragment=element.ownerDocument.createDocumentFragment();
  lines.forEach((line,lineIndex)=>{
    if(lineIndex)fragment.append(element.ownerDocument.createTextNode('\n'));
    for(const token of line.tokens){
      if(!token.className){fragment.append(element.ownerDocument.createTextNode(token.text));continue;}
      const span=element.ownerDocument.createElement('span');span.className=token.className;span.textContent=token.text;fragment.append(span);
    }
  });
  element.classList.add('qbits-code');
  element.setAttribute('data-language',grammar.scopeName);
  element.replaceChildren(fragment);
}

export const qbitsGrammarScope=grammar.scopeName;
