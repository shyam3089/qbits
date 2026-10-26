# Phase 3A.3 release gate

Historical gate for the candidate below. It does not approve the later
[two-machine reconciliation](merge-2026-10-26.md) or record independent human review.

Candidate: Qubits 0.1.0 based on Git revision
`1529466299be4e6e4636592b4351b826b62d13a0`, with the documented release-gate
worktree changes. No tag, merge, publication or Phase 3B work is included.

## Decision: PASS

The automated gate found and fixed two runtime gaps: initialization work could bypass
`maxWorkPerOperation`, and a directly supplied nested numeric literal could bypass safe
integer validation. Focused Firefox regressions cover exact-limit success, repeated
failure, cleanup, capacity recovery, prop/state/class-field accounting and numeric
rejection. No confirmed High or Critical finding remains.

Validation completed with Node 22.22.2 and Firefox 157.0:

- `npm run build`
- `npm run sync:check`
- `npm run test:docs`
- `npm test` (45 existing tests plus one release regression)
- `npm run test:rename`
- `npm run test:external -- --manager npm`
- `npm run test:external -- --manager pnpm` with an isolated pnpm 10.12.1 CLI
- `npm audit --audit-level=low`
- `npm pack --dry-run --json` for both packages
- two paired `npm run bench:reactivity -- --baseline ...` Firefox runs

Both npm and pnpm external tests installed local tarballs outside the checkout and
verified scaffolding, exports, installed docs/init, CLI/compiler behavior, development
reload and error recovery, and production Firefox bundles. The audit reported zero
vulnerabilities. Package dry-runs retained the expected exports, documentation and legal
files. Versions remain synchronized at 0.1.0.

The candidate adds 228 raw runtime bytes and 22 gzip bytes over the pre-fix Phase 3A.3
runtime. Paired results show no repeatable mount/startup or disposal median regression.
Computed numeric chains pay an expected 3–7 us median validation cost; remaining small
differences are recorded as Firefox/JIT variance in `docs/performance.md`.

Remaining limitations are unchanged: trusted host JavaScript and dependencies are not
sandboxed, asynchronous side effects are not transactional, budgets count framework work
rather than actual heap or layout cost, and packages remain private until publication is
explicitly authorized.

Verification was AI-assisted and is release evidence, not a security certification.
