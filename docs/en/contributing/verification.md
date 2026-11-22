# Remote verification

[Tiếng Việt](../../vi/contributing/verification.md)

Allocate an external session with the Contracts Next artifact allocator. Place Cargo targets, database files and logs there. Set CIRNET_CONTRACTS_ROOT to the selected Contracts Next checkout and run cargo fmt --all --check and cargo test --locked. For CLI migration verification, set CIRNET_REMOTE_CLI_DIR to a new directory inside that session and run cargo test --locked --test cli -- --ignored.

Additional fixture-backed tests cover legacy compatibility, SQLite and PostgreSQL migration, runtime fault transport, scheduler authority and capture integrity. Their ignore messages name the required inputs. The optional Python fixtures in tests/reference run in a separate verification environment. The production binary uses Rust and the native artifacts.

Run the packaged system verification against the artifact manifest before accepting a candidate. Record the exact sources, toolchains and inputs, along with tests that passed, failed or could not run. Link approved summaries to evidence stored outside Git.
