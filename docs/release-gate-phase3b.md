# Phase 3B release gate

Candidate: Qubits 0.1.0 on `phase3b-compiler-startup`, based on main revision
`7f0257e3bac8ebc77855f1afb9fb44d12d2ba8a3`. No merge, tag, publication, or
Phase 3C work is included.

## Decision: PASS

Review was limited to the Phase 3B diff. Constant folding retains typed model data,
constant branches emit no executable source expressions, static bindings still render
untrusted strings as text, and the reused child runtime adapter preserves the existing
limits and shared budget. One weakened generated-model assertion was restored. No
confirmed High or Critical security or integrity finding remains.

Validation completed with Node 22.22.2 and Firefox 157.0:

- `npm run build`, `npm run sync:check`, and `npm run test:docs`
- `npm test` (47/47), plus the focused compiler test (10/10)
- `npm run test:rename`
- external npm and pnpm 12.15.0 tarball checks
- `npm audit --audit-level=low` (zero vulnerabilities)
- `npm pack --dry-run --json` for `qubits` and `create-qb`

Two paired Firefox runs show the 1,000-component static nested mount median improving
from 16 ms to 9 ms and from 14 ms to 10 ms. The generated 1,000-node module is 15 raw
bytes and 11 gzip bytes smaller. Runtime cold-start medians regressed by 1 ms in both
orderings (3 to 4 ms and 2 to 3 ms); one p95 regressed by 1 ms and one was unchanged.

Compiler results do not establish a p95 improvement: compile p95 was 26-34% slower in
both runs, while generated-module startup p95 was worse once and equal once. These
21-sample Firefox measurements have millisecond timer granularity and visible JIT and
scheduler variance, so tails are evidence of a limitation, not a generalized speedup.

The user explicitly waived independent human review for this gate. This AI verification
is release evidence, not security certification. Trusted host JavaScript and async side
effects remain outside the transactional and sandbox guarantees.
