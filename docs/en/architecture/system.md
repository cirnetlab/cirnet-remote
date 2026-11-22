# System architecture

[Tiếng Việt](../../vi/architecture/system.md)

The [Lab-First architecture](lab-first-v3-1.md) governs system ownership and station safety. Interface edits the logical CircuitGraph and consumes Remote REST and WebSocket APIs. Remote owns authentication, authorization, projects, assignments, scheduling, durable leases and capture storage. Hardware owns loopback RPC, station lifecycles and safe Stop. Its isolated native Simulator workers perform bounded digital and DC execution. Contracts owns canonical schemas, device data, RPC descriptors and NCAP. Embedded Hardware owns RTL and hardware-side qualification.

Remote serves the browser assets from the same origin as the API in the Windows candidate. Local Hardware RPC 2.0 remains separate. Hardware verifies the Simulator executable SHA-256 at startup. The Windows package carries all native runtime assets and Remote verifies its candidate selection at the artifact boundary.

Production targets Linux with PostgreSQL and explicit HTTPS origin configuration. Physical execution requires verified protection, observed wiring and permitted station capabilities. Physical FPGA and ngspice remain UNAVAILABLE where no qualified configuration exists. See the [physical safety contract](physical-lab-safety-contract.md) and [deployment guide](../../../deployment/README.md).
