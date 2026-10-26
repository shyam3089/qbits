import {parse,validate,generate as defaultGenerate} from '../../language/index.js';
function validated(source:string){const ast=parse(source);validate(ast,source);return ast;}
export const lightFixture=(size:number,generate=defaultGenerate)=>{const emit=(source:string)=>({code:generate(validated(source))});return {child:emit(`component Child(label = ""):
    count = 0
    section:
        span text=label
        button text=str(count):
            on click:
                count = count + 1
`).code,root:emit(`import Child from "./Child.qb"
class Item:
    id = 0
    count = 0
    computed doubled = count + count
component Bench(title = "sample"):
    first = Item(0, 0)
    last = Item(${size-1}, 0)
    extra = Item(${size}, 0)
    items = [${['first',...Array.from({length:size-2},(_,i)=>`Item(${i+1}, 0)`),'last'].join(', ')}]
    computed length = len(items)
    button text="Update":
        on click:
            first.count = first.count + 1
    button text="First":
        on click:
            items.move(last, 0)
    button text="Last":
        on click:
            items.move(last, ${size-1})
    button text="Append":
        on click:
            items.append(extra)
    button text="Remove":
        on click:
            items.remove(extra)
    p text=title + str(length)
    Child label=str(first.count)
    ul:
        for item in items key=item.id:
            li text=str(item.doubled)
`).code};};

export function realisticFixture(size:number,generate=defaultGenerate) {
  const emit=(source:string)=>generate(validated(source));
  return {
    './Badge.qb':emit(`component Badge(label = ""):
    computed display = label + "!"
    span text=display
`),
    './Row.qb':emit(`import Badge from "./Badge.qb"
component Row(label = "", amount = 0):
    local = 0
    editable = label
    computed first = amount + 1
    computed next = first + first
    computed total = next + first
    section:
        span text=label
        span text=str(total)
        input:
            value=editable
            on input:
                editable = event.value
        button text=str(local):
            on click:
                local = local + 1
        Badge label=label + str(total)
`),
    './Bench.qb':emit(`import Row from "./Row.qb"
class Product:
    id = 0
    amount = 0
    name = ""
    computed subtotal = amount + amount
    computed total = subtotal + amount
component Bench(title = "Products"):
    first = Product(0, 0, "Coffee")
    last = Product(${size-1}, 0, "Tea")
    items = [${['first',...Array.from({length:size-2},(_,i)=>`Product(${i+1}, 0, "Product ${i+1}")`),'last'].join(', ')}]
    n = 0
    x = 0
    pulled = 0
    computed left = n + 1
    computed right = n + 2
    computed total = left + right
    computed length = len(items)
    computed selection = Product(999999, x, "Selection")
    computed selected = selection.total
    button text="Update":
        on click:
            first.amount = first.amount + 1
            first.amount = first.amount + 1
    button text="Pull":
        on click:
            x = x + 1
            pulled = selected + 0
            pulled = selected + 0
    button text="Chain":
        on click:
            n = n + 1
            n = n + 1
    button text="First":
        on click:
            items.move(last, 0)
    button text="Last":
        on click:
            items.move(last, ${size-1})
    h2 text=title + str(length)
    p text=str(total)
    p text="Selected: " + str(selected) + ":" + str(pulled)
    ul:
        for item in items key=item.id:
            li:
                Row label=item.name amount=item.total
`),
  };
}
