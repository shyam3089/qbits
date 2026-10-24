# Firefox performance observations

Phase 3A preserves the approved grammar and public mount API. See
[reactivity](reactivity.md) for dependency metadata, caching, transactional rendering
and failure semantics. This report compares measured Qubits implementations only.
No React, Angular or Vue numbers are inferred.

## Method

[Raw observations](benchmarks/phase3a-2026-10-24.json) were captured on 24 October
2026 local time (23 October UTC): Windows 10.0.26200, Intel Core i3-1115G4,
Node 22.16.0, Firefox 157.0. Runtime/fixture hashes, individual samples and baseline
provenance are in the report. Historical runtime snapshots are confined to
`tests/benchmarks`; their original revisions and TypeScript settings are recorded
in `tests/benchmarks/provenance.json`. Both snapshots reproduce from those revisions.

Each runtime receives the same current compiler-generated fixture. It contains
1,000 or 10,000 keyed `li` row elements, class-computed text, a stateful child and
controls. Actual element counts are 1,010/10,010; including text/comments there are
4,019/40,019 DOM nodes. This is a row-update workload, not a complete commerce app.

Three trials alternate runtime order, using fresh Firefox pages. Each trial warms
up 30 updates, then records seven batches of 1,000 synchronous events and seven
last-to-first moves (reset moves excluded). Update/reorder columns use medians of
all 21 samples; mount uses three single observations. Timing includes event
execution, safety checks, synchronous reconciliation and MutationObserver recording,
not subsequent paint/layout. Firefox's coarse timer resolution limits small-operation
precision. There are no timing thresholds in correctness tests.

## Before and after

| Rows | Implementation | Mount, ms | Isolated update, microseconds/event | Events/second | Reorder, ms |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | Before Phase 2D guards (`d845f2d`) | 25 | 44 | 22,727 | 1 |
| 1,000 | Phase 2D baseline (`ab4d8b7`) | 28 | 26 | 38,462 | 1 |
| 1,000 | Phase 3A | 36 | 34 | 29,412 | 1 |
| 10,000 | Before Phase 2D guards (`d845f2d`) | 146 | 61 | 16,393 | 7 |
| 10,000 | Phase 2D baseline (`ab4d8b7`) | 152 | 40 | 25,000 | 8 |
| 10,000 | Phase 3A | 188 | 40 | 25,000 | 9 |

The historical safety comparison records mount increases of 3/6 ms and an emitted
runtime increase from 24,297 to 31,518 bytes (gzip 5,528 to 6,892). Measured update
times decreased in that comparison. It compares complete historical implementations,
not an isolated guard-only ablation: JIT behavior, allocation and noise also affect
these numbers. It does not establish that safety checks are free or improve speed.
No safety checks were disabled in the delivered runtime for benchmarking.

Phase 3A introduces transactional preparation/rollback, caches and dependency
connectors. Compared with Phase 2D, the 1,000-row update measurement is slower;
10,000-row throughput is unchanged at this resolution. Mount and larger reorders
are slower. Median mount/dispose cycle observations are 15/150 ms for 1,000/10,000
rows, versus 15/99 ms in Phase 2D. Correctness takes priority; no overall speedup
is claimed. Emitted runtime size is 42,106 bytes, gzip 8,836, versus Phase 2D's
31,518/6,892. These are standalone emitted-module sizes, not minified app bundle
sizes. The current example's Vite JS build is about 27.70 kB (gzip 7.79 kB).

All three runtimes produced two isolated text writes (row and child label), zero
structural writes for that update, and one moved three-node range per reorder
(three removals/insertions, zero text writes). All retained row and child identities.
Phase 3A regression tests separately prove one class-computed evaluation across
validation and multiple consumers, one committed render per binding per batch,
key/DOM failure rollback, and no recreation of unrelated nodes or instances.

The retention probe keeps five disposed handles alive after repeated mounts and
uses WeakRefs plus Playwright `requestGC`. Every run observed zero reachable sampled
props/nodes, zero attached owned nodes and balanced listeners. This is evidence for
these workloads, not heap-byte measurement or proof that every leak is impossible.
Firefox does not expose a portable heap-byte reading here. Failed-transaction
retention has a separate Firefox regression test.

## Reproduce

```sh
npm ci
npm run build
npm run bench:phase3
npm run bench:phase3 -- --sizes 1000,10000 --trials 3 --samples 7 --events 1000 --output phase3-results.json
npm run test:browser
```

Default output is `.tools/phase3a/latest.json`. Use `--runtimes` with comma-separated
runtime paths for other saved comparisons. Baseline snapshots are test-only framework
runtimes, not production inputs; builds never decode or execute them. Tests, scripts
and snapshots are excluded from production modules and packed packages. Only Firefox
is launched. The older `npm run bench:reactivity` and its
[historical report](benchmarks/reactivity-2026-10-23.json) remain available for the
richer 1,000-row form/component workload; those earlier numbers predate safety guards.

Next priorities are profiling transactional journal/plan allocations, list map/range
snapshots and startup closures; specializing generated static/binding code; and
repeating measurements on more machines and browser versions. Key validation remains
linear in list length, as does general keyed reconciliation. No virtualization,
async scheduler, external batching API, state-preserving HMR or resource sandbox is
introduced. Keep rollback, typed validation and subscription integrity when optimizing.
