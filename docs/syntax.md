# Qbits syntax through Phase 3D.4

One default component is declared per file. Imports precede the component.
The Phase 1 counter remains valid:

```text
component Counter:
    count = 0
    button text="Count: " + str(count):
        on click:
            count = count + 1
```

Props are named, read-only, and have literal defaults. Types are inferred as
string, number, or boolean. Numeric literals currently remain nonnegative safe
integers. Multiple props use commas inside the component header; commas do not
terminate statements. Local numeric, string or boolean state declarations precede root elements.

```text
import "./Counter.css"

component Counter(label = "Count: ", step = 1, enabled = true):
    count = 0
    div class="counter":
        button class="counter-button" text=label + str(count):
            on click:
                count = count + 1
```

Relative default imports use the configured source extension; see the generated
[example](examples.md) for the current identity. An imported component is instantiated
by its local import name. Named attributes supply props. Omitted props retain defaults.
Unknown props, incompatible value types, and assignments to props are errors.
Named child events may be handled on component instances; see [Events and lifecycle](#events-and-lifecycle).

## Component composition

A reusable layout may declare one default `slot`. Indented views supplied to an
instance are rendered at that marker and keep the parent's scope:

```text
component Panel(title = ""):
    section class="panel":
        h2 text=title
        slot
```

The parent imports that layout in a separate file:

```text
import Panel from "./Panel.qb"

component App:
    count = 0
    Panel title="Counter":
        p text="Count: " + str(count)
        button text="Increment":
            on click:
                count = count + 1
```

Slotted content may contain elements, components, conditions, and keyed lists.
Parent updates remain reactive, while nested component state and keyed identity are
preserved normally. The layout owns the insertion point; disposing it also disposes
the projected content. A component without `slot` rejects supplied content. One
unnamed slot is supported per component, and its marker must be in the static layout,
not inside `if` or `for`. Named slots and fallback slot content are not supported.

Phase 2B adds the approved text-input form:

```text
component Greeting:
    name = ""

    input:
        value=name
        on input:
            name = event.value

    p text="Hello, " + name
```

An indented property such as `value=name` has no colon and belongs to its
parent element. Existing inline `text` and `class` properties remain supported;
`value` is supported only as an indented property on `input`. The `on input`
handler assigns the current text from the fixed `event.value` form to a string
state. `event.value` is available only as that handler assignment source. Runtime
updates preserve the input element, focus and caret.

The approved checkbox form uses boolean state, a static checkbox type, a boolean
`checked` property, and the fixed `event.checked` handler value:

```text
component NotificationSetting:
    enabled = false

    button text="Disable notifications":
        on click:
            enabled = false

    input:
        type="checkbox"
        checked=enabled
        on change:
            enabled = event.checked
```

`type` and `checked` are indented input properties. The only supported `type` value
is the static string literal `"checkbox"`. `checked` requires a boolean expression,
and `on change` assigns `event.checked` to boolean state. `event.checked` is
available only as that handler assignment source.

The approved conditional form evaluates a boolean condition and renders exactly
one matching branch. `else` is optional and must immediately follow its `if` block
at the same indentation:

```text
component NotificationSetting:
    enabled = false

    input:
        type="checkbox"
        checked=enabled
        on change:
            enabled = event.checked

    if enabled:
        p text="Notifications enabled"
    else:
        p text="Notifications disabled"
```

When state changes, the old branch is disposed and the new branch is mounted at
the same DOM position. Conditions reference local state and may use the approved
`==`, `!=`, `and`, `or`, and `not` operators with string, number, and boolean literals:

```text
component Greeting:
    name = ""
    enabled = true

    if name == "":
        p text="Enter your name"
    else:
        p text="Hello, " + name

    if enabled and name != "":
        button text="Continue"

    if not enabled:
        p text="Unavailable"
```

Precedence is arithmetic, then `not`, then `==` and `!=`, then `and`, then `or`.
Parentheses override precedence. The existing precedence of `not` over equality
is preserved; write `not (name == "")` to negate a comparison.
Equality operands must have the same inferred type. `not` and both operands of
`and` and `or` must be boolean; numbers, strings, and lists are never truthy values.
`and` skips its right operand when the left is false; `or` skips it when the left
is true. Both operands are type checked even when one will be skipped. Results
are always boolean.

These expressions also work in computed values, state initializers, assignments,
component props, and reactive bindings such as `checked` or `text=str(expression)`.
Shared defaults and class field defaults retain their literal restrictions.
Conditions must reference local state, computed state, or shared state and evaluate
to boolean. Unknown names and invalid types produce located errors. Ordering and
chained comparisons, JavaScript `&&`/`||`/`!`, and arbitrary calls are unsupported.

```text
component Availability:
    enabled = true
    loading = false
    fallback = false
    computed ready = enabled and not loading or fallback
    input:
        type="checkbox"
        checked=enabled and (not loading or fallback)
    p text=str(ready)
    if enabled and (not loading or fallback):
        p text="Ready"
```

### Client-side routing

Routing is optional. Put one static `router:` in the app's mounted component tree.
Each `route` takes a literal path and a view block; the final `route "*"` is the
required 404 fallback. Route parameters are read-only strings scoped to that route.

```text
component Store:
    button text="Product":
        on click:
            navigate "/products/42"
    router:
        route "/":
            p text="Home"
        route "/products/<id>":
            p text="Product " + id
            button text="Home":
                on click:
                    navigate "/"
        route "*":
            p text="Page not found"
```

`navigate` accepts a string expression in built-in or child event handlers, uses
`history.pushState`, and updates the initiating app without reloading. Repeating
the current URL adds no history entry. Back/forward updates mounted routers through
`popstate`. Separate mounts retain separate state; navigation in one mount does not
write another mount's route state. Back/forward reflects the document URL in each.
Host `pushState` calls alone do not notify routers.

Routes match whole paths, case sensitively. Static segments use ASCII letters,
digits, underscores and hyphens. `<name>` captures one decoded segment. More static
segments win; duplicates and equally specific overlapping patterns are rejected.
Legacy `:name` patterns are rejected; replace `/products/:id` with `/products/<id>`.
Parameters can feed text, conditions and child props. A parameter change within
the same route retains its components and local state; switching route branches
stages new content before disposing old content, using existing lifecycle ordering.
Keep persistent UI outside the outlet. A parameterized match does not validate
whether a product or other application record exists.

Navigation accepts only same-origin paths beginning with one `/`; query strings
and fragments are preserved but do not affect matching or expose extra bindings.
Malformed escapes, dot segments, encoded separators, backslashes and controls are
rejected. Malformed browser paths and unmatched paths render the fallback.
Decoded parameters remain text, with no source or HTML execution. Paths are limited
to 2048 characters and tables to 256 routes, additionally respecting collection,
work, DOM, component and effect limits. Trailing slashes are distinct paths.

Failed synchronous navigation preserves committed state, DOM and URL; failed
back/forward rendering restores the previous URL with `replaceState` at the current
history position. Cleanup errors after commit are surfaced without undoing the new
route. Disposal removes the router's history listener. Navigation during route
preparation or lifecycle finalization is unsupported. There are no nested routers,
guards, redirects, link interception or asynchronous route loaders. Production
hosting must serve the app entry for deep links.

Supported standard elements: main, section, div, h1–h6, p, span, label, button, input.
Elements may nest using colon blocks or end at a newline when they have no children
or handler. Properties are `text=expression`, static `class="space separated classes"`,
and the documented indented input `value`, `type` and `checked` forms.
`text` requires a string and creates a text node, never HTML. Expressions are literals,
state/prop references, `str(value)`, `len(list)`, `count(list, item)`, case-insensitive
`contains(text, query)`, string/number addition, and number subtraction.
Mixed additions require explicit `str`. Arbitrary calls and JavaScript are unsupported.
Buttons accept `on click` blocks containing either one numeric state increment,
`target = operand + integer`, or one boolean literal assignment, `target = true`
or `target = false`. The target of a boolean assignment must be boolean state.
No other click assignment forms are supported. Text inputs accept the documented `on input`
assignment; checkbox inputs accept the documented `on change` assignment.
Each instance owns its state, bindings and listeners.

## Classes, computed values, and keyed lists

Classes are file-local data models. Fields have literal defaults; their declaration
order defines the values required by construction. `computed` members derive values
from fields, and parameterless `action` blocks contain validated assignments. There
are no constructor declarations, inheritance, access modifiers, static members, or
arbitrary method bodies.

```text
class Product:
    id = 0
    name = ""
    quantity = 0
    computed label = name + " x " + str(quantity)
    action increment:
        quantity = quantity + 1

component Catalog:
    products = [Product(1, "Tea", 1), Product(2, "Coffee", 1)]
    computed productCount = len(products)

    section:
        h2 text="Products: " + str(productCount)
        ul:
            for product in products key=product.id:
                li:
                    span text=product.label
                    button text="Increase":
                        on click:
                            product.increment()
                    button text="Move first":
                        on click:
                            products.move(product, 0)
                    button text="Remove":
                        on click:
                            products.remove(product)
        button text="Add Cocoa":
            on click:
                products.append(Product(3, "Cocoa", 1))
```

Homogeneous populated lists infer their item type. An empty list declares it explicitly,
for example `products = [] as Product` or `ids = [] as number`. A class name must resolve
to a local class or a compatible schema from an imported shared module.
An iteration key must be a string, number, or boolean derived from its item. Duplicate
keys are rejected at runtime because they can arise after state changes. `append`
inserts a typed item, `remove` removes the identical item instance when present, and
`move(item, index)` reorders it. `sort("field", ascending)` stably sorts class records by
a validated literal field without recreating retained keyed components. Reconciliation preserves the DOM range and component
instances for retained keys and creates or disposes only inserted and removed records.

Computed values may depend on state, other computed values, list length, or class
fields. Dependency cycles are errors. Runtime evaluation records the signals read by
each DOM binding and reruns only subscribed bindings. Class computed members are lazy,
so removing a list record leaves no class-level subscription behind.

## Shared reactive state

Declare a data-only shared module with `shared Name:` and literal typed defaults:

```text
shared Cart:
    items = [] as number
    total = 0
```

Shared class-record lists declare their schema before the shared block. Populated lists
may continue to infer it from their constructors:

```text
class CartItem:
    id = 0
    name = ""

shared Cart:
    items = [] as CartItem
    featured = [CartItem(1, "Featured")]
```

Unrelated components import the same module with the ordinary named-import syntax and
read or assign its fields directly:

```plaintext
import Cart from "./Cart.qb"

component AddToCart(price = 10):
    button text="Add item":
        on click:
            Cart.items.append(price)
            Cart.total = Cart.total + price
```

Each root component mount creates a separate shared-state registry. Descendants that
import the same module descriptor share its signals; a second root mount receives fresh
defaults. Reads subscribe only the consuming binding, and writes use the normal
synchronous transaction and rollback rules. Disposed components unsubscribe, and root
disposal releases the registry. Shared modules cannot import modules or contain views;
their defaults are primitive literals or homogeneous primitive/class-record lists. The
generated descriptor stores explicit schemas separately, so empty lists contain no
sentinel. Host records must be plain data objects with known, correctly typed fields.
Every root hydrates fresh reactive instances, and list mutation accepts only compatible
instances owned by that root. Assignments and list operations enforce the same schema.
Existing module graph,
source, work, update, and safe-integer limits still apply.

The disposer returned by a generated root mount exposes `updateState(patch)` for trusted
host adapters such as an API loader. It validates declared primitive/list schemas and
applies the complete patch through the normal synchronous transaction, including DOM
rollback and keyed identity preservation on failure. It does not make asynchronous host
side effects transactional.

See the [shared-cart example](../examples/shared-cart/App.qb), its [store](../examples/shared-cart/Cart.qb), and [consumer](../examples/shared-cart/AddToCart.qb).

## Events and lifecycle

`click`, text-input `input`, and checkbox `change` handlers accept one or more closed,
typed statements: state/field assignment, a parameterless class action, or a list
`append`, `remove`, or `move`. `event.value` is a string available only to input
handlers; `event.checked` is a boolean available only to change handlers. Calls,
members, and values outside the documented forms are compile errors.

Components can emit named events from a lifecycle hook, event handler, or class action
with `emit name` or `emit name(payload)`. Payloads are one string, number, or boolean expression. Each
event has one consistent payload type. A parent handles a child event by indenting an
`on name(parameter):` block under that component instance. Payload parameters are local,
read-only values; handlers can update parent state and list state using the existing
typed statements. Use `on name:` for an event without a payload. Unknown events,
payload mismatches, and undeclared payload parameters are compile errors. Event handlers
work through nested and slotted components and inside keyed iterations.

```text
component ProductCard(product_id = 0):
    button text="Add to cart":
        on click:
            emit add_to_cart(product_id)
```

```text
import ProductCard from "./ProductCard.qb"

component Store:
    cart = 0
    ProductCard product_id=42:
        on add_to_cart(product_id):
            cart = cart + product_id
```

See [the ProductCard example](../examples/events/Store.qb) and its [child component](../examples/events/ProductCard.qb).

```text
component LifecycleExample:
    ready = false
    on init:
        ready = true
    on cleanup:
        ready = false

    input:
        value=""
```

`on init` runs once before the component's DOM mounts. `on cleanup` runs once after its
descendants and owned resources are disposed. Hooks may use the same typed statements
as handlers and may `emit` an event to expose readiness or cleanup without executing
arbitrary source code. Mount order is parent before descendants, in document order;
cleanup order is descendants before their parent, in reverse current document order.
This also applies to slotted and keyed children. A component whose mount starts and then
fails is cleaned up; rollback cleans up only newly prepared components. Disposal is
idempotent, including after a cleanup error, and removes DOM nodes, event listeners,
conditional/list scopes, child instances, and reactive subscriptions.

See [the lifecycle example](../examples/lifecycle/App.qb) and its [child component](../examples/lifecycle/Connection.qb).

`class` on a component instance forwards to its single resolved root element,
merging with existing classes and retaining defaults. Duplicate classes are removed.
Multiple roots are allowed without forwarding; ambiguous forwarding is diagnosed,
including through components whose root is another component. No wrappers are added.
`class` is reserved and cannot be a declared prop.

Side-effect imports accept relative `.css` files using ordinary standard CSS syntax.
Component modules use normal imports and Vite resolution; missing files, incorrect
source extensions, and component import cycles are diagnosed. No application code
is executed while compiling. The pure compiler accepts optional component metadata
for cross-file prop checking; Node tooling performs filesystem graph validation.

Indentation defines blocks. Headers end with a colon. Use spaces only; the first
indented code line establishes the width (four recommended). Every deeper block
adds exactly that width; dedents return to an existing level. Top-level code starts
in column one. Tabs outside strings/comments are errors, including leading tabs on
blank lines. Blank/comment-only lines do not affect indentation. `#` starts a trailing
or whole-line comment. Strings use JSON double-quoted escaping.

Newlines end statements; the final newline is optional. LF, CRLF and CR work.
Braces, semicolons, interpolation, var/let/const, multiline strings and line
continuations are unsupported. Braces/semicolons inside strings are literal text.
Identifiers use ASCII letters/underscore followed by letters/digits/underscore.

Spans use zero-based UTF-16 offsets with exclusive ends; diagnostics use one-based
lines/columns. NEWLINE covers the physical ending or is zero-width at EOF. INDENT
covers leading spaces; DEDENT is zero-width at the next code token or EOF. Block
spans end at their final statement, excluding trailing comments.

Ordering comparisons, broader expression/assignment forms, event members and
controls, class inheritance/custom constructors/action parameters,
filter/sort/index expressions, nested routing, SSR, plugins and LSP remain deferred.
Development reloads on component/CSS edits and recovers from located errors.
Reload resets state; state-preserving HMR and generated JavaScript source maps are deferred.
