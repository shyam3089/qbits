<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Package managers

The intended entry remains npm create qb myapp; no global tool
is required. It is unpublished/unverified. For local tarballs follow local-packages.md,
adding --package-manager pnpm to the creator invocation for pnpm, or
--package-manager npm (the default). The scaffolder never installs dependencies.

| Selection | Install | Develop | Check | Build | Lockfile created by install |
| --- | --- | --- | --- | --- | --- |
| npm | npm install | npm run dev | npm run check | npm run build | package-lock.json |
| pnpm | pnpm install | pnpm run dev | pnpm run check | pnpm run build | pnpm-lock.yaml |

package.json remains the manifest. Only the selected manager writes a lockfile on
installation; the generator does not fabricate or translate locks. Commit the resulting
lockfile. Generated devEngines.packageManager.name records the selection without
pinning application dependencies globally. Do not run the other manager to install.
For reproducible installs use npm ci or pnpm install --frozen-lockfile after committing
the corresponding lockfile. npm uses normal project-local node_modules.

pnpm uses its existing shared content-addressable store and project-specific linking
and resolution. Shared package contents can save disk space, while each project's
lockfile preserves its own dependency resolutions. Two apps can use different versions.
No application dependencies are installed globally. Qubits does not configure a store
location, implement a resolver/cache/registry, or perform linking, integrity checking,
or store cleanup: these belong to the selected package manager. Disk savings depend
on package overlap, filesystem and manager configuration. See [pnpm motivation](https://pnpm.io/motivation).

If pnpm is unavailable, explicitly opt in to a non-global tool download:

```sh
npm exec --package=pnpm -- pnpm install
npm exec --package=pnpm -- pnpm run dev
npm exec --package=pnpm -- pnpm run check
npm exec --package=pnpm -- pnpm run build
```

This invokes the tool, not global application dependencies. Use a pnpm release
compatible with your Node.js version; review [installation options](https://pnpm.io/installation).
Alternatively select npm when scaffolding a new app. The generator never silently
installs pnpm or changes an existing project to npm.

Agent discovery: npm run qb -- docs --agent, or
pnpm run qb docs --agent. Existing-app onboarding: npm exec -- qb init
or pnpm exec qb init after installing the intended local package.
init preserves lockfiles and package manager metadata. Conflicting declarations or
lockfile managers, and unsupported existing managers, cause an error without writes.
No automatic migrations or lockfile deletions occur.
