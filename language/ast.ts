export interface Span { start: number; end: number }
export interface Node<T> { value: T; span: Span }
export interface Component {
  kind: 'Component'; span: Span; name: Node<string>;
  state: { span: Span; name: Node<string>; initial: Node<number> };
  button: { span: Span; prefix: Node<string>;
    conversion: { kind: 'StringConversion'; span: Span; argument: Node<string> }; handlerSpan: Span;
    target: Node<string>; operand: Node<string>; step: Node<number> };
}
export interface Diagnostic { filename: string; line: number; column: number; span: Span; message: string }
