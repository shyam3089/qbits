import mountRows from './generated/Rows.qb';
import mountNested from './generated/Nested.qb';
import mountCatalog from './generated/Catalog.qb';
import * as runtime from '../../../../runtime/index';
import {install, products, rows, sizes, type Workload} from '../common';
import '../shared.css';

type Mount = (target: Element, runtimeApi: typeof runtime) => () => void;
const mounts: Record<Workload, Mount> = {
  'rows-1k': (target, runtimeApi) => mountRows(target, runtimeApi, {size: sizes['rows-1k']}, {items: rows(sizes['rows-1k'])}),
  'rows-10k': (target, runtimeApi) => mountRows(target, runtimeApi, {size: sizes['rows-10k']}, {items: rows(sizes['rows-10k'])}),
  nested: (target, runtimeApi) => mountNested(target, runtimeApi, {}, {items: rows(sizes.nested).map(({id}) => ({id}))}),
  catalog: (target, runtimeApi) => mountCatalog(target, runtimeApi, {}, {products: products(sizes.catalog).map(({id, name, price}) => ({id, name, price}))})
};
const target = document.querySelector('#app')!;
let dispose: (() => void) | undefined;

install({
  async mount(workload: Workload) {dispose = mounts[workload](target, runtime);},
  async unmount() {dispose?.(); dispose = undefined;},
  async settle() {await Promise.resolve();}
});
