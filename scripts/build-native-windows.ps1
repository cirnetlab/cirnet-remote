#Requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Selection,
    [Parameter(Mandatory)][string] $OutputParent,
    [switch] $Offline
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-StrictMode -Version Latest

if (-not $IsWindows -or $env:VSCMD_ARG_TGT_ARCH -ne 'x64') {
    throw 'Run from an x64 MSVC developer PowerShell.'
}
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$repoNames = @(
    'cirnet-contracts-next', 'cirnet-simulator-next', 'cirnet-hardware-next',
    'cirnet-remote-next', 'cirnet-interface-next', 'cirnet-embedded-hardware'
)
$roots = @($repoNames | ForEach-Object { Join-Path $workspace $_ })
$allocator = Join-Path $roots[0] 'tools/artifact-paths/cirnet_artifact_paths/artifact-paths.mjs'
$env:CIRNET_ARTIFACTS_CONTEXT = @{ owner = 'cirnet-next-native-candidate'; roots = $roots } | ConvertTo-Json -Compress
$env:CIRNET_ARTIFACTS_SESSION = $null
$env:NETCIRCUIT_ARTIFACTS_SESSION = $null
$env:CIRNET_ARTIFACTS_SESSION = node $allocator --directory (Resolve-Path -LiteralPath $OutputParent).Path
$session = $env:CIRNET_ARTIFACTS_SESSION
Write-Host "Candidate build session $session"
$selectionPath = Join-Path $session 'selection.json'
Copy-Item -LiteralPath $Selection -Destination $selectionPath
$sources = Join-Path $session 'src'
node (Join-Path $PSScriptRoot 'native-source-selection.mjs') stage $selectionPath $sources
$lockedSources = Get-Content -LiteralPath $selectionPath -Raw | ConvertFrom-Json -AsHashtable

$contracts = Join-Path $sources $repoNames[0]
$simulator = Join-Path $sources $repoNames[1]
$hardware = Join-Path $sources $repoNames[2]
$remote = Join-Path $sources $repoNames[3]
$web = Join-Path $sources $repoNames[4]
$embedded = Join-Path $sources $repoNames[5]
$target = 'x86_64-pc-windows-msvc'
$env:CARGO_TARGET_DIR = Join-Path $session 'target'
$env:CARGO_ENCODED_RUSTFLAGS = "-C$([char]31)target-feature=+crt-static"
$env:CIRNET_CANDIDATE_NPM = npm.cmd --version
$env:CIRNET_ARTIFACTS_CLI = Join-Path $contracts 'tools/artifact-paths/cirnet_artifact_paths/artifact-paths.mjs'
$env:CIRNET_ARTIFACT_PATHS_MODULE = [Uri]::new($env:CIRNET_ARTIFACTS_CLI).AbsoluteUri
$env:TEMP = $env:TMP = Join-Path $session 'tmp'
$null = New-Item -ItemType Directory -Path $env:TEMP
if ($Offline) {
    $env:CARGO_NET_OFFLINE = 'true'
    $env:npm_config_offline = 'true'
}

function In-Directory([string] $Directory, [scriptblock] $Action) {
    Push-Location -LiteralPath $Directory
    try { & $Action } finally { Pop-Location }
}
function Get-Sha([string] $Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Write-Json([string] $Path, $Value) {
    $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $Path -Encoding utf8
}
function Build-Service([string] $Root, [string] $Binary) {
    In-Directory $Root { cargo.exe build --locked --release --target $target --bin $Binary }
}

$version = (Get-Content -LiteralPath (Join-Path $remote 'Cargo.toml') |
    Select-String '^version\s*=\s*"([^"]+)"' | Select-Object -First 1).Matches[0].Groups[1].Value
if ($version -cnotmatch '^\d+\.\d+\.\d+-dev\.\d+$') { throw 'Expected a next-generation development version.' }
$contractPackage = Join-Path $session 'contracts'
$contractReceipt = Join-Path $contractPackage 'contracts-native-manifest.json'
In-Directory $contracts { node scripts/package-native.mjs $contractPackage }
$contractHash = Get-Sha $contractReceipt
$contractCrate = Join-Path $env:CARGO_TARGET_DIR "package/cirnet-contracts-native-$version.crate"
In-Directory $contracts { node scripts/check-native-package.mjs $contractPackage $contractCrate }
$env:CIRNET_CONTRACTS_ROOT = Join-Path $contractPackage 'resources'

$simBuild = Join-Path $session 'sim-build'
cmake.exe -S $simulator -B $simBuild -G 'Visual Studio 17 2022' -A x64
cmake.exe --build $simBuild --config Release
cmake.exe --install $simBuild --config Release --prefix (Join-Path $session 'sim')

Build-Service $hardware 'cirnet-hardware'
Build-Service $remote 'cirnet-remote'
$remoteBinary = Join-Path $env:CARGO_TARGET_DIR "$target/release/cirnet-remote.exe"
$openapi = Join-Path $session 'remote-openapi.json'
& $remoteBinary --export-openapi > $openapi

$sdk = Join-Path $session 'sdk'
$sdkTools = Join-Path $session 'sdk-tools'
$null = New-Item -ItemType Directory -Path $sdkTools
$sdkSource = Join-Path $contracts 'packages/public-sdk'
foreach ($file in @('package.json', 'package-lock.json')) {
    Copy-Item -LiteralPath (Join-Path $sdkSource $file) -Destination $sdkTools
}
In-Directory $sdkTools { npm.cmd ci --ignore-scripts --no-audit --no-fund }
In-Directory $contracts {
    node scripts/check_public_sdk.mjs --native-bundle $contractPackage --native-bundle-sha256 $contractHash `
        --native-crate $contractCrate --remote-openapi $openapi --node-tools $sdkTools --output $sdk
}
$sdkArchive = Join-Path $sdk "cirnet-contracts-$version.tgz"
$devArchive = Join-Path $sdk "cirnet-artifact-paths-$version.tgz"
In-Directory (Join-Path $contracts 'tools/artifact-paths') { npm.cmd pack --ignore-scripts --pack-destination $sdk }

$interfaceInput = Join-Path $session 'interface-input.json'
Write-Json $interfaceInput @{
    npm = @{ path = $sdkArchive; sha256 = Get-Sha $sdkArchive }
    dev_npm = @{ path = $devArchive; sha256 = Get-Sha $devArchive }
    native_crate = @{ path = $contractCrate; sha256 = Get-Sha $contractCrate }
    remote_openapi = @{ path = $openapi; sha256 = Get-Sha $openapi }
}
In-Directory $web {
    node scripts/bootstrap-contracts.mjs --manifest $interfaceInput | Out-Null
    npm.cmd ci --ignore-scripts --no-audit --no-fund
    npm.cmd run build
}
$interfaceSource = $lockedSources.repositories[$repoNames[4]]
Write-Json (Join-Path $web 'dist/interface-artifact.json') @{
    name = $repoNames[4]; kind = 'static'; version = $version
    sourceFingerprint = $interfaceSource.sourceSha256
    contractsSha256 = Get-Sha $sdkArchive
    contractsCrateSha256 = Get-Sha $contractCrate
    remoteOpenapiSha256 = Get-Sha $openapi
}

$embeddedArchive = Join-Path $session "cirnet-embedded-hardware-$version-native-source.tar.gz"
$embeddedSource = $lockedSources.repositories[$repoNames[5]]
$embeddedProvenance = Join-Path $session 'embedded-source.json'
Write-Json $embeddedProvenance @{
    repository = "https://github.com/cirnetlab/$($repoNames[5]).git"
    revision = $embeddedSource.baseRevision
    sourceSha256 = $embeddedSource.sourceSha256
    uncommittedMigration = $embeddedSource.dirty
}
$env:CIRNET_ARTIFACTS_CLI_SHA256 = Get-Sha $env:CIRNET_ARTIFACTS_CLI
In-Directory $embedded {
    node scripts/build-source.mjs --output $embeddedArchive --contracts-receipt $contractReceipt `
        --contracts-sha256 $contractHash --provenance $embeddedProvenance
}

In-Directory $remote { node scripts/package-native-windows.mjs $session }
$result = Get-Content -LiteralPath (Join-Path $session 'assembly-result.json') -Raw | ConvertFrom-Json
node (Join-Path $remote 'scripts/verify-native-windows.mjs') $result.directory $result.manifestSha256
