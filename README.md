# Qbits

Qbits is a small, typed, indentation-based UI language that compiles to browser
JavaScript. It provides fine-grained reactivity, keyed lists, components, one default
slot, shared reactive state, typed child events, lifecycle hooks, and safe text/property
rendering without executing source expressions.

The supported 1.0.1 public surface is frozen in the [API reference](docs/api.md). See the
[complete grammar](docs/syntax.md), [compilable examples](docs/examples.md), and
[current limitations](docs/limitations.md). The client-side router and low-level
compiler/runtime internals are experimental as described in the API reference.

Requires Node.js 22+. For npm versions/policies that permit dependency install scripts,
installing directly into a new empty directory prepares Hello World:

```sh
mkdir myapp
cd myapp
npm install qbits
npm run dev
```

No existing project files are overwritten. Transitive/global/linked installs skip
automatic setup. Vite is an optional Qbits dependency, installed during the original
npm operation; the hook never runs a nested installation or changes script approvals.

**Lifecycle limitation:** with disabled lifecycle scripts, a policy that blocks
the package's install script, or omitted optional dependencies, the
four-command flow is unavailable: no app files or dev script can be generated. These
policies are respected. Creating an empty folder inside an existing npm project may
also cause npm to select the ancestor project; it is left untouched by Qbits setup.
Patch publication and live registry availability are separate from local preparation.
Firefox is the verified browser; other compatibility claims are qualified in the API reference.

To work on the framework itself, run from the repository root:

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
from release-candidate tarballs. It documents the distinct main/scaffolder packages
and explicit onboarding for existing apps. Commands use local binaries, with no global
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
[brand guidance](TRADEMARKS.md) for the Qbits name and logo. Packages are configured
for public distribution; preparation does not publish packages or deploy a website.
Registry release actions and GitHub Actions administration require separate authorization.

Qbits batches synchronous reactive changes, orders computed dependencies, updates
child props without remounting, and reconciles keyed ranges while preserving DOM
identity, child state, focus, and selection. Disposal releases subscriptions, listeners,
and retained state, including failed mounts. No performance claim is made without a
measurement; the existing methodology and results remain in
[performance documentation](docs/performance.md).
