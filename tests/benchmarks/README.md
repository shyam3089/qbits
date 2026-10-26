# Historical benchmark runtimes

These are immutable test-only Qubits runtime snapshots, retained for reproducible
Firefox comparisons. `provenance.json` records original git revisions, source and
emitted SHA-256 hashes, and TypeScript transpilation settings. Regenerate a snapshot
by reading that revision's `runtime/index.ts` with `git show` and using the recorded
TypeScript `transpileModule` settings. Do not import them from builds, package them,
or use the pre-guard implementation in applications. They retain the repository's
Apache-2.0 license. Run the benchmark via `npm run bench:phase3`; see
`docs/performance.md` for measurement limitations.

The Phase 3A runtime/generator snapshots were captured from the working tree before
Phase 3A.1, not from a claimed commit. Their hashes and the generator's test-only
relative import adjustment appear under `workingTreeSnapshots` in provenance.json.
`npm run bench:stabilization` bundles both versions with the installed Vite production
minifier. Diagnostic function/allocator instrumentation runs in separate pages;
it never enters production timing modules or ordinary builds.
