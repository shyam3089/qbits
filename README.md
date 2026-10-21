# qubits
A declarative UI language and framework for building reactive web interfaces, designed for simplicity, extensibility, and excellent developer tooling.
# Qubits UI — Phase 2B

A small UI language compiling to browser JavaScript. Components support nested
standard elements, numeric/string/boolean local state, read-only typed props with literal defaults,
relative component imports, static classes, text and checkbox input binding, boolean-state conditionals and ordinary external CSS imports.
Use `text=expression` and `str(value)` for safe text content. Button click handlers
support numeric increments and boolean literal assignment. Blocks use spaces and colon headers; newlines end statements.
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
Packages are private. An open-source license decision is pending; no license grant
is implied. Nothing here publishes packages or deploys a website.

Phase 2B defers comparisons, boolean operators, other conditional and assignment forms, event members and controls, loops, routing, SSR, plugins,
LSP/editor extensions, native targets, and a registry. Numeric literals remain
nonnegative safe integers; only documented text/class/value/type/checked properties and click/input/change handlers
are supported. Component children/slots and state-preserving HMR are deferred.
