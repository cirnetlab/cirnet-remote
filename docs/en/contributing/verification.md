# Remote verification

[Tiếng Việt](../../vi/contributing/verification.md)

The Windows x64 component workflow runs on pushes to `master` with the exact Contracts Next commit pinned in the workflow. Manual component runs can override that commit. The Windows x64 native candidate workflow remains a manual release-verification step with explicit component commits.

Create the Actions secret `CIRNET_DEPENDENCIES_READ_TOKEN` in [the cirnetlab organization settings](https://github.com/organizations/cirnetlab/settings/secrets/actions) with **Selected repositories** access. Include the repositories that run the workflows. Use a fine-grained token owned by `cirnetlab` with `Contents: read` on the private dependencies listed below. The component workflow needs `cirnet-contracts-next`. The manual native candidate workflow also needs `cirnet-simulator-next` and `cirnet-embedded-hardware`. To keep the shared token limited to component CI, use a Remote repository secret with the same name and the required candidate permissions.

Allocate an external session with the Contracts Next artifact allocator. Place Cargo targets, database files and logs there. Set CIRNET_CONTRACTS_ROOT to the selected Contracts Next checkout and run cargo fmt --all --check and cargo test --locked. For CLI migration verification, set CIRNET_REMOTE_CLI_DIR to a new directory inside that session and run cargo test --locked --test cli -- --ignored.

## Legacy regression fixtures

Run the Windows x64 fixture checks from the Remote Next checkout with Python
3.14, Node, Git, and the pinned Rust toolchain. Set `CIRNET_ARTIFACTS_DIR` to the
absolute external output parent and `CIRNET_CONTRACTS_ROOT` to the selected
Contracts Next checkout.

```powershell
python -I -B tests/reference/verify.py
python -I -B tests/reference/verify.py --postgres-dsn-file <owned-dsn-file>
```

The runner reads exact historical Git objects from sibling `cirnet-remote`,
`cirnet-contracts` and `cirnet-simulator` repositories. Use `--legacy-root` to
select another parent directory. It recovers the legacy database schema from
the tracked pre-retirement revision. The [wheel lock](../../../tests/reference/requirements-windows.lock)
pins Python dependencies by SHA-256. Use `--wheelhouse` with cached wheels and
`--offline-cargo` with cached Cargo sources for an offline run.

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
verification exercises the actual Hardware and Simulator. Historical
Stage 3 binary replay, Linux timing and physical HIL retain their own inputs
and result status. Python runs only in the isolated fixture environment.

Run the packaged system verification against the artifact manifest before accepting a candidate. Record the exact sources, toolchains and inputs, along with tests that passed, failed or could not run. Link approved summaries to evidence stored outside Git.
