# Phase 2E: initial runtime hardening

Phase 2D's classes, instances, computed state, keyed lists, typed handlers and
lifecycle cleanup are implemented. This first Phase 2E step keeps that grammar.

Dynamic ranges now insert relative to their live anchors. A staging
DocumentFragment is emptied when mounted, so retaining it as an insertion target
breaks subsequent nested condition/list updates and can move keyed records out
of the document. The live anchor also follows retained records during reorders.
Existing keyed records and their DOM nodes remain in place unless moved or removed.

Text bindings compare the evaluated string with the existing text node before
writing. A changed dependency with the same rendered result causes zero character
data mutations. The previous implementation produced one redundant mutation in
the Firefox regression fixture; a changed result still produces one mutation.
This is a DOM mutation observation, not a throughput or memory benchmark.

Run npm run build followed by npm run test:browser. The Firefox regressions cover
nested conditions, lists inside condition branches, conditions inside keyed
records, retained node identity across moves, insert/remove, safe hostile text,
branch remounting, detached handlers and idempotent disposal. Tests use the built
runtime and compiler-generated component modules, without executing application
source during compilation. Existing browser tests cover dev and production apps.

Remaining Phase 2E work includes event batching/computed dependency ordering,
large-list reconciliation benchmarks, startup/bundle and retained-memory profiling,
compiler resource limits for hostile input, and further security review. Current
list reconciliation is not claimed to minimize every possible reorder. The
generator still emits a validated serialized model interpreted by the runtime;
specialized generated binding code remains future work. No scalability or timing
guarantees are claimed. Security-sensitive changes require independent human
review before merging, per AGENTS.md and GOVERNANCE.md.
