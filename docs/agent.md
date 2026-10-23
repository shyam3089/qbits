<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Agent entry point

Use only this installed version (0.1.0) of Qubits. Load guidance by topic:
- [syntax](syntax.md): approved indentation grammar through Phase 2D.
- [examples](examples.md): compilable counters, forms, conditions, classes and keyed lists.
- [commands](commands.md): setup, checks, init, docs and builds.
- [security](security.md): enforced controls versus recommendations.
- [limitations](limitations.md): supported subset and reload behavior.

Do not invent syntax. Phase 2D adds documented `class` fields, computed values, parameterless actions, typed list literals, `for … in … key=…`, list append/remove/move, and component init/cleanup blocks. Handlers remain closed typed statements; application JavaScript is not accepted. Mutate only existing writable list-state names, never computed/temporary lists. Numeric arithmetic and writes require safe integers; validation failures roll back the synchronous update before DOM effects. Request founder approval before adding operators, methods, event members, controls, inheritance, asynchronous effects, or other executable forms. Use the selected manager commands in the root AGENTS.md. npm: npm run check and npm run build; pnpm: pnpm run check and pnpm run build. See [package managers](package-managers.md).
