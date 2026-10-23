# Fine-grained reactive rendering

The compiler still validates the existing grammar and emits a small readable module
containing a serialized, typed component model and a mount function. No application
source is executed during compilation. This milestone changes the runtime, not the
grammar, compiler boundary, public mount signature, or generated module format.

An event follows this path:

1. Generated handler statements execute against state/instance-field signals.
2. Signal writes mark dependent computed values dirty and enqueue affected effects.
3. Nested class actions share the enclosing synchronous batch. Reads inside an action
   refresh dirty computed dependencies immediately, preserving sequential statement values.
4. At the end of the handler, computed dependencies settle before DOM effects run.
   Sets deduplicate queued effects; unchanged computed outputs do not notify DOM bindings.
5. Each text/value/checked binding tracks only the signals it actually reads and
   compares the rendered value before writing. Class/type attributes remain static
   under the approved grammar. Conditional scopes track their condition, and list
   scopes track their collection and item keys, without subscribing to construction
   reads from child props or init statements.
6. A parent-owned effect refreshes only child prop signals. Child DOM, local state,
   and listeners remain mounted. Class computed chains remain lazy and subscribe
   their consuming bindings directly to fields.

Keyed reconciliation reuses records by key, including when an action removes and
appends a new instance with the same key in one batch. New ranges attach once at their final position. The longest increasing
subsequence of old record positions identifies the retained ranges that can stay
in place; other ranges move once. Ordered updates avoid that search. One reusable
key scope replaces per-item key-evaluation scopes. Moves restore focused elements
and input selection when DOM detachment would otherwise lose them. No retained
DOM element is recreated for reordering. Duplicate keys are checked before
structural changes and retain the existing non-rollback behavior for list state.
Validation and arithmetic failures during synchronous update preparation now roll
back signal writes/subscriptions before DOM updates. This adds validation/journal
work; the measurements below predate those correctness guards and do not establish
their performance impact. No new performance improvement is claimed.

Disposal removes effects from signal subscriptions and scheduler queues, clears
listeners and nested scopes, runs cleanup once, and releases state, supplied props
and component references. Cleanup failures do not skip other owned resources.
Ownership is registered before mounting dynamic scopes, so failed child mounts
also unwind already-created records. Repeated disposal and refresh after disposal
are harmless. No production debug counters or new dependencies were introduced.

## Measurements

[Recorded observations](benchmarks/reactivity-2026-10-23.json), recorded 23 October 2026:
Windows, Intel Core i3-1115G4, Node 22.16.0, Firefox 157.0, Playwright 1.64.1.
Baseline: commit `306aa84ccc15ea73fe8bbd25dea542b688cbf8b7`.
The same compiler-generated fixture was run sequentially against baseline and
optimized built runtimes, in separate Firefox pages.

The fixture mounts 1,000 keyed rows with controlled inputs, class-computed text,
handlers and stateful child components. Reorder times are medians of nine measured
last-to-first moves after two warmup cycles. Button lookup, dependency tracking,
DOM instrumentation and focus restoration are included. Reset moves are excluded.
The computed fixture has a forward-declared diamond and two writes in one handler.
For the even-sized mount/dispose cycle sample, the upper middle observation is reported.

| Observation | Baseline | Optimized |
| --- | ---: | ---: |
| Last-to-first retained ranges moved | 999 | 1 |
| Nodes removed / inserted during that reorder | 2,997 / 2,997 | 3 / 3 |
| Elements created / text writes during reorder | 0 / 0 | 0 / 0 |
| Median last-to-first update | 40 ms | 5 ms |
| Text writes for the computed event batch | 4 | 1 |
| Text writes for one isolated field edit | 1 | 1 |
| Nested child prop label after parent field edit | Stale | Updated |
| Input focus and selection after moves | Lost | Preserved |
| Single instrumented 1,000-row mount observation | 216 ms | 198 ms |
| Median mount + dispose, 30 cycles | 168 ms | 156 ms |
| Live listeners / attached nodes after those cycles | 0 / 0 | 0 / 0 |
| Reachable supplied-prop objects after GC, 30 retained disposed handles | 30 | 0 |
| Reachable rendered nodes in that GC probe | 0 | 0 |
| Example app JS, minified / gzip | 17.83 / 4.44 kB | 19.67 / 5.23 kB |

These are actual observations from this machine, not universal speed guarantees.
The single mount observation is not a startup benchmark. Reorder and cycle times have different
sample counts; very small operations hit Firefox's timer resolution. DOM counts,
not time thresholds, are asserted in regression tests. Runtime capability adds
bundle bytes; the generated component module format itself is unchanged.

Firefox did not expose a heap-byte measurement. The memory probe keeps 30 disposer
handles alive, drops other strong references and uses WeakRefs after Playwright's
requestGC. The table reports observed reachable objects, not byte savings or a
guarantee of garbage collection. Listener balance and empty mount targets are
separate resource checks, not a proof that every possible leak is absent.

## Reproduce and validate

Run `npm run build`, then `npm run bench:reactivity`. For a comparison, build the
baseline commit in a separate checkout and save its `dist/lib/runtime/index.js`,
then run `npm run bench:reactivity -- --baseline <saved-runtime.js>`. The benchmark
script uses the existing compiler and Firefox. Its fixtures and instrumentation
are confined to tests/scripts and excluded from production modules and packages.

`npm run test:browser` covers existing dev/production behavior plus computed
read-after-write, same-key replacement, nested props/state, conditional teardown,
duplicate-key recovery, failed mount/cleanup, 1,000-row isolation, repeated mounts,
focus/selection, and prepend insertion without temporary removal. Every four-row permutation is checked against an independent
exhaustive subsequence reference for the minimum number of retained range moves.

The next target is startup: mounting took 198 ms and created 10,003 elements and
7,002 text nodes. Static text/default-prop paths still create effect machinery.
Profile state/effect allocations and static bindings before claiming faster startup
or lower heap usage. Compiler resource limits and specialized generated
bindings remain future work. Security-sensitive changes require independent human
review before merging, per AGENTS.md and GOVERNANCE.md.
