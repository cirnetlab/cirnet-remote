# Getting started

[Tiếng Việt](../../vi/guides/getting-started.md)

Place cirnet-contracts beside this checkout. Use the pinned Rust toolchain and cargo build --locked --bin cirnet-remote. Run cirnet-remote --help for the native CLI.

For a Windows development host, use the packaged [native launcher](../../../deployment/windows-native/cirnet-native.ps1) to install the candidate using its expected manifest SHA-256, then initialize and check the database. The launcher starts Remote with the bundled Interface, Hardware service, Simulator worker and Contracts resources. See [deployment](../../../deployment/README.md).

The production profile requires PostgreSQL, explicit HTTPS origins and guest access disabled. Keep database and capture storage paired for restore. Physical FPGA execution and ngspice remain UNAVAILABLE in the virtual candidate.
