<!-- Generated for Qbits 0.1.0-beta.2 by npm run sync. -->
# Commands

Installed app commands come from the root README/AGENTS.md. npm: npm install, npm run dev, npm run check, npm run build. pnpm: pnpm install, pnpm run dev, pnpm run check, pnpm run build. See [package managers](package-managers.md); never change an existing app manager silently.
No global install is needed. Scripts resolve the local qb binary.

Explicit onboarding for existing apps after installing the local package:

```sh
npm exec -- qb init
npm run qb -- docs --agent
npm run qb -- docs syntax
npm run qb -- check src --json
```

init preserves existing instructions and conflicting scripts. It does not install dependencies,
modify Vite configuration, or attach agent integrations. It adds a managed guidance section
and missing local CLI/check scripts. For pnpm use pnpm exec instead of npm exec, and pnpm run <script> <args> without the npm argument separator. init detects existing manager declarations/lockfiles, preserves them, and refuses conflicts or unsupported managers before writing. If script names conflict, retain your existing scripts
and invoke the installed binary with npm exec -- qb instead.
Check defaults to src; specify other directories/files as needed. Human compile/check
errors show file:line:column, a source line and caret, plus a targeted hint where available.
The same imported error is reported once, even when several scanned files import it.
check --json keeps schemaVersion 1 on failures, including invalid graph-limit options;
it writes one JSON object to stdout, with nonzero exit status and no human stderr.
Vite dev overlays and production build errors carry the failing source location and frame.
Save a correction to recover dev errors; rerun check/build after fixing source. It validates relative component imports, missing CSS, cycles, prop schemas and root-class forwarding without executing application source.
Compile emits one ES module and retains source/CSS import specifiers; keep imports resolvable when relocating output. Use Vite build to bundle a complete production app. Mount accepts (element, runtime, optionalProps) and returns an instance disposer. JSON schemaVersion 1
returns ok, filesChecked, diagnostics; each diagnostic has kind (syntax/io), filename,
line, column, span and message. Lines/columns are one-based, spans zero-based exclusive.
Exit 0 means valid; exit 1 means syntax, I/O, usage, or no-source errors.

Target scaffolding: npm create qb myapp requires create-qb.
This candidate is not published. See the repository's README for local tarball commands.
Never rely on npm fetching it until an authorized release is confirmed in the registry.
