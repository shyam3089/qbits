export interface Span { start:number; end:number }
export interface Node<T> { value:T; span:Span }
export type Literal = string | number | boolean;
export type Expression =
  | {kind:'literal';value:Literal;span:Span}
  | {kind:'reference';name:string;span:Span}
  | {kind:'member';object:Expression;name:Node<string>;span:Span}
  | {kind:'str'|'len';argument:Expression;span:Span}
  | {kind:'add';left:Expression;right:Expression;span:Span}
  | {kind:'construct';name:Node<string>;arguments:Expression[];span:Span}
  | {kind:'list';items:Expression[];span:Span};
export type ConditionExpression =
  | {kind:'literal';value:Literal;span:Span}
  | {kind:'reference';name:string;span:Span}
  | {kind:'member';object:Expression;name:Node<string>;span:Span}
  | {kind:'not';argument:ConditionExpression;span:Span}
  | {kind:'equal'|'notEqual'|'and';left:ConditionExpression;right:ConditionExpression;span:Span};
export interface Import {name?:Node<string>;path:Node<string>;span:Span}
export interface Prop {name:Node<string>;initial:Node<Literal>;span:Span}
export interface State {name:Node<string>;initial:Expression;span:Span}
export interface Computed {name:Node<string>;expression:Expression;span:Span}
export type Statement =
  | {kind:'assign';target:Expression;value:Expression;span:Span}
  | {kind:'eventAssign';target:Expression;member:Node<'value'|'checked'>;span:Span}
  | {kind:'call';target:Expression;method:Node<string>;arguments:Expression[];span:Span};
export interface Action {name:Node<string>;statements:Statement[];span:Span}
export interface ClassDecl {name:Node<string>;fields:State[];computed:Computed[];actions:Action[];span:Span}
export interface Handler {event:Node<'click'|'input'|'change'>;kind?:'click'|'clickBoolean'|'input'|'change';statements:Statement[];span:Span}
export interface ElementNode {kind:'element';tag:Node<string>;attributes:Record<string,Expression>;indentedAttributes:string[];children:ViewNode[];handler?:Handler;span:Span}
export interface ConditionalNode {kind:'conditional';condition:ConditionExpression;consequent:ViewNode[];alternate:ViewNode[];span:Span}
export interface IterationNode {kind:'iteration';item:Node<string>;collection:Expression;key:Expression;children:ViewNode[];span:Span}
export type ViewNode = ElementNode | ConditionalNode | IterationNode;
export interface Component {
  kind:'Component';name:Node<string>;span:Span;imports:Import[];classes:ClassDecl[];props:Prop[];states:State[];computed:Computed[];init:Statement[];cleanup:Statement[];roots:ViewNode[];
}
export interface Diagnostic {filename:string;line:number;column:number;span:Span;message:string}
