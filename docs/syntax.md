# Phase 2D syntax

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
Component instances cannot accept children, slots, or event handlers in this phase.

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
`==`, `!=`, `and`, and `not` operators with string, number, and boolean literals:

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

Precedence is `not`, then `==` and `!=`, then `and`. Equality operands must have
the same inferred type. `not` and both operands of `and` must be boolean, and the
complete condition must evaluate to boolean and depend on local state, a computed
value, or an instance member. Props may participate in a reactive condition, but
prop-only and literal-only conditions are rejected. Unknown names and invalid
operand types are located errors. Lists and instances compare by identity when
both operands have the same inferred type. `or`, ordering
comparisons, parentheses, chained comparisons, and other expression forms are not
supported in conditions.

Supported standard elements: main, section, div, h1–h6, p, span, label, button, input.
Elements may nest using colon blocks or end at a newline when they have no children
or handler. Properties are `text=expression`, static `class="space separated classes"`,
and the documented indented input `value`, `type` and `checked` forms.
`text` requires a string and creates a text node, never HTML. Expressions are literals,
state/prop/computed references, instance members, typed class construction, list
literals, `str(reference)` (also accepting a member), `len(list)`, and addition of
two strings or two numbers.
Mixed additions require explicit `str`. Arbitrary calls and JavaScript are unsupported.
Buttons accept `on click` blocks with one or more typed state/field assignments,
parameterless class actions, or the supported list operations. Assignments must
retain the target's inferred type; numeric increments, boolean assignments and
string updates are examples. Props, computed values and iteration-item bindings
are read-only (an instance item's fields remain writable). Text inputs accept
`on input`; checkbox inputs accept `on change`. Their closed statements follow the
same typing rules, with `event.value` and `event.checked` available only in their
respective handlers. See Events and lifecycle below.
Each instance owns its state, bindings and listeners.

Numbers are safe integers in the inclusive range -9007199254740991 to
9007199254740991. Literals remain nonnegative; no unary minus or subtraction is
introduced. Host-supplied numeric props may be negative safe integers. Literal-only
arithmetic overflow is a located compile error. Runtime arithmetic and numeric
writes reject unsafe integers (including fractional/nonfinite host values) with a
`RangeError`, before committing invalid state.

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

List literals must be non-empty and homogeneous so their item type can be inferred.
An iteration key must be a string, number, or boolean derived from its item. Duplicate
keys are rejected at runtime because they can arise after state changes. The only
mutation receivers are existing writable list-state names. Computed lists,
literal/temporary lists, members and iteration-item bindings cannot be mutated.
`append(item)` inserts a matching typed item, `remove(item)` removes the identical
instance (or equal primitive) when present, and `move(item, index)` reorders it.
Remove/move of an absent item is a no-op. Move requires a safe-integer index and
clamps it to the list bounds. All three operations validate targets, argument
counts and types at compile time and again at runtime. Reconciliation preserves the DOM range and component
instances for retained keys and creates or disposes only inserted and removed records.

Computed values may depend on state, other computed values, list length, or class
fields. Dependency cycles are errors. The compiler records binding dependency paths; the runtime connects them to each
mounted scope and reruns only affected bindings. Class computed members cache their
results against input values and are validated when their instance changes. They create
no permanent class-level subscriptions, so removing a list record releases its bindings.

## Events and lifecycle

`click`, text-input `input`, and checkbox `change` handlers accept one or more closed,
typed statements: state/field assignment, a parameterless class action, or a list
`append`, `remove`, or `move`. `event.value` is a string available only to input
handlers; `event.checked` is a boolean available only to change handlers. Calls,
members, and values outside the documented forms are compile errors.

Synchronous handlers and their nested class actions form a validation batch.
Invalid mutations or arithmetic, including overflow in affected computed values,
restore earlier signal writes and subscriptions in that batch before DOM updates.
Valid statements still see preceding writes in order. Duplicate keys also roll back
the batch, including writes that preceded the invalid list change. DOM changes are
staged before commit; recoverable rendering failures restore owned nodes and state.
Cleanup errors finish releasing owned resources and report the error after the
rendering commit. See [reactivity](reactivity.md) for host failure boundaries.

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

`on init` runs once before DOM mounting. `on cleanup` runs once when the component
disposer is called. Disposal is idempotent and removes DOM nodes, event listeners,
conditional/list scopes, child instances, and reactive subscriptions.

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

`or`, ordering comparisons, broader expression/assignment forms, event members and
controls, class inheritance/custom constructors/action parameters, empty typed lists,
filter/sort/index expressions, routing, SSR, plugins and LSP remain deferred.
Development reloads on component/CSS edits and recovers from located errors.
Reload resets state; state-preserving HMR and generated JavaScript source maps are deferred.
