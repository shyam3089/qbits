# Phase 3A.1 performance stabilization

The stabilization changes preserve syntax, public mount APIs, safe-integer/list
validation, batching, keyed identity and transactional failure recovery. They improve
several measured medians, but **do not eliminate all regressions**, particularly tail
latency. No overall speed or heap-size claim is made.

## Profiled causes and changes

The Firefox diagnostic run instruments copied framework function declarations and
Set/Map allocation/operation counts. Production latency runs use separate pages and
unmodified Vite-minified modules. Instrumented self times include probe overhead;
use them as diagnostics, not production timings. Actual observed work included:

| Observation at 1,000 nested rows | Phase 3A | Phase 3A.1 |
| --- | ---: | ---: |
| Mount transaction calls | 4,001 | 2,000 |
| Mount journal Maps allocated | 20,005 | 0 |
| Mount expression-evaluator calls | 66,065 | 52,053 |
| Initial class-computed input Maps | 4,004 | 2,002 |
| Journal Maps per 100 update events | 500 | 300 |
| Expression-evaluator calls per 100 updates | 5,000 | 3,900 |
| Dependency Sets per 100 steady update events | 800 | 0 |
| Signal subscription removals/additions per 100 updates | 1,200 / 1,300 | 0 / 0 |
| Key lookup Maps allocated per pure reorder | 1 | 0 |

The original mount eagerly created transaction containers for empty lifecycle hooks
and initial no-op prop refreshes. Empty hooks now return immediately; journals
allocate containers on first actual use. The initial refresh is retained because a
custom mount callback can change parent state; a regression test covers this API
case. No-op refreshes still create their small journal object, but no undo containers.
The journal keeps a stable property layout and snapshots queues only when nonempty.

Dependency connection previously walked references and then evaluated the expression
again, cloning dependency Sets and reconnecting subscriptions on each run. Fixed
subscriptions now qualify only after checking the actual AST for root-signal reads
and approved pure operators. Member paths and conditions retain dynamic read traces.
Stable traces allocate no Set; changed traces preserve immutable undo sets. Rollback
and disposal release traces. Pure computeds avoid self-requeue while pulling
dirty inputs, including dynamic member paths; cycle guards and scheduler feedback limits remain active.

An intermediate collector reduced allocation counts but regressed update latency.
It was replaced after repeated timing experiments; fewer allocations alone were not
accepted as evidence of faster execution. No individual optimization is assigned a
precise share of the timing gain. Class-cache input Maps are now allocated on first
evaluation, redundant class-string processing is skipped on unstyled native nodes,
and literal dependency hints are omitted from generated models.

Lists validate every desired key before planning. Pure reorders share the validated
lookup Map and retain the previous order array as undo data. Membership changes
still build a new Map. Temporary entry objects/filter arrays and unnecessary position
arrays were removed. LIS reconciliation, staged scopes, focus/selection behavior,
rollback, cleanup-after-commit and fail-closed disposal remain active. Scheduler work
is removed from its owning queue, with initial category transitions handled explicitly.

## Production-build comparison

[Raw samples, profiles and hashes](benchmarks/stabilization-2026-10-24.json) were
recorded on 24 October 2026: Windows 10.0.26200, Intel Core i3-1115G4, Node 22.16.0,
Firefox 157.0, Vite 6.4.4, Playwright 1.64.1, TypeScript 5.8.3. Both versions use the
same installed minifier, browser, fixture source and options. Phase 3A's preserved
runtime and generator snapshots have provenance in `tests/benchmarks/provenance.json`;
they represent the prior working tree, not a claimed commit. Their runtime hash
matches the earlier Phase 3A report. The new compiler only omits redundant literal
metadata; the source, data, DOM workload and actions are otherwise identical.

Three trials alternate version order, with fresh pages. Each trial warms up two
mount/dispose cycles, then measures seven mount/dispose cycles. Update warmup is
2,000 events; seven batches of 1,000 events follow. Reorders have two warmup pairs
and seven measured last-to-first moves; reset moves are excluded. The nested fixture
also measures a computed diamond with two writes per action and a dynamic member
pull case, each after its own warmup.

The table uses **median / p95**, then before -> after. Each statistic combines all
21 observations; p95 uses nearest rank `ceil(0.95 * n)`. Update values are elapsed
batch time divided by 1,000, **not individual-event tail latency**. Timings include
synchronous handlers, checks, DOM work, listener accounting and MutationObserver
recording. Paint/layout after the handler is excluded. Firefox's coarse clock and
shared machine load limit precision; 1 ms differences are not universal guarantees.

| Workload | Rows | Mount ms, p50/p95 | Update microseconds/event, p50/p95 | Reorder ms, p50/p95 |
| --- | ---: | --- | --- | --- |
| Light keyed rows | 1,000 | 20/24 -> 18/21 | 29/37 -> 32/49 | 1/1 -> 1/2 |
| Light keyed rows | 10,000 | 110/125 -> 98/107 | 40/54 -> 57/89 | 9/10 -> 6/9 |
| Nested products | 1,000 | 74/87 -> 64/83 | 57/76 -> 54/95 | 1/2 -> 1/3 |
| Nested products | 10,000 | 1634/2092 -> 1336/1755 | 77/105 -> 66/87 | 17/28 -> 13/62 |

The light fixture has 1,010/10,010 elements. The nested fixture has 7,009/70,009
elements, with 2,000/20,000 Row/Badge component instances, class computed
chains, component computed chains, controlled inputs and local Row state. It
uses only existing language features. It models component/form work, not network,
checkout, routing or a complete commerce application.

The nested computed-diamond cost changed 27/36 -> 24/26
microseconds/event at 1,000 rows, and 42/70 -> 36/52 at 10,000.
The separate dynamic constructor/member pull-on-read case changed
29/51 -> 23/28 at 1,000 rows and 39/81 -> 44/79 at 10,000. That action
reads a derived member twice after updating its constructor input; the regression
tests assert one evaluation per actual input change, not just equal output values.
Median nested 10,000-row throughput changed from about
12,987 to 15,152 synchronous events/second. Each isolated update wrote two
text nodes and no structural nodes. Both versions retained live row/child DOM and
the activated child's local state during updates and reorders.

Remaining regressions include light update median/tails, the light 1,000-row reorder
tail, nested 1,000-row update/reorder tails, and the 10,000-row dynamic-pull median.
The nested 10,000-row reorder tail also worsened despite a better median. Disposal
medians were 3 -> 3 ms and 15 -> 18 ms for light 1,000/10,000 rows; nested medians were
17 -> 16 and 246 -> 290 ms. These observations remain in the report; their exact causes
are not established by the allocation counts. Additional GC/CPU sampling and runs on
other machines are needed before attributing tails. In particular, the larger nested
workload showed substantial variation between development runs. Do not compare these
production results directly with the older unminified Phase 3A harness's quoted
26/34-microsecond observations. There is no across-the-board stabilization claim.

## Size and memory

Literal hint omission saves 100 raw generated bytes / 90 minified bytes in both
fixtures. Compressed app-module savings are only 3-6 bytes. The standalone minified
runtime grows from 26,151 to 28,580 bytes (gzip 7,092 -> 7,769). The example's Vite JS
grows from approximately 27.70 to 28.92 kB (gzip 7.79 -> 8.37 kB). There is **no overall
bundle-size reduction**: fixed-source proof, read traces and target release cost code.
Single module-load/compile observations are recorded but are not used to claim faster
cold startup.

The broader retention probe found a real retained-reference issue: five disposed
handles kept all five detached caller mount targets alive in Phase 3A. Replacing the
root loop alone did not release them. Clearing the completed mount's target parameter
in a finally block released that reference while preserving the Element-target API
and live-anchor updates. The implementation also clears it when mounting fails.

Every measured run balanced listeners, removed owned nodes and retained live row/child
identity. After five additional mount/update/dispose cycles, with disposer handles
kept alive, Firefox `requestGC` observed five reachable sampled mount targets in the
baseline and zero in Phase 3A.1, across every workload/trial. Both versions observed
zero sampled supplied-prop objects, first-row nodes and class instances (five class
instances sampled per run). New regressions cover target/instance release and failed
transaction retention remains tested. Sampling does not prove every object is
collectible or measure peak/live heap bytes.

This Firefox build exposes neither `performance.memory` nor
`performance.measureUserAgentSpecificMemory`; the report records this capability
result. No heap-byte savings are invented. Dynamic traces retain arrays of signal
references while mounted, and fixed effects share an empty trace. Fewer transient
Maps/Sets do not establish lower retained or peak heap usage. Larger heap-retention
workloads and privileged profiler/OS tooling remain future measurement work.

## Reproduce and validate

Run these commands in the framework checkout, not in a scaffolded app or installed
package. Tests, profiling tools and snapshots are intentionally not shipped.

```sh
npm ci
npm run sync:check
npm run build
npm run test:docs
npm test
npm run test:rename
npm run test:external
npm run test:external -- --manager pnpm
npm run bench:stabilization -- --sizes 1000,10000 --trials 3 --samples 7 --events 1000 --warmups 2 --output results.json
npm run bench:stabilization -- --mode profile --sizes 1000 --output profiles.json
```

Default benchmark output is `.tools/stabilization/latest.json`. `--mode timing` skips
instrumentation; `--scenarios light,realistic` selects workloads. `--candidate path`
accepts a trusted saved framework runtime for controlled experiments. Production
timing modules are bundled using Vite's installed production minifier. Normal builds
never import/execute profiling code or snapshots, and packed packages exclude them.
Only Firefox is launched. npm remains the repository manager; pnpm is tested only
in standalone generated apps with its own store and lockfile.

Seven added Firefox regressions cover dependency rollback, safe literal metadata
omission, fixed-root and dynamic-member evaluation counts, initial prop refresh
after custom mounting, retained target/instance release, and malformed zero-length
action-body rollback. The original 45 tests remain, for 52 total. Security evidence and the required separate review are recorded in the
[prepared checklist](security-review-phase3a1.md); no independent review is claimed.

Next priorities: profile the remaining tails/disposal costs, measure dynamic-trace
heap costs with suitable tooling, and evaluate smaller specialization code without
removing guard or rollback coverage. No deferred language or application features
are introduced by this work.
