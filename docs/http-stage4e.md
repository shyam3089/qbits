# HTTP, transfers, connections, and services

This is the complete Stage 5 guide to the HTTP surface implemented through Stage
4E. All examples use approved Qbits syntax. HTTP work is asynchronous and is not
part of Qbits synchronous DOM transactions.

## Learning path

Start with queries and resource state, then add client configuration, scheduling,
dependencies, and cache policy. Continue with actions and file transfers. Finish
with live connections and root-scoped services. The repository examples follow the
same path: [`http-basics`](../examples/http-basics) is the beginner example, while
[`http-commerce`](../examples/http-commerce) combines the advanced features in a
complete storefront workflow.

## 1. Queries

A query is a reactive resource. It runs when mounted and reruns when a state, prop,
or upstream resource referenced by its URL, parameter, header, or body changes.
Every query requires an explicit response type: `string`, `number`, `boolean`, a
local class, or `list[...]` of one of those types.

```qbits
class Product:
    id = 0
    name = ""
    price = 0

component ProductSearch:
    term = ""
    http client api:
        base "https://api.example.test/v1/"
    client api
    query products:
        get "products"
        param q = term
        header "X-View" = "catalog"
        response list[Product]
        debounce 300ms
        timeout 10s
        retry 2
        cache 60s
        refresh on-focus
    input:
        value=term
        on input:
            term = event.value
    if products.loading:
        p text="Loading products"
    else:
        if products.success:
            for product in products.data key=product.id:
                p text=product.name + " - " + str(product.price)
        else:
            p text=products.error
    button text="Refresh":
        on click:
            products.refresh()
```

Supported methods are `get`, `post`, `put`, `patch`, and `delete`. GET queries
cannot have a body. Query parameters must be strings, numbers, or booleans. Header
values must be strings. Bodies support primitives, typed lists, and class records.

## 2. Resource state

Query resources expose:

- `data`: the validated response; read it after `success` is true.
- `loading`: true until the first committed result or failure.
- `refreshing`: true while refreshing an already committed result.
- `success`: true after the latest successful commit.
- `empty`: true before any successful commit.
- `error`: an error message, or an empty string after success.
- `refresh()`: explicitly requests a new run.

An obsolete response cannot overwrite newer input. Refreshes requested during an
in-flight run are coalesced. Identical safe reads are deduplicated within their HTTP
scope. A failed dependency prevents downstream work until it succeeds.

## 3. Configuration

Declare named clients inside a component, select one with `client`, and optionally
override it on an individual query, action, connection, or imperative request.

```qbits
component Health:
    http client api:
        base "https://api.example.test/v1/"
        auth bearer getToken
        interceptor addTrace
        interceptor response unwrap
        interceptor error reportError
    client api
    query status:
        get "health"
        response string
    if status.success:
        p text=status.data
    else:
        p text=status.error
```

The host supplies referenced functions before mounting:

```ts
const restore = configureHttpApplication({
  functions: {
    getToken: async () => sessionStorage.getItem('token'),
    addTrace: request => { request.headers.set('X-Trace', crypto.randomUUID()); },
    unwrap: value => value.data,
    reportError: error => console.error(error),
  },
});
// Call restore() when replacing this application-level configuration.
```

Client declarations are configuration, not a JavaScript sandbox. Auth providers
and interceptors are trusted host functions. A client base may be relative to the
page, but a literal HTTPS base is the portable choice for authenticated clients.

## 4. Cancellation and lifecycle

Component disposal cancels owned safe reads, pending debounce/poll timers, and
connection reconnect timers, and suppresses stale UI commits. Imperative GET reads
are also aborted on disposal. A shared service and its cache live until the root
application is disposed, not until its last consumer disappears.

Mutating actions are intentionally not aborted merely because their initiating
component is destroyed: the server may already have accepted the mutation. Ordinary
actions have no `cancel()` API. Upload and download actions do expose `cancel()`;
explicit cancellation rejects the transfer with an `AbortError` and clears its
active state. Application-created promises and other host side effects are outside
Qbits lifecycle control.

## 5. Retries and scheduling

Only safe GET queries may use automatic replay features: `debounce`, `retry`,
`cache`, `refresh on-focus`, `poll`, or resource dependencies. `retry` accepts
0–10 retries. Durations use `ms` or `s`, must be positive, and are bounded by the
runtime timer range. Retries use bounded delayed replay; polling schedules the next
run after the current one settles. Timeouts and input changes abort obsolete reads.
Unsafe queries and actions are never automatically retried.

## 6. Clients and authentication

Bearer authentication requires HTTPS except for permitted local development
origins. Tokens are placed only in the `Authorization` header. They are never placed
in URLs. Authenticated requests use `credentials: "same-origin"` and
`redirect: "error"`; an interceptor cannot redirect an authenticated request to a
different origin. A selected client also prevents URLs from escaping its configured
base origin.

Request interceptors run before transport, response interceptors run before schema
validation/hydration, and error interceptors observe failures. Interceptors must
return valid request/value shapes and must not weaken origin or multipart checks.

## 7. Dependencies

Dependencies are inferred from resource references, including forward references.
The downstream query waits for the upstream resource to succeed and reruns when its
committed value changes. Cycles are compile errors.

```qbits
class Account:
    id = 0

component AccountOrders:
    query orders:
        get "https://api.example.test/orders"
        param accountId = account.data.id
        response list[string]
    query account:
        get "https://api.example.test/account"
        response Account
    if orders.success:
        p text="Orders: " + str(len(orders.data))
    else:
        p text=orders.error
```

## 8. Caching and isolation

`cache 60s` keeps a successful safe response fresh for that duration. Cached values
can be shown immediately while a refresh sets `refreshing`. Cache keys include the
resolved client scope and request input. Separate root applications never share
service instances or caches, even with identical credentials. Consumers of one
service inside one root must provide exactly one compatible inherited named-client
configuration; conflicting base/auth/interceptor declarations fail the mount and
roll back its partial tree.

Caching is in-memory only. It is not persistent storage, an HTTP cache replacement,
or a cross-tab cache. Mutating actions invalidate only resources named by `refresh`.

## 9. Actions, imperative requests, and instant updates

Actions execute only when called. They expose `data`, `loading`, `success`, and
`error`. All five HTTP verbs are supported; GET actions cannot have a body. Actions
may overlap. Each optimistic (`instant`) layer is applied atomically and rolled back
independently if its request fails; successful mutations refresh every named shared
consumer. An instant assignment requires the same resource in `refresh`.

```qbits
class Cart:
    count = 0

component CartActions:
    query cart:
        get "https://api.example.test/cart"
        response Cart
        cache 60s
    action add(amount):
        post "https://api.example.test/cart/items"
        body amount
        response Cart
        refresh cart
        instant cart:
            count = count + amount
    button text="Add one":
        on click:
            add(1)
    if cart.success:
        p text="Items: " + str(cart.data.count)
    else:
        p text=cart.error
```

For one-off work in `on init` or an event handler, use `await http.get(...)` (or
another verb). A bound result requires `response Type`; the binding exists only for
the remaining statements in that handler and does not become component state.
Imperative calls inherit the default client unless `client name` is specified.
Failures are surfaced asynchronously; use reactive actions when the UI needs a
renderable error state.

## 10. File bindings

File state is either nullable `File` state or a typed `File` list. Qbits preserves
native `File` identity and selection order.

```qbits
component FileSelection:
    state photo = null
    state attachments = [] as File
    state selected = 0
    input type="file" bind=photo
    input type="file" multiple bind=attachments:
        on change:
            attachments = event.files
            selected = len(event.files)
    input type="file":
        on change:
            photo = event.file
    button text="Clear photo":
        on click:
            photo = null
    p text="Attachments: " + str(selected)
```

`bind` requires writable file state. A single input binds `File|null`; `multiple`
binds `list[File]`. In file change handlers, `event.file` is the first selected file
or `null`, and `event.files` is an ordered file list. Those members exist only in
file change handlers. Clearing bound state clears the native input; scripts cannot
set a non-empty native file selection. List selection is replaced, not appended.
Listeners and retained selections are released on disposal.

## 11. Transfers and progress

Uploads use POST plus one or more uniquely named `upload` fields. Qbits builds the
multipart body and boundary; declaring `Content-Type` yourself is rejected.
Downloads use GET plus a safe basename and cannot declare a response schema, body,
or upload. Transfer actions use the selected client, auth, and interceptors.

```qbits
class Receipt:
    name = ""
    size = 0

component Transfers:
    state receipt = null
    action uploadReceipt(file):
        post "https://api.example.test/receipts"
        upload "receipt" = file
        response Receipt
    action downloadInvoice():
        get "https://api.example.test/invoice"
        download "invoice.pdf"
    input type="file" bind=receipt
    button text="Upload":
        on click:
            uploadReceipt(receipt)
    button text="Download":
        on click:
            downloadInvoice()
    button text="Cancel download":
        on click:
            downloadInvoice.cancel()
    if uploadReceipt.progress:
        progress value=uploadReceipt.progress max=100
    if downloadInvoice.progress:
        progress value=downloadInvoice.progress max=100
    p text=uploadReceipt.error + downloadInvoice.error
```

`progress` is `-1` when total size is indeterminate and otherwise a number clamped
to `0–100`, ending at 100 on a completed transfer. In an `if action.progress`
condition, `-1` is intentionally treated as active. A negative `<progress>` value
removes its `value` attribute, producing native indeterminate rendering. Transfers
enforce the configured byte limit, reject cross-origin redirect escapes, revoke
download object URLs, and clean up progress handlers. Upload/download action calls
with a required nullable file currently do nothing while the value is `null`.

## 12. WebSockets and SSE

Both connection types open on mount, expose `state`, `connected`, `connecting`, and
`error`, close on disposal, and support a bounded exponential reconnect requested
from `on disconnect`. The base reconnect duration is 1ms–30s and framework retries
stop after ten attempts.

```qbits
component LiveOrders:
    state lastAlert = ""
    state lastUpdate = ""
    socket alerts:
        connect "/orders/alerts"
        on message(data):
            lastAlert = data
        on disconnect:
            reconnect 1s
    sse updates:
        connect "/orders/updates"
        on message(data):
            lastUpdate = data
        on disconnect:
            reconnect 1s
    button text="Acknowledge":
        on click:
            alerts.send("ack")
    button text="Close live updates":
        on click:
            updates.close()
    p text=alerts.state + ":" + lastAlert
    p text=updates.state + ":" + lastUpdate
```

WebSockets accept and send text only. Outbound messages are limited to 64 KiB, the
queued total to 1 MiB, and inbound messages to 1 MiB. SSE accepts default text
`message` events up to 1 MiB. WebSockets and `EventSource` cannot set custom
Authorization headers: Qbits does not call bearer providers or HTTP interceptors
for them. Use secure same-origin cookies or an application-controlled message
protocol. URL credentials/fragments and cross-origin escapes are rejected; secure
pages require `wss`, and non-loopback SSE requires HTTPS.

## 13. Shared services

A service contains `client`, `query`, and `action` declarations and no view. Import
and `use` it before component elements. One instance is shared by every consumer in
one root application, so queries, cache, optimistic layers, and refreshes are shared.

```qbits
class CartSummary:
    count = 0

service CartService:
    client api
    query cart:
        get "cart"
        response CartSummary
        cache 60s
    action add(amount):
        post "cart/items"
        body amount
        response CartSummary
        refresh cart
        instant cart:
            count = count + amount
```

The complete two-file service consumer is in
[`examples/http-commerce`](../examples/http-commerce). Services are root-scoped;
separate mounts isolate authentication, instances, caches, and cleanup. A service
cannot accept props or render elements. Service dependencies are checked for cycles.

## Errors, concurrency, security, and limits

HTTP status failures, transport failures, timeouts, aborts, interceptor failures,
and schema mismatches never become successful data. Reactive queries/actions put a
message in `error`; imperative failures are thrown asynchronously. Responses must
exactly match their declared primitive/class/list shape: unknown fields, accessors,
wrong types, non-finite/unsafe numbers, excessive depth, and oversized collections
are rejected before commit. Records are hydrated into Qbits classes without
executing server-supplied source or HTML.

Concurrent safe reads are deduplicated by scope and request identity. Obsolete query
generations cannot commit. Concurrent actions remain distinct; optimistic layers
settle independently. Framework queues, response collections/depth, transfer bytes,
message sizes, retries, and component work are bounded. Server rate limits, CSP,
TLS, cookie attributes, CORS policy, host functions, and asynchronous server effects
remain application responsibilities.

Known limitations: no arbitrary catch/try syntax in `.qb`; no automatic retry of
mutations; no persistent/offline cache; no request cancellation API for ordinary
actions; no custom WebSocket/SSE headers; no binary WebSocket/SSE payloads; SSE has
no named events or application-managed Last-Event-ID persistence; and connections
do not survive page navigation. Query responses always require explicit types.
