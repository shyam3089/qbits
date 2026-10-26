# qubits
A declarative UI language and framework for building reactive web interfaces, designed for simplicity, extensibility, and excellent developer tooling.
# Qubits UI — Phase 3A.1

A small UI language compiling to browser JavaScript. Components support nested
standard elements, numeric/string/boolean local state, read-only typed props with literal defaults,
relative component imports, static classes, text and checkbox input binding, typed state conditions and ordinary external CSS imports.
Phase 2D adds file-local data classes, computed values, typed keyed lists, closed
event actions, and component initialization/cleanup. Use `text=expression` and
`str(value)` for safe text content. Blocks use spaces and colon headers; newlines end statements.
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
output). Optional third-argument props override defaults. The return value disposes
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

See [architecture](docs/architecture.md), [renaming](docs/renaming.md),
[contributing](CONTRIBUTING.md), [governance](GOVERNANCE.md), and [security](SECURITY.md).
Software is licensed under [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for
creator attribution, [third-party notices](THIRD_PARTY_NOTICES.md), and
[brand guidance](TRADEMARKS.md) for the Qubits name and logo. Packages remain private
and unpublished. GitHub Actions jobs are disabled; their configuration is retained
for future review. Nothing here publishes packages or deploys a website.

Conditions support `==`, `!=`, `and`, and `not`. Classes omit inheritance, custom
constructors, access modifiers, static members, action parameters, and unrestricted
methods. Lists require a non-empty homogeneous literal for type inference. `or`,
ordering comparisons, filtering/sorting/index expressions, additional controls,
routing, SSR, plugins, LSP/editor extensions, native targets, and a registry are
deferred. Component children/slots and state-preserving HMR are also deferred.
No performance claim is made without a benchmark.

Phase 3A adds compiler dependency metadata, cached class-computed chains, static
binding elision, and transactional DOM preparation. Synchronous batches update only
affected text/properties/regions. Keyed lists preserve nodes, child state, focus and
selection. Duplicate keys and recoverable rendering failures roll back state and
subscriptions. The indentation grammar and public mount API are unchanged.
Run `npm run bench:phase3` after building for Firefox comparisons at 1,000/10,000
rows. See [reactivity semantics](docs/reactivity.md) and [measurements](docs/performance.md)
for correctness boundaries, measured costs and remaining optimization work.

Phase 3A.1 reduces empty transactions, redundant expression walks and subscription
churn while preserving failure recovery. Run `npm run bench:stabilization` for
repeated Firefox production-build comparisons with nested component and computed
chain workloads. See [results and measurement limits](docs/performance-stabilization.md).
