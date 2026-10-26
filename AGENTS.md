# Qubits — Agent Instructions

## Mission
Build a secure, fast, scalable UI framework for large applications. Prioritize correctness, fine-grained reactivity, small bundles, low memory use, and simple indentation-based `.qb` syntax. React/Angular/Vue performance is a benchmark goal, **not** an unverified claim.

## Token-efficient workflow
- Follow the current request; do not explore unrelated features or plan later phases.
- Inspect filenames/symbols first (`rg --files`, `rg -n`); read only relevant ranges. Avoid full-file dumps, broad diffs, and repository-wide scans unless necessary.
- Cap routine command output at ~2,000 tokens; show at most 30 relevant log lines. Expand only to resolve a specific uncertainty.
- Reuse established findings; never reread unchanged files or rerun passing checks without a reason.
- Do not load previous chats, session logs, cross-project memories, or external sources unless explicitly requested or required by the task.
- Make the smallest coherent change. No unrelated refactors, dependencies, generated files, or documentation rewrites.
- Run focused checks during implementation; run relevant full checks once at completion. Report failures, not lengthy passing logs.

## Architecture and compatibility
- Read docs/syntax.md before grammar changes; obtain founder approval for language changes.
- Keep compiler semantics independent of branding/suffixes; edit identity.json and run npm run sync.
- Preserve public APIs, existing `.qb` syntax, component identity, configurable framework name/extension, and external npm/pnpm compatibility.
- Keep code readable and simple. Prefer compiler-time work and targeted DOM updates over runtime abstractions or full subtree reconstruction.
- Preserve computed caching, batching, keyed reconciliation, focus, subscriptions, and lifecycle cleanup.
- Profile before optimizing. Compare identical production workloads in **Firefox only**; report measurements and regressions, never invented speedups.

## Security invariants
- Reject invalid syntax, types, mutation targets, non-finite numbers, and unsafe integer operations on **every** path (including initial, derived, and host-provided values).
- Failed framework-controlled synchronous transactions must preserve committed state, DOM identity, child-local state, and subscriptions. Prepare structural changes before commit; treat post-commit cleanup failures as post-commit errors, not reversible failures.
- Never hide recovery failures. Surface errors and safely disable unrecoverable components.
- Render untrusted strings as text; forbid `eval`, `Function`, unsafe HTML injection, and implicit execution of source expressions.
- Check malformed input, prototype pollution, resource exhaustion, cleanup failures, and unusual event sequences. Trusted host JavaScript and asynchronous side effects are **not** sandboxed or transactionally reversible.
- Never weaken safety for a benchmark. A known High/Critical integrity or security defect blocks merge.

## Validation and reporting
- Add focused regression tests for changed behavior, including failure paths. Use deterministic seeds for fuzz/stress tests.
- Relevant project checks: `npm run build`, `npm run sync:check`, `npm run test:docs`, `npm test`; run rename and external npm/pnpm checks when their surfaces change. Use **Firefox, never Chromium**.
- Do not assume a historical test count: use the current checkout's actual output.
- Keep packages private. Never publish, deploy, change visibility or add secrets; tests and fixtures stay outside production output.
- Before merging security-sensitive changes, require independent human review; do not claim certification.
- Final response: concise summary of changes, tests, measured impact (if relevant), and remaining risks. Do not commit, push, merge, or advance phases unless asked.
