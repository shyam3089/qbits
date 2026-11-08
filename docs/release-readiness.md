# Release readiness: Phases 3F.2-3F.5

Release decisions use validation evidence produced locally on the exact candidate commit.
GitHub CI is supplementary and is not a release requirement. This checklist does not
authorize publishing, tagging, publishing-workflow activation, or deployment.

## Current candidate - 1.0.0 preparation, 2026-11-08

- Promote the verified `0.1.0-beta.2` baseline at `85afa955` to `qbits` and
  `create-qb` version `1.0.0`, with no new features or dependency changes.
- Freeze the supported public APIs in [api.md](api.md) under Semantic Versioning;
  keep its experimental interfaces and compatibility limitations explicit.
- Verify `npm create qb myapp` defaults locally using the installed candidate and
  matching framework version. Actual registry availability requires publication.
- Rerun build, full tests, sync, docs, npm audit, external npm/pnpm installation and
  Firefox production checks. Inspect intended archive contents and record checksums.
- Preserve signed beta tags, Apache-2.0 notices and existing npm submissions. No new
  tags, npm staging, approvals, publication, Actions or visibility changes are authorized.

## Phase 3F.4.5 - beta.2 preparation, 2026-11-08

- Candidate: `qbits` and `create-qb` version `0.1.0-beta.2`, based on the verified
  remediation commit `ec1f3c5` from clean `main`.
- Retain the frozen beta API, syntax, default limits and Apache-2.0 notices.
- Include the disposed staged-list, computed-list mutation and work-accounting fixes;
  see [CHANGELOG](../CHANGELOG.md) and [release notes](../RELEASE_NOTES.md).
- Rerun build, full tests, sync, docs, npm audit, external npm/pnpm tarball and Firefox
  checks locally; inspect both archives and record their SHA-256 checksums.
- Existing beta.1 tags and npm staged submissions remain untouched. No new tag,
  npm staging, approval, publication or GitHub Actions change is part of preparation.

The beta validation records are historical evidence, not a substitute for
the 1.0.0 local gate or the outstanding human and publication prerequisites.

## Phase 3F.2 - candidate verification (beta.1 evidence)

- [x] Rebuild from a clean `npm ci` checkout on Node.js 22.
- [x] Run sync, build, docs, full Firefox tests, rename, and external npm/pnpm checks.
- [x] Verify both tarball manifests and installed entry points from packed artifacts.
- [x] Resolve every skipped package-manager check or record it as a blocker.

## Phase 3F.3 - independent review

- [ ] Obtain independent human review of security-sensitive compiler/runtime behavior.
- [ ] Review dependency licenses, lockfile changes, secrets scan, and public tarball contents.
- [ ] Confirm repository, npm ownership, package-name control, and provenance prerequisites.
- [x] Reconcile all findings into the changelog and beta release notes.

### CI and npm infrastructure status - 2026-11-07

- `.github/workflows/ci.yml` runs supplementary push/pull-request checks for Node.js 22
  on Linux, Windows and macOS; Node.js 24 and 26 on Linux; and the full Node.js 22
  Firefox, audit, rename, npm, pnpm and tarball integration gate on Linux. GitHub CI
  availability or results are not release evidence and do not replace the local gate.
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

Local validation policy:

1. Run every required build, test, audit, documentation, Firefox, npm/pnpm and tarball
   check locally on the exact candidate commit and retain the command results.
2. Treat GitHub CI as supplementary feedback only. Investigate failures locally, but
   do not make GitHub runner availability or status a release prerequisite.
3. Keep CI read-only and SHA-pinned; CI activation or configuration changes remain
   separate repository-administration decisions and do not authorize a release.

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
4. Obtain separate written approval for the exact `v1.0.0` commit, signed tag,
   GitHub release, publishing-workflow activation and npm staging. Only then replace
   `on: []` with the approved release trigger and remove the publish job's `if: false` guard.
5. Review both staged tarballs and provenance records, then separately approve or reject
   each stage with npm 2FA. Approval makes the package public and is not authorized by
   this checklist.

## Phase 3F.4 - release approval

- [ ] Approve the frozen API, experimental labels, limitations, and migration policy.
- [ ] Review and approve the recorded local validation evidence; GitHub CI is supplementary.
- [x] Confirm `v1.0.0` is the exact version in both packages and generated docs.
- [ ] Record explicit human authorization for tag and publication steps.

## Phase 3F.5 - publish and verify

- [ ] Tag and publish only after explicit authorization, with npm provenance enabled.
- [ ] Verify registry metadata, signatures/provenance, tarball contents, and install commands.
- [ ] Create a fresh app from the registry and run check, production build, and Firefox smoke tests.
- [ ] Publish release notes and record rollback/deprecation instructions for discovered defects.
