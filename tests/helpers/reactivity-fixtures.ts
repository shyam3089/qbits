import { compile } from '../../language/index.js';

export function reactiveFixtures(size = 1000): Record<string, string> {
  return {
    './Row.qb': compile(`component Row(label = ""):
    count = 0
    section:
        span text=label
        button text=str(count):
            on click:
                count = count + 1
`).code,
    './List.qb': compile(`import Row from "./Row.qb"
class Item:
    id = 0
    name = ""
    count = 0
    computed label = name + str(count)
component List:
    items = [${Array.from({ length: size }, (_, i) => `Item(${i}, "Row ${i}", 0)`).join(', ')}]
    missing = Item(${size + 1}, "Missing", 0)
    button text="Noop":
        on click:
            items.remove(missing)
    button text="Append":
        on click:
            items.append(Item(${size}, "Added", 0))
    ul:
        for item in items key=item.id:
            li:
                input:
                    value=item.name
                    on input:
                        item.name = event.value
                span text=item.label
                button text="Increment":
                    on click:
                        item.count = item.count + 1
                button text="First":
                    on click:
                        items.move(item, 0)
                button text="Last":
                    on click:
                        items.move(item, ${size - 1})
                button text="Remove":
                    on click:
                        items.remove(item)
                Row label=item.name
`).code,
    './Batch.qb': compile(`component Batch:
    count = 0
    computed total = left + right
    computed left = count + 1
    computed right = count + 2
    button text="Update":
        on click:
            count = count + 1
            count = count + 1
    p text=str(total)
`).code,
    './Overflow.qb': compile(`component Overflow:
    count = 9007199254740991
    button text=str(count):
        on click:
            count = count + 1
`).code,
    './TransactionalList.qb': compile(`import Row from "./Row.qb"
class Item:
    id = 0
component TransactionalList:
    original = Item(1)
    replacement = Item(2)
    items = [original]
    button text="Replace":
        on click:
            items.remove(original)
            items.append(replacement)
    button text="Remove":
        on click:
            items.remove(original)
    button text="Restore":
        on click:
            items.append(original)
    for item in items key=item.id:
        div:
            span text=str(item.id)
            Row
`).code,
    './TransactionalConditional.qb': compile(`import Row from "./Row.qb"
component TransactionalConditional:
    visible = true
    button text="Switch":
        on click:
            visible = false
    if visible:
        div:
            span text="Before"
            Row
    else:
        div:
            span text="After"
            Row
`).code,
    './NestedTransaction.qb': compile(`class Counter:
    value = 0
    action increment:
        value = value + 1
class Item:
    id = 0
component NestedTransaction:
    counter = Counter(0)
    original = Item(1)
    items = [original]
    button text="Fail":
        on click:
            counter.increment()
            items.append(original)
    button text="Increment":
        on click:
            counter.increment()
    p text=str(counter.value)
    for item in items key=item.id:
        span text=str(item.id)
`).code,
    './FatalRecovery.qb': compile(`import Row from "./Row.qb"
class Item:
    id = 0
component FatalRecovery:
    original = Item(1)
    added = Item(2)
    items = [original]
    duplicates = [original]
    button text="Fail":
        on click:
            items.append(added)
            duplicates.append(original)
    for item in items key=item.id:
        Row
    for item in duplicates key=item.id:
        span text=str(item.id)
`).code,
    './Edges.qb': compile(`import Row from "./Row.qb"
class Item:
    id = 0
    name = ""
    computed first = name + "!"
    computed second = first + "!"
component Edges:
    original = Item(1, "Old")
    replacement = Item(1, "New")
    added = Item(2, "Added")
    items = [original]
    visible = true
    count = 0
    snapshot = 0
    computed total = left + right
    computed left = count + 1
    computed right = count + 2
    button text="Replace":
        on click:
            items.remove(original)
            items.append(replacement)
    button text="Update":
        on click:
            count = count + 1
            snapshot = total + 0
            count = count + 1
    button text="Hide":
        on click:
            visible = false
    button text="Show":
        on click:
            visible = true
    button text="Rename":
        on click:
            replacement.name = "Renamed"
    button text="Duplicate":
        on click:
            count = count + 1
            items.append(replacement)
    button text="Recover":
        on click:
            items.remove(replacement)
            items.append(replacement)
    button text="Prepend":
        on click:
            items.append(added)
            items.move(added, 0)
    p text=str(total) + ":" + str(snapshot)
    if visible:
        for item in items key=item.id:
            div:
                span text=item.second
                Row label=item.name
`).code,
  };
}

export function mountFixture(size: number): Record<string, string> {
  return {'./Mount.qb': compile(`class Item:
    id = 0
component Mount:
    items = [${Array.from({length:size},(_,index)=>`Item(${index})`).join(', ')}]
    ul:
        for item in items key=item.id:
            li text="Row"
`).code};
}

export function distinctWriteFixture(size: number): string {
  const states=Array.from({length:size},(_,index)=>`    value${index} = 0`).join('\n');
  const writes=Array.from({length:size},(_,index)=>`            value${index} = value${index} + 1`).join('\n');
  return compile(`component DistinctWrites:
${states}
    button text="Update":
        on click:
${writes}
`).code;
}
