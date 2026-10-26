# Phase 3A.1 security review checklist

Status: prepared for review; **no independent security review has occurred**.
Do not merge these changes until a separate human reviewer completes this checklist
and records approval. Documentation does not enforce repository permissions.

The external trust boundaries are unchanged: source is parsed/validated into a
closed JSON model; the runtime interprets only approved operations and writes text
nodes/properties. Compilation never executes source. No new dependencies, plugin
execution, HTML insertion, eval/Function, permissions or network services were added.

Models are compiler-produced plain data, not a general-purpose JavaScript object
execution API. Host-created objects/getters and custom mount callbacks retain host
privileges. Untrusted source must pass compiler validation.

Internal ownership changes needing review:

- Undo maps/sets are allocated on first use; every changed value/dirty flag must
  still be recorded before mutation. Nonempty scheduler queues retain snapshots.
- Previous dependency sets are immutable undo data. Stable edges keep subscriptions;
  changed edges are restored on failure. The shared empty set and fixed-effect empty read trace must stay empty.
- Fixed subscriptions are selected from actual ASTs limited to root-signal reads,
  literals and approved pure operators. Member paths/conditions remain dynamic.
  Dynamic read traces must be cleared on dependency rollback and disposal.
- Effects track actual expression reads once, including short-circuit conditions.
  Compiler dependency metadata is an optimization hint, not permission to skip
  type, writable-target, safe-integer or key validation. Pure computed effects
  ignore self-invalidations while refreshing dirty inputs; this relies on all
  approved computed expressions being pure. Propagation effects are not skipped,
  and circular-read guards remain active.
- Pure reorders share the key map only after complete key/membership validation.
  Membership changes use a fresh map, and old order/index data survives until commit.
- Initial and subsequent child propagation still validate and batch prop writes,
  including changes made by custom mount callbacks. No-op refreshes allocate no undo
  containers; empty hooks have no statements. The empty-block shortcut must accept
  genuine Arrays only, preserving errors/rollback for zero-length array-like or
  inherited-function action bodies.
- Mount targets are cleared from the shared parameter environment in a finally
  block after initial rendering. Live updates use their local parents/anchors;
  the public Element-target signature remains unchanged.

Independent reviewer checks:

- [ ] Trace overflow, invalid list target/type/index and duplicate-key failures;
      verify preceding writes, caches, queues and subscriptions restore correctly.
- [ ] Trace repeated failed instance swaps and dependency-edge changes; verify
      unchanged subscriptions are retained and obsolete subscriptions are released.
      Verify fixed-source proof, first subscription timing, short-circuit behavior,
      computed read-after-write, duplicate evaluation counts and queue transitions.
- [ ] Inject mount, DOM commit/restoration and cleanup failures across nested scopes;
      verify ownership, fail-closed disposal, node identity and post-error updates.
- [ ] Check literal metadata omission preserves safe serialized values and old models.
- [ ] Check disposal and retained handles, including failed transactions; acknowledge
      target, prop, node and class-instance WeakRefs are sampled. Verify target
      release on successful/failed mounts and continued updates after initial mount.
      WeakRef observations cannot prove absence of leaks or bound heap usage.
- [ ] Inspect packed files: profiling instrumentation, snapshots and test fixtures
      must stay outside production output. Re-run all documented checks in Firefox.

Host JavaScript side effects and hostile DOM overrides remain outside general
transaction guarantees. Resource limits were not implemented in that historical Phase 3A.1 snapshot.
The reconciled runtime includes incoming limits; it still provides no sandbox.
Evidence and reproduction commands: [stabilization report](performance-stabilization.md).
Reviewer identity, findings and approval must be recorded separately before merge.

## Incoming review checklist

- Confirm generated modules contain serialized models and fixed runtime calls only; search for `eval`, `Function`, `innerHTML`, and application-source execution paths.
- Verify literal and user-controlled text reaches DOM text nodes or typed DOM properties, including static-binding fast paths.
- Exercise safe-integer overflow before mutation and confirm state and DOM remain at the last committed value.
- Exercise duplicate keyed-list values after an earlier write in the same handler; confirm state, computed values, DOM identity, focus, and subscriptions roll back.
- Inject failures during computed propagation, child mounting, cleanup, and prop refresh; confirm the original error is preserved and owned resources are still released.
- Review the shared synchronous transaction journal for reentrancy, nested class actions, cross-component isolation, and stale scheduler entries.
- Confirm rollback recovery cannot execute arbitrary source and only re-runs already validated reactive effects.
- Verify removed/disposed scopes unsubscribe from every signal and scheduler queue and release supplied props, component references, listeners, and DOM nodes.
- Recheck XSS fixtures in development and production Firefox builds.
- Confirm compiler identity and configured source suffix remain tooling concerns and do not affect runtime semantics.
- Confirm benchmark and test instrumentation is excluded from production output and packed packages.
- Record reviewer, commit, environment, findings, and remediation. Do not merge Phase 3A.1 or proceed to Phase 3B until an independent reviewer signs off.


This reconciliation preserves both checklists; it does not record independent review
of the combined runtime. Historical Phase 3A.2/3A.3 gate evidence does not approve it.
