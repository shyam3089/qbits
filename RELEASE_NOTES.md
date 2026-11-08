# Qbits 1.0.1 release

This patch adds Hello World initialization when a lifecycle-enabled npm directly
installs Qbits into a new empty application. It reuses existing templates, supplies
Vite as an optional dependency, and does not change language or runtime APIs.
Files are created exclusively; existing applications and transitive installs skip setup.

The exact four-command workflow depends on install scripts being permitted. Disabled
scripts, policies that block the hook, and omitted optional dependencies prevent setup.
The installer does not bypass those policies. Publication must remain
blocked if the required client cannot complete the packed-artifact workflow unchanged.

<!-- qbits-release:start -->
Version: `1.0.1`; tag: `v1.0.1`; date: 2026-11-08.
<!-- qbits-release:end -->

## Previous stable release

Version: `1.0.0`; tag: `v1.0.0`; date: 2026-11-08.

The framework was renamed from Qubits to Qbits. The npm package and language identity
change from `qubits` to `qbits`; imports must use `qbits/compiler`, `qbits/runtime`, and
`qbits/vite`. The `.qb` extension, `qb` executable, and `npm create qb` initializer remain
unchanged. No compatibility alias for the unpublished `qubits` package is provided.

This release promotes the verified `0.1.0-beta.2` baseline at `85afa955`
without adding features, changing runtime behavior or updating dependencies. The
supported public surface in [docs/api.md](docs/api.md) is frozen under Semantic
Versioning starting with 1.0.0.

Experimental interfaces remain outside that guarantee: client-side routing; parser,
validator, generator and AST exports; generated models and the low-level runtime ABI;
`mountCounter`; disposer `refresh`/`updateState` extensions; and local-tarball override flags.
Generated components and runtimes must use the same Qbits version.

Compatibility requires Node.js 22+, ES modules and Vite `^6.4.5` for the Vite plugin.
Firefox is release-gated; other browser compatibility is not claimed by this preparation.
Transactions remain synchronous, development uses full reload, and SSR, routing guards,
nested routes and the other features in [limitations.md](docs/limitations.md) remain unsupported.

After both 1.0.1 packages are published, the default npm flow is:

```sh
npm create qb myapp
cd myapp
npm install
npm run check
npm run dev
npm run build
```

The scaffolder pins the generated Qbits dependency to its own version and creates
files without installing dependencies. Local tarball verification exercises npm/pnpm,
the default create command, production builds and Firefox before any publication.

Security and correctness fixes since beta.1:

- Disposed list ranges cancel their staged commits and release prepared resources.
  Hiding a list and appending in the same transaction preserves the surrounding app;
  lifecycle cleanup errors remain observable without committing discarded work.
- Computed lists reject `append`, `remove`, `move` and `sort` in the compiler and runtime.
  Failed mutations preserve cached derived state, keyed DOM identity and subscriptions.
- Recursive expression visits and every `count` input item consume the shared root-tree
  work budget, including nested components and synchronous transactions. Exhaustion is
  bounded and deterministic, with rollback and recovery covered by Firefox regressions.

Work-budget compatibility: the `maxWorkPerOperation` option and its default remain
unchanged, but the accounting is stricter. Applications with low custom ceilings may
fail earlier and should review those limits for their trusted workloads. Existing
syntax, public signatures and Apache-2.0 notices are unchanged.

Core capabilities retained from beta.2:

- Iterative module-graph traversal with configurable aggregate limits.
- Shared runtime budgets across nested component trees and staged mounts.
- Transactional failure recovery that preserves committed identity, state, focus and subscriptions.
- Default slots, shared reactive state, typed child events, and lifecycle cleanup.
- Local npm/pnpm scaffolding, existing-project onboarding, and machine-readable checks.
- Explicit experimental labels for routing and low-level compiler/runtime exports.

Dependency security evidence (Phase 3F.2.1, 2026-11-07):

- Raised the minimum supported Vite version from `^6.3.5` to `^6.4.5` in the
  development dependency, optional peer dependency, API documentation and generated
  scaffolder manifest. Vite 6.4.5 is the minimum release that patches
  `GHSA-8g5g-mxqh-grgj`, which affects 6.4.4.
- `npm audit --json` reported zero known vulnerabilities at every severity after the
  lockfile update. Build, sync, documentation, the full test suite, Node.js 22 plugin
  checks, Firefox checks, and external npm/pnpm tarball applications passed with Vite
  6.4.5. This automated evidence does not replace independent human security review.

Release execution and partial outcomes are reported by scripts/release.ps1.
