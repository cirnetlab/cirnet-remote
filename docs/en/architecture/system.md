# System architecture

[Tiếng Việt](../../vi/architecture/system.md)

The [Ecosystem Architecture](https://github.com/cirnetlab/cirnet-rules/blob/master/docs/tai-lieu-kien-tuc-he-thong/cirnetlab-architecture-en.md) defines the organization-wide target. [CIRNET Lab-First](https://github.com/cirnetlab/cirnet-rules/blob/master/docs/tai-lieu-kien-tuc-he-thong/cirnet-architecture-lab-first-en.md) governs Lab execution, ownership and station safety. The [FPGA Architecture](https://github.com/cirnetlab/cirnet-rules/blob/master/docs/cirnetlab-FPGA-architecture-en.md) defines the FPGA and board target within those safety rules.

In the native implementation, Interface edits the logical CircuitGraph and consumes Remote REST and WebSocket APIs. Remote owns authentication, authorization, projects, assignments, scheduling, durable leases, capture storage and system release selection. Hardware owns loopback RPC, station lifecycles and safe Stop. Its isolated native Simulator workers perform bounded digital and DC execution. Contracts owns canonical schemas, device data, RPC descriptors and NCAP. Embedded Hardware owns RTL and hardware-side qualification.

Remote serves the browser assets from the same origin as the API in the Windows candidate. Local Hardware RPC 2.0 remains separate. Hardware verifies the Simulator executable SHA-256 at startup. The Windows package carries all native runtime assets and Remote verifies its candidate selection at the artifact boundary.

## Repository layout

The core repositories keep production code in language-native roots such as `src/` and `rtl/`. Build and verification entry points live in `scripts/` or the toolchain manifest. Tests, fixtures and generated resources stay with their owning feature or producer. Each repository maintains its own `docs/en/` and `docs/vi/` references. Remote records exact source and artifact digests in the candidate, and each producer maintains its own dependency lock.

| Path | Responsibility |
| --- | --- |
| [`src/api/`](../../../src/api/) | HTTP routes, query and body decoding, OpenAPI export and WebSocket delivery. |
| [`src/application/`](../../../src/application/) | Operations for auth, projects, assignments, stations and experiments, including lease and Stop coordination. |
| [`src/domain/`](../../../src/domain/) | Compiler rules, topology, routing and numeric semantics. |
| [`src/infrastructure/`](../../../src/infrastructure/) | Database and migrations, local Hardware client, same-origin web serving and diagnostic evidence. |
| [`deployment/`](../../../deployment/README.md) | Windows candidate launcher and Linux systemd and nginx inputs. |
| [`scripts/`](../../../scripts/) | Source selection, native assembly, manifest verification and packaged smoke tests. |
| [`tests/`](../../../tests/) | Rust integration checks and offline reference fixtures. |

The binary in `src/main.rs` assembles the service, and `src/lib.rs` exposes the existing crate module paths. The candidate pipeline packages browser files from the selected Interface build. Repository `assets/` retain historical artwork and sample captures as source references.

## Target and qualification

Production targets Linux with PostgreSQL and explicit HTTPS origin configuration. Physical execution requires verified protection, observed wiring and permitted station capabilities. Physical FPGA and ngspice remain UNAVAILABLE where no qualified configuration exists. See the [physical safety contract](physical-lab-safety-contract.md) and [deployment guide](../../../deployment/README.md).
