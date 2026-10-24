export const transactionSource=`import Child from "./Child.qb"
class Item:
    id = 0
    count = 0
    computed doubled = count + count
    action bump:
        count = count + 1
        count = count + 1
component Transactions:
    a = Item(1, 0)
    b = Item(2, 0)
    c = Item(3, 0)
    items = [a, b]
    visible = false
    n = 0
    label = "initial"
    computed left = n + 1
    computed right = n + 2
    computed total = left + right
    button text="Duplicate":
        on click:
            a.count = a.count + 1
            n = n + 1
            items.append(a)
    button text="Collision":
        on click:
            b.id = 1
    button text="Append":
        on click:
            items.append(c)
    button text="Move":
        on click:
            items.move(b, 0)
    button text="Show":
        on click:
            visible = true
    button text="Hide":
        on click:
            visible = false
    button text="Update":
        on click:
            a.bump()
            n = n + 1
            n = n + 1
    button text="Remove":
        on click:
            items.remove(b)
    input:
        value=label
        on input:
            label = event.value
    p text=str(total)
    p text=label
    h2 text="Unaffected"
    if visible:
        Child label=label
    else:
        p text="Hidden"
    ul:
        for item in items key=item.id:
            li:
                span text=str(item.doubled)
                span text=str(item.doubled)
                Child label=str(item.count)
    ol:
        for item in items key=item.id:
            li text=str(item.id)
`;
