<!-- Generated for Qbits 1.1.0 by npm run sync. -->
# Agent entry point

Use only this installed version (1.1.0) of Qbits. Load guidance by topic:
- [api](api.md): frozen public surface and experimental features.
- [syntax](syntax.md): approved indentation grammar and HTTP surface through Stage 4E.
- [HTTP](http-stage4e.md): queries, resources, clients, actions, files, transfers, connections and services.
- [examples](examples.md): compilable UI, HTTP and e-commerce examples.
- [commands](commands.md): setup, checks, init, docs and builds.
- [security](security.md): enforced controls versus recommendations.
- [limitations](limitations.md): supported subset and reload behavior.

Do not invent syntax. Qbits supports only the documented language, including typed HTTP resources/actions, file bindings, transfers, WebSockets/SSE and root-scoped services. Ordinary HTTP actions have no cancellation API; only transfers support `cancel()`. WebSocket/SSE authentication cannot use bearer providers or custom headers. Handlers remain closed typed statements; application JavaScript is not accepted. Request founder approval before adding operators, methods, event members, controls, inheritance, asynchronous effects, or other executable forms. Use the selected manager commands in the root AGENTS.md. npm: npm run check and npm run build; pnpm: pnpm run check and pnpm run build. See [package managers](package-managers.md).
