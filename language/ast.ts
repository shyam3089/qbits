export interface Span { start: number; end: number }
export interface Node<T> { value: T; span: Span }
export type Literal = string | number | boolean;
export type Expression = {kind:'literal'; value:Literal; span:Span} | {kind:'reference'; name:string; span:Span} | {kind:'str'; argument:Expression; span:Span} | {kind:'add'; left:Expression; right:Expression; span:Span};
export interface Import { name?:Node<string>; path:Node<string>; span:Span }
export interface Prop { name:Node<string>; initial:Node<Literal>; span:Span }
export interface State { name:Node<string>; initial:Node<Literal>; span:Span }
export type Handler =
  | {kind:'click'; target:Node<string>; operand:Node<string>; step:Node<number>; span:Span}
  | {kind:'input'; target:Node<string>; eventValue:Node<'event.value'>; span:Span}
  | {kind:'change'; target:Node<string>; eventChecked:Node<'event.checked'>; span:Span};
export interface ElementNode { tag:Node<string>; attributes:Record<string,Expression>; indentedAttributes:string[]; children:ElementNode[]; handler?:Handler; span:Span }
export interface Component {
  kind:'Component'; name:Node<string>; span:Span; imports:Import[]; props:Prop[]; states:State[]; roots:ElementNode[];
}
export interface Diagnostic { filename: string; line: number; column: number; span: Span; message: string }
