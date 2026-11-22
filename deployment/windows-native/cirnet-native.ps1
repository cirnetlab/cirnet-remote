[CmdletBinding(PositionalBinding=$false)]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Install','Doctor','Migrate','BootstrapAdmin','Maintenance','Start','Stop','Restart','Backup','Restore')]
    [string] $Action,
    [string] $BundleDirectory,
    [string] $InstallDirectory,
    [string] $ManifestSha256,
    [string] $ExpectedVersion,
    [string] $DataDirectory = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'CIRNET\Native'),
    [ValidateRange(1024,65535)][int] $Port = 8000,
    [ValidateRange(1024,65535)][int] $HardwarePort = 50051,
    [string] $Username,
    [ValidateRange(1,1000)][int] $Limit = 100,
    [switch] $DryRun,
    [switch] $InitializeDatabase,
    [switch] $OpenBrowser,
    [switch] $Check,
    [switch] $Interactive,
    [string] $Snapshot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Sha([string] $Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Join-InventoryPath([string] $Root, [string] $Relative) {
    $current = $Root
    foreach ($segment in $Relative.Split('/')) {
        if ($segment -notmatch '^[a-zA-Z0-9_-][a-zA-Z0-9_. -]*$' -or
            $segment.EndsWith('.') -or $segment.EndsWith(' ') -or
            $segment -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)') {
            throw "Unsafe inventory path: $Relative"
        }
        $current = Join-Path $current $segment
        if ((Test-Path -LiteralPath $current) -and
            ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Reparse point is forbidden: $current"
        }
    }
    $current
}

function Assert-Directory([string] $Directory) {
    $entry = Get-Item -LiteralPath $Directory -Force
    if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Expected a real directory: $Directory"
    }
}

function Confirm-Files([string] $Root, $Files) {
    Assert-Directory $Root
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($record in $Files) {
        if (-not $seen.Add($record.path) -or $record.sha256 -cnotmatch '^[a-f0-9]{64}$') {
            throw "Duplicate file or invalid digest: $($record.path)"
        }
        $file = Join-InventoryPath $Root $record.path
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or
            (Get-Item -LiteralPath $file).Length -ne $record.size -or
            (Get-Sha $file) -cne $record.sha256) {
            throw "Missing or modified artifact: $($record.path)"
        }
    }
    ,$seen
}

function Copy-Files([string] $Source, [string] $Destination, $Files) {
    foreach ($record in $Files) {
        $from = Join-InventoryPath $Source $record.path
        $to = Join-InventoryPath $Destination $record.path
        [void] [IO.Directory]::CreateDirectory((Split-Path -Parent $to))
        [IO.File]::Copy($from, $to, $false)
    }
}

function Confirm-Tree([string] $Directory, [string] $Prefix, $Inventory) {
    foreach ($entry in Get-ChildItem -LiteralPath $Directory -Force) {
        $relative = $Prefix + $entry.Name
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Unexpected reparse point: $relative"
        }
        if ($entry.PSIsContainer) {
            Confirm-Tree $entry.FullName ($relative + '/') $Inventory
        } elseif ($relative -cne 'native-manifest.json' -and -not $Inventory.Contains($relative)) {
            throw "Undeclared bundle file: $relative"
        }
    }
}

function Assert-Disjoint([string] $First, [string] $Second) {
    $left = [IO.Path]::GetFullPath($First).TrimEnd('\','/')
    $right = [IO.Path]::GetFullPath($Second).TrimEnd('\','/')
    if (($left + '\').StartsWith($right + '\', [StringComparison]::OrdinalIgnoreCase) -or
        ($right + '\').StartsWith($left + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Directories must be separate and may not contain one another.'
    }
}

$root = if ($BundleDirectory) { [IO.Path]::GetFullPath($BundleDirectory) } else { $PSScriptRoot }
Assert-Directory $root
$manifestPath = Join-InventoryPath $root 'native-manifest.json'
if (($Action -eq 'Install' -or $BundleDirectory -or $ManifestSha256) -and
    ($ManifestSha256 -notmatch '^[a-f0-9]{64}$' -or
    (Get-Sha $manifestPath) -ne $ManifestSha256)) {
    throw 'Supply the reviewed manifest SHA-256. The bundle identity did not match.'
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.target -ne 'x86_64-pc-windows-msvc' -or
    $manifest.product -ne 'cirnet-native-candidate' -or -not [Environment]::Is64BitOperatingSystem) {
    throw 'Unsupported native bundle or host.'
}
if ($ExpectedVersion -and $manifest.version -cne $ExpectedVersion) {
    throw "Expected CIRNET native $ExpectedVersion. Bundle declares $($manifest.version)."
}
$required = @('bin/cirnet-remote.exe','bin/cirnet-hardware.exe','bin/cirnet-simulator-worker.exe',
              'bin/cirnet-contracts.exe','resources/contracts/api/openapi.json','web/index.html',
              'cirnet-native.ps1')
if ($Action -ne 'Stop') {
    $inventory = Confirm-Files $root $manifest.files
    Confirm-Tree $root '' $inventory
    foreach ($path in $required) {
        if (-not $inventory.Contains($path)) { throw "Required artifact is not declared: $path" }
    }
}
if ($Action -eq 'Install') {
    if (-not $InstallDirectory) { throw '-InstallDirectory is required.' }
    $destination = [IO.Path]::GetFullPath($InstallDirectory)
    Assert-Disjoint $root $destination
    if (Test-Path -LiteralPath $destination) { throw 'Install destination already exists.' }
    [void] [IO.Directory]::CreateDirectory($destination)
    Copy-Files $root $destination $manifest.files
    $null = Confirm-Files $destination $manifest.files
    [IO.File]::Copy($manifestPath, (Join-Path $destination 'native-manifest.json'), $false)
    Write-Output "Installed CIRNET native candidate at $destination"
    return
}
if ($Port -eq $HardwarePort) { throw 'HTTP and Hardware ports must differ.' }
$data = [IO.Path]::GetFullPath($DataDirectory)
Assert-Disjoint $root $data
if ($Action -ne 'Restore') {
    [void] [IO.Directory]::CreateDirectory($data)
    Assert-Directory $data
}
$database = Join-InventoryPath $data 'cirnet.db'
$captures = Join-InventoryPath $data 'captures'
$control = Join-InventoryPath $data 'supervisor.json'
$lockPath = Join-InventoryPath $data 'run.lock'
$worker = Join-InventoryPath $root 'bin/cirnet-simulator-worker.exe'
$workerRecord = @($manifest.files | Where-Object { $_.path -ceq 'bin/cirnet-simulator-worker.exe' })
if ($workerRecord.Count -ne 1) { throw 'Worker artifact identity is missing.' }
$origin = "http://127.0.0.1:$Port"
$contracts = Join-InventoryPath $root 'bin/cirnet-contracts.exe'
$remote = Join-InventoryPath $root 'bin/cirnet-remote.exe'
$hardware = Join-InventoryPath $root 'bin/cirnet-hardware.exe'
$settings = @{
    CIRNET_ENV = 'development'
    CIRNET_REMOTE_READ_ONLY = 'false'
    CIRNET_HARDWARE_MODE = 'simulation'
    CIRNET_TRUSTED_ORIGINS = $origin
    CIRNET_ALLOW_GUEST = 'true'
    CIRNET_DATABASE_URL = 'sqlite:///' + $database.Replace('\','/')
    CIRNET_CAPTURE_DIR = $captures
    CIRNET_CONTRACTS_ROOT = (Join-InventoryPath $root 'resources')
    CIRNET_HARDWARE_GRPC_TARGET = "127.0.0.1:$HardwarePort"
    CIRNET_SIMULATION_BACKEND = 'cpp'
    CIRNET_SIM_CPP_WORKER = $worker
    CIRNET_SIM_CPP_WORKER_SHA256 = $workerRecord[0].sha256
}

function Start-NativeProcess([string] $Executable, [string[]] $Arguments, [bool] $Supervised, [string] $Password = '') {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Executable
    $start.WorkingDirectory = $data
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $Supervised
    $start.RedirectStandardInput = $Supervised
    $start.RedirectStandardOutput = $Supervised
    $start.Arguments = ($Arguments | ForEach-Object {
        if ($_ -match '["\x00-\x1f]') { throw 'Invalid native command argument.' }
        '"' + ($_ -replace '(\\+)$', '$1$1') + '"'
    }) -join ' '
    foreach ($key in @($start.EnvironmentVariables.Keys)) {
        if ($key -match '^(CIRNET_|NETCIRCUIT_)') { $start.EnvironmentVariables.Remove($key) }
    }
    foreach ($key in $settings.Keys) { $start.EnvironmentVariables[$key] = $settings[$key] }
    if ($Password) { $start.EnvironmentVariables['CIRNET_BOOTSTRAP_PASSWORD'] = $Password }
    [Diagnostics.Process]::Start($start)
}

function Invoke-Remote([string[]] $Arguments, [string] $Password = '') {
    $process = Start-NativeProcess $remote $Arguments $false $Password
    try {
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Native Remote command failed with exit code $($process.ExitCode)." }
    } finally { $process.Dispose() }
}

function Confirm-NativeContracts {
    $arguments = @('validate', $settings.CIRNET_CONTRACTS_ROOT, 'DigitalObservation', 'structural')
    $process = Start-NativeProcess $contracts $arguments $true
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        try {
            $process.StandardInput.WriteLine('{"signal":"startup","time_ns":0,"value":0}')
            $process.StandardInput.Close()
        } catch [IO.IOException] {
            throw 'Native Contracts validation failed while sending the startup observation.'
        }
        if (-not $process.WaitForExit(20000)) { throw 'Native Contracts validation timed out.' }
        if ($process.ExitCode -ne 0) { throw "Native Contracts validation failed with exit code $($process.ExitCode)." }
        $null = $output.GetAwaiter().GetResult()
    } finally {
        try {
            if (-not $process.HasExited) {
                try { $process.Kill() } catch [InvalidOperationException] {
                    if (-not $process.HasExited) { throw }
                }
                $process.WaitForExit()
            }
        } finally { $process.Dispose() }
    }
    Write-Output 'CIRNET_CONTRACTS_READY'
}

function Get-RunLock {
    [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
}

function Request-Stop {
    $owned = $null
    try { $owned = Get-RunLock } catch [IO.IOException] {}
    if ($owned) { $owned.Dispose(); throw 'No running native instance owns this data directory.' }
    $run = Get-Content -Raw -LiteralPath $control | ConvertFrom-Json
    if ($run.id -cnotmatch '^[a-f0-9]{32}$') { throw 'Invalid supervisor identity.' }
    $stopFile = Join-InventoryPath $data ('stop-' + $run.id)
    [IO.File]::WriteAllText($stopFile, '')
    $watch = [Diagnostics.Stopwatch]::StartNew()
    while (Test-Path -LiteralPath $stopFile) {
        if ($watch.Elapsed.TotalSeconds -ge 120) { throw 'Stop confirmation timed out. Check the supervisor.' }
        Start-Sleep -Milliseconds 100
    }
    if ((Get-Content -Raw -LiteralPath (Join-InventoryPath $data ('result-' + $run.id))) -ne 'clean') {
        throw 'A component exited without confirming clean shutdown.'
    }
    Write-Output 'Native instance stopped.'
}

function Wait-Ready($Process, [string] $Expected) {
    $line = $Process.StandardOutput.ReadLineAsync()
    if (-not $line.Wait(20000) -or $line.Result -cne $Expected -or $Process.HasExited) {
        throw "Native service did not report readiness: $Expected"
    }
}

function Close-NativeProcess($Process) {
    if (-not $Process) { return $true }
    try {
        $Process.StandardInput.Close()
        $Process.WaitForExit()
        return ($Process.ExitCode -eq 0)
    } finally { $Process.Dispose() }
}

function Start-Instance {
    $lock = Get-RunLock
    $api = $station = $null
    $id = [Guid]::NewGuid().ToString('N')
    $stopFile = Join-InventoryPath $data ("stop-$id")
    $clean = $false
    $savedControlMode = $null
    $keyboard = $Interactive -and -not [Console]::IsInputRedirected
    if ($keyboard) {
        try {
            $savedControlMode = [Console]::TreatControlCAsInput
            [Console]::TreatControlCAsInput = $true
        } catch [IO.IOException], [InvalidOperationException] { $keyboard = $false }
    }
    try {
        Confirm-NativeContracts
        if ($InitializeDatabase -and -not (Test-Path -LiteralPath $database)) {
            Invoke-Remote @('--migrate')
        }
        Invoke-Remote @('--check')
        $station = Start-NativeProcess $hardware @('--listen', "127.0.0.1:$HardwarePort", '--exit-on-stdin-eof') $true
        Wait-Ready $station "CIRNET_HARDWARE_READY=127.0.0.1:$HardwarePort"
        $api = Start-NativeProcess $remote @('--listen', "127.0.0.1:$Port", '--web-root',
            (Join-InventoryPath $root 'web'), '--exit-on-stdin-eof') $true
        Wait-Ready $api "CIRNET_REMOTE_READY=127.0.0.1:$Port"
        [IO.File]::WriteAllText($control, (@{ id=$id; remote=$api.Id; hardware=$station.Id } | ConvertTo-Json -Compress))
        Write-Output "CIRNET_NATIVE_READY=$origin"
        if ($Check) {
            $health = Invoke-WebRequest -Uri "$origin/api/health" -UseBasicParsing -TimeoutSec 5
            if ($health.StatusCode -ne 200) { throw 'Native health check failed.' }
            Write-Output 'Native health check passed.'
        } else {
            if ($OpenBrowser) {
                try { Start-Process $origin -ErrorAction Stop }
                catch { Write-Warning "Open $origin in your browser." }
            }
            if ($keyboard) { Write-Output 'Press Esc, Enter or Ctrl+C to stop and return to the menu.' }
            while (-not (Test-Path -LiteralPath $stopFile)) {
                if ($api.HasExited -or $station.HasExited) { throw 'A native component exited unexpectedly.' }
                if ($keyboard) {
                    try {
                        if ([Console]::KeyAvailable) {
                            $key = [Console]::ReadKey($true)
                            if ($key.Key -in [ConsoleKey]::Escape,[ConsoleKey]::Enter -or $key.KeyChar -eq [char]3) { break }
                        }
                    } catch [IO.IOException], [InvalidOperationException] { $keyboard = $false }
                }
                Start-Sleep -Milliseconds 100
            }
        }
        $clean = $true
    } finally {
        try {
            try { $clean = (Close-NativeProcess $api) -and $clean }
            finally { $clean = (Close-NativeProcess $station) -and $clean }
            $result = if ($clean) { 'clean' } else { 'failed' }
            [IO.File]::WriteAllText((Join-InventoryPath $data ("result-$id")), $result)
            if (Test-Path -LiteralPath $control) { [IO.File]::Delete($control) }
        } finally {
            $lock.Dispose()
            if (Test-Path -LiteralPath $stopFile) { [IO.File]::Delete($stopFile) }
            if ($null -ne $savedControlMode) {
                try { [Console]::TreatControlCAsInput = $savedControlMode }
                catch [IO.IOException], [InvalidOperationException] {}
            }
        }
    }
    if (-not $clean) { throw 'A native component did not confirm clean shutdown.' }
}

function Get-SnapshotFiles {
    foreach ($name in 'cirnet.db','cirnet.db-wal','cirnet.db-shm','cirnet.db-journal') {
        $path = Join-InventoryPath $data $name
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            @{ path=$name; size=(Get-Item -LiteralPath $path).Length; sha256=(Get-Sha $path) }
        }
    }
    if (Test-Path -LiteralPath $captures) {
        Assert-Directory $captures
        foreach ($capture in Get-ChildItem -LiteralPath $captures -Force) {
            if ($capture.Name -cnotmatch '^[a-f0-9]{32}\.ncap$' -or $capture.PSIsContainer) {
                throw "Unexpected capture file: $($capture.Name)"
            }
            $relative = "captures/$($capture.Name)"
            $path = Join-InventoryPath $data $relative
            @{ path=$relative; size=$capture.Length; sha256=(Get-Sha $path) }
        }
    }
}

switch ($Action) {
    'Doctor' {
        Confirm-NativeContracts
        Invoke-Remote @('--help')
        if (Test-Path -LiteralPath $database) { Invoke-Remote @('--check') }
        Write-Output 'Verified native bundle, resources and executable startup.'
    }
    'Migrate' { $lock = Get-RunLock; try { Invoke-Remote @('--migrate') } finally { $lock.Dispose() } }
    'BootstrapAdmin' {
        if ($Username -notmatch '^[a-zA-Z0-9_.-]{1,64}$') { throw 'Supply a valid -Username.' }
        $password = $env:CIRNET_BOOTSTRAP_PASSWORD
        if (-not $password) {
            $secret = Read-Host 'Administrator password' -AsSecureString
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
            try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
            finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
        }
        $lock = Get-RunLock
        try { Invoke-Remote @('--bootstrap-admin', $Username) $password }
        finally { $password = $null; $lock.Dispose() }
    }
    'Maintenance' {
        $args = @('--capture-maintenance','--limit', [string]$Limit)
        if ($DryRun) { $args += '--dry-run' }
        $lock = Get-RunLock
        try { Invoke-Remote $args } finally { $lock.Dispose() }
    }
    'Start' { Start-Instance }
    'Stop' { Request-Stop }
    'Restart' { Request-Stop; Start-Instance }
    'Backup' {
        if (-not $Snapshot) { throw '-Snapshot is required.' }
        $target = [IO.Path]::GetFullPath($Snapshot)
        Assert-Disjoint $data $target
        Assert-Disjoint $root $target
        if (Test-Path -LiteralPath $target) { throw 'Snapshot destination already exists.' }
        $lock = Get-RunLock
        try {
            Invoke-Remote @('--check')
            $files = @(Get-SnapshotFiles)
            [void] [IO.Directory]::CreateDirectory($target)
            Copy-Files $data $target $files
            $null = Confirm-Files $target $files
            [IO.File]::WriteAllText((Join-Path $target 'snapshot.json'),
                (@{schemaVersion=1; files=$files} | ConvertTo-Json -Depth 5))
        } finally { $lock.Dispose() }
    }
    'Restore' {
        if (-not $Snapshot) { throw '-Snapshot is required.' }
        $source = [IO.Path]::GetFullPath($Snapshot)
        Assert-Disjoint $data $source
        if (Test-Path -LiteralPath $data) { throw 'Restore destination must not exist.' }
        Assert-Directory $source
        $receipt = Get-Content -Raw -LiteralPath (Join-InventoryPath $source 'snapshot.json') | ConvertFrom-Json
        if ($receipt.schemaVersion -ne 1) { throw 'Unsupported snapshot.' }
        foreach ($file in $receipt.files) {
            if ($file.path -cnotmatch '^(cirnet\.db(-wal|-shm|-journal)?|captures/[a-f0-9]{32}\.ncap)$') {
                throw 'Snapshot includes an unsupported file.'
            }
        }
        $names = Confirm-Files $source $receipt.files
        if (-not $names.Contains('cirnet.db')) { throw 'Snapshot has no SQLite database.' }
        [void] [IO.Directory]::CreateDirectory($data)
        Copy-Files $source $data $receipt.files
        $null = Confirm-Files $data $receipt.files
        Invoke-Remote @('--check')
    }
}
