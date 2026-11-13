export interface Span { start:number; end:number }
export interface Node<T> { value:T; span:Span }
export type Literal = string | number | boolean;
export type Expression =
  | {kind:'not';argument:Expression;span:Span}
  | {kind:'equal'|'notEqual'|'and'|'or';left:Expression;right:Expression;span:Span}
  | {kind:'literal';value:Literal;span:Span}
  | {kind:'reference';name:string;span:Span}
  | {kind:'member';object:Expression;name:Node<string>;span:Span}
  | {kind:'str'|'len';argument:Expression;span:Span}
  | {kind:'contains';left:Expression;right:Expression;span:Span}
  | {kind:'count';left:Expression;right:Expression;span:Span}
  | {kind:'add';left:Expression;right:Expression;span:Span}
  | {kind:'subtract';left:Expression;right:Expression;span:Span}
  | {kind:'construct';name:Node<string>;arguments:Expression[];span:Span}
  | {kind:'list';items:Expression[];itemType?:Node<string>;span:Span};
export type ConditionExpression = Expression;
export interface Import {name?:Node<string>;path:Node<string>;span:Span;kind?:'component'|'shared'}
export interface Prop {name:Node<string>;initial:Node<Literal>;span:Span}
export interface State {name:Node<string>;initial:Expression;span:Span}
export interface Computed {name:Node<string>;expression:Expression;span:Span}
export type HttpMethod='get'|'post'|'put'|'patch'|'delete';
export interface HttpInterceptor {phase:'request'|'response'|'error';handler:Node<string>;span:Span}
export interface HttpClient {name:Node<string>;base?:Expression;auth?:{scheme:'bearer';provider:Node<string>;span:Span};interceptors:HttpInterceptor[];span:Span}
export interface Query {
  name:Node<string>;method:HttpMethod;url:Expression;params:{name:Node<string>;value:Expression;span:Span}[];
  headers:{name:Node<string>;value:Expression;span:Span}[];body?:Expression;response:Node<string>;
  responseList:boolean;client?:Node<string>;span:Span;
}
export type Statement =
  | {kind:'navigate';path:Expression;span:Span}
  | {kind:'assign';target:Expression;value:Expression;span:Span}
  | {kind:'eventAssign';target:Expression;member:Node<'value'|'checked'>;span:Span}
  | {kind:'call';target:Expression;method:Node<string>;arguments:Expression[];span:Span}
  | {kind:'emit';event:Node<string>;payload?:Expression;payloadType?:EventPayloadType;span:Span};
export type EventPayloadType = 'string'|'number'|'boolean';
export interface EmittedEvent {name:string;payload:EventPayloadType|null}
export interface Action {name:Node<string>;statements:Statement[];span:Span}
export interface ClassDecl {name:Node<string>;fields:State[];computed:Computed[];actions:Action[];span:Span}
export interface Handler {event:Node<string>;parameter?:Node<string>;payloadType?:EventPayloadType|null;kind?:'click'|'clickBoolean'|'input'|'change';statements:Statement[];span:Span}
export interface ElementNode {kind:'element';tag:Node<string>;attributes:Record<string,Expression>;indentedAttributes:string[];children:ViewNode[];handler?:Handler;span:Span}
export interface ConditionalNode {kind:'conditional';condition:ConditionExpression;consequent:ViewNode[];alternate:ViewNode[];span:Span}
export interface IterationNode {kind:'iteration';item:Node<string>;collection:Expression;key:Expression;children:ViewNode[];span:Span}
export interface SlotNode {kind:'slot';span:Span}
export interface RouterNode {kind:'router';routes:{path:Node<string>;children:ViewNode[];span:Span}[];span:Span}
export type ViewNode = ElementNode | ConditionalNode | IterationNode | SlotNode | RouterNode;
export interface Component {
  kind:'Component'|'SharedState';name:Node<string>;span:Span;imports:Import[];classes:ClassDecl[];props:Prop[];states:State[];computed:Computed[];httpClients:HttpClient[];client?:Node<string>;queries:Query[];init:Statement[];cleanup:Statement[];roots:ViewNode[];emits:EmittedEvent[];
}
export interface Diagnostic {filename:string;line:number;column:number;span:Span;message:string}
