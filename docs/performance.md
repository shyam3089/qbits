# Phase 3A.1 performance and reactivity

Phase 3A.1 keeps the Phase 2D grammar and public mount API. It stabilizes the
fine-grained runtime with synchronous transactions, compiler-marked static bindings,
and lower-cost ownership cleanup. Compilation still emits serialized data and fixed
runtime calls; it never executes application source.

## Profiled root causes

The Phase 2D Firefox harness ran its baseline first and its candidate second without
warmup, so identical runtime bytes measured 141 ms and 65 ms for the same mount. It
also reported single sub-millisecond updates, which was too coarse for microsecond
comparisons. The Phase 3A.1 harness warms each candidate and reports repeated medians
and p95 values.

Source and allocation profiling identified three justified production changes:

1. Literal `text`, `value`, and `checked` attributes created effects, dependency sets,
   and subscription work even though the compiler already proved they were static.
2. Every descendant element allocated a removal closure although removing an owned
   subtree root already removes its descendants.
3. Full state snapshots would make successful transactions scale with component size.
   Rollback only needs the directly changed writable signals; derived values and DOM
   can be recovered by invalidating outward from those restored sources.

Keyed reconciliation was already efficient: ordered updates skip the longest-increasing-
subsequence search, reordered records move once, construction is untracked, and retained
DOM and child component identity are preserved. No replacement algorithm was justified.

## Runtime behavior

Generated element models now carry an additive numeric bitmask for compiler-proven
static bindings. New runtimes initialize those DOM values directly and create no effect
for them. Older runtimes ignore the field, and the new runtime continues to accept models
without it.

Handlers, nested class actions, lifecycle statements, and prop refreshes share one
synchronous transaction. A reusable journal records only the first old value of each
directly changed writable signal. Successful updates allocate no state snapshot and do
not clone component state. On failure, the runtime restores journaled signals, clears
uncommitted scheduler work, and invalidates subscribers from the restored sources so
computed caches, dynamic subscriptions, and DOM return to the last committed state.
Safe-integer overflow is rejected before mutation.

Bindings still subscribe only to values read during their execution. Computed values
remain cached and settle before DOM effects. Equality checks suppress redundant writes.
Keyed lists preserve identity, focus, and selection. Disposal stops effects, removes
listeners, runs every cleanup, clears retained references, and removes owned subtree
roots rather than every descendant individually.

## Firefox measurements

[Recorded observations](benchmarks/reactivity-2026-10-24.json) were captured on
24 October 2026 with Firefox 157.0. Both candidates used the same current compiler-
generated fixtures in separate Firefox pages. Each candidate received three warmups.
Mount/update samples contain 21 observations; each update observation averages 1,000
synchronous operations. Reorder uses 15 warmed samples. Times include DOM event dispatch
and reactive work. Results are machine observations, not universal guarantees.

| Scenario | Phase 2D median | Phase 3A.1 median | Phase 2D p95 | Phase 3A.1 p95 |
| --- | ---: | ---: | ---: | ---: |
| 1,000-row lightweight mount | 7 ms | 5 ms | 13 ms | 8 ms |
| 10,000-row lightweight mount | 47 ms | 33 ms | 104 ms | 46 ms |
| Isolated row update | 39 us | 17 us | 125 us | 82 us |
| Computed diamond/two-write chain | 14 us | 10 us | 22 us | 21 us |
| 1,000-row last-to-first reorder | <1 ms | <1 ms | 2 ms | 1 ms |
| Nested child-prop update | 39 us | 17 us | 563 us | 283 us |
| Heavy 1,000-row mount + dispose | 63 ms | 51 ms | n/a | n/a |

The 10,000-row mount target is met with a 33 ms median, below 152 ms. Isolated
updates are below the 40 us target. The retained-range reorder still inserts/removes
three boundary nodes, creates no elements, performs no text writes, and preserves focus,
selection, DOM identity, and child state.

Firefox did not expose `performance.memory`. After explicit Playwright GC, the WeakRef
probe observed zero reachable supplied-prop objects and zero reachable rendered nodes
for both candidates while retaining 30 disposed handles. Listener balance and empty
mount targets were also verified; these observations are not a formal leak proof.

## Bundle and startup tradeoff

The built runtime changed from 24,297 to 26,634 bytes raw and from 5,528 to 5,940
bytes gzip. The example production JavaScript changed from 19.67 to 20.51 kB minified
and from 5.23 to 5.50 kB gzip. The increase pays for synchronous rollback and recovery;
the static-binding bitmask was selected instead of duplicating literal values in the
model. Removing rollback would save bytes but violate the Phase 3A.1 safety guarantee.

## Reproduce

Run `npm run build`, then `npm run bench:reactivity`. For a same-process comparison,
save a built baseline runtime and run:

```sh
npm run bench:reactivity -- --baseline /path/to/runtime.js --output docs/benchmarks/result.json
```

The benchmark uses Firefox only. Fixtures and instrumentation remain under `tests/`
and `scripts/` and are excluded from production modules. Timing is not a CI threshold;
correctness tests assert DOM operations, rollback, cleanup, and identity separately.
