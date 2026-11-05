# qbits
A declarative UI language and framework for building reactive web interfaces, designed for simplicity, extensibility, and excellent developer tooling.
# Qbits UI — Phase 3D.1

A small UI language compiling to browser JavaScript. Components support nested
standard elements, numeric/string/boolean local state, read-only typed props with literal defaults,
relative component imports, static classes, text and checkbox input binding, typed state conditions and ordinary external CSS imports.
Phase 2D adds file-local data classes, computed values, typed keyed lists, closed
event actions, and component initialization/cleanup. Use `text=expression` and
`str(value)` for safe text content. Blocks use spaces and colon headers; newlines end statements.
Phase 3A.3 preserves that syntax while adding iterative module-graph limits, shared
runtime resource budgets, transactional rollback, compiler-marked static bindings,
and repeatable Firefox performance measurements.
Phase 3D.1 adds one default `slot` for reusable parent-child layouts. Slotted content
retains its parent's reactive scope, keyed identity, rollback behavior, and cleanup.
See the [composition example](examples/composition/App.qb).
The example mounts two independent counters. Instance classes merge into a single
root element's defaults; ambiguous forwarding is an error.
See the [grammar](docs/syntax.md) and [identity reference](docs/identity.md).

Requires Node.js 22+ and npm. From the repository root:

```sh
npm ci
npx playwright install firefox
npm run sync:check
npm run dev
```

Open the local URL Vite prints. Stop with Ctrl+C. Build and validate:

```sh
npm run build
npm run test:docs
npm test
npm run test:rename
npm run test:external
npm run cli -- docs --agent
```

Run build before tests: browser tests check both development and `dist/site`.
Linux systems may need `npx playwright install --with-deps firefox`.
The CLI produces an ES module: import its default mount function and call
`mount(element, runtime)` using the exports from `runtime/index.ts` (or its compiled
output). Optional third-argument props override defaults. An optional fourth argument
seeds typed list state from API records; the list declaration supplies its item schema,
for example `mount(element, runtime, {}, {products: apiProducts})`. Records are copied
into reactive class instances and validated before DOM commit. The return value disposes
the component, nested instances and listeners. Source component/CSS imports are
retained for Vite; a CLI output module must retain resolvable import paths.
Use the Vite build for a complete production application.
Source edits automatically recompile and fully reload the browser. Located errors
appear in Vite's overlay; fixing source reloads the app without restarting Vite.
Component HMR/state preservation is not implemented; state resets on reload.

Follow [local package/scaffolder setup](docs/local-packages.md) to create an app
with locally packed private packages. It documents the target registry command,
the distinct main/scaffolder packages, and explicit onboarding for existing apps.
While packages are private, the scaffolder requires an explicit local main-package
tarball; it never assumes registry availability. Commands use local binaries, with no global
installs. See [commands](docs/commands.md) for machine-readable checking and init.
The generator accepts `--package-manager npm|pnpm` (default npm). See
[package managers](docs/package-managers.md) for selected commands, optional shared
storage and non-global pnpm setup. Existing projects retain their manager and locks.

The package ships version-matched [agent guidance](docs/agent.md) and topic documents.
Generated applications get a small root AGENTS.md linking into those installed docs.
Initialization is explicit, preserves user instructions/scripts, and is repeatable.
There is no postinstall that changes projects or installs agent integrations.
The external test creates an app outside this checkout using local tarballs and
Vite dependencies from npm's cache or registry; run npm ci first. It checks reload,
error recovery, installed docs, CLI, onboarding, production and browser boundaries.

See the [changelog](CHANGELOG.md), [release notes](RELEASE_NOTES.md),
[architecture](docs/architecture.md), [renaming](docs/renaming.md),
[contributing](CONTRIBUTING.md), [governance](GOVERNANCE.md), and [security](SECURITY.md).
Software is licensed under [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for
creator attribution, [third-party notices](THIRD_PARTY_NOTICES.md), and
[brand guidance](TRADEMARKS.md) for the Qbits name and logo. Packages remain private
and unpublished. GitHub Actions jobs are disabled; their configuration is retained
for future review. Nothing here publishes packages or deploys a website.

Conditions support `==`, `!=`, `and`, and `not`. Classes omit inheritance, custom
constructors, access modifiers, static members, action parameters, and unrestricted
methods. Lists require a non-empty homogeneous literal for type inference. `or`,
ordering comparisons, filtering/sorting/index expressions, additional controls,
routing, SSR, plugins, LSP/editor extensions, native targets, and a registry are
deferred. Named/fallback slots and state-preserving HMR are also deferred.
No performance claim is made without a benchmark.

Phase 2E adds synchronous reactive batching, computed dependency ordering, tracked
child prop updates, and keyed reconciliation that minimizes retained range moves.
DOM identity, child state, focus and selection are preserved; unchanged values skip
DOM writes. Disposal releases subscriptions, listeners and retained state, including
failed mounts. Run `npm run bench:reactivity` after building. See
[measurements and validation](docs/performance.md) for the baseline comparison and limitations.
