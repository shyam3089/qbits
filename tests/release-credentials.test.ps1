# Run: powershell.exe -NoProfile -File tests/release-credentials.test.ps1
# All Git commands are mocked. No network, config writes, signing or release actions.
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/release.ps1')
$gitExe = 'git.exe'
$script:Helpers = "manager`nmanager-core`n"
$script:ConfigExit = 0
$script:AuthFailure = $false
$script:Calls = @()
function Invoke-ReleaseCommand {
    param($Tool, [string[]]$Arguments, [switch]$Capture, [switch]$AllowFailure)
    $script:Calls += [pscustomobject]@{ Arguments = $Arguments.Clone() }
    $code = 0; $output = ''; $errorOutput = ''
    if (($Arguments -join ' ') -ceq 'config --get-all credential.helper') {
        $code = $script:ConfigExit; $output = $script:Helpers
        if ($code -gt 1) { $errorOutput = 'fatal: config read failed' }
    } elseif ($Arguments -contains 'ls-remote') {
        if ($Arguments -notcontains 'credential.helper=' -or $Arguments -contains 'credential.helper=manager-core') {
            $code = 128; $errorOutput = "git: 'credential-manager-core' is not a git command"
        } elseif ($script:AuthFailure) {
            $code = 128; $errorOutput = 'fatal: Authentication failed'
        } else { $output = ('a' * 40) + "`trefs/heads/main`n" }
    } elseif (($Arguments -join ' ') -ceq 'config --get user.signingkey') {
        $output = 'ssh-ed25519 MOCK-PUBLIC-KEY'
    } else { throw 'Unexpected mock Git command.' }
    return [pscustomobject]@{ ExitCode = $code; Output = $output; ErrorOutput = $errorOutput }
}
$probe = @('ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/main')
$broken = Invoke-ReleaseCommand -Tool $gitExe -Arguments $probe -Capture -AllowFailure
if ($broken.ExitCode -ne 128 -or $broken.ErrorOutput -notmatch 'credential-manager-core') { throw 'Missing helper was not reproduced.' }
$head = Get-ReleaseGit -Arguments $probe
if ($head -cne (('a' * 40) + "`trefs/heads/main")) { throw 'Remote lookup failed with the temporary override.' }
$expected = @('-c', 'credential.helper=', '-c', 'credential.helper=manager') + $probe
if (($script:Calls[-1].Arguments -join '|') -cne ($expected -join '|')) { throw 'Working credential helper was not preserved.' }

$script:Helpers = "manager`nmanager-core`n!gh auth git-credential`n"
$options = @(Get-ReleaseRemoteGitArguments -Arguments $probe)
if ($options -notcontains 'credential.helper=!gh auth git-credential' -or $options -contains 'credential.helper=manager-core') { throw 'Configured helper filtering changed authentication.' }
$script:Helpers = "store`n`nmanager`nmanager-core`n"
$options = @(Get-ReleaseRemoteGitArguments -Arguments $probe)
if (($options -join '|') -cne ($expected -join '|')) { throw 'An explicit empty helper reset was lost.' }
$script:Helpers = "manager`nmanager-core`n`n"
$options = @(Get-ReleaseRemoteGitArguments -Arguments $probe)
if (($options -join '|') -cne ((@('-c', 'credential.helper=') + $probe) -join '|')) { throw 'A final empty helper reset was lost.' }
$script:ConfigExit = 1; $script:Helpers = ''
$options = @(Get-ReleaseRemoteGitArguments -Arguments $probe)
if (($options -join '|') -cne ((@('-c', 'credential.helper=') + $probe) -join '|')) { throw 'No-helper configuration was not supported.' }

$script:ConfigExit = 0; $script:Helpers = "manager`nmanager-core`n"
$push = @('-c', 'push.followTags=false', 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', 'refs/tags/v1.0.0:refs/tags/v1.0.0')
$options = @(Get-ReleaseRemoteGitArguments -Arguments $push)
if (($options -join '|') -cne ((@('-c', 'credential.helper=', '-c', 'credential.helper=manager') + $push) -join '|')) { throw 'Push lost its credential override or existing safeguards.' }
$before = $script:Calls.Count
$key = Get-ReleaseGit -Arguments @('config', '--get', 'user.signingkey')
if ($key -cne 'ssh-ed25519 MOCK-PUBLIC-KEY' -or $script:Calls.Count -ne $before + 1) { throw 'SSH signing configuration was intercepted.' }

$script:AuthFailure = $true
$before = @($script:Calls | Where-Object { $_.Arguments -contains 'ls-remote' }).Count
$stopped = $false
try { Get-ReleaseGit -Arguments $probe } catch { $stopped = $_.Exception.Message -match 'exit 128' }
$after = @($script:Calls | Where-Object { $_.Arguments -contains 'ls-remote' }).Count
if (-not $stopped -or $after -ne $before + 1) { throw 'Authentication failure was ignored or retried.' }
$script:ConfigExit = 128
$before = $after; $stopped = $false
try { Get-ReleaseGit -Arguments $probe } catch { $stopped = $true }
if (-not $stopped -or @($script:Calls | Where-Object { $_.Arguments -contains 'ls-remote' }).Count -ne $before) { throw 'A configuration error did not stop remote access.' }
Write-Host 'PASS: temporary helper overrides, working auth preservation, SSH isolation and fail-closed Git errors.'
