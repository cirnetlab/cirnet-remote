# System architecture

[Tiếng Việt](../../vi/architecture/system.md)

The [Ecosystem Architecture](../../cirnetlab-architecture-en.md) defines the organization-wide target. [CIRNET Lab-First](../../cirnet-architecture-lab-first-en.md) governs Lab execution, ownership and station safety. The [FPGA Architecture](../../cirnetlab-FPGA-architecture-en.md) defines the FPGA and board target within those safety rules.

In the Next implementation, Interface edits the logical CircuitGraph and consumes Remote REST and WebSocket APIs. Remote owns authentication, authorization, projects, assignments, scheduling, durable leases, capture storage and system release selection. Hardware owns loopback RPC, station lifecycles and safe Stop. Its isolated native Simulator workers perform bounded digital and DC execution. Contracts owns canonical schemas, device data, RPC descriptors and NCAP. Embedded Hardware owns RTL and hardware-side qualification.

Remote serves the browser assets from the same origin as the API in the Windows candidate. Local Hardware RPC 2.0 remains separate. Hardware verifies the Simulator executable SHA-256 at startup. The Windows package carries all native runtime assets and Remote verifies its candidate selection at the artifact boundary.

Production targets Linux with PostgreSQL and explicit HTTPS origin configuration. Physical execution requires verified protection, observed wiring and permitted station capabilities. Physical FPGA and ngspice remain UNAVAILABLE where no qualified configuration exists. See the [physical safety contract](physical-lab-safety-contract.md) and [deployment guide](../../../deployment/README.md).
