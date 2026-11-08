<#
Usage: .\scripts\release.ps1 -Version 1.0.0
Run from main when ready to release. Stages all working-tree changes with git add -A.
Rejects other outstanding qbits/create-qb stages; leaves the target stage untouched.
A staged target can therefore block direct publication. Only Git/npm may prompt for auth.
#>
param([string]$Version = '1.0.0')

$ErrorActionPreference = 'Stop'
$script:Completed = @()
$script:Operation = 'initialize release'
$script:PublishAttempt = $null
$success = $false
$locationPushed = $false
$tag = "v$Version"
$npmTag = if ((($Version -split '\+', 2)[0]).Contains('-')) { 'beta' } else { 'latest' }

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    $script:Operation = $Name
    Write-Host "Starting: $Name"
    $global:LASTEXITCODE = 0
    & $Action
    if ($global:LASTEXITCODE -ne 0) { throw "$Name failed (exit $global:LASTEXITCODE)." }
    $script:Completed += $Name
    Write-Host "Completed: $Name"
}

try {
    Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
    $locationPushed = $true
    $npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    Invoke-Step 'Update qbits version and lockfile' { & $npm version $Version --no-git-tag-version --ignore-scripts --allow-same-version }
    Push-Location -LiteralPath 'packages/create'
    try {
        Invoke-Step 'Update create-qb version' { & $npm version $Version --no-git-tag-version --ignore-scripts --allow-same-version }
    } finally { Pop-Location }

    $metadata = @'
import fs from 'node:fs';
const [version, date] = process.argv.slice(2);
const read = path => fs.readFileSync(path, 'utf8');
const write = (path, text) => {
  const old = read(path), normalized = text.replaceAll('\r\n', '\n');
  const next = old.includes('\r\n') ? normalized.replaceAll('\n', '\r\n') : normalized;
  if (old !== next) fs.writeFileSync(path, next);
};
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
write('docs/api.md', read('docs/api.md').replace(/^# Qbits v\S+ public API/m, `# Qbits v${version} public API`)
  .replace(/(freezes the supported public surface for `v)[^`]+(`)/, (_, a, b) => a + version + b));
write('README.md', read('README.md').replace(/(The supported )\S+( public surface)/, (_, a, b) => a + version + b)
  .replace(/(qbits@|create-qb@)[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?/g, (_, a) => a + version));
let changelog = read('CHANGELOG.md');
const unreleased = new RegExp('^## ' + escape(version) + ' - Unreleased\\r?$', 'm');
const existing = new RegExp('^## ' + escape(version) + ' - ', 'm');
if (unreleased.test(changelog)) changelog = changelog.replace(unreleased, `## ${version} - ${date}`);
else if (!existing.test(changelog)) changelog = changelog.replace(/^# Changelog\r?\n/, `# Changelog\n\n## ${version} - ${date}\n\n- Release metadata and generated version references updated; see RELEASE_NOTES.md.\n`);
write('CHANGELOG.md', changelog);
const block = `<!-- qbits-release:start -->\nVersion: \`${version}\`; tag: \`v${version}\`; date: ${date}.\n<!-- qbits-release:end -->`;
const metadata = text => /<!-- qbits-release:start -->[\s\S]*?<!-- qbits-release:end -->/.test(text)
  ? text.replace(/<!-- qbits-release:start -->[\s\S]*?<!-- qbits-release:end -->/, block)
  : text.replace(/^(#[^\r\n]*\r?\n)/, '$1\n' + block + '\n');
write('RELEASE_NOTES.md', metadata(read('RELEASE_NOTES.md').replace(/^# Qbits [^\r\n]+/, `# Qbits ${version} release`)
  .replace(/This stable candidate/, 'This release')
  .replace(/After both \S+ packages are published/, `After both ${version} packages are published`)
  .replace(/\n1\.0\.0 preparation produces local candidate tarballs only\.[\s\S]*$/, '\nRelease execution and partial outcomes are reported by scripts/release.ps1.\n')));
write('docs/release-readiness.md', metadata(read('docs/release-readiness.md'))
  .replace(/^## Current candidate - /m, '## Previous preparation - ')
  .replace(/(for the exact `v)[^`]+(` commit, signed tag)/, (_, a, b) => a + version + b)
  .replace(/(Confirm `v)[^`]+(` is the exact version)/, (_, a, b) => a + version + b));
'@
    Invoke-Step 'Update release metadata' { $metadata | & node.exe --input-type=module - $Version (Get-Date -Format 'yyyy-MM-dd') }
    Invoke-Step 'Sync generated references' { & $npm run sync --ignore-scripts }
    Invoke-Step 'Build distributable packages' { & $npm run build --ignore-scripts }

    # Capture list JSON without mixing stderr into stdout. Reject/publish stay in
    # PowerShell so their normal interactive browser/2FA prompts retain stdin.
    $listStages = @'
import {spawnSync} from 'node:child_process';
const [npm, name] = process.argv.slice(2);
const result = spawnSync('call "' + npm + '" stage list ' + name + ' --json --fetch-retries=0', {shell:true, encoding:'utf8'});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
'@
    foreach ($name in @('qbits', 'create-qb')) {
        $script:Operation = "List staged $name submissions"
        Write-Host "Starting: $script:Operation"
        $json = $listStages | & node.exe --input-type=module - $npm $name
        if ($LASTEXITCODE -ne 0) { throw "$script:Operation failed (exit $LASTEXITCODE)." }
        $stages = $json | ConvertFrom-Json
        $script:Completed += $script:Operation
        Write-Host "Completed: $script:Operation"
        foreach ($stage in $stages) {
            if ($stage.packageName -cne $name -or $stage.version -ceq $Version) { continue }
            if ($stage.PSObject.Properties['status'] -and $stage.status -in @('approved', 'published', 'rejected', 'expired')) { continue }
            Invoke-Step "Reject staged $name@$($stage.version) ($($stage.id))" { & $npm stage reject $stage.id --fetch-retries=0 }
        }
    }

    Invoke-Step 'Stage release changes' { & git.exe add -A }
    $script:Operation = 'Check staged changes'
    & git.exe diff --cached --quiet
    $diffExit = $LASTEXITCODE
    if ($diffExit -eq 1) {
        Invoke-Step 'Commit release changes' { & git.exe commit -m "Release v$Version [skip ci]" }
    } elseif ($diffExit -ne 0) { throw "git diff failed (exit $diffExit)." }
    else { Write-Host 'No staged changes; commit skipped.' }
    Invoke-Step "Create SSH-signed $tag" { & git.exe -c gpg.format=ssh tag -s -m "Qbits v$Version" $tag }
    Invoke-Step 'Push main' { & git.exe -c credential.helper= -c push.followTags=false push origin main }
    Invoke-Step "Push $tag" { & git.exe -c credential.helper= -c push.followTags=false push origin $tag }
    $script:PublishAttempt = "qbits@$Version"
    Invoke-Step "Publish qbits@$Version [$npmTag]" { & $npm publish --tag $npmTag --access public --ignore-scripts --fetch-retries=0 }
    $script:PublishAttempt = $null
    Push-Location -LiteralPath 'packages/create'
    try {
        $script:PublishAttempt = "create-qb@$Version"
        Invoke-Step "Publish create-qb@$Version [$npmTag]" { & $npm publish --tag $npmTag --access public --ignore-scripts --fetch-retries=0 }
        $script:PublishAttempt = $null
    } finally { Pop-Location }
    $success = $true
} catch {
    Write-Host "FAILED during $script:Operation`: $($_.Exception.Message)"
} finally {
    if ($locationPushed) { Pop-Location }
    Write-Host ('Final status: ' + $(if ($success) { 'SUCCESS' } else { 'FAILED / possibly partial release' }))
    Write-Host "Requested release: $Version; Git tag: $tag; npm tag: $npmTag"
    foreach ($operation in $script:Completed) { Write-Host "Completed: $operation" }
    if ($script:PublishAttempt) { Write-Host "$script:PublishAttempt was attempted; its registry outcome may be successful or unknown. Inspect npm before any manual retry." }
    if (-not $success) { Write-Host 'Stopped. Completed operations are retained; no rollback or automatic retry.' }
}
if ($success) { exit 0 } else { exit 1 }
