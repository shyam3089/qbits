# Release readiness: Phases 3F.2-3F.5

This checklist does not authorize publishing, tagging, workflow activation, or deployment.

## Phase 3F.2 - candidate verification

- [ ] Rebuild from a clean `npm ci` checkout on Node.js 22.
- [ ] Run sync, build, docs, full Firefox tests, rename, and external npm/pnpm checks.
- [ ] Verify both tarball manifests and installed entry points from packed artifacts.
- [ ] Resolve every skipped package-manager check or record it as a blocker.

## Phase 3F.3 - independent review

- [ ] Obtain independent human review of security-sensitive compiler/runtime behavior.
- [ ] Review dependency licenses, lockfile changes, secrets scan, and public tarball contents.
- [ ] Confirm repository, npm ownership, package-name control, and provenance prerequisites.
- [ ] Reconcile all findings into the changelog and beta release notes.

## Phase 3F.4 - release approval

- [ ] Approve the frozen API, experimental labels, limitations, and migration policy.
- [ ] Approve enabling the reviewed CI checks; keep publish permissions separate.
- [ ] Confirm `v0.1.0-beta.1` is the exact version in both packages and generated docs.
- [ ] Record explicit human authorization for tag and publication steps.

## Phase 3F.5 - publish and verify

- [ ] Tag and publish only after explicit authorization, with npm provenance enabled.
- [ ] Verify registry metadata, signatures/provenance, tarball contents, and install commands.
- [ ] Create a fresh app from the registry and run check, production build, and Firefox smoke tests.
- [ ] Publish release notes and record rollback/deprecation instructions for discovered defects.
