# Architecture

`language/` is a pure source-to-module pipeline: tokenize → parse → validate →
generate. `compile(source, filename)` returns `{ast, code}` or throws `CompileError`
with structured `diagnostic`. Each stage and AST types are exported from
`language/index.ts` for future tooling. Tokens and all AST constructs carry spans.
No stage evaluates source or resolves application imports.

The lexer emits NEWLINE/INDENT/DEDENT from space-indented logical lines, ignoring
blank/comment-only lines. The parser accepts only colon-headed blocks and an
explicit `StringConversion` AST node for `str(state)` in button text. Runtime
rendering uses `String(value)`; old brace syntax is rejected. See docs/syntax.md.

`runtime/` owns DOM creation, local state, click listeners, and disposal. Its
`CounterModel` interface is the boundary with generated code. User names never
become JS identifiers. Literal text uses JSON serialization and DOM text nodes.
Safe-integer overflow throws without changing state.

`tooling/` owns identity validation, CLI filesystem access, and Vite transformation.
The Vite plugin compiles configured suffixes and appends identity metadata; the
compiler itself knows neither branding nor suffixes. Vite invalidates source modules
and explicitly triggers full reloads, including after failed transforms. Component
HMR/state preservation is unsupported; component state resets on reload. Source maps are deferred, while
compile diagnostics retain original locations. `examples/` contains only the demo.

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
