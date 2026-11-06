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
  return 'import "./Counter.css"\n\ncomponent Counter(label = "Count: "):\n    count = 0\n    div class="counter":\n        button class="counter-button" text=label + str(count):\n            on click:\n                count = count + 1\n';
}
export function greetingSource() {
  return 'component Greeting:\n    name = ""\n    enabled = true\n\n    input:\n        value=name\n        on input:\n            name = event.value\n\n    if name == "":\n        p text="Enter your name"\n    else:\n        p text="Hello, " + name\n\n    if enabled and name != "":\n        button text="Continue"\n\n    if not enabled:\n        p text="Unavailable"\n\n    button text="Disable greeting":\n        on click:\n            enabled = false\n';
}
export function notificationSettingSource() {
  return 'component NotificationSetting:\n    enabled = false\n\n    button text="Disable notifications":\n        on click:\n            enabled = false\n\n    input:\n        type="checkbox"\n        checked=enabled\n        on change:\n            enabled = event.checked\n\n    if enabled:\n        p text="Notifications enabled"\n    else:\n        p text="Notifications disabled"\n';
}
export function catalogSource() {
  return 'class Product:\n    id = 0\n    name = ""\n    quantity = 0\n    computed label = name + " x " + str(quantity)\n    action increment:\n        quantity = quantity + 1\n\ncomponent Catalog:\n    initialized = false\n    products = [Product(1, "Tea", 1), Product(2, "Coffee", 1)]\n    computed productCount = len(products)\n    on init:\n        initialized = true\n    on cleanup:\n        initialized = false\n\n    section class="catalog":\n        h2 text="Products: " + str(productCount)\n        ul:\n            for product in products key=product.id:\n                li class="product":\n                    input:\n                        value=product.name\n                        on input:\n                            product.name = event.value\n                    span text=product.label\n                    button text="Increase":\n                        on click:\n                            product.increment()\n                    button text="Move first":\n                        on click:\n                            products.move(product, 0)\n                    button text="Remove":\n                        on click:\n                            products.remove(product)\n        button text="Add Cocoa":\n            on click:\n                products.append(Product(3, "Cocoa", 1))\n';
}
export function appSource(identity) {
  return `import Counter from "./Counter${identity.sourceExtension}"\nimport Greeting from "./Greeting${identity.sourceExtension}"\nimport NotificationSetting from "./NotificationSetting${identity.sourceExtension}"\nimport Catalog from "./Catalog${identity.sourceExtension}"\n\ncomponent App:\n    main class="page":\n        h1 text="Two independent counters"\n        Counter label="First: " class="compact"\n        Counter label="Second: "\n        Greeting\n        NotificationSetting\n        Catalog\n`;
}
export const counterCSS = '.counter { padding: 16px; }\n.counter-button { color: rgb(20, 80, 160); }\n.counter.compact { padding: 4px; }\n';
export function applicationFiles(identity, version, frameworkSpec, viteSpec, manager = 'npm') {
  const commands = managerCommands(manager);
  return {
    'package.json': JSON.stringify({name:'counter-app', version:'0.0.0', private:true, type:'module', devEngines:{packageManager:{name:manager,onFail:'warn'}}, scripts:{dev:'vite --host 127.0.0.1',build:'vite build',check:`${identity.cliName} check src --json`,[identity.cliName]:identity.cliName}, dependencies:{[identity.packageName]:frameworkSpec}, devDependencies:{vite:viteSpec}},null,2) + '\n',
    'vite.config.ts': `import { defineConfig } from 'vite';\nimport { languagePlugin } from '${identity.packageName}/vite';\nexport default defineConfig({ plugins: [languagePlugin()] });\n`,
    'index.html': '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Counter</title></head><body><main><h1>Reactive counter</h1><div id="app"></div></main><script type="module" src="/src/main.ts"></script></body></html>\n',
    [`src/Counter${identity.sourceExtension}`]: counterSource(),
    [`src/Greeting${identity.sourceExtension}`]: greetingSource(),
    [`src/NotificationSetting${identity.sourceExtension}`]: notificationSettingSource(),
    [`src/Catalog${identity.sourceExtension}`]: catalogSource(),
    [`src/App${identity.sourceExtension}`]: appSource(identity),
    'src/Counter.css': counterCSS,
    'src/main.ts': `import mount from './App${identity.sourceExtension}';\nimport * as runtime from '${identity.packageName}/runtime';\nconst target = document.querySelector('#app');\nif (!target) throw new Error('Missing application target');\nmount(target, runtime);\n`,
    '.gitignore': 'node_modules/\ndist/\n*.log\n.env\n.env.*\n!.env.example\n',
    'AGENTS.md': agentBlock(identity, version, manager),
    'README.md': `# ${identity.displayName} counter\n\nPackage manager: ${manager}.\n\n\`\`\`sh\n${commands.install}\n${commands.run('check')}\n${commands.run('dev')}\n\`\`\`\n\nOpen the local URL Vite prints. Edit src/Counter${identity.sourceExtension} and save\nto see the counter reload. Stop the dev server with Ctrl+C, or use a second\nterminal in this directory for the following commands:\n\n\`\`\`sh\n${commands.run('build')}\n${commands.cli(identity.cliName,'docs --agent')}\n${commands.cli(identity.cliName,'docs syntax')}\n\`\`\`\n\nBuild failures and human-readable checks show a source location and caret. Fix the indicated\nsource, save, and rerun the command; dev errors recover on save without restarting\nthe server. Human-readable checks: ${commands.cli(identity.cliName,'check src')}.\nThe check script emits JSON for tools, with exit status 1 on failure.\n\nInstallation creates ${commands.lockfile}; commit it and keep only this manager's\nlockfile. package.json remains the dependency manifest. No lockfile is fabricated\nby the generator; the selected manager resolves and writes it during installation.\n${manager === 'pnpm' ? 'pnpm uses its existing shared content-addressable store and project-specific links.\nShared storage can save disk space; the app lockfile preserves project-specific resolutions.\nIf pnpm is unavailable, explicitly run npm exec --package=pnpm -- pnpm install\n(and prefix subsequent pnpm commands the same way), or select npm for a new app.\nThis opt-in tool download is not a global installation.' : 'npm uses normal project-local node_modules installation.'}\nVersions remain independent across apps; never use globally installed application\ndependencies. Storage, linking, integrity checks and cleanup belong to the package\nmanager. Existing projects keep their manager and lockfile; do not silently migrate.\nSource edits trigger full page reload; component HMR/state preservation is not supported.\nThe ${identity.displayName} framework is licensed under Apache-2.0; see its installed LICENSE, NOTICE and TRADEMARKS.md. Application licensing is chosen by the application owner.\n`,
  };
}
