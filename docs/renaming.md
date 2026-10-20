# Rename and migrate

1. Edit only `identity.json`: displayName (human title), languageId (lowercase language
   ID), sourceExtension (dot plus lowercase alphanumerics), packageName (main package),
   cliName (local binary), createCommand (npm create name), createPackageName (must
   equal create- plus createCommand). Names are unscoped lowercase IDs. Validation
   rejects unsafe values, unknown keys, coincident package names, and CLI names that
   collide with application scripts/npm lifecycle hooks. See docs/identity.md.
2. Rename source filenames to the new suffix, including the counter example.
   Update application source imports to match; the synchronization script updates
   the maintained counter import automatically. Other imports require manual migration.
3. Run `npm run sync` then `npm install --package-lock-only` to update lock metadata.
   Sync deterministically updates both package manifests/binaries, scaffolder source
   copies, example import, versioned topic docs and identity documentation.
   Run it twice or use `npm run sync:check` to
   confirm idempotence. Handwritten prose/project history may need editorial updates.
4. Run `npm run build`, `npm run test:docs`, `npm test`, `npm run test:rename`,
   and `npm run test:external`. Repack both packages after a rename.

The rename test uses a temporary local copy with a different name and suffix,
checks CLI and browser development/production behavior, then removes that copy.
The delivered identity remains unchanged. cliName controls the package's local bin
and usage text; installed apps invoke it through npm scripts/npm exec without global
installs. Migrate existing app dependencies, runtime/Vite/compiler subpath imports,
local scripts and managed AGENTS.md links (explicitly rerun init after installing
the renamed package). Source imports/filenames outside the maintained example are manual.

Changing local identity does not reserve or rename external registry packages,
transfer ownership, rename GitHub repositories, change visibility, or migrate
existing consumers. Registry availability, trademarks, account permissions, and
package redirects are external concerns. All manifests remain private and no
publishing workflow or credentials are included.
