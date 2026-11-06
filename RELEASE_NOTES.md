# Qbits 0.1.0-beta.1 release candidate

The framework was renamed from Qubits to Qbits. The npm package and language identity
change from `qubits` to `qbits`; imports must use `qbits/compiler`, `qbits/runtime`, and
`qbits/vite`. The `.qb` extension, `qb` executable, and `npm create qb` initializer remain
unchanged. No compatibility alias for the unpublished `qubits` package is provided.

This first public-beta candidate freezes the supported language, compiler, runtime,
Vite, CLI, and scaffolder surfaces described in [docs/api.md](docs/api.md).

Highlights:

- Iterative module-graph traversal with configurable aggregate limits.
- Shared runtime budgets across nested component trees and staged mounts.
- Transactional failure recovery that preserves committed identity, state, focus and subscriptions.
- Default slots, shared reactive state, typed child events, and lifecycle cleanup.
- Local npm/pnpm scaffolding, existing-project onboarding, and machine-readable checks.
- Explicit experimental labels for routing and low-level compiler/runtime exports.

The manifests are configured for public packages, but nothing has been published,
tagged, or released. Independent human security review and explicit publication
authorization remain required. Existing automated checks are not a security certification.
