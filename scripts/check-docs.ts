import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { compile } from '../language/index.js';
import { identity } from '../tooling/config.js';
let examples = 0;
for (const name of (await readdir('docs')).filter(name => name.endsWith('.md'))) {
  const filename = join('docs',name); const content = await readFile(filename,'utf8');
  for (const block of content.matchAll(/```([^\r\n]+)\r?\n([\s\S]*?)```/g)) {
    if (!['text', identity.languageId].includes(block[1])) continue;
    const offset = block.index! + block[0].indexOf('\n') + 1;
    // Preserve Markdown line numbers in any source diagnostic.
    compile('\n'.repeat(content.slice(0,offset).split('\n').length - 1) + block[2],filename);
    examples++;
  }
}
assert.ok(examples >= 2,'Syntax and packaged example must both compile');
const manifest = JSON.parse(await readFile('package.json','utf8'));
const docs = JSON.parse(await readFile('docs/manifest.json','utf8'));
assert.equal(docs.version,manifest.version); assert.deepEqual(docs.identity,identity);
console.log(`Compiled ${examples} documented examples for ${identity.displayName} ${manifest.version}.`);
