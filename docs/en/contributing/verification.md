# Remote verification

[Tiếng Việt](../../vi/contributing/verification.md)

The Windows x64 component workflow runs on pushes to `master` with the exact Contracts commit pinned in the workflow. Manual component runs can override that commit. The Windows x64 native candidate workflow remains a manual release-verification step with explicit component commits.

Create the Actions secret `CIRNET_DEPENDENCIES_READ_TOKEN` in [the cirnetlab organization settings](https://github.com/organizations/cirnetlab/settings/secrets/actions) with **Selected repositories** access. Include the repositories that run the workflows. Use a fine-grained token owned by `cirnetlab` with `Contents: read` on the private dependencies listed below. The component workflow needs `cirnet-contracts`. The manual native candidate workflow also needs `cirnet-simulator` and `cirnet-embedded-hardware`. To keep the shared token limited to component CI, use a Remote repository secret with the same name and the required candidate permissions.

Allocate an external session with the Contracts artifact allocator. Place Cargo targets, database files and logs there. Set CIRNET_CONTRACTS_ROOT to the selected Contracts checkout and run cargo fmt --all --check and cargo test --locked. For CLI migration verification, set CIRNET_REMOTE_CLI_DIR to a new directory inside that session and run cargo test --locked --test cli -- --ignored.

## Regression fixtures

Run the Windows x64 fixture checks from the Remote checkout with Python
3.14, Node, and the pinned Rust toolchain. Set `CIRNET_ARTIFACTS_DIR` to the
absolute external output parent and `CIRNET_CONTRACTS_ROOT` to the selected
Contracts checkout.

```powershell
python -I -B tests/reference/verify.py
python -I -B tests/reference/verify.py --postgres-dsn-file <owned-dsn-file>
```

Remote stores the verified JSON corpora and database seeding sources under
`tests/reference`. The fixture runner verifies the corpus hashes, generates
fresh database sessions, and builds the station RPC test peer from Contracts.
Source revisions and licensing are documented with the [fixtures](../../../tests/reference/README.md).
Use `--wheelhouse` with the SHA-256-locked wheels and `--offline-cargo` for an offline run.
To include the native experiment manager, recovery and Stop checks, supply
`--candidate-manifest` pointing to the unpacked package manifest and
`--candidate-manifest-sha256` with its separately reviewed digest.

The Contracts allocator owns the generated corpora, SQLite and session
fixtures, Cargo builds, and logs. `--prepare-only` creates SQLite fixtures and
records corpus hashes without running Cargo. For PostgreSQL, use a disposable
server and a file containing its loopback administrator URL in the form
`postgresql://user:password@127.0.0.1:port/postgres`. The runner creates and
removes isolated databases with unique names.

The selected ignored tests exercise compiler, topology, routing, HTTP body,
auth, project and assignment parity, database migration and write fencing,
scheduler authority, Stop claims, WebSocket protocol, and capture integrity.
The unit station corpus uses a loopback gRPC test peer. The native package
verification exercises the actual Hardware and Simulator. Linux timing and physical HIL retain their own inputs
and result status. Python runs only in the isolated fixture environment.

Run the packaged system verification against the artifact manifest before accepting a candidate. Record the exact sources, toolchains and inputs, along with tests that passed, failed or could not run. Link approved summaries to evidence stored outside Git.

## Local development storage

With `CIRNET_LOCAL_STORAGE_ROOT` configured, build-native-windows.ps1 can omit `-OutputParent` and use the cirnet-remote namespace. An explicit parent remains supported. Staged sources, targets and verification share the candidate context and session. Use a fresh session for another source selection. A reviewed receipt can verify an existing session in its original location.

For an explicit reuse check, run `node scripts/native-source-selection.mjs reuse-check RECEIPT EVIDENCE EVIDENCE_SHA256 MANIFEST_SHA256` in an x64 MSVC developer shell. Use the existing assembly receipt and independently pinned `native-smoke/.../result.json` from packaged browser verification. The check compares the source inventory and Git provenance, verifies the manifest and its files, and checks the pinned toolchain. Running the build command still requests a fresh assembly.
