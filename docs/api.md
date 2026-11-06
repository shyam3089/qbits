# Qbits v0.1.0 beta API

This document freezes the supported surface for `v0.1.0-beta.1`. A feature is not
stable merely because it is exported or present in generated code. The exact `.qb`
grammar in [syntax.md](syntax.md) and the interfaces listed below are the beta contract.

## Supported language

The beta language includes relative component and CSS imports; typed literal props;
primitive and typed-list state; file-local data classes; computed values; conditions;
keyed iteration; text, input, and checkbox bindings; closed actions; lifecycle hooks;
one unnamed slot; root-class forwarding; shared reactive state; and typed child events.
The compiler rejects syntax outside [syntax.md](syntax.md). Generated output is an ES
module and is intended to be used with the matching Qbits runtime version.

Client-side routing is experimental. Its currently documented static, parameter, and
fallback routes are tested, but its syntax and navigation behavior may change between
beta prereleases. Nested routes and guards are not supported.

## Package entry points

There is intentionally no `qbits` root export.

- `qbits/vite` exports `languagePlugin(options?)`. Supported options are the compiler
  graph-limit overrides documented in [security.md](security.md). Vite `^6.3.5` is an
  optional peer dependency because compiler-only and runtime-only consumers do not need it.
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
later beta with a changelog entry.

## Generated component mount

A compiled component's default export accepts `(element, runtime, props?, initialState?)`
and returns an idempotent disposer. `props` overrides declared literal defaults.
`initialState` may seed declared typed list state with host records; values are copied and
validated before commit. The disposer may expose `refresh()` and `updateState(state)`;
those handle members are experimental during the beta. Slot-content and event-map
parameters used between generated components are internal ABI.

Use the runtime and generated component output from the same Qbits version. Cross-version
generated-code/runtime compatibility is not promised during the beta.

## CLI and scaffolder

The `qb` executable supports:

- `qb compile <input.qb> <output.js>` with graph-limit flags.
- `qb check [path ...] [--json]` with graph-limit flags. JSON `schemaVersion: 1`,
  diagnostic fields, and exit codes documented in [commands.md](commands.md) are supported.
- `qb init` and `qb docs [--agent|topic]`.

The `create-qb` executable accepts a new directory plus `--package-manager npm|pnpm`.
For local candidate testing it also accepts `--framework <local.tgz>` and
`--vite <local.tgz>`; those two override flags are experimental release tooling.
The scaffolder never overwrites an existing target or installs dependencies.

## Compatibility and changes

Qbits supports Node.js 22 and later, ES modules, and Vite `^6.3.5` for the Vite plugin.
Runtime verification is performed in Firefox; other browsers are not yet a release-gated
compatibility claim. npm and pnpm application flows are supported as documented.

During the `0.1.0-beta.*` series, supported APIs will not change silently. Any necessary
breaking beta change must be called out in the changelog and release notes with migration
guidance and a version bump. Experimental surfaces may break between prereleases under
the same disclosure rule. After `0.1.0` stable, Qbits will follow Semantic Versioning:
breaking supported-API changes require a major release, additions a minor release, and
backward-compatible fixes a patch release.

See [limitations.md](limitations.md) for deferred features and operational boundaries.
