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

### CI and npm infrastructure status - 2026-11-07

- `.github/workflows/ci.yml` contains disabled jobs for Node.js 22 on Linux, Windows
  and macOS; Node.js 24 and 26 on Linux; and the full Node.js 22 Firefox, audit,
  rename, npm, pnpm and tarball integration gate on Linux. Every job remains guarded
  by `if: false` until Phase 3F.4 approval.
- `.github/workflows/publish.yml` has no trigger and its staging job is also guarded
  by `if: false`. It grants `id-token: write` only to that job, uses no npm token,
  validates the exact package versions/tag, and prepares `npm stage publish` so a
  maintainer must review and approve each package with 2FA before it becomes public.
- All referenced GitHub actions use reviewed full commit SHAs. Checkout persistence
  is disabled, workflow permissions default to read-only contents, dependency installs
  suppress lifecycle scripts, and the isolated pnpm verification CLI is version-pinned.
- Public registry lookups returned `E404` for both `qbits` and `create-qb`. This means
  no public package currently occupies either exact name, but it does not reserve the
  names or prove that any account can publish them. The audit machine is not logged in
  to npm, so authenticated ownership was not verified.

Owner actions required before CI activation:

1. Review the prepared workflow diff and explicitly approve removing the three
   `if: false` guards in `ci.yml`. Do not change `publish.yml` in this approval.
2. In repository Actions settings, retain read-only default workflow permissions,
   disallow pull-request approval/write escalation, allow only the required GitHub-owned
   actions, and require full-length action SHAs. After the first successful run, make
   the portability, supported-Node and integration jobs required branch checks.
3. Confirm GitHub-hosted Linux, Windows and macOS runner availability and billing for
   the repository before enabling the matrix.

Owner actions required before any npm staging or publication:

1. Sign in to the intended npm owner account with 2FA, repeat the registry checks, and
   confirm authenticated publish access for both exact names. An unauthenticated `E404`
   is not ownership evidence. If npm requires package creation before trusted-publisher
   setup, stop and obtain separate authorization before creating either staged placeholder.
2. Create a protected GitHub environment named `npm-publish` with required human
   reviewers and no long-lived npm credential secrets.
3. For both packages, configure npm trusted publishing for GitHub user `shyam3089`,
   repository `qubits`, workflow filename `publish.yml`, environment `npm-publish`,
   and stage-publish-only permission. Complete the first trusted publish within npm's
   two-day validation window.
4. Obtain separate written approval for the exact `v0.1.0-beta.1` commit, signed tag,
   GitHub release, workflow activation and npm staging. Only then replace `on: []` with
   the approved release trigger and remove the publish job's `if: false` guard.
5. Review both staged tarballs and provenance records, then separately approve or reject
   each stage with npm 2FA. Approval makes the package public and is not authorized by
   this checklist.

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
