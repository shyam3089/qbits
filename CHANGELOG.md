# Changelog

## 0.1.0-beta.2 - Unreleased

- Cancel staged list commits after their owning range is disposed, safely releasing
  prepared records, components, effects and DOM reservations without disabling the app.
- Reject mutations of computed lists in compiler validation and the runtime, preserving
  read-only derived values and consistent cached state after failed transactions.
- Charge recursive expression evaluation and every `count` input item against the shared
  `maxWorkPerOperation` budget, including nested components and synchronous transactions.
  Custom low ceilings may now reject workloads that previously escaped accounting;
  review those limits without relying on the former undercounting.
- Add focused compiler and Firefox regressions for disposal, cleanup, keyed identity,
  rollback, recovery and work ceilings; require exact expected rows in the seeded security test.
- Retain the frozen beta APIs, `.qb` syntax, default limit values and Apache-2.0 notices.

## 0.1.0-beta.1 - 2026-11-06

- Added typed components, props, state, computed values, keyed lists, lifecycle hooks,
  one default slot, shared reactive state, child events, and experimental routing.
- Added compiler graph limits, shared runtime budgets, transactional rollback, and
  identity-preserving keyed reconciliation.
- Added the `qb` CLI, Vite plugin, local onboarding, and npm/pnpm scaffolding flows.
- Froze the supported beta API, documented experimental surfaces and compatibility,
  and narrowed published files to public documentation and built library artifacts.
- Added deterministic compiler, runtime, Firefox, packaging, rename, and external-package coverage.
- Raised the minimum supported Vite version to `^6.4.5`, resolving
  `GHSA-8g5g-mxqh-grgj`; the updated lockfile audits with zero known vulnerabilities.
