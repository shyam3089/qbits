# Architecture

`language/` is a pure source-to-module pipeline: tokenize → parse → validate →
generate. `compile(source, filename)` returns `{ast, code}` or throws `CompileError`
with structured `diagnostic`. Each stage and AST types are exported from
`language/index.ts` for future tooling. Tokens and all AST constructs carry spans.
No stage evaluates source or resolves application imports.

The tokenizer rejects oversized source and excessive indentation before constructing a
full token/AST graph. The parser tracks view depth, recursive expression depth, total
expression nodes, and literal/argument collection sizes. Defaults are exported and each
compile call may supply narrower or wider positive safe-integer limits. These checks are
compiler policy only; identity and configured suffixes remain tooling concerns.

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
Generated element records include a compact bitmask for compiler-proven literal
text/value/checked bindings. Older runtimes ignore the additive field; newer runtimes
skip effects and subscriptions for those static bindings while accepting older models.
Safe-integer overflow throws without changing state. Controlled text inputs update
their existing DOM value only when it differs, preserving focus and caret while typing.
Checkbox state is synchronized through the DOM `checked` property.
Each state or instance field is a small signal. A DOM binding effect dynamically
subscribes to only the signals it reads. Closed handlers batch writes synchronously;
computed values invalidate derived descendants and settle before queued DOM effects.
Sets deduplicate scheduled effects; equality checks suppress unchanged derived outputs.
Handlers, lifecycle statements, and prop refreshes are synchronous transactions.
The runtime journals only directly changed writable signals. It uses a compact linear
journal because isolated comparison found a reusable identity set slower at the measured
transaction sizes. Numeric values are checked before entering a signal or arithmetic result.
Conditional branches and new keyed records mount in detached fragments and register
commit/rollback hooks. A preparation failure disposes only staged scopes, restores
signals, and reruns affected subscribers, leaving committed DOM and child state intact.
If that recovery fails, an aggregate error exposes the original and recovery failures
and participating components are disabled.
Reads inside actions refresh dirty computed values immediately. Component computed
values propagate through signals, while class computed members evaluate lazily inside
their consuming effect, including references to other class computed members. Conditionals
use comment anchors and branch-local cleanup scopes. Keyed iteration tracks only
collection/key reads; record construction is untracked. A longest increasing subsequence
identifies retained ranges that stay in place; only other ranges move. Focus and input
selection survive moves. Item signals support same-key replacement without recreating
child instances. Duplicate keys are rejected during preparation. Loop variables are
installed as own data properties, including names such as `__proto__`, so source
identifiers cannot alter a scope prototype. Runtime list size, component depth, and
scheduler-flush limits propagate through child mounts. Numeric move indexes are validated
as safe integers before list mutation. Generated mounts also accept typed API records as
fourth-argument initial state. Only declared non-empty list states can be seeded; plain
records are checked against class fields, primitive types, safe-number rules and collection
limits before the first DOM node is committed.

Phase 3A.3 gives every public mount one shared component-tree budget. Component, live
record, framework DOM-node and reactive-effect reservations happen before allocation;
detached staged records and initial effects use that same budget. Work accounting spans
the outer synchronous mount or update. Rollback and disposal release reservations, while
recovery resets only operation work so cleanup cannot be blocked by the failed operation.

Commit updates ranges and reconciliation maps before disposing removed scopes. Disposal
is irreversible: a throwing removed-scope cleanup is reported after commit and does not
roll state back. Transaction guarantees end at the synchronous boundary. Host component
mount/cleanup functions, getters, proxies, and application JavaScript are trusted code
and can perform side effects outside the runtime journal. See reactivity.md and
performance.md for detailed behavior and measurements.

`tooling/` owns identity validation, CLI filesystem access, and Vite transformation.
Component-import discovery, cycle detection, ordering and longest-depth calculation are
iterative. A real-path map counts shared dependencies once, while cumulative UTF-8 source
bytes and parsed AST complexity are charged to each distinct module. Bottom-up validation
preserves existing import semantics without recursive graph traversal.
The Vite plugin compiles configured suffixes and appends identity metadata; the
compiler itself knows neither branding nor suffixes. Vite invalidates source modules
and explicitly triggers full reloads, including after failed transforms. Component
HMR/state preservation is unsupported; component state resets on reload. Source maps are deferred, while
compile diagnostics retain original locations. `examples/` contains focused demos.

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
Default-slot content is compiled as parent-owned views and mounted through the child
layout's insertion point. It therefore reads the parent scope while using the rendered
child depth for shared limits; child disposal owns the projected effects, listeners,
components and DOM ranges.
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
