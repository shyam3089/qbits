export function validateIdentity(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join() !== 'cliName,createCommand,createPackageName,displayName,languageId,packageName,sourceExtension') throw new Error('Identity requires displayName, languageId, sourceExtension, cliName, packageName, createCommand, createPackageName');
  if (typeof value.displayName !== 'string' || !/^[A-Za-z][A-Za-z0-9 ]{0,39}$/.test(value.displayName)) throw new Error('Invalid displayName');
  for (const key of ['languageId', 'cliName', 'packageName', 'createCommand', 'createPackageName']) if (typeof value[key] !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value[key])) throw new Error(`Invalid ${key}`);
  if (value.createPackageName !== `create-${value.createCommand}`) throw new Error('createPackageName must be create- plus createCommand for npm create');
  if (value.packageName === value.createPackageName) throw new Error('Main and scaffolder packages must have distinct names');
  if (['dev','build','check','test','start','stop','restart','install','uninstall','prepare','publish','pack','version','npm','pnpm','npx','corepack'].includes(value.cliName) || /^(pre|post)/.test(value.cliName)) throw new Error('cliName must not collide with application scripts, package manager commands or npm lifecycle hooks');
  if (typeof value.sourceExtension !== 'string' || !/^\.[a-z][a-z0-9]*$/.test(value.sourceExtension)) throw new Error('Invalid sourceExtension');
  return Object.freeze({...value});
}
