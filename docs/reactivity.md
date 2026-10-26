<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Phase 3A reactivity

Phase 3A preserves the Phase 2D grammar, closed expressions, safe-integer checks,
writable-list validation and public mount/dispose APIs. It adds no JavaScript
execution, HTML insertion, virtual DOM, dependency or asynchronous scheduling.

The compiler exports `dependencies(expression)` and `analyzeDependencies(ast)`.
Analysis returns deduplicated symbol/member paths for component/class computeds,
source-located DOM bindings, conditions, collections and keys. State initializer
edges are identified separately: `snapshot = count` initializes once and does not
create an ongoing dependency. These APIs operate on ASTs without executing source.
Generated models carry dependency paths on bound expression roots. Models produced
by earlier compilers still work through dynamic read tracking.

Phase 3A.1 records actual closed-expression reads in each mounted scope once per
effect, rather than walking dependency paths and then evaluating the same expression.
For ASTs limited to root signals and approved pure operators, those signal identities
are verified once and subscribed after the first evaluation. Member paths and
conditions keep dynamic read traces; unchanged traces require no dependency Set.
Changed traces retain immutable undo sets and are cleared on rollback/disposal.
Metadata still supplies compile-time dependency analysis and static binding hints;
literals need no redundant empty hint.
Literal bindings and static child props allocate no subscription effects. Conditions
retain dynamic short-circuit tracking; iteration tracks the collection and keys in
its item scope. Compiler paths for these expressions are conservative analysis,
not permission to evaluate an inactive condition operand. Class/type remain static
attributes under the approved syntax; text, value and checked update in place.

Component computed values cache outputs in signals, invalidate affected descendants
and notify bindings only when outputs change. Class computed members cache both
results and input values, including transitive class-computed chains. Validation
and multiple consumers reuse the result. Value snapshots keep caches correct after
rollback and same-key instance replacement; no permanent class subscription survives
a removed consumer. Both compiler cycle diagnostics and runtime recursion guards
reject circular computed dependencies. Scheduler feedback is bounded; explicit
sequential computed reads inside handlers are not counted as scheduler loops.

A handler and nested class actions share one synchronous batch:

1. Statements see earlier writes immediately. A computed read refreshes dirty inputs.
2. The journal allocates undo containers only when needed and records original
   signal values, dirty flags and changed dependency sets. Original sets remain
   immutable undo data; unchanged edges keep their existing subscriptions.
   Class validation, computed derivations and child props settle before DOM work.
3. Affected structural scopes and bindings prepare render plans. New scopes mount in
   detached fragments; removed scopes remain alive but are excluded from the update.
   Every active list validates all desired primitive keys before structural commit.
4. Plans commit only after preparation succeeds. Text/properties compare values;
   conditionals replace their owned range. Keyed lists retain records and use the
   longest increasing subsequence to avoid moving already ordered ranges. Pure
   reorders retain the validated key map and keep the old order array for rollback. Reorders
   preserve child state, focus and selection.
5. Successful commits dispose removed scopes. Every owned cleanup is attempted even
   when one cleanup throws. Disposal stops effects, removes queued work/listeners,
   clears scopes/props and releases owned DOM references. Repeated disposal is safe.

Invalid keys, arithmetic, mutations or failed staged mounts restore the batch's
state and subscriptions before any live DOM commit. This includes preceding writes
and multiple list regions. A recoverable DOM commit failure restores previous owned
ranges and binding values before restoring reactive state. Already removed scopes
are not destroyed until the whole commit succeeds. Cleanup failures are reported
**after** a successful commit; they do not undo that commit or revive disposed scopes.

These are framework ownership guarantees, not arbitrary host-side transactions.
An input event's external DOM edits, caller-owned objects, custom mount callbacks
and other host JavaScript side effects cannot generally be undone. If host DOM
operations repeatedly fail and restoration is impossible, the affected owner is
disposed to stop subscriptions and listeners. A hostile DOM override can also prevent
physical removal; no sandbox or general process-resource guarantee is provided.
Security-sensitive changes require independent human review before merging.

Use `npm run test:browser` for Firefox identity, computed chains, batching, forms,
nested ranges/components, keyed permutations, injected mounting/DOM/cleanup errors,
rollback recovery and observed WeakRef retention. See [performance](performance.md)
for reproducible comparisons and measured costs. The existing catalog example and
scaffold already exercise computed fields, keyed lists, actions and typed events;
their syntax is unchanged.

Phase 3A.1 skips empty lifecycle transactions. Initial prop refreshes remain active,
including changes made by custom mount callbacks; no-op refreshes allocate no undo
containers.
Actual lifecycle statements, prop validation, safe-integer checks, list checks and
failure recovery remain active. See [performance stabilization](performance-stabilization.md)
for production-build comparisons and memory-measurement limits.

The completed mount also releases its caller-target parameter reference, which
otherwise remained reachable through retained disposer handles. Dynamic updates
continue through their own live anchors/parents, and disposal releases those scopes.

Dirty inputs refreshed during a pure computed evaluation do not requeue that same
computation. Root and dynamic member chains have evaluation-count regressions;
actual circular reads still throw before a cached value can be reused.

## Shared resource budgets

Transactions end before trusted host cleanup code runs and never cross an asynchronous
boundary. JavaScript getters, proxies and component mount/cleanup functions can execute
arbitrary host code and must be reviewed by the application. See security.md and
limitations.md for the trust and resource boundaries.


Compiler graph limits and runtime tree budgets are described in security.md and
limitations.md. Reservations include staged DOM/effects/records/components and are
released on rollback/disposal. Framework work and scheduled effect executions are
bounded; trusted host callbacks are not sandboxed. The merged engine restores
recorded dependency sets directly rather than re-running effects to recover.
