<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Security

Implemented controls: parsing never executes application source; generation serializes
literals; the runtime uses DOM text nodes, not HTML insertion; no community plugin
execution or postinstall exists. Compiler-proven static bindings still use text nodes or
typed DOM properties. All accepted numeric values and arithmetic results are finite safe
integers. Synchronous transactions validate and prepare structural changes before commit;
failed preparation leaves committed DOM identities and subscriptions intact. If rollback
recovery itself fails, the original and recovery errors are reported and participating
components are disabled instead of continuing with uncertain state.

A cleanup error after structural commit is reported as a post-commit error; it does not
roll back committed state. Component mount/cleanup functions, application JavaScript,
prop getters and proxies, Vite configs, and npm dependencies are trusted host code with
normal permissions. Transactions are synchronous only and do not span timers, promises,
network activity, or other asynchronous work. These controls are not a sandbox. Resource
limits for hostile source, values, strings, or collections are not implemented.

init runs only explicitly, rejects symlink instruction files, preserves unmanaged
instructions and conflicting scripts, and refuses malformed managed markers. The
scaffolder refuses existing targets and never runs installation. Check skips symlinks,
hidden directories, node_modules and dist. Review source/config/dependencies, use a
lockfile, keep development servers local, and require independent review for
security-sensitive changes. The Phase 3A.1 checklist prepares that review but does not
constitute approval. Software is licensed under Apache-2.0; see LICENSE and NOTICE.
