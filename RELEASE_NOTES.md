# Qbits 0.1.0 release candidate

The framework was renamed from Qubits to Qbits. The npm package and language identity
change from `qubits` to `qbits`; imports must use `qbits/compiler`, `qbits/runtime`, and
`qbits/vite`. The `.qb` extension, `qb` executable, and `npm create qb` initializer remain
unchanged. No compatibility alias for the unpublished `qubits` package is provided.

Phase 3A.3 hardens compiler and runtime resource handling without changing approved `.qb` syntax or the public compiler, runtime and Vite export paths.

Highlights:

- Iterative module-graph traversal with configurable aggregate limits.
- Shared runtime budgets across nested component trees and staged mounts.
- Transactional failure recovery that preserves committed identity, state, focus and subscriptions.
- Linearized validator member, action and prop lookup paths.
- Firefox-only adversarial, performance and external-package verification.

The packages remain marked private until publication is explicitly authorized. This release candidate was verified with an AI-assisted security and quality gate. It is not a security certification.
