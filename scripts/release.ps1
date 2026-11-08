<#
Usage: .\scripts\release.ps1 [-Version 1.0.0] [-DryRun]
Run from an already-built, validated release checkout. HEAD must match the verified
signed annotated tag v<Version>. DryRun validates and prints the plan without npm.
Real publishing asks once for confirmation, then uses existing npm browser/2FA auth.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$')]
    [string]$Version = '1.0.0',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tagRef = "refs/tags/v$Version"
$published = @()
$attempted = $null
$status = 'FAILED'
$exitCode = 1
$locationPushed = $false

function Invoke-ReleaseGit {
    param([string[]]$GitArguments)
    $output = & $gitExe @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArguments -join ' ') failed (exit $LASTEXITCODE)."
    }
    return $output
}

function Assert-ReleaseUnchanged {
    if (Invoke-ReleaseGit -GitArguments @('status', '--porcelain=v1', '--untracked-files=all')) {
        throw 'The Git tree must be clean, including untracked files.'
    }
    if ((Invoke-ReleaseGit -GitArguments @('rev-parse', '--verify', 'HEAD')) -cne $releaseCommit) {
        throw 'HEAD changed or no longer matches the signed release commit.'
    }
    if ((Invoke-ReleaseGit -GitArguments @('rev-parse', '--verify', $tagRef)) -cne $tagObject) {
        throw 'The signed release tag changed.'
    }
}

try {
    $gitExe = (Get-Command git.exe -CommandType Application -ErrorAction Stop).Source
    $npmExe = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
    Push-Location -LiteralPath $releaseRoot
    $locationPushed = $true
    $gitRoot = Invoke-ReleaseGit -GitArguments @('rev-parse', '--show-toplevel')
    if ([IO.Path]::GetFullPath($gitRoot) -ine $releaseRoot) {
        throw 'The script must belong to the Qbits repository root.'
    }

    Write-Host "Validating Qbits $Version release checkout..."
    $packages = @(
        [pscustomobject]@{ Name = 'qbits'; Path = $releaseRoot },
        [pscustomobject]@{ Name = 'create-qb'; Path = (Join-Path $releaseRoot 'packages/create') }
    )
    foreach ($package in $packages) {
        $manifest = Get-Content -LiteralPath (Join-Path $package.Path 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($manifest.name -cne $package.Name -or $manifest.version -cne $Version) {
            throw "Expected $($package.Name)@$Version in $($package.Path)/package.json."
        }
        $entryPoints = @($manifest.bin.PSObject.Properties | ForEach-Object { $_.Value })
        if ($package.Name -ceq 'qbits') {
            foreach ($entry in $manifest.exports.PSObject.Properties) {
                $entryPoints += $entry.Value.types
                $entryPoints += $entry.Value.import
            }
        }
        foreach ($entryPoint in $entryPoints) {
            if (-not (Test-Path -LiteralPath (Join-Path $package.Path $entryPoint) -PathType Leaf)) {
                throw "Missing prepared entry point: $($package.Name)/$entryPoint. This script does not build."
            }
        }
    }

    $tagObject = Invoke-ReleaseGit -GitArguments @('rev-parse', '--verify', $tagRef)
    if ((Invoke-ReleaseGit -GitArguments @('cat-file', '-t', $tagRef)) -cne 'tag') {
        throw "v$Version must be a signed annotated tag."
    }
    Invoke-ReleaseGit -GitArguments @('verify-tag', $tagRef)
    $releaseCommit = Invoke-ReleaseGit -GitArguments @('rev-parse', '--verify', "${tagRef}^{commit}")
    Assert-ReleaseUnchanged
    Write-Host "Verified v$Version at $releaseCommit. Order: qbits, then create-qb."

    if ($DryRun) {
        foreach ($package in $packages) {
            Write-Host "DRY RUN [$($package.Path)]: npm publish --tag latest --access public --ignore-scripts"
        }
        $status = 'DRY RUN PASS'
        $exitCode = 0
    } else {
        $confirmation = Read-Host "Type 'PUBLISH $Version' to publish both packages from this commit"
        if ($confirmation -cne "PUBLISH $Version") {
            $status = 'CANCELLED'
        } else {
            foreach ($package in $packages) {
                Assert-ReleaseUnchanged
                Write-Host "Publishing $($package.Name)@$Version to latest..."
                Push-Location -LiteralPath $package.Path
                try {
                    $attempted = "$($package.Name)@$Version"
                    # Preserve interactive npm auth; never run build/test lifecycle hooks.
                    & $npmExe publish --tag latest --access public --ignore-scripts
                    if ($LASTEXITCODE -ne 0) {
                        throw "npm publish for $attempted failed (exit $LASTEXITCODE)."
                    }
                    $published += $attempted
                    $attempted = $null
                } finally {
                    Pop-Location
                }
            }
            $status = 'SUCCESS'
            $exitCode = 0
        }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
} finally {
    if ($locationPushed) { Pop-Location }
    Write-Host "Final status: $status"
    if ($published.Count -gt 0) {
        Write-Host "npm reported successful publication: $($published -join ', ')."
        if ($status -ne 'SUCCESS') { Write-Host 'PARTIAL PUBLICATION: the remaining release did not complete successfully.' }
    }
    if ($attempted) {
        Write-Host "Publication was attempted for $attempted; its registry outcome may be successful or unknown."
        Write-Host 'STOP: verify registry state before any manual retry. No automatic retry or further publish will run.'
    } elseif ($published.Count -eq 0) {
        Write-Host 'No npm publish command was run.'
    } elseif ($status -ne 'SUCCESS') {
        Write-Host 'No further package was attempted.'
    }
}
exit $exitCode
