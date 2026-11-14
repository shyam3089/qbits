# Qbits v1.0.1 public API

This document freezes the supported public surface for `v1.0.1`. A feature is not
stable merely because it is exported or present in generated code. The exact `.qb`
grammar in [syntax.md](syntax.md) and the supported interfaces listed below are the stable contract.

## Supported language

The supported language includes relative component and CSS imports; typed literal props;
primitive and typed-list state; file-local data classes; computed values; conditions;
keyed iteration; text, input, and checkbox bindings; closed actions; lifecycle hooks;
one unnamed slot; root-class forwarding; shared reactive state; typed child events; and
component-owned text WebSockets.
The compiler rejects syntax outside [syntax.md](syntax.md). Generated output is an ES
module and is intended to be used with the matching Qbits runtime version.

Client-side routing is experimental. Its currently documented static, parameter, and
fallback routes are tested, but its syntax and navigation behavior may change between
releases outside the stable API guarantee. Nested routes and guards are not supported.

## Package entry points

There is intentionally no `qbits` root export.

- `qbits/vite` exports `languagePlugin(options?)`. Supported options are the compiler
  graph-limit overrides documented in [security.md](security.md). Vite `^6.4.5` is an
  optional peer dependency. It is also an optional package dependency for automatic
  app setup; compiler-only/runtime-only installs may omit optional dependencies.
- `qbits/compiler` supports `compile(source, filename?, options?)`, `CompileError`,
  `formatCompileError`, diagnostics, and compiler/module limit types and defaults.
  `compile` returns generated `code`; its returned `ast` is experimental.
- `qbits/runtime` is the runtime namespace passed to generated mount functions.
  `RuntimeLimits` and `defaultRuntimeLimits` are supported configuration types. The
  `mountComponent*` functions and model types are a generated-code ABI, not a hand-authored
  application API. `mountCounter` is a legacy test/example helper and is experimental.

The tokenizer, parser, validator, generator, AST shapes, generated model objects, and
other transitive exports from `qbits/compiler` or `qbits/runtime` are experimental.
They remain exported for tooling and generated-code compatibility but may change in a
later release with a changelog entry outside the stable API guarantee.

## Generated component mount

A compiled component's default export accepts `(element, runtime, props?, initialState?)`
and returns an idempotent disposer. `props` overrides declared literal defaults.
`initialState` may seed declared typed list state with host records; values are copied and
validated before commit. The disposer may expose `refresh()` and `updateState(state)`;
those handle members are experimental. Slot-content and event-map
parameters used between generated components are internal ABI.

Use the runtime and generated component output from the same Qbits version. Cross-version
generated-code/runtime compatibility is not promised for this internal ABI.

## CLI and scaffolder

With dependency install scripts enabled, a direct `npm install qbits` in a new empty
directory creates Hello World and an existing `dev` script. Existing projects,
transitive installs and linked/global installations are left alone. npm supplies
Vite through the optional dependency; omitted optional dependencies disable setup.
Install-script approval policies that block the package and `ignore-scripts`
prevent this lifecycle from running. The four-command flow is unavailable under those
policies; Qbits does not change approvals or bypass them.

The `qb` executable supports:

- `qb compile <input.qb> <output.js>` with graph-limit flags.
- `qb check [path ...] [--json]` with graph-limit flags. JSON `schemaVersion: 1`,
  diagnostic fields, and exit codes documented in [commands.md](commands.md) are supported.
- `qb init` and `qb docs [--agent|topic]`.

The `create-qb` executable accepts a new directory plus `--package-manager npm|pnpm`.
The default registry command is `npm create qb myapp`. It generates an application
with the matching Qbits version; then run `cd myapp`, `npm install`, `npm run check`,
and `npm run dev`. Both registry packages must be published before this path is available.
For local candidate testing it also accepts `--framework <local.tgz>` and
`--vite <local.tgz>`; those two override flags are experimental release tooling.
The scaffolder never overwrites an existing target or installs dependencies.

## Compatibility and changes

Qbits supports Node.js 22 and later, ES modules, and Vite `^6.4.5` for the Vite plugin.
Runtime verification is performed in Firefox; other browsers are not yet a release-gated
compatibility claim. npm and pnpm application flows are supported as documented.

Starting with `1.0.0`, the supported public APIs follow Semantic Versioning:
breaking supported-API changes require a major release, additions a minor release, and
backward-compatible fixes a patch release. Experimental interfaces listed above are
excluded from that stability guarantee; changes require a changelog entry and migration
guidance. The stable version introduces no new language features or runtime behavior
relative to `0.1.0-beta.2`.

See [limitations.md](limitations.md) for deferred features and operational boundaries.
