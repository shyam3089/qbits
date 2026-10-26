import {createApp, defineComponent, h, nextTick, ref, type App} from 'vue';
import {install, products, rows, sizes, type Workload} from '../common';
import '../shared.css';

const Rows = defineComponent({
  props: {size: {type: Number, required: true}},
  setup(props) {
    const items = ref(rows(props.size));
    const increase = (id: number) => {const item = items.value.find(value => value.id === id)!; item.value++;};
    const moveFirst = (id: number) => {const index = items.value.findIndex(value => value.id === id); items.value.unshift(items.value.splice(index, 1)[0]);};
    return () => h('main', {class: 'benchmark'}, [h('h1', `Rows ${props.size}`), h('section', {class: 'rows'}, items.value.map(item => h('div', {class: 'row', key: item.id}, [
      h('span', {class: 'name'}, item.name), h('span', {class: 'value'}, String(item.value)),
      h('button', {class: 'increment', onClick: () => increase(item.id)}, 'Increase'),
      h('button', {class: 'move', onClick: () => moveFirst(item.id)}, 'Move first')])))]);
  }
});
const Leaf = defineComponent({props: {name: {type: String, required: true}, value: {type: Number, required: true}}, setup: props => () => h('section', {class: 'details'}, [h('span', {class: 'name'}, props.name), h('span', {class: 'value'}, String(props.value))])});
const Card = defineComponent({props: {id: {type: Number, required: true}}, setup(props) {const value = ref(0); return () => h('div', {class: 'card'}, [h(Leaf, {name: `Card ${props.id}`, value: value.value}), h('button', {class: 'increment', onClick: () => value.value++}, 'Increase')]);}});
const Nested = defineComponent({setup: () => () => h('main', {class: 'benchmark'}, [h('h1', 'Nested components 1000'), h('section', {class: 'cards'}, rows(sizes.nested).map(item => h(Card, {key: item.id, id: item.id})))])});
const ProductTile = defineComponent({props: {name: {type: String, required: true}, price: {type: Number, required: true}}, setup(props) {const value = ref(0); return () => h('div', {class: 'product'}, [h('h2', props.name), h('p', `$${props.price}`), h('span', {class: 'value'}, String(value.value)), h('button', {class: 'increment', onClick: () => value.value++}, 'Add to cart')]);}});
const Catalog = defineComponent({setup: () => () => h('main', {class: 'benchmark'}, [h('h1', 'Catalog 1000'), h('section', {class: 'catalog'}, products(sizes.catalog).map(product => h(ProductTile, {key: product.id, name: product.name, price: product.price})))])});

const target = document.querySelector('#app')!;
let app: App | undefined;
install({
  async mount(workload: Workload) {
    const component = workload === 'rows-1k' || workload === 'rows-10k'
      ? defineComponent({setup: () => () => h(Rows, {size: sizes[workload]})})
      : workload === 'nested' ? Nested : Catalog;
    app = createApp(component); app.mount(target); await nextTick();
  },
  async unmount() {app?.unmount(); app = undefined;},
  async settle() {await nextTick();}
});
