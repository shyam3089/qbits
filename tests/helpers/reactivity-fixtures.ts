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
            items.append(replacement)
    button text="Recover":
        on click:
            items.remove(replacement)
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
