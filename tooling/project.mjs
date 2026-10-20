// Node-only project templates; identity and version are explicit inputs.
import { managerCommands } from './package-manager.mjs';
export function agentBlock(identity, version, manager = 'npm') {
  const commands = managerCommands(manager);
  const base = `node_modules/${identity.packageName}/docs`;
  return `<!-- BEGIN FRAMEWORK GUIDANCE -->\n## ${identity.displayName} ${version}\n\nRead [overview](${base}/agent.md) first. Load only relevant topics:\n- Syntax: [grammar](${base}/syntax.md) and [examples](${base}/examples.md).\n- Commands/onboarding: [commands](${base}/commands.md).\n- Security: [controls and recommendations](${base}/security.md).\n- Scope: [limitations](${base}/limitations.md).\n\nUse the installed version's docs. Package manager: ${manager}; retain ${commands.lockfile}.\nInstall: ${commands.install}. Dev: ${commands.run('dev')}.\nValidate: ${commands.run('check')} and ${commands.run('build')}.\nDocs: ${commands.cli(identity.cliName,'docs --agent')}. Do not migrate package managers.\n<!-- END FRAMEWORK GUIDANCE -->\n`;
}
export function mergeAgentInstructions(existing, block) {
  const startMarker = '<!-- BEGIN FRAMEWORK GUIDANCE -->';
  const endMarker = '<!-- END FRAMEWORK GUIDANCE -->';
  const start = existing.indexOf(startMarker); const end = existing.indexOf(endMarker);
  if (start < 0 && end < 0) return existing + (existing && !existing.endsWith('\n') ? '\n\n' : existing ? '\n' : '') + block;
  if (start < 0 || end < start || existing.indexOf(startMarker, start + startMarker.length) >= 0 || existing.indexOf(endMarker, end + endMarker.length) >= 0) throw new Error('Ambiguous framework guidance markers; repair AGENTS.md manually before init');
  return existing.slice(0, start) + block.trimEnd() + existing.slice(end + endMarker.length);
}
export function counterSource() {
  return 'component Counter:\n    count = 0\n    button text="Count: " + str(count):\n        on click:\n            count = count + 1\n';
}
export function applicationFiles(identity, version, frameworkSpec, viteSpec, manager = 'npm') {
  const commands = managerCommands(manager);
  return {
    'package.json': JSON.stringify({name:'counter-app', version:'0.0.0', private:true, type:'module', devEngines:{packageManager:{name:manager,onFail:'warn'}}, scripts:{dev:'vite --host 127.0.0.1',build:'vite build',check:`${identity.cliName} check src --json`,[identity.cliName]:identity.cliName}, dependencies:{[identity.packageName]:frameworkSpec}, devDependencies:{vite:viteSpec}},null,2) + '\n',
    'vite.config.ts': `import { defineConfig } from 'vite';\nimport { languagePlugin } from '${identity.packageName}/vite';\nexport default defineConfig({ plugins: [languagePlugin()] });\n`,
    'index.html': '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Counter</title></head><body><main><h1>Reactive counter</h1><div id="app"></div></main><script type="module" src="/src/main.ts"></script></body></html>\n',
    [`src/Counter${identity.sourceExtension}`]: counterSource(),
    'src/main.ts': `import mount from './Counter${identity.sourceExtension}';\nimport * as runtime from '${identity.packageName}/runtime';\nconst target = document.querySelector('#app');\nif (!target) throw new Error('Missing application target');\nmount(target, runtime);\n`,
    '.gitignore': 'node_modules/\ndist/\n*.log\n.env\n.env.*\n!.env.example\n',
    'AGENTS.md': agentBlock(identity, version, manager),
    'README.md': `# ${identity.displayName} counter\n\nPackage manager: ${manager}.\n\n\`\`\`sh\n${commands.install}\n${commands.run('dev')}\n${commands.run('check')}\n${commands.run('build')}\n${commands.cli(identity.cliName,'docs --agent')}\n\`\`\`\n\nInstallation creates ${commands.lockfile}; commit it and keep only this manager's\nlockfile. package.json remains the dependency manifest. No lockfile is fabricated\nby the generator; the selected manager resolves and writes it during installation.\n${manager === 'pnpm' ? 'pnpm uses its existing shared content-addressable store and project-specific links.\nShared storage can save disk space; the app lockfile preserves project-specific resolutions.\nIf pnpm is unavailable, explicitly run npm exec --package=pnpm -- pnpm install\n(and prefix subsequent pnpm commands the same way), or select npm for a new app.\nThis opt-in tool download is not a global installation.' : 'npm uses normal project-local node_modules installation.'}\nVersions remain independent across apps; never use globally installed application\ndependencies. Storage, linking, integrity checks and cleanup belong to the package\nmanager. Existing projects keep their manager and lockfile; do not silently migrate.\nSource edits trigger full page reload; component HMR/state preservation is not supported.\nLicense selection for the framework is pending.\n`,
  };
}
