# CIRNET Remote version 0 changelog

[Changelog index](README.md)

## Unreleased

### Changed

- Standardize English major-version changelog navigation. Route system architecture references to CIRNET Rules.

## v0.3.0-dev.1 — Development

This is the Windows x64 Native Candidate development line. The available Git tags and GitHub Releases provide no publication date for this version.

### Added

- Establish Remote Next ownership of the Windows native candidate.

### Changed

- Group HTTP decoding, diagnostic evidence and Linux deployment files by responsibility.
- Align repository references with the canonical CIRNET names.
- Migrate the Rust REST and WebSocket service into API, domain, application and infrastructure directories.
- Build against Contracts Next and keep the existing RPC and data compatibility.
- Preserve native deployment, migrations, capture persistence and scheduler safety regression tests.
- Adopt the Ecosystem, CIRNET Lab-First and FPGA target references and archive Lab-First v3.1.
- Run Windows component CI on master pushes with pinned private dependencies.
- Document the Actions secret permissions for component CI and manual candidates.
- Reproduce legacy compiler, HTTP and database fixtures from pinned Python references and run the ignored Rust regression tests.
- Exercise browser reconnect, NCAP parity, hard reload and native process cleanup in the installed candidate.
- Store verified corpora and database seeding sources in Remote Next and check native peers against the selected candidate manifest.
- Reused compatible candidates only after checking source provenance, toolchain identity, package digests and pinned E2E evidence. Kept native assembly output in the owned Remote session.

**Sources**

- [Version manifest](../../Cargo.toml)
- [Native implementation baseline](https://github.com/cirnetlab/cirnet-remote/commit/343247ec96cb5c85dae4e7e259511a745d634aec)
- [Latest source milestone recorded here](https://github.com/cirnetlab/cirnet-remote/commit/6ca8abf41f0c371abfebaf6319545f96c9a66c4c)
- [Earlier version index placeholder](https://github.com/cirnetlab/cirnet-remote/blob/f149ef68499b5687db6b7ac37147e06688446ae1/docs/changelogs/CHANGELOG_V0.md)
