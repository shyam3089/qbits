<#
Usage: .\scripts\release.ps1 [-Version 1.0.0] [-DryRun]
Requires clean main, GitHub origin shyam3089/qubits, existing npm authentication,
and Git user.signingKey plus gpg.ssh.allowedSignersFile configured for SSH signing.
Confirms once, updates metadata, syncs/builds, commits/signs/pushes, then publishes.
DryRun prints the complete plan only: no auth/network, edits, builds or release actions.
Failures retain completed work for inspection; publication is never retried.
Remote Git calls omit manager-core per process, retaining other helpers and SSH config.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$')]
    [string]$Version = '1.0.0',
    [switch]$DryRun
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:ReleaseExitCode = 1

function Resolve-ReleaseApplication {
    param([string]$Name)
    return (Get-Command $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
}

function ConvertTo-ReleaseArgument {
    param([string]$Value)
    # Windows native argv quoting: escape quotes and trailing backslashes.
    return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}

function Invoke-ReleaseCommand {
    param([string]$Tool, [string[]]$Arguments, [switch]$Capture,
          [switch]$AllowFailure, [string]$InputText)
    $global:LASTEXITCODE = -1
    if ($Capture) {
        # Keep machine-readable stdout separate from successful-command diagnostics.
        # Read both streams concurrently so a full stderr buffer cannot deadlock Git/npm.
        $start = New-Object System.Diagnostics.ProcessStartInfo
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.WorkingDirectory = (Get-Location).ProviderPath
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $start.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
        $start.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
        if ([IO.Path]::GetExtension($Tool) -ieq '.cmd') {
            # Only read-only npm queries use this branch; disallow cmd expansion.
            foreach ($value in (@($Tool) + $Arguments)) {
                if ($value -match '["%\^\r\n]') { throw 'Unsafe character in captured batch-command argument.' }
            }
            $start.FileName = $env:ComSpec
            $command = ((@($Tool) + $Arguments) | ForEach-Object { '"' + $_ + '"' }) -join ' '
            $start.Arguments = '/d /v:off /c call ' + $command
        } else {
            $start.FileName = $Tool
            $start.Arguments = ($Arguments | ForEach-Object { ConvertTo-ReleaseArgument $_ }) -join ' '
        }
        $process = New-Object System.Diagnostics.Process
        try {
            $process.StartInfo = $start
            if (-not $process.Start()) { throw 'Could not start captured command.' }
            $stdout = $process.StandardOutput.ReadToEndAsync()
            $stderr = $process.StandardError.ReadToEndAsync()
            $process.WaitForExit()
            $code = $process.ExitCode
            $global:LASTEXITCODE = $code
            $result = [pscustomobject]@{ ExitCode = $code; Output = $stdout.GetAwaiter().GetResult(); ErrorOutput = $stderr.GetAwaiter().GetResult() }
        } finally { $process.Dispose() }
    } else {
        if ($InputText) { $InputText | & $Tool @Arguments } else { & $Tool @Arguments }
        $code = $global:LASTEXITCODE
    }
    if ($code -ne 0 -and -not $AllowFailure) { throw "$(Split-Path -Leaf $Tool) failed (exit $code). Stopping without retry." }
    if ($Capture) { return $result }
}

function Get-ReleaseRemoteGitArguments {
    param([string[]]$Arguments)
    $config = Invoke-ReleaseCommand -Tool $gitExe -Arguments @('config', '--get-all', 'credential.helper') -Capture -AllowFailure
    if ($config.ExitCode -ne 0 -and $config.ExitCode -ne 1) {
        if ($config.ErrorOutput) { Write-Host "Git diagnostic: $($config.ErrorOutput.Trim())" }
        throw 'Could not read Git credential helpers; refusing remote access.'
    }
    $helpers = @()
    if ($config.ExitCode -eq 0) {
        $records = @($config.Output -split '\r?\n')
        # Remove the output terminator, preserving explicit empty helper resets.
        if ($records[-1] -ceq '') { $records = @($records | Select-Object -SkipLast 1) }
        foreach ($helper in $records) {
            if ([string]::IsNullOrWhiteSpace($helper)) { $helpers = @() }
            elseif ($helper.Trim() -notmatch '^manager-core(?:\s|$)') { $helpers += $helper }
        }
    }
    # Per-process reset only. Keep other configured helpers and SSH authentication.
    $options = @('-c', 'credential.helper=')
    foreach ($helper in $helpers) { $options += @('-c', "credential.helper=$helper") }
    return $options + $Arguments
}

function Get-ReleaseGit {
    param([string[]]$Arguments)
    $command = $Arguments[0]
    if ($command -ceq 'ls-remote') { $Arguments = @(Get-ReleaseRemoteGitArguments -Arguments $Arguments) }
    $result = Invoke-ReleaseCommand -Tool $gitExe -Arguments $Arguments -Capture -AllowFailure
    if ($result.PSObject.Properties['ErrorOutput'] -and $result.ErrorOutput.Trim()) { Write-Host "Git diagnostic: $($result.ErrorOutput.Trim())" }
    if ($result.ExitCode -ne 0) { throw "git $command failed (exit $($result.ExitCode)). Stopping without retry." }
    return $result.Output.Trim()
}

function Assert-ReleaseGitContext {
    param([string]$ExpectedHead, [switch]$Clean)
    if ((Get-ReleaseGit -Arguments @('branch', '--show-current')) -cne 'main') { throw 'Release requires branch main.' }
    if ((Get-ReleaseGit -Arguments @('rev-parse', '--verify', 'HEAD')) -cne $ExpectedHead) { throw 'HEAD changed during the release.' }
    if ($Clean -and (Get-ReleaseGit -Arguments @('--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=all'))) { throw 'Release requires a clean working tree, including untracked files.' }
}

function Assert-ReleaseVersionMissing {
    param($Package, [string]$ReleaseVersion)
    $result = Invoke-ReleaseCommand -Tool $npmExe -Capture -AllowFailure -Arguments @('view', "$($Package.Name)@$ReleaseVersion", 'version', '--json', '--registry', $registry)
    if ($result.ExitCode -eq 0) {
        $Package.Status = 'ALREADY EXISTS (not published by this run)'
        throw "$($Package.Name)@$ReleaseVersion already exists or could not be ruled out. Refusing a duplicate release."
    }
    $diagnostic = $result.Output
    if ($result.PSObject.Properties['ErrorOutput']) { $diagnostic += $result.ErrorOutput }
    if ($diagnostic -notmatch '"code"\s*:\s*"E404"') { throw "Could not establish that $($Package.Name)@$ReleaseVersion is absent (exit $($result.ExitCode))." }
}

function Update-ReleaseMetadata {
    param([string]$ReleaseVersion, [string]$BaseCommit)
    $source = @'
import fs from 'node:fs';
const [version, baseCommit, date] = process.argv.slice(2);
const read = path => fs.readFileSync(path, 'utf8');
const write = (path, text) => {
  const before = read(path), normalized = text.replaceAll('\r\n', '\n');
  const next = before.includes('\r\n') ? normalized.replaceAll('\n', '\r\n') : normalized;
  if (before !== next) fs.writeFileSync(path, next);
};
const main = JSON.parse(read('package.json'));
const creator = JSON.parse(read('packages/create/package.json'));
const lock = JSON.parse(read('package-lock.json'));
if (main.name !== 'qbits' || creator.name !== 'create-qb') throw new Error('Unexpected package names');
if (lock.version !== main.version || lock.packages[''].version !== main.version) throw new Error('Baseline lockfile version disagrees');
main.version = creator.version = lock.version = lock.packages[''].version = version;
for (const [path, value] of [['package.json', main], ['packages/create/package.json', creator], ['package-lock.json', lock]])
  write(path, JSON.stringify(value, null, 2) + '\n');
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let api = read('docs/api.md').replace(/^# Qbits v\S+ public API/m, `# Qbits v${version} public API`)
  .replace(/(freezes the supported public surface for `v)[^`]+(`)/, (_, a, b) => a + version + b);
if (!api.includes(`# Qbits v${version} public API`) || !api.includes('for `v' + version + '`')) throw new Error('Unrecognized API version metadata');
write('docs/api.md', api);
write('README.md', read('README.md').replace(/(The supported )\S+( public surface)/, (_, a, b) => a + version + b)
  .replace(/(qbits@|create-qb@)[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?/g, (_, a) => a + version));
let changelog = read('CHANGELOG.md');
const heading = new RegExp('^## ' + escape(version) + ' - .+$', 'm');
if (heading.test(changelog)) changelog = changelog.replace(heading, `## ${version} - ${date}`);
else changelog = changelog.replace(/^# Changelog\r?\n/, `# Changelog\n\n## ${version} - ${date}\n\n- Release metadata and generated references prepared from ${baseCommit}.\n- See RELEASE_NOTES.md for supported APIs and compatibility limits.\n`);
if (!changelog.includes(`## ${version} - ${date}`)) throw new Error('Unrecognized changelog');
write('CHANGELOG.md', changelog);
const block = '<!-- qbits-release:start -->\n' +
  `Version: \`${version}\`; tag: \`v${version}\`; date: ${date}; source commit: \`${baseCommit}\`.\n` +
  'Release execution requires pipeline confirmation. Prior releases and tags are preserved.\n' +
  '<!-- qbits-release:end -->';
function metadata(text) {
  const existing = /<!-- qbits-release:start -->[\s\S]*?<!-- qbits-release:end -->/;
  if (existing.test(text)) return text.replace(existing, block);
  return text.replace(/^(#[^\r\n]*\r?\n)/, '$1\n' + block + '\n');
}
let notes = read('RELEASE_NOTES.md').replace(/^# Qbits [^\r\n]+/, `# Qbits ${version} release`)
  .replace(/This stable candidate/, 'This release')
  .replace(/After both \S+ packages are published/, `After both ${version} packages are published`)
  .replace(/\n1\.0\.0 preparation produces local candidate tarballs only\.[\s\S]*$/, '\nPublication outcomes are reported by scripts/release.ps1. Independent human review\nand registry ownership/provenance remain release responsibilities.\n');
write('RELEASE_NOTES.md', metadata(notes));
write('docs/release-readiness.md', metadata(read('docs/release-readiness.md'))
  .replace(/^## Current candidate - /m, '## Previous preparation - ')
  .replace(/(for the exact `v)[^`]+(` commit, signed tag)/, (_, a, b) => a + version + b)
  .replace(/(Confirm `v)[^`]+(` is the exact version)/, (_, a, b) => a + version + b));
'@
    Invoke-ReleaseCommand -Tool $nodeExe -Arguments @('--input-type=module', '-', $ReleaseVersion, $BaseCommit, (Get-Date -Format 'yyyy-MM-dd')) -InputText $source
}

function Show-ReleasePlan {
    param([string]$ReleaseVersion, [string]$DistributionTag)
    Write-Host "Release plan: qbits@$ReleaseVersion -> create-qb@$ReleaseVersion (npm tag: $DistributionTag)"
    Write-Host '1. Validate clean main, GitHub origin/fast-forward, npm auth, SSH signing, and absent Git/npm versions.'
    Write-Host '2. Confirm once; update both manifests/lock, API/readme/changelog/release metadata.'
    Write-Host '3. npm run sync --ignore-scripts; npm run build --ignore-scripts. No tests or benchmarks.'
    Write-Host '4. Commit release/generated changes with [skip ci]; create and verify an SSH-signed tag.'
    Write-Host '5. Atomic, non-force push of HEAD:main and the new tag only; leave Actions configuration untouched.'
    Write-Host "6. Recheck each npm version; npm publish --tag $DistributionTag --access public --ignore-scripts --fetch-retries=0 (qbits first)."
    Write-Host '7. Stop on failure, retain completed work and report exact/uncertain outcomes. Never retry publication.'
}

function Invoke-QbitsRelease {
    param([string]$ReleaseVersion, [switch]$Preview,
          [string]$Root = ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))))
    $script:ReleaseExitCode = 1
    $distributionTag = if ($ReleaseVersion.Contains('-')) { 'beta' } else { 'latest' }
    $registry = 'https://registry.npmjs.org/'
    $tag = "v$ReleaseVersion"
    $tagRef = "refs/tags/$tag"
    $packages = @(
        [pscustomobject]@{ Name = 'qbits'; Path = $Root; Status = 'NOT ATTEMPTED' },
        [pscustomobject]@{ Name = 'create-qb'; Path = (Join-Path $Root 'packages/create'); Status = 'NOT ATTEMPTED' }
    )
    $state = [pscustomobject]@{ Result = 'FAILED'; Phase = 'preflight'; Files = 'unchanged'; Commit = 'not resolved'; CommitStatus = 'unchanged'; Tag = $tag; TagStatus = 'NOT CREATED'; Push = 'NOT ATTEMPTED'; Packages = $packages }
    $script:ReleaseState = $state
    $pushedLocation = $false
    $gitReady = $false
    try {
        Show-ReleasePlan -ReleaseVersion $ReleaseVersion -DistributionTag $distributionTag
        if ($ReleaseVersion.Contains('-')) {
            foreach ($identifier in ($ReleaseVersion -split '-', 2)[1].Split('.')) {
                if ($identifier -match '^0[0-9]+$') { throw 'Numeric prerelease identifiers cannot have leading zeros.' }
            }
        }
        if ($Preview) {
            Write-Host 'DRY RUN: plan only. Preconditions, auth, signing and registry availability were not checked.'
            $state.Commit = 'unchanged (dry run)'; $state.Result = 'DRY RUN'; $script:ReleaseExitCode = 0
            return
        }
        $gitExe = Resolve-ReleaseApplication 'git.exe'
        $npmExe = Resolve-ReleaseApplication 'npm.cmd'
        $nodeExe = Resolve-ReleaseApplication 'node.exe'
        Push-Location -LiteralPath $Root
        $pushedLocation = $true
        if ([IO.Path]::GetFullPath((Get-ReleaseGit -Arguments @('rev-parse', '--show-toplevel'))) -ine $Root) { throw 'Wrong repository root.' }
        $baseCommit = Get-ReleaseGit -Arguments @('rev-parse', '--verify', 'HEAD')
        $state.Commit = $baseCommit
        $gitReady = $true
        Assert-ReleaseGitContext -ExpectedHead $baseCommit -Clean
        foreach ($arguments in @(@('remote', 'get-url', '--all', 'origin'), @('remote', 'get-url', '--push', '--all', 'origin'))) {
            if ((Get-ReleaseGit -Arguments $arguments) -notmatch '^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)shyam3089/qubits(\.git)?/?$') { throw 'origin must have one fetch/push URL for github.com/shyam3089/qubits.' }
        }
        $remoteHead = Get-ReleaseGit -Arguments @('ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/main')
        $remoteMatch = [regex]::Match($remoteHead, '\A([0-9a-f]{40}|[0-9a-f]{64})[ \t]+refs/heads/main\z')
        if (-not $remoteMatch.Success) { throw 'origin/main returned an unexpected response; refusing to infer a release commit.' }
        Invoke-ReleaseCommand -Tool $gitExe -Arguments @('merge-base', '--is-ancestor', $remoteMatch.Groups[1].Value, 'HEAD')
        $localTag = Invoke-ReleaseCommand -Tool $gitExe -Arguments @('show-ref', '--verify', '--quiet', $tagRef) -Capture -AllowFailure
        if ($localTag.ExitCode -eq 0 -or (Get-ReleaseGit -Arguments @('ls-remote', '--tags', 'origin', $tagRef))) { $state.TagStatus = 'ALREADY EXISTS'; throw "$tag already exists. Tags are never replaced." }
        if ($localTag.ExitCode -ne 1) { throw 'Could not check local tag absence.' }
        $signingKey = Get-ReleaseGit -Arguments @('config', '--get', 'user.signingkey')
        if (-not $signingKey) { throw 'Configure an existing SSH Git signing key before releasing.' }
        if ($signingKey -notmatch '^(key::)?(ssh-|ecdsa-)') {
            $keyPath = Get-ReleaseGit -Arguments @('config', '--path', '--get', 'user.signingkey')
            if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw 'user.signingKey must identify an existing SSH signing key.' }
        }
        $signers = Get-ReleaseGit -Arguments @('config', '--path', '--get', 'gpg.ssh.allowedSignersFile')
        if (-not (Test-Path -LiteralPath $signers -PathType Leaf)) { throw 'SSH verification requires an existing allowedSignersFile.' }
        $auth = Invoke-ReleaseCommand -Tool $npmExe -Arguments @('whoami', '--registry', $registry) -Capture -AllowFailure
        if ($auth.ExitCode -ne 0 -or -not $auth.Output.Trim()) { throw 'Existing npm authentication is required. Authenticate normally outside this script.' }
        $baselineVersion = $null
        foreach ($package in $packages) {
            $manifest = Get-Content -LiteralPath (Join-Path $package.Path 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($manifest.name -cne $package.Name) { throw 'Unexpected package name.' }
            if ($null -eq $baselineVersion) { $baselineVersion = $manifest.version }
            if ($manifest.version -cne $baselineVersion) { throw 'Baseline package versions disagree.' }
            $config = $manifest.PSObject.Properties['publishConfig']
            if ($config -and $config.Value.PSObject.Properties['registry'] -and ($config.Value.registry.TrimEnd('/') -cne $registry.TrimEnd('/'))) { throw 'Package publishConfig points at another registry.' }
            if ($manifest.PSObject.Properties['private'] -and $manifest.private) { throw 'Refusing to publish a private package.' }
            Assert-ReleaseVersionMissing -Package $package -ReleaseVersion $ReleaseVersion
        }
        if ((Read-Host "Type 'PUBLISH $ReleaseVersion' to execute this complete release") -cne "PUBLISH $ReleaseVersion") { $state.Result = 'CANCELLED'; return }
        Assert-ReleaseGitContext -ExpectedHead $baseCommit -Clean
        $state.Phase = 'metadata update'
        $state.Files = 'UPDATE ATTEMPTED (inspect tree on failure)'
        Update-ReleaseMetadata -ReleaseVersion $ReleaseVersion -BaseCommit $baseCommit
        $state.Files = 'UPDATED'
        $state.Phase = 'sync/build'
        Invoke-ReleaseCommand -Tool $npmExe -Arguments @('run', 'sync', '--ignore-scripts')
        Invoke-ReleaseCommand -Tool $npmExe -Arguments @('run', 'build', '--ignore-scripts')
        foreach ($package in $packages) {
            $manifest = Get-Content -LiteralPath (Join-Path $package.Path 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($manifest.name -cne $package.Name -or $manifest.version -cne $ReleaseVersion) { throw 'Generated package identity/version mismatch.' }
            $entries = @($manifest.bin.PSObject.Properties | ForEach-Object { $_.Value })
            if ($package.Name -ceq 'qbits') { foreach ($entry in $manifest.exports.PSObject.Properties) { $entries += $entry.Value.types; $entries += $entry.Value.import } }
            foreach ($entry in $entries) { if (-not (Test-Path -LiteralPath (Join-Path $package.Path $entry) -PathType Leaf)) { throw "Missing distributable entry: $entry" } }
        }
        if ((Get-Content -LiteralPath 'docs/manifest.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version -cne $ReleaseVersion) { throw 'Generated documentation version mismatch.' }
        Assert-ReleaseGitContext -ExpectedHead $baseCommit
        if (Get-ReleaseGit -Arguments @('ls-files', '--others', '--exclude-standard')) { throw 'Unexpected untracked files after sync/build.' }
        $changed = @((Get-ReleaseGit -Arguments @('diff', '--name-only', 'HEAD')) -split '\r?\n' | Where-Object { $_ })
        foreach ($path in $changed) {
            if ($path -notmatch '^(package(-lock)?\.json|README\.md|CHANGELOG\.md|RELEASE_NOTES\.md|docs/[^/]+\.(md|json)|packages/create/(package\.json|README\.md|identity\.json|LICENSE|NOTICE|TRADEMARKS\.md|THIRD_PARTY_NOTICES\.md|tooling/[^/]+\.mjs))$') { throw "Unexpected non-release change: $path" }
        }
        $state.Phase = 'release commit'
        if ($changed.Count -gt 0) {
            Invoke-ReleaseCommand -Tool $gitExe -Arguments (@('add', '--') + $changed)
            Invoke-ReleaseCommand -Tool $gitExe -Arguments @('diff', '--cached', '--check')
            $state.CommitStatus = 'ATTEMPTED'
            Invoke-ReleaseCommand -Tool $gitExe -Arguments @('-c', 'gpg.format=ssh', 'commit', '-m', "release: v$ReleaseVersion [skip ci]")
            $state.CommitStatus = 'CREATED'
            $state.Files = 'COMMITTED'
        }
        $state.Commit = Get-ReleaseGit -Arguments @('rev-parse', '--verify', 'HEAD')
        Assert-ReleaseGitContext -ExpectedHead $state.Commit -Clean
        if ((Get-ReleaseGit -Arguments @('log', '-1', '--format=%B')) -notmatch '\[skip ci\]') { throw 'Release commit must contain [skip ci]; Actions must not run.' }
        $state.Phase = 'SSH tag'
        $state.TagStatus = 'ATTEMPTED (inspect local tag on failure)'
        Invoke-ReleaseCommand -Tool $gitExe -Arguments @('-c', 'gpg.format=ssh', 'tag', '-s', '-m', "Qbits $tag [skip ci]", '--', $tag)
        Invoke-ReleaseCommand -Tool $gitExe -Arguments @('-c', 'gpg.format=ssh', 'verify-tag', $tagRef)
        if ((Get-ReleaseGit -Arguments @('rev-parse', '--verify', "${tagRef}^{commit}")) -cne $state.Commit) { throw 'Signed tag does not match the release commit.' }
        $state.TagStatus = 'SIGNED AND VERIFIED'
        $tagObject = Get-ReleaseGit -Arguments @('rev-parse', '--verify', $tagRef)
        $state.Phase = 'GitHub push'
        foreach ($arguments in @(@('remote', 'get-url', '--all', 'origin'), @('remote', 'get-url', '--push', '--all', 'origin'))) {
            if ((Get-ReleaseGit -Arguments $arguments) -notmatch '^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)shyam3089/qubits(\.git)?/?$') { throw 'origin changed before the release push.' }
        }
        $pushArguments = @(Get-ReleaseRemoteGitArguments -Arguments @('-c', 'push.followTags=false', 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', "${tagRef}:${tagRef}"))
        $state.Push = 'ATTEMPTED (remote outcome unknown on failure)'
        Invoke-ReleaseCommand -Tool $gitExe -Arguments $pushArguments
        $state.Push = 'PUSHED (commit and tag)'
        foreach ($package in $packages) {
            $state.Phase = "publish $($package.Name)"
            Assert-ReleaseGitContext -ExpectedHead $state.Commit -Clean
            if ((Get-ReleaseGit -Arguments @('rev-parse', '--verify', $tagRef)) -cne $tagObject) { throw 'Release tag changed before publication.' }
            Assert-ReleaseVersionMissing -Package $package -ReleaseVersion $ReleaseVersion
            Push-Location -LiteralPath $package.Path
            try {
                Write-Host "Publishing $($package.Name)@$ReleaseVersion with npm tag $distributionTag..."
                $package.Status = 'ATTEMPTED (registry outcome unknown on failure)'
                Invoke-ReleaseCommand -Tool $npmExe -Arguments @('publish', '--tag', $distributionTag, '--access', 'public', '--ignore-scripts', '--fetch-retries=0', '--registry', $registry)
                $package.Status = 'PUBLISHED (npm reported success)'
            } finally { Pop-Location }
        }
        $state.Result = 'SUCCESS'
        $script:ReleaseExitCode = 0
    } catch {
        Write-Host "ERROR during $($state.Phase): $($_.Exception.Message)"
    } finally {
        if ($gitReady) {
            try {
                $head = Invoke-ReleaseCommand -Tool $gitExe -Arguments @('rev-parse', '--verify', 'HEAD') -Capture -AllowFailure
                if ($head.ExitCode -eq 0) { $state.Commit = $head.Output.Trim() }
            } catch { Write-Host 'Could not refresh HEAD for the final report; inspect Git manually.' }
        }
        if ($pushedLocation) { Pop-Location }
        Write-Host "Final status: $($state.Result); commit: $($state.Commit) ($($state.CommitStatus))"
        Write-Host "Release files: $($state.Files)"
        Write-Host "Tag: $tag ($($state.TagStatus)); GitHub: $($state.Push)"
        foreach ($package in $packages) { Write-Host "npm $($package.Name)@$ReleaseVersion [$distributionTag]: $($package.Status)" }
        if ($state.Result -eq 'FAILED') {
            if ($state.Files -ne 'unchanged') { Write-Host 'PARTIAL RELEASE: local and/or remote steps may have completed.' }
            Write-Host 'STOP: completed work is retained. Inspect local/remote Git and npm before manual recovery. No automatic retry or rollback.'
        }
    }
}

# Dot-sourcing defines functions only, permitting isolated validation with mocked commands.
if ($MyInvocation.InvocationName -ne '.') {
    Invoke-QbitsRelease -ReleaseVersion $Version -Preview:$DryRun
    exit $script:ReleaseExitCode
}
