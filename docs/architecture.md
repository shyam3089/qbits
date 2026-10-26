# Architecture

`language/` is a pure source-to-module pipeline: tokenize → parse → validate →
generate. `compile(source, filename)` returns `{ast, code}` or throws `CompileError`
with structured `diagnostic`. Each stage and AST types are exported from
`language/index.ts` for future tooling. Tokens and all AST constructs carry spans.
No stage evaluates source or resolves application imports.

The lexer emits NEWLINE/INDENT/DEDENT from space-indented logical lines, ignoring
blank/comment-only lines. The parser accepts only colon-headed blocks and an
explicit expression AST nodes for literals, references, members, typed construction,
lists, addition, `str(value)`, and `len(list)`. Class actions, event handlers, and
lifecycle hooks compile to a closed statement model rather than JavaScript. Runtime
rendering uses `String(value)`; old brace syntax is rejected. See docs/syntax.md.

`runtime/` owns DOM creation, local state, click/input/change listeners, property updates,
and disposal. Its
serialized component model is the boundary with generated code. The legacy
`mountCounter` runtime export remains available. User names never
become JS identifiers. Literal text uses JSON serialization and DOM text nodes.
Safe-integer overflow throws before invalid numeric writes. Handler validation
batches journal signal values, derived dirty flags and subscriptions so validation
failures restore earlier writes before any DOM effects run. Child prop propagation
settles with computed values during preparation. DOM plans stage changes in
detached fragments; key and mounting failures roll back the batch, and commit
failures restore owned ranges before restoring signals and subscriptions. List methods require registered writable list-state
signals and validate argument counts, types and safe-integer move indexes before
copying/committing a new list. Controlled text inputs update
their existing DOM value only when it differs, preserving focus and caret while typing.
Checkbox state is synchronized through the DOM `checked` property.
Each state or instance field is a small signal. The compiler emits deduplicated dependency paths on bound expressions, and exports
`analyzeDependencies(ast)` with one-shot initializer edges, computed edges, and
source-located binding edges. Phase 3A.1 uses metadata to identify static bindings and records actual closed-model
reads once per effect, avoiding a second expression/dependency walk. Both old and
new models retain fine-grained tracking; literal bindings and static child props
need no subscription effects. The compiler omits redundant empty metadata on
literals, preserving the serialized JSON model boundary. Closed handlers batch writes synchronously;
computed values invalidate derived descendants and settle before queued DOM effects.
Sets deduplicate scheduled effects; equality checks suppress unchanged derived outputs.
Reads inside actions refresh dirty computed values immediately. Component computed
values propagate through signals, while class computed members evaluate lazily inside
their consuming effect, caching results by input signal values across validation and
multiple consumers, including references to other class computed members;
instance updates also preflight these expressions for arithmetic failures.
Conditionals use comment anchors and branch-local
cleanup scopes. Keyed iteration tracks only collection/key reads; record construction
is untracked. A longest increasing subsequence identifies retained ranges that stay
in place; only other ranges move. Focus and input selection survive moves. Item
signals support same-key replacement without recreating child instances. Duplicate
runtime keys are rejected before structural mutation. Insertion/removal creates or
disposes only the corresponding scope. See performance.md for measured results.

`tooling/` owns identity validation, CLI filesystem access, and Vite transformation.
The Vite plugin compiles configured suffixes and appends identity metadata; the
compiler itself knows neither branding nor suffixes. Vite invalidates source modules
and explicitly triggers full reloads, including after failed transforms. Component
HMR/state preservation is unsupported; component state resets on reload. Source maps are deferred, while
compile diagnostics retain original locations. `examples/` contains only the demo.

`tooling/modules.ts` validates the relative component graph without executing it:
missing imports, configured extensions, cycles, prop types and transitive single-root
class forwarding are checked before emission. The pure compiler accepts linked
component metadata through validation options; standalone source compilation cannot
check a dependency's prop schema without that metadata. Generation retains normal
ES module imports so Vite owns module loading and CSS. Runtime mounts allocate
independent state, safe text nodes, child mounts and teardown callbacks per instance.
Conditions are compiled to a typed data tree and interpreted by the runtime; source
text is never evaluated as JavaScript. Branch content uses text nodes, not HTML insertion.
Props are read-only inputs; parent state changes notify child bindings without remounting.
Component disposal stops effects, removes listeners, DOM nodes, child instances and
conditional/list scopes, then runs its closed cleanup statements once and releases
state and supplied-prop references. Cleanup failures do not skip other owned resources.
Ownership callbacks are registered before dynamic scope mounting so failed mounts
also unwind. Parent prop effects refresh child signals without reading child state.
CSS edits also trigger a full reload. Error frames refer to the failing dependency,
even when discovered while transforming its importer.

`npm run build` emits TypeScript modules/declarations to `dist/lib` and Vite browser
assets to `dist/site`. Production compilation excludes tests and scripts. The package
allowlist excludes tests, fixtures, caches, and the example bundle. No fixture
payload decoding or execution occurs in builds. Tests import generated JavaScript
only to check its literal data boundary. Dependencies are development-only and
locked in package-lock.json. Vite is an optional peer for consumers using the Vite
entry point. Runtime imports have no compiler or Node-only imports. The package
exports separate runtime/compiler/vite subpaths and a local CLI bin; tooling and
the compiler cannot enter browser bundles through the runtime entry point.
No community plugin loading exists.

`tooling/project.mjs` holds identity-parametrized app/agent templates. `npm run sync`
copies the small dependency-free scaffolder into `packages/create`, synchronizes
its private manifest/version, and generates installed topic docs/manifest. This is
deliberate generated duplication checked in CI, not a second template authority.
Both packages are packed locally without publishing. The scaffolder creates new
apps with npm or pnpm command guidance (npm by default). Installation and lockfile
generation are delegated to that manager. pnpm controls its existing shared store;
the framework has no custom dependency storage, linking or cleanup. Existing manager
declarations/locks are checked before onboarding writes; conflicts are refused.
The framework repository continues to use npm and package-lock.json.
The scaffolder creates new directories only, requires an explicit local main-package tarball while private,
and never installs dependencies. `init` explicitly merges a marked
AGENTS.md block and missing scripts, retaining user content and script conflicts.
There are no postinstall hooks. The CLI reads docs shipped alongside compiled code.

The external integration check packs both packages and the installed Vite version,
installs them in an OS temp directory outside this checkout (Vite transitive
dependencies may use npm's cache or registry),
and exercises the installed binaries/exports, docs, source edits, located errors,
recovery, state reset and production counter. It uses no workspace symlinks. npm ci
must run first. Browser bundle checks reject Node-only
tooling markers. Documentation fences for supported source examples compile in CI.
Use `npm run test:external -- --manager pnpm` to run the same checks with pnpm.
The harness reports SKIP if its local pnpm CLI is unavailable. Both manager modes
verify the selected lockfile only, selected command guidance and unchanged locks
after onboarding. No store configuration or store cleanup is performed by the test.

Phase 3A.1 allocates journal containers on their first actual use. Original dependency
sets remain immutable undo data; unchanged edges keep their subscriptions instead
of cloning and reconnecting them. Queue snapshots are captured only when nonempty.
Empty lifecycle hooks do no work. A child mount validates and initializes props as
before; its initial propagation effect refreshes props to preserve custom-mount
behavior, while no-op refreshes allocate no undo containers. Class caches allocate their input
map on evaluation, rather than allocating an unused empty map first.

Lists separate key lookup from ordered records. A pure reorder reuses the lookup
map only after all keys and membership are validated. Membership changes allocate
a new map, while the previous ordered array remains available for rollback. Removed
scopes still survive until successful commit. The longest increasing subsequence
and focus restoration are retained. See [stabilization measurements](performance-stabilization.md)
and the [pending security review checklist](security-review-phase3a1.md).

For expressions containing only root-signal references and approved pure operators,
`fixedSources` verifies the actual AST and resolves stable signal identities once.
These effects subscribe after their first evaluation and run without dependency
collection thereafter. Member paths and conditions retain dynamic read traces;
unchanged traces allocate no dependency Set. A changed trace is deduplicated and its
edges compared before replacing subscriptions. Rollback invalidates changed traces,
and disposal releases them. Pure computed effects ignore self-invalidation while refreshing their own dirty
inputs, including dynamic member paths; explicit circular-read guards remain active.
Scheduler removal targets the owning queue and reclassifies work queued during an
initial scope/prop effect before its structural/propagation flag was installed.

A retained disposer previously kept the caller's mount target through the shared
parameter environment, even after owned nodes and props were released. The mount
now clears that reference in a finally block after initial rendering, including
failure. Updates retain their own live anchors/parents. The public Element-target
signature is unchanged; the internal nullable reference exists only to release it.
Firefox retention probes sample targets and class instances as well as props/nodes.

## Resource controls and merged history

The tokenizer rejects oversized source and excessive indentation before constructing a
full token/AST graph. The parser tracks view depth, recursive expression depth, total
expression nodes, and literal/argument collection sizes. Defaults are exported and each
compile call may supply narrower or wider positive safe-integer limits. These checks are
compiler policy only; identity and configured suffixes remain tooling concerns.

Phase 3A.3 gives every public mount one shared component-tree budget. Component, live
record, framework DOM-node and reactive-effect reservations happen before allocation;
detached staged records and initial effects use that same budget. Work accounting spans
the outer synchronous mount or update. Rollback and disposal release reservations, while
recovery resets only operation work so cleanup cannot be blocked by the failed operation.

Component-import discovery, cycle detection, ordering and longest-depth calculation are
iterative. A real-path map counts shared dependencies once, while cumulative UTF-8 source
bytes and parsed AST complexity are charged to each distinct module. Bottom-up validation
preserves existing import semantics without recursive graph traversal.

The reconciled engine retains lazy Map journals and immutable dependency undo sets,
not the incoming branch's separate linear journal. Recovery restores those sets
directly; cleanup failures are aggregated and unrecoverable participants disabled.
Loop bindings use own data properties, including names such as `__proto__`.
The generator retains incoming literal-binding bitmasks alongside dependency metadata;
the runtime proves constant expressions directly so older models remain compatible.
Historical performance reports measure their named versions, not this combination.
