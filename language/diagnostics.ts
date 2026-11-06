import type { Diagnostic, Span } from './ast.js';
export class CompileError extends Error {
  readonly frame?:string;
  readonly hint?:string;
  constructor(public diagnostic: Diagnostic, source?:string) {
    super(`${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`);
    this.name = 'CompileError';
    if(source!==undefined)this.frame=sourceFrame(source,diagnostic);
    this.hint=suggestion(diagnostic.message);
  }
}
// Keep source-derived terminal output inert, including invalid control characters.
function visible(value:string):string {return value.replace(/[\u0000-\u001f\u007f-\u009f]/g,char=>char==='\t'?'    ':`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);}
function sourceFrame(source:string,diagnostic:Diagnostic):string {
  const line=source.split(/\r\n|\r|\n/)[diagnostic.line-1]??'',column=Math.min(line.length,Math.max(0,diagnostic.column-1));
  const start=Math.max(0,column-70),end=Math.min(line.length,Math.max(column+1,start+140));
  const prefix=start?'...':'',text=prefix+visible(line.slice(start,end))+(end<line.length?'...':'');
  const caret=prefix.length+visible(line.slice(start,column)).length,label=String(diagnostic.line);
  return `${label} | ${text}\n${' '.repeat(label.length)} | ${' '.repeat(caret)}^`;
}
function suggestion(message:string):string|undefined {
  // Existing diagnostics with a concrete remedy already explain their fix.
  if(/\buse\b|for example|for instance/i.test(message))return;
  if(/indent|Tabs are not allowed/i.test(message))return 'Use spaces and keep the same indentation width for each block.';
  if(/Expected :/.test(message))return 'End block headers with : and indent the following lines.';
  if(/Missing import|Imports must use|Named import must use/.test(message))return 'Check the relative path, filename case, and extension; import CSS without a component name.';
  if(/Unknown element or missing component import/.test(message))return 'Import the component with a relative path, or use a supported standard element.';
  if(/Unknown shared value/.test(message))return 'Check the state names declared in the imported shared module.';
  if(/Unknown state or prop/.test(message))return 'Declare the value or pass it as a prop; route parameters are visible only inside their route.';
  if(/Cannot assign read-only/.test(message))return 'Assign local/shared state or a writable instance field; props, computed values, and route parameters are read-only.';
  if(/requires.*boolean|must evaluate to boolean/.test(message))return 'Use true/false or a Boolean expression; strings and numbers are not converted to booleans.';
  if(/Unsupported event/.test(message))return 'Native handlers support click on buttons, input on text inputs, and change on checkboxes.';
  if(/Unknown event/.test(message))return 'Match the event name emitted by the child component.';
  if(/dependency cycle/.test(message))return 'Remove the circular dependency between computed values.';
  if(/Router requires a final/.test(message))return 'Add a final route "*": block inside the router for unmatched URLs.';
  if(/Duplicate or ambiguous route pattern/.test(message))return 'Make overlapping patterns distinct or give one more static segments.';
  if(/Route parameter requires|Duplicate or shadowed route parameter/.test(message))return 'Use <name> for a whole segment, with a unique identifier that does not shadow state or props.';
}
export function formatCompileError(error:CompileError):string {
  return [visible(error.message),error.frame,error.hint?`Hint: ${error.hint}`:undefined].filter(value=>value!==undefined).join('\n');
}
export function fail(source: string, filename: string, span: Span, message: string): never {
  const lines = source.slice(0, span.start).split(/\r\n|\r|\n/);
  throw new CompileError({filename, span, line: lines.length, column: lines.at(-1)!.length + 1, message},source);
}
