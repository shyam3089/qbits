# Historical benchmark runtimes

These are immutable test-only Qubits runtime snapshots, retained for reproducible
Firefox comparisons. `provenance.json` records original git revisions, source and
emitted SHA-256 hashes, and TypeScript transpilation settings. Regenerate a snapshot
by reading that revision's `runtime/index.ts` with `git show` and using the recorded
TypeScript `transpileModule` settings. Do not import them from builds, package them,
or use the pre-guard implementation in applications. They retain the repository's
Apache-2.0 license. Run the benchmark via `npm run bench:phase3`; see
`docs/performance.md` for measurement limitations.
