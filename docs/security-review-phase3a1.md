# Phase 3A.1 independent security-review checklist

This checklist prepares an independent review; it does not record or imply approval.

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
