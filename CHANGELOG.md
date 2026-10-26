# Changelog

## 0.1.0 - 2026-10-25

- Added iterative, graph-wide module limits for module count, import depth, UTF-8 source bytes and aggregate AST complexity.
- Added shared per-root runtime budgets for component instances, list records, DOM nodes, reactive effects and synchronous work.
- Preserved staged mounting, transactional rollback, keyed identity, focus, subscriptions and cleanup under failed updates.
- Replaced quadratic validator lookups with indexed Map and Set lookups while retaining diagnostics.
- Hardened runtime numeric validation and accounted prop, state and class-field initialization against operation budgets.
- Added deterministic adversarial, Firefox runtime, packaging, rename and external npm/pnpm integration coverage.
