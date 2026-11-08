# Run: powershell.exe -NoProfile -File tests/release-capture.test.ps1
# Local processes/Git metadata only; no registry, signing, push or publishing.
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/release.ps1')
$nodeExe = Resolve-ReleaseApplication 'node.exe'
$npmExe = Resolve-ReleaseApplication 'npm.cmd'
if ($npmExe -isnot [string] -or $npmExe -cne @(Get-Command npm.cmd -CommandType Application)[0].Source) { throw 'npm resolution must select the first PATH entry.' }

$result = Invoke-ReleaseCommand -Tool $nodeExe -Arguments @('-e', 'process.stderr.write("warning");process.stdout.write("ok")') -Capture
if ($result.ExitCode -ne 0 -or $result.Output -cne 'ok' -or $result.ErrorOutput -cne 'warning') { throw 'stdout/stderr separation failed.' }

# Reproduce ls-remote succeeding while Git emits a credential-helper diagnostic.
$gitExe = $nodeExe
$head = Get-ReleaseGit -Arguments @('-e', 'process.stderr.write("git: credential-helper warning");process.stdout.write("a".repeat(40)+"\trefs/heads/main\n")')
if ($head -cne (('a' * 40) + "`trefs/heads/main")) { throw 'Git diagnostic contaminated the remote ref.' }

# ProcessStartInfo must use PowerShell's location, not .NET's independent cwd.
$gitExe = Resolve-ReleaseApplication 'git.exe'
$repository = Split-Path -Parent $PSScriptRoot
$savedDirectory = [Environment]::CurrentDirectory
Push-Location -LiteralPath $repository
try {
    [Environment]::CurrentDirectory = [IO.Path]::GetTempPath()
    $root = Get-ReleaseGit -Arguments @('rev-parse', '--show-toplevel')
    if ([IO.Path]::GetFullPath($root) -ine $repository) { throw 'Captured command used the wrong working directory.' }
} finally { [Environment]::CurrentDirectory = $savedDirectory; Pop-Location }

$expected = @('space value', 'embedded"quote', 'trailing\', '')
$result = Invoke-ReleaseCommand -Tool $nodeExe -Arguments (@('-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))') + $expected) -Capture
$actual = $result.Output | ConvertFrom-Json
if ($actual.Count -ne $expected.Count) { throw 'Native argument count changed.' }
for ($index = 0; $index -lt $expected.Count; $index++) {
    if ($actual[$index] -cne $expected[$index]) { throw 'Native argument quoting changed.' }
}

$failure = Invoke-ReleaseCommand -Tool $nodeExe -Arguments @('-e', 'process.stderr.write(JSON.stringify({error:{code:"E404"}}));process.exit(1)') -Capture -AllowFailure
if ($failure.ExitCode -ne 1 -or $failure.Output -cne '' -or $failure.ErrorOutput -notmatch 'E404') { throw 'Stderr-only error capture failed.' }
$stopped = $false
try { Invoke-ReleaseCommand -Tool $nodeExe -Arguments @('-e', 'process.exit(1)') -Capture } catch { $stopped = $true }
if (-not $stopped) { throw 'Native failure was ignored.' }

$batchPath = Join-Path ([IO.Path]::GetTempPath()) ('qbits-capture-' + [guid]::NewGuid().ToString('N') + '.cmd')
try {
    [IO.File]::WriteAllText($batchPath, "@echo off`r`necho batch-warning 1>&2`r`nexit /b 17`r`n", [Text.Encoding]::ASCII)
    $batch = Invoke-ReleaseCommand -Tool $batchPath -Arguments @('--probe') -Capture -AllowFailure
    if ($batch.ExitCode -ne 17 -or $batch.Output -cne '' -or $batch.ErrorOutput.Trim() -cne 'batch-warning') { throw 'Batch exit/stderr capture failed.' }
} finally { if (Test-Path -LiteralPath $batchPath) { Remove-Item -LiteralPath $batchPath -Force } }

$npmVersion = Invoke-ReleaseCommand -Tool $npmExe -Arguments @('--version') -Capture -AllowFailure
if ($npmVersion.ExitCode -ne 0 -or $npmVersion.Output.Trim() -notmatch '^\d+\.\d+\.\d+$') { throw "Windows npm.cmd capture failed: $($npmVersion.ErrorOutput)" }

# Registry errors may be JSON on either stream. No npm query is executed here.
$script:RegistryResult = $failure
function Invoke-ReleaseCommand {
    param($Tool, $Arguments, [switch]$Capture, [switch]$AllowFailure)
    return $script:RegistryResult
}
$registry = 'https://registry.npmjs.org/'
$package = [pscustomobject]@{ Name = 'qbits'; Status = 'NOT ATTEMPTED' }
Assert-ReleaseVersionMissing -Package $package -ReleaseVersion '1.0.0'
$script:RegistryResult = [pscustomobject]@{ ExitCode = 1; Output = ''; ErrorOutput = '{"error":{"code":"E401"}}' }
$stopped = $false
try { Assert-ReleaseVersionMissing -Package $package -ReleaseVersion '1.0.0' } catch { $stopped = $true }
if (-not $stopped) { throw 'Authentication failure was mistaken for an absent version.' }
Write-Host 'PASS: release command capture, quoting, exit handling, and registry-error classification.'
