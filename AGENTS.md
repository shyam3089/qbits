# Local development instructions

- Read docs/syntax.md before changing grammar. Obtain founder approval for language changes.
- Keep compiler semantics independent of identity and source suffixes. Edit identity.json and run npm run sync.
- Keep language/, runtime/, tooling/, examples/ boundaries explicit; avoid new dependencies without need.
- Never execute application source during compilation. Use text nodes, not HTML injection.
- Security-sensitive changes need independent human review before merging.
- Run npm run sync:check, npm run build, npm run test:docs, npm test, npm run test:rename, npm run test:external.
- Keep installed topic docs/version metadata and scaffolder synchronized; never use postinstall to modify projects.
- npm stays the repository manager. Test standalone pnpm apps with npm run test:external -- --manager pnpm when available; report skips. Delegate stores/locks to managers.
- Keep packages private. Do not publish, deploy, change visibility, or introduce secrets.
- Preserve existing work. Tests/fixtures must never enter production output.
