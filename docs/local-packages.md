<!-- Generated for Qbits 0.1.0-beta.1 by npm run sync. -->
# Local packages and onboarding

The target command is npm create qb myapp, which requires the
create-qb registry package. This candidate is not published. Do not run that registry command expecting this
implementation until an authorized release is confirmed.
The main package is qbits, with separate /runtime, /compiler and /vite
entry points, plus the local qb binary.

From the framework repository, pack both release-candidate packages locally:

```sh
npm ci
npm run sync:check
npm run build
npm pack --ignore-scripts --pack-destination ..
npm pack ./packages/create --ignore-scripts --pack-destination ..
mkdir ../local-scaffold-runner
cd ../local-scaffold-runner
npm init -y
npm install --ignore-scripts ../create-qb-0.1.0-beta.1.tgz
npm create qb --offline -- ../myapp --framework ../qbits-0.1.0-beta.1.tgz
cd ../myapp
npm install
npm run check
npm run build
npm run dev
```

Use fresh runner/app directories. The creator refuses existing targets. Local file
paths are resolved before creation. This installs the intended scaffolder from its
tarball, never by an unverified registry name. Offline npm create uses that locally
installed initializer; it does not verify or fetch a registry release. Open the URL
printed by the dev server. Edit src/Counter.qb, then save to reload.
Stop the server with Ctrl+C; use another terminal in the app directory to run checks. Vite and transitive dependencies may
be fetched by npm install; --vite /absolute/vite.tgz can pin a local Vite tarball.
No global install is used. npm install creates package-lock.json. To select pnpm, add --package-manager pnpm to the creator invocation, then use pnpm install, pnpm run dev, pnpm run check and pnpm run build. pnpm creates only pnpm-lock.yaml. See [package managers](package-managers.md) for shared storage and non-global tool options.

For an existing app, run from its root (replace the tarball path if necessary):

```sh
npm install --ignore-scripts /absolute/qbits-0.1.0-beta.1.tgz
npm exec --offline -- qb init
npm run qb -- docs --agent
npm run qb -- check src --json
```

Install a compatible Vite version separately if needed. Merge languagePlugin() from
qbits/vite into the existing Vite plugins array manually. init does
not rewrite Vite config or application files. It preserves existing AGENTS.md text
and conflicting scripts. See commands.md for conflicts and non-src layouts.
Do not use npm exec by name until the intended local package is installed.
