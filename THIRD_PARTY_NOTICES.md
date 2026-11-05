# Third-party licenses

Qbits' original code is licensed under Apache-2.0. Dependencies keep their own
licenses and copyright notices; the Qbits license does not replace them.

The current package-lock.json records these dependency licenses:

| Packages, including platform variants where present | Declared license |
| --- | --- |
| Vite, Rollup, esbuild, tsx, fdir, tinyglobby, picomatch, nanoid, PostCSS, fsevents, @types/node, @types/estree, undici-types, @napi-rs/lzma-linux-x64-gnu | MIT |
| picocolors | ISC |
| source-map-js | BSD-3-Clause |
| TypeScript, Playwright, playwright-core | Apache-2.0 |

The installed Vite LICENSE.md also contains the full notices for its bundled
dependencies, with MIT, ISC, BSD-2-Clause, Apache-2.0 and CC0-1.0 terms. Preserve
that file when redistributing Vite. Playwright's NOTICE credits Microsoft
Corporation and code derived from Puppeteer under Apache 2.0. Preserve its LICENSE
and NOTICE when redistributing Playwright. TypeScript's ThirdPartyNoticeText.txt
includes MIT and Unicode data/software notices; preserve those when distributing
TypeScript. Each other dependency's supplied license/notice files remain authoritative
for those packages. No existing third-party notice has been removed or relicensed.

The framework and scaffolder tarballs contain Qbits code, docs and notices; they
do not vendor node_modules or bundle these build/test dependencies. The browser
runtime has no third-party imports. Vite's small module-preload helper may appear
in example application builds; its MIT license and bundled notices are in the
installed Vite LICENSE.md. Example builds are local validation artifacts and
are excluded from the framework tarball.

Review of the locked dependency metadata and installed Vite/Playwright notices
found permissive terms compatible with this Apache-2.0 project when their notice
and other applicable conditions are retained. This is scoped to the current
lockfile and packaging; it is not a certification of future distributions or of
separately downloaded browsers and operating-system libraries. Before distributing
bundled third-party code or browser binaries, include their actual license texts,
copyright notices and any required notices. Recheck dependency and bundle changes.

Official Qbits license text source:
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt).
