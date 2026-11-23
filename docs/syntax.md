# Qbits syntax through Stage 7B.3

One default component is declared per file. Imports precede the component.
The Phase 1 counter remains valid:

```text
component Counter:
    count = 0
    button text="Count: " + str(count):
        on click:
            count = count + 1
```

## Standards-based HTML and SVG

Lowercase HTML5 elements, standards-based nesting, void elements, and hyphenated
custom elements use the existing indentation syntax. Attribute names retain standard
spelling, including `data-*`, `aria-*`, SVG camel case such as `viewBox`, and qualified
SVG names such as `xlink:href`. Boolean attributes may be flags; reactive booleans add
or remove the attribute.

```qbits
component Profile:
    name = ""
    form aria-label="Profile":
        label for="name" text="Name"
        input id="name" autocomplete="name" required:
            value=name
            on input:
                name = event.value
        qbits-status data-ready=true text=name
```

`value` uses the live DOM property on `input`, `textarea`, `select`, and `option`;
`checked` uses the input property. Writes are skipped when the live value is already
current, preserving the control, focus, selection, and browser-managed input state.
Other bindings, including reactive `class` and `style`, use DOM attribute semantics.
One `on event:` block is currently supported per element. Form handlers expose only
the typed `event.value`, `event.checked`, `event.file`, or `event.files` members already
documented; Qbits does not expose a general executable browser event object.
For backward compatibility, a bare `slot` line remains Qbits component projection;
write a native HTML slot with an attribute, such as `slot name="details"`.

An `svg` element enters the SVG namespace. Descendants retain SVG casing and namespace;
`foreignObject` returns its children to HTML, and a nested `svg` enters SVG again.

```qbits
component RadiusChart:
    radius = 24
    svg viewBox="0 0 100 100" role="img" aria-label="Radius chart":
        defs:
            linearGradient id="fill":
                stop offset="0%" stop-color="#4f46e5"
        g transform="translate(50 50)":
            circle r=radius fill="url(#fill)" stroke-width=2:
                on click:
                    radius = radius + 4
        foreignObject x=4 y=4 width=40 height=20:
            div text="Radius: " + str(radius)
```

Text always renders through text nodes. `script`, `innerHTML`, `outerHTML`, `srcdoc`,
inline event-handler attributes, and `javascript:`, `vbscript:`, or `data:` URL schemes
are rejected. Interpolated strings are never parsed as markup.

## External HTML templates

A component may replace its inline view roots with one build-time HTML template. The
path is relative to the `.qb` file, must end in `.html`, and must stay inside the
project root after symlink resolution. Inline view roots and `template` cannot be mixed.

```qbits-external
component Registration:
    template "./Registration.html"
    email = ""
    accepted = false
```

```html
<form qb-on-submit="accepted = true">
  <label>Email <input type="email" qb-model="email" required></label>
  <p qb-text="email" qb-bind-aria-label="email"></p>
</form>
```

The HTML file is parsed and lowered into the same compiled view model as indentation
syntax; it is never fetched or parsed in the browser. Standard HTML, inline SVG,
custom elements, imported Qbits components, and a bare `<slot></slot>` are supported.
Formatting whitespace is standard HTML text and is preserved inside elements.

Supported directives are deliberately small:

- `qb-text="expression"` replaces element content with escaped reactive text.
- `qb-bind-name="expression"` reactively binds an existing safe DOM attribute or
  form property, including `class`, `style`, `data-*`, `aria-*`, and SVG casing.
- `qb-on-event="statement"` attaches one existing Qbits handler statement. Multiple
  distinct events may be declared on one element; arbitrary JavaScript is not accepted.
- `qb-model="target"` provides two-way string, number, checkbox, radio, select, and
  compatible custom-control binding to writable state. Empty numeric input remains in
  the browser until a valid finite safe integer is entered because Qbits number state
  is non-nullable.
- `qb-if="condition"` uses the existing reactive conditional implementation.
- `qb-for="item in items" qb-key="item.id"` uses existing keyed reconciliation.

`qb-model` cannot be combined with `qb-bind-value` or `qb-bind-checked`. Template
expressions and handler statements use the existing Qbits grammar, not JavaScript.
`qb-form` and `qb-field` connect external HTML to a declared reactive form. See
[Reactive forms](#reactive-forms) and `examples/html-template`.

## Reactive forms

Forms reuse component state as their only value source. A form-level timing applies to
every field unless the field overrides it:

```qbits-external
component Registration:
    template "./Registration.html"
    state email = ""
    state password = ""
    state confirmPassword = ""

    form signup validate on blur:
        field email:
            required msg="Email is required"
            email
            maxLength 254
        field password:
            required
            minLength 12
        field confirmPassword validate on change:
            required
            match password msg="Passwords do not match"
```

```html
<form qb-form="signup">
  <label for="email">Email</label><input id="email" type="email" qb-field="email">
  <label for="password">Password</label><input id="password" type="password" qb-field="password">
  <label for="confirm">Confirm</label><input id="confirm" type="password" qb-field="confirmPassword">
  <button type="submit">Register</button><button type="reset">Reset</button>
</form>
```

Built-ins are `required`, `email`, `min`, `max`, `minLength`, `maxLength`,
`pattern`, and generic equality `match`. `msg="..."` replaces a rule's default plain-
text message. Patterns are bounded to 256 characters and use a conservative safe
subset without groups, alternation, backreferences, lookarounds, or repeated wildcards. Validators other than
`required` ignore empty optional values.

Field metadata is `signup.email.value`, `valid`, `invalid`, `dirty`, `touched`,
`pending`, `errors`, `error`, `validationError`, and `serverError`; form metadata is
`signup.value`, `valid`, `invalid`, `dirty`, `touched`, `pending`, `submitting`,
`submitted`, `submitSuccess`, `submitError`, `validationError`, and `result`.
Metadata is read-only. Validity always reflects current state, while
errors appear after the configured `change` or `blur`, or after a submit attempt.
Programmatic state writes revalidate without marking a field dirty.

Nested records, stable record arrays, asynchronous validation, and typed HTTP submit
use the same state and action declarations:

```qbits-external
class Account:
    username = ""
class Address:
    city = ""
class RegistrationRequest:
    account = Account("")
    addresses = [] as Address
class FieldError:
    path = ""
    message = ""
component Registration:
    account = Account("")
    addresses = [] as Address
    action usernameAvailable(value):
        get "/users/available"
        param value = value
        response boolean
    action register(payload):
        post "/registrations"
        body payload
        response string
        error 422 response list[FieldError]
    form signup validate on blur:
        field account:
            field username validate on change:
                required
                async usernameAvailable debounce 300 ms
                    msg="Username is already used"
        array addresses:
            field city:
                required
        submit register(RegistrationRequest(account, addresses))
```

Use dotted paths for records. Array templates iterate the stable metadata items and
bind through the item alias:

```html
<input qb-field="account.username">
<div qb-for="address in signup.addresses.items" qb-key="address.key">
  <input qb-field="address.city">
</div>
```

An async validator calls a safe typed GET action. `depends` adds typed action
arguments after the field value, `debounce` is optional, superseded requests are
cancelled, and stale completions are ignored. A `false` result is a validation
failure; network, protocol, or malformed-response failures populate
`validationError` without becoming a user validation message. `pending` covers both
the debounce interval and the active request. Submit follows the latest field value
when edits supersede validation, and reset, field removal, and component disposal
settle pending validation without allowing a stale completion to update metadata.

Submit waits for current async validation and prevents duplicates. Its explicit
constructor expression is the only payload source. Typed success data is exposed as
`result`. A declared 422 `list[FieldError]` maps bounded JSON-pointer-style paths such
as `/account/username` and `/addresses/0/city` against the submitted array snapshot;
unknown, duplicate, malformed, or unsafe paths reject the complete mapping.
Snapshot entries removed before the response are also rejected rather than receiving
detached errors. Field server errors clear when that field's value changes. While an
HTTP submission is active, additional submit attempts are ignored.

`qb-field` supports text, email, password, number, checkbox, radio, textarea, and
single or multiple select controls. It preserves control identity and authored ARIA,
adds a stable adjacent plain-text error description, and manages `aria-invalid`.
Invalid submit is prevented and focuses the first connected enabled invalid control.
Valid submit invokes the declared typed action. Reset cancels pending validation,
restores the complete mount-time record/list graph and order, preserves retained
record identity, and clears validation and submission metadata.

`qb-form` keeps native keyboard submission. Visible field messages are plain text and
are connected to controls with `aria-describedby`; revealed failures update
`aria-invalid`, and correction or dynamic field cleanup removes the framework-owned
ARIA reference without replacing the control.

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
Root routes use absolute paths and the final root `route "*"` is the required 404
fallback. Nested routes use relative paths, `""` is an index route, and a nested
`route "*"` is optional. When a child group has no matching fallback, matching
continues with the nearest ancestor fallback.

```text
import ReportsPage from "./ReportsPage.qb"
component Store:
    action canOpenReports():
        get "/api/reports/access"
        response boolean
    button text="Reviews":
        on click:
            navigate "/products/<id>":
                id = 42
                tab = "reviews"
                page = 2
    router:
        scroll:
            restore = true
        loading:
            p text="Loading page"
        error:
            p text=navigation.error
        route "/":
            section:
                route "":
                    p text="Home"
                route "products/<id:number>":
                    query:
                        tab = "details"
                        page = 1
                    p text="Product " + str(id) + " " + tab + " " + str(page)
                route "reports":
                    guard async:
                        if not canOpenReports():
                            navigate replace "/login"
                    lazy:
                        ReportsPage
                    loading:
                        p text="Loading reports"
                    error:
                        p text=navigation.error
                route "*":
                    p text="Store page not found"
        route "/old-products":
            navigate replace "/products/1"
        route "*":
            p text="Page not found"
```

`navigate` accepts a string expression in built-in or child event handlers, uses
`history.pushState`, and updates the initiating app without reloading. Repeating
the current URL adds no history entry. `navigate replace "/path"` replaces the current
entry; `navigate back` and `navigate forward` call the corresponding browser-history
operations. Back/forward updates mounted routers through
`popstate`. Separate mounts retain separate state; navigation in one mount does not
write another mount's route state. Back/forward reflects the document URL in each.
Host `pushState` calls alone do not notify routers. A multiline navigation destination
is a literal full route template without inline types. Its assignments are checked
against that route's path parameters and declared query values, then encoded into a
local URL. The destination is resolved against the router declared in the same
component; child components can continue to use ordinary string `navigate`. All path
parameters are required; query assignments are optional.

Routes match complete root-to-leaf paths, case sensitively. Static segments use ASCII
letters, digits, underscores and hyphens. `<name>` captures one decoded string segment;
`<name:number>` accepts only canonical finite safe integers such as `0`, `42`, or `-3`.
Values such as `01`, `-0`, `1.0`, exponents, and unsafe integers do not match and use
the nearest fallback. Parent parameters are inherited by nested routes. More static
segments win; duplicates and equally specific overlapping patterns are rejected even
when their parameter types differ.
Legacy `:name` patterns are rejected; replace `/products/:id` with `/products/<id>`.
Parameters can feed text, conditions and child props. A parameter change within
the same route retains its components and local state. Query groups contain literal
string, boolean, or safe-integer defaults; missing, duplicate, or invalid typed query
values resolve to those defaults. Query-only navigation updates subscribed bindings
without recreating the matched route components. Ordinary state changes do not write
browser history.

Same-origin native `<a href>` clicks use the router without a page reload. Modified
clicks, non-primary buttons, `download`, non-`_self` targets, cross-origin URLs, and
non-HTTP(S) schemes retain native browser behavior. Qbits does not modify host-owned
`history.state`. Scroll restoration is enabled by default: new navigation starts at
the fragment target or page top, while back/forward restores a bounded in-memory
position. Declare `scroll: restore = false` to disable router scrolling.

`navigation.pending` is a read-only boolean and `navigation.error` is a read-only,
sanitized error string. Both are reactive in inline and external templates. Async
navigation retains the committed page. A route-specific `loading:` or `error:` block
overrides the router-level block; the loading overlay covers the changing content,
blocks its pointer interaction, announces status accessibly, and leaves shared
navigation usable. Initial loading and errors render without exposing protected route
content.

`guard:` conditions are synchronous. `guard async:` additionally permits calls to
declared side-effect-free typed GET actions whose response is exactly `boolean`; guard
actions cannot declare a body, instant update, refresh, upload, or download. Guards run
parent before child; a true branch must contain only `navigate` or `navigate replace`.
No state mutation is allowed in a guard. New navigation cancels cancellable guard
requests and ignores all stale completions. Transport failures populate
`navigation.error`; they are not treated as access denial. Redirect chains are bounded
to 16 steps. A route containing only `navigate` or `navigate replace` is a redirect-only
route; there is no `redirect` keyword.

`lazy:` contains exactly one normally imported component. When that import has no eager
use elsewhere in the component, generated JavaScript uses a dynamic import and the
bundler can emit a separate route chunk. An eagerly used import remains eager. Failed
imports retain the committed page and select the nearest route or router `error:` block.
Qbits does not prefetch route chunks.

Nested route declarations supplied as content to a component render through that
component's existing default `slot`. Common parent layouts remain mounted while their
active child changes. Layout and page components may use inline views or external HTML
templates; an external layout uses a bare `<slot></slot>`. Switching unmatched route
branches stages new content before disposing old content using existing lifecycle
ordering. A parameterized match does not validate whether an application record exists.

Navigation accepts only same-origin paths beginning with one `/`; query strings
and fragments are preserved but do not affect path matching. Only query keys declared
by the matched route chain expose bindings; unknown keys remain unbound.
Malformed escapes, dot segments, encoded separators, backslashes and controls are
rejected. Malformed browser paths and unmatched paths render the fallback.
Decoded parameters remain text, with no source or HTML execution. Paths are limited
to 2048 characters and trees to 256 routes, additionally respecting collection,
work, DOM, component and effect limits. Trailing slashes are distinct paths.

Failed synchronous navigation preserves committed state, DOM and URL; failed
back/forward rendering restores the previous URL with `replaceState` at the current
history position. Async guard, redirect, and lazy work is latest-navigation-wins.
Cleanup errors after commit are surfaced without undoing the new route. Disposal
removes router history and link listeners and cancels active guard work. Navigation
during route preparation or lifecycle finalization is unsupported. Nested router
instances remain unsupported. Production hosting must serve the app entry for deep
links.

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
type Product:
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

`type` is the preferred additive alias for record declarations. Existing `class`
declarations remain supported and compile to the identical constructor and schema
representation; neither keyword adds inheritance or methods beyond existing actions.

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

## WebSockets

Components declare browser WebSockets before their view. Messages are text and the
message parameter is a local, read-only string. Socket fields are `state`, `connected`,
`connecting`, and `error`; handlers can call `send(string)` or `close()`.

```text
component SocketExample:
    state last = ""
    socket alerts:
        connect "/alerts"

        on message(data):
            last = data

        on disconnect:
            reconnect 3s
    p text=last
```

`reconnect` accepts `ms` or `s` durations up to 30 seconds and uses bounded exponential
backoff with jitter. A relative URL uses the selected component HTTP client's base URL,
if present, and converts HTTP(S) to WS(S). Socket URLs cannot escape that configured
origin. HTTP bearer providers and interceptors are not applied to WebSocket handshakes.
Binary messages are rejected. Component disposal closes the connection and removes its
listeners and reconnect timer.

## Server-Sent Events

SSE declarations use the same reactive connection fields and lifecycle rules as
WebSockets, but are receive-only and expose only `close()`.

```text
component NotificationStream:
    state last = ""
    sse notifications:
        connect "/notifications"

        on message(data):
            last = data

        on disconnect:
            reconnect 3s
    p text=last
```

Messages are browser-decoded UTF-8 strings limited to 1 MiB. Qbits closes a failed
`EventSource` before scheduling its bounded retry so native and framework reconnects
cannot overlap. Relative URLs inherit the selected HTTP client base, but must remain
same-origin HTTP(S); non-loopback connections require HTTPS. Bearer providers,
interceptors, custom headers, and query-token injection are not applied. Same-origin
cookies follow the browser's normal cookie policy.

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

## HTTP, files, connections, and services

The complete reference and tutorials are in [HTTP, transfers, connections, and
services](http-stage4e.md). The approved declarations are:

- `http client`, `client`, named auth/interceptors, and per-operation clients;
- typed `query` resources with params, headers, bodies, dependencies, debounce,
  timeout, retry, cache, focus refresh, polling, state fields, and `refresh()`;
- typed HTTP `action` declarations, imperative `await http.verb(...)`, `refresh`,
  and `instant` optimistic assignments;
- nullable `File` and `[] as File` state, file-input `bind`, `multiple`,
  `event.file`, and `event.files`;
- upload/download actions, `progress` (`-1` or `0–100`), and transfer `cancel()`;
- `socket` and `sse` declarations with text messages, close/send where applicable,
  disconnect handlers, and bounded reconnect;
- imported root-application-scoped `service` declarations selected with `use`.

Queries and actions require explicit response declarations when they consume a
response. Automatic replay features are limited to safe GET queries. Ordinary HTTP
actions cannot be cancelled; `cancel()` is available only for transfers. Client,
authentication, cache isolation, disposal, security, and known limitations are part
of the HTTP reference and must not be inferred from general component lifecycle.

Ordering comparisons, broader expression/assignment forms, event members and
controls, class inheritance/custom constructors/class-action parameters,
filter/sort/index expressions, nested routing, SSR, plugins and LSP remain deferred.
Development reloads on component/CSS edits and recovers from located errors.
Reload resets state; state-preserving HMR and generated JavaScript source maps are deferred.

Editor authors can reuse the theme-neutral TextMate grammar and language
configuration described in [Qbits syntax highlighting](syntax-highlighting.md).
