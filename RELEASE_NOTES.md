# Qbits 0.1.0-beta.2 release candidate

The framework was renamed from Qubits to Qbits. The npm package and language identity
change from `qubits` to `qbits`; imports must use `qbits/compiler`, `qbits/runtime`, and
`qbits/vite`. The `.qb` extension, `qb` executable, and `npm create qb` initializer remain
unchanged. No compatibility alias for the unpublished `qubits` package is provided.

This candidate retains the language, compiler, runtime, Vite, CLI and scaffolder
surfaces frozen for beta.1 and described in [docs/api.md](docs/api.md). It is prepared
from the verified remediation commit `ec1f3c5` without adding APIs or syntax.

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

Retained beta highlights:

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

Beta.2 preparation produces local candidate tarballs only. Existing beta.1 tags and
npm staged submissions remain unchanged; this preparation creates no tag, npm stage,
approval or publication. Independent human security review, authenticated ownership
and provenance prerequisites, and explicit approval for the exact release remain
required. Existing automated checks are not a security certification.
