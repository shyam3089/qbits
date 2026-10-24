<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Security

Implemented controls: parsing never executes application source; generation serializes
literals; the runtime uses DOM text nodes, not HTML insertion; no community plugin
execution or postinstall exists. init runs only explicitly, rejects symlink instruction
files, preserves unmanaged instructions and conflicting scripts, and refuses malformed
managed markers. The scaffolder refuses existing targets and never runs installation.
Check skips symlinks, hidden directories, node_modules and dist. List mutations validate writable state targets and argument types in the compiler and runtime; safe-integer arithmetic guards reject invalid numeric writes. Synchronous validation and duplicate-key failures restore signal values, derived dirty flags and subscriptions before DOM commits. DOM plans prepare detached scopes and restore the previous owned DOM on recoverable reconciliation failure; irrecoverable host DOM failures dispose the affected owner. Cleanup errors do not skip remaining resources. These controls do not make arbitrary host JavaScript or DOM overrides transactional.

These controls are not a sandbox. Resource limits for hostile input are not implemented.
Application JavaScript, Vite configs, npm dependencies and build tooling run with their
normal host permissions. Recommended: review source/config/dependencies, use a lockfile,
keep development servers local, and require independent review for security-sensitive
changes. Recommendations and founder approval policies do not enforce GitHub permissions.
No agent integration is automatically installed or activated. Software is licensed under Apache-2.0; see LICENSE and NOTICE.
