# Phase 3A.2 security hardening review record

This is an implementation review record, not an independent approval, certification, or
claim of complete security. Independent human review remains mandatory before merge.

## Reviewed boundary

The review covered compiler tokenization/parsing/validation/generation, generated model
transport, runtime DOM rendering, props, reactive transactions, keyed reconciliation,
component mounting/disposal, and the Firefox test/benchmark harness. Arbitrary host
JavaScript, component mount/cleanup functions, getters, proxies, build configuration,
dependencies, browser bugs, and asynchronous side effects remain trusted or external.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Deep or oversized untrusted source and collections had no explicit work limits, permitting stack or memory exhaustion. | Fixed with configurable source, nesting, expression, collection, component-depth, and scheduler limits plus regression tests. |
| Defense in depth | A loop variable named `__proto__` used assignment on a derived scope. Null-prototype framework scopes prevented the suspected pollution path in focused reproduction. | Own-property definition was retained as hardening and a minimized regression was added; this was not a reproduced exploit. |
| Low | Runtime `move` truncated/coerced malformed host-model indexes. | Fixed by requiring a safe integer before mutation. |
| Informational | Getters, proxies, and host mounts can execute arbitrary code and side effects. | Documented trusted boundary; throwing cases verify no framework DOM is left behind. |
| Informational | Duplicate keyed data can be created while its view is inactive. | Activation fails transactionally and rolls back; documented limitation and stress coverage retained. |

The later Phase 3A release-gate audit found unresolved aggregate compiler-graph and
component-tree exhaustion paths, so the earlier zero-High statement was inaccurate.
Phase 3A.3 records their remediation separately and still requires independent human
review. Searches and generated-code tests found no `eval`, `Function`, `innerHTML`, HTML
injection, or application-source execution path in compiler/runtime production code.
