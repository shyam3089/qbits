import {ChangeDetectionStrategy, Component, EnvironmentInjector, ApplicationRef, createComponent, provideZonelessChangeDetection, signal, type ComponentRef, type Type} from '@angular/core';
import {createApplication} from '@angular/platform-browser';
import {install, products, rows, sizes, type Workload} from '../common';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="benchmark"><h1>Rows {{size}}</h1><section class="rows">@for (item of items(); track item.id) {<div class="row"><span class="name">{{item.name}}</span><span class="value">{{item.value}}</span><button class="increment" (click)="increase(item.id)">Increase</button><button class="move" (click)="moveFirst(item.id)">Move first</button></div>}</section></main>`
})
class RowsComponent {
  size = 1_000;
  readonly items = signal(rows(this.size));
  configure(size: number) {this.size = size; this.items.set(rows(size));}
  increase(id: number) {this.items.update(current => current.map(item => item.id === id ? {...item, value: item.value + 1} : item));}
  moveFirst(id: number) {this.items.update(current => {const index = current.findIndex(item => item.id === id); return [current[index], ...current.slice(0, index), ...current.slice(index + 1)];});}
}

@Component({standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, selector: 'section.details', inputs: ['name', 'value'], template: `<span class="name">{{name}}</span><span class="value">{{value}}</span>`})
class LeafComponent {name = ''; value = 0;}

@Component({standalone: true, imports: [LeafComponent], changeDetection: ChangeDetectionStrategy.OnPush, selector: 'div.card', inputs: ['id'], template: `<section class="details" [name]="'Card ' + id" [value]="value()"></section><button class="increment" (click)="increase()">Increase</button>`})
class CardComponent {id = 0; readonly value = signal(0); increase() {this.value.update(value => value + 1);}}

@Component({standalone: true, imports: [CardComponent], changeDetection: ChangeDetectionStrategy.OnPush, template: `<main class="benchmark"><h1>Nested components 1000</h1><section class="cards">@for (item of items; track item.id) {<div class="card" [id]="item.id"></div>}</section></main>`})
class NestedComponent {readonly items = rows(sizes.nested);}

@Component({standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, selector: 'div.product', inputs: ['name', 'price'], template: `<h2>{{name}}</h2><p>\${{price}}</p><span class="value">{{value()}}</span><button class="increment" (click)="increase()">Add to cart</button>`})
class ProductComponent {name = ''; price = 0; readonly value = signal(0); increase() {this.value.update(value => value + 1);}}

@Component({standalone: true, imports: [ProductComponent], changeDetection: ChangeDetectionStrategy.OnPush, template: `<main class="benchmark"><h1>Catalog 1000</h1><section class="catalog">@for (product of items; track product.id) {<div class="product" [name]="product.name" [price]="product.price"></div>}</section></main>`})
class CatalogComponent {readonly items = products(sizes.catalog);}

const target = document.querySelector('#app') as HTMLElement;
const application = await createApplication({providers: [provideZonelessChangeDetection()]});
let reference: ComponentRef<unknown> | undefined;

function attach<T>(component: Type<T>, configure?: (instance: T) => void): void {
  const created = createComponent(component, {environmentInjector: application.injector as EnvironmentInjector, hostElement: target});
  configure?.(created.instance);
  application.attachView(created.hostView);
  created.changeDetectorRef.detectChanges();
  reference = created;
}

install({
  async mount(workload: Workload) {
    if (workload === 'rows-1k' || workload === 'rows-10k') attach(RowsComponent, instance => instance.configure(sizes[workload]));
    else if (workload === 'nested') attach(NestedComponent);
    else attach(CatalogComponent);
  },
  async unmount() {if (reference) {application.detachView(reference.hostView); reference.destroy(); reference = undefined;} target.replaceChildren();},
  async settle() {application.tick(); await Promise.resolve();}
});
