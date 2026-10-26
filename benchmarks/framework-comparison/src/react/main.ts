import React from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {install, products, rows, sizes, type Workload} from '../common';
import '../shared.css';

type Item = {id: number; name: string; value: number};
type Product = Item & {price: number};

function Rows({size}: {size: number}) {
  const [items, setItems] = React.useState(() => rows(size));
  const increase = (id: number) => setItems(current => current.map(item => item.id === id ? {...item, value: item.value + 1} : item));
  const moveFirst = (id: number) => setItems(current => {const index = current.findIndex(item => item.id === id); return [current[index], ...current.slice(0, index), ...current.slice(index + 1)];});
  return React.createElement('main', {className: 'benchmark'},
    React.createElement('h1', null, `Rows ${size}`),
    React.createElement('section', {className: 'rows'}, items.map(item => React.createElement('div', {className: 'row', key: item.id},
      React.createElement('span', {className: 'name'}, item.name),
      React.createElement('span', {className: 'value'}, String(item.value)),
      React.createElement('button', {className: 'increment', onClick: () => increase(item.id)}, 'Increase'),
      React.createElement('button', {className: 'move', onClick: () => moveFirst(item.id)}, 'Move first')))));
}

function Leaf({item}: {item: Item}) {
  return React.createElement('section', {className: 'details'},
    React.createElement('span', {className: 'name'}, item.name),
    React.createElement('span', {className: 'value'}, String(item.value)));
}
function Card({id}: {id: number}) {
  const [value, setValue] = React.useState(0);
  return React.createElement('div', {className: 'card'},
    React.createElement(Leaf, {item: {id, name: `Card ${id}`, value}}),
    React.createElement('button', {className: 'increment', onClick: () => setValue(current => current + 1)}, 'Increase'));
}
function Nested() {
  return React.createElement('main', {className: 'benchmark'}, React.createElement('h1', null, 'Nested components 1000'),
    React.createElement('section', {className: 'cards'}, rows(sizes.nested).map(item => React.createElement(Card, {key: item.id, id: item.id}))));
}

function ProductTile({product}: {product: Product}) {
  const [value, setValue] = React.useState(0);
  return React.createElement('div', {className: 'product'},
    React.createElement('h2', null, product.name), React.createElement('p', null, `$${product.price}`),
    React.createElement('span', {className: 'value'}, String(value)),
    React.createElement('button', {className: 'increment', onClick: () => setValue(current => current + 1)}, 'Add to cart'));
}
function Catalog() {
  return React.createElement('main', {className: 'benchmark'}, React.createElement('h1', null, 'Catalog 1000'),
    React.createElement('section', {className: 'catalog'}, products(sizes.catalog).map(product => React.createElement(ProductTile, {key: product.id, product}))));
}

const target = document.querySelector('#app')!;
let root: Root | undefined;
install({
  async mount(workload: Workload) {
    root = createRoot(target);
    const view = workload === 'rows-1k' || workload === 'rows-10k'
      ? React.createElement(Rows, {size: sizes[workload]})
      : workload === 'nested' ? React.createElement(Nested) : React.createElement(Catalog);
    flushSync(() => root!.render(view));
  },
  async unmount() {if (root) flushSync(() => root!.unmount()); root = undefined;},
  async settle() {await Promise.resolve();}
});

