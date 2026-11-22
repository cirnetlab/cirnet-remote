# Windows x64 native candidate

[Tiếng Việt](../../vi/operations/native-candidate.md)

Remote owns the release selection. The next-generation sources use the
`0.3.0-dev.N` version line. Protocol versions stay governed by Contracts.
An assembled build is a development candidate. Record the verification scope
and manifest SHA-256 when accepting a candidate. Release publication is a
separate operation.

## Build from an exact source selection

Place the six next-generation checkouts side by side and run PowerShell 7.4+
in the x64 MSVC developer environment. Install the Rust toolchain specified in
the repositories, Node.js 26.12.1, CMake and the Windows SDK. Choose an
existing absolute output parent outside every checkout.

From the Remote checkout, use a new selection file:

```powershell
$output = (Resolve-Path 'E:/cirnet-output').Path
$selection = Join-Path $output 'next-selection.json'
node scripts/native-source-selection.mjs lock $selection
./scripts/build-native-windows.ps1 -Selection $selection -OutputParent $output
```

The selection records the relative paths, sizes and SHA-256 digests of tracked
and non-ignored source files. Git revisions record the source context. Content
digests pin the exact bytes, including pending changes. Staging rejects changes
to the selection and copies only the selected sources into an owned session.
Hardware and Remote compile against the staged Contracts checkout. The
Interface SDK is generated against the newly built Remote's OpenAPI export.
The Embedded Hardware source archive records the selected Contracts FPGA schema.
Use `-Offline` when the locked Rust and npm dependencies are cached.

The session's `assembly-result.json` gives the bundle directory, archive
and their digests. The manifest records each input tree, tool versions and the
size and SHA-256 of every packaged file. Keep the selection and reviewed
manifest digest with verification evidence. Different compiler environments
can yield different artifact bytes for the same selected sources.

## Launch for local development

Invoke the bundled launcher from PowerShell 7.4+ when orchestrating this
workflow. Use the same external `-DataDirectory`, `-Port` and
`-HardwarePort` for `Start` and `Stop`. Explicit `-InitializeDatabase`
initializes missing SQLite state. Start validates any existing database
without applying migrations or creating an administrator. For Vite, pass
`-DevPort` to `Start` to authorize only its exact `127.0.0.1` origin for
HTTP mutations and WebSocket connections. The three ports must be distinct.

For a read-only RPC readiness check, set `CIRNET_HARDWARE_GRPC_TARGET` to
the selected loopback endpoint and invoke `cirnet-remote.exe --check-hardware`.
It confirms an available virtual digital station without opening the database.

## Verify the installed bundle

On a Windows development host, read the reviewed assembly receipt:

```powershell
$result = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
node scripts/verify-native-windows.mjs $result.directory $result.manifestSha256
node scripts/test-native-windows.mjs $result.directory $result.manifestSha256 $chromiumCache
```

`$chromiumCache` is the absolute directory containing the Chromium version
installed by the staged Interface's locked Playwright dependency. The test
installs into a fresh directory, checks artifact tamper rejection, runs the
Remote, Hardware and Simulator via the launcher, and exercises browser virtual
execution, Stop, persistence and snapshot restore. Omitting the Chromium
argument runs the installation and API checks with reduced coverage.

Physical FPGA and ngspice remain **UNAVAILABLE** for this development
candidate. Production acceptance requires the applicable evidence for the
selected deployment host and the supported hardware and safety capabilities.
