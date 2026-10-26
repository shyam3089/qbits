import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const output = resolve(import.meta.dirname, '../src/qubits/generated');
await mkdir(output, {recursive: true});

const rows = `class Item:
    id = 0
    name = ""
    value = 0
    action increment:
        value = value + 1

component Rows(size = 0):
    items = [Item(0, "schema", 0)]
    main class="benchmark":
        h1 text="Rows " + str(size)
        section class="rows":
            for item in items key=item.id:
                div class="row":
                    span class="name" text=item.name
                    span class="value" text=str(item.value)
                    button class="increment" text="Increase":
                        on click:
                            item.increment()
                    button class="move" text="Move first":
                        on click:
                            items.move(item, 0)
`;

const nested = `import Card from "./Card.qb"
class Item:
    id = 0
component Nested:
    items = [Item(0)]
    main class="benchmark":
        h1 text="Nested components 1000"
        section class="cards":
            for item in items key=item.id:
                Card id=item.id
`;
const card = `import Leaf from "./Leaf.qb"
component Card(id = 0):
    value = 0
    div class="card":
        Leaf label="Card " + str(id) value=value
        button class="increment" text="Increase":
            on click:
                value = value + 1
`;
const leaf = `component Leaf(label = "", value = 0):
    section class="details":
        span class="name" text=label
        span class="value" text=str(value)
`;
const catalog = `import ProductTile from "./ProductTile.qb"
class Product:
    id = 0
    name = ""
    price = 0
component Catalog:
    products = [Product(0, "schema", 0)]
    main class="benchmark":
        h1 text="Catalog 1000"
        section class="catalog":
            for product in products key=product.id:
                ProductTile label=product.name price=product.price
`;
const product = `component ProductTile(label = "", price = 0):
    value = 0
    div class="product":
        h2 text=label
        p text="$" + str(price)
        span class="value" text=str(value)
        button class="increment" text="Add to cart":
            on click:
                value = value + 1
`;

await Promise.all([
  writeFile(resolve(output, 'Rows.qb'), rows),
  writeFile(resolve(output, 'Nested.qb'), nested),
  writeFile(resolve(output, 'Card.qb'), card),
  writeFile(resolve(output, 'Leaf.qb'), leaf),
  writeFile(resolve(output, 'Catalog.qb'), catalog),
  writeFile(resolve(output, 'ProductTile.qb'), product)
]);
