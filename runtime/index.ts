export interface CounterModel { initial: number; prefix: string; step: number }
export function mountCounter(target: Element, model: CounterModel): () => void {
  let value = model.initial;
  const button = target.ownerDocument.createElement('button');
  const text = target.ownerDocument.createTextNode(''); button.append(text);
  const render = () => { text.data = model.prefix + String(value); };
  const click = () => { const next = value + model.step; if (!Number.isSafeInteger(next)) throw new RangeError('State exceeded safe integer range'); value = next; render(); };
  render(); button.addEventListener('click', click); target.append(button);
  return () => { button.removeEventListener('click', click); button.remove(); };
}
