<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Security

Implemented controls: parsing never executes application source; generation serializes
literals; the runtime uses DOM text nodes, not HTML insertion; no community plugin
execution or postinstall exists. init runs only explicitly, rejects symlink instruction
files, preserves unmanaged instructions and conflicting scripts, and refuses malformed
managed markers. The scaffolder refuses existing targets and never runs installation.
Check skips symlinks, hidden directories, node_modules and dist.

These controls are not a sandbox. Resource limits for hostile input are not implemented.
Application JavaScript, Vite configs, npm dependencies and build tooling run with their
normal host permissions. Recommended: review source/config/dependencies, use a lockfile,
keep development servers local, and require independent review for security-sensitive
changes. Recommendations and founder approval policies do not enforce GitHub permissions.
No agent integration is automatically installed or activated. License selection is pending.
