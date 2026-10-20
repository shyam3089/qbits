# Contributing

Use Node.js 22+, `npm ci`, and `npx playwright install chromium`. Run `npm run dev`
for the counter. Before proposing changes run `npm run sync:check`, `npm run build`,
`npm run test:docs`, `npm test`, `npm run test:rename`, and `npm run test:external`.
The external test installs local tarballs in an OS temporary directory, edits source
through error/recovery, and checks the browser bundle and installed agent docs.
See README.md for the CLI and local scaffolder commands.
The rename check also runs the external app check with alternate package/command identities.
Use `npm run test:external -- --manager pnpm` for the pnpm standalone app check.
It uses `.tools/pnpm-tool/node_modules/pnpm/bin/pnpm.cjs`, or an absolute
`TEST_PNPM_CLI` path to a locally installed pnpm JavaScript entry point. If absent,
it prints an explicit SKIP; do not report that as a passing pnpm check. No global
tool is installed automatically. The npm check remains the default. Both checks
assert that only the selected manager's lockfile exists and that init preserves it.

Approachable tasks: improve diagnostic wording with location tests, add malformed
string cases, clarify compilable grammar examples, improve topic docs, and test runtime disposal/accessibility.
Keep changes small and explain observable behavior and validation in your PR.
Discuss syntax changes with the founder before implementation. Security-sensitive
changes require an independent reviewer. Do not add speculative language features.

The open-source license is pending. Until selected, contributions require explicit
agreement with the maintainer about terms; do not assume an open-source license.
