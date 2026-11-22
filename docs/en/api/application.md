# Application API

[Tiếng Việt](../../vi/api/application.md) · [System architecture](../architecture/system.md)

The Rust service publishes its current REST operations at /openapi.json and serves the corresponding WebSocket operation updates. Run cirnet-remote --export-openapi with the selected Contracts Next resources to export the same projection for the Interface SDK. The [HTTP profiles](http-profiles.md) document the current and retired routes.

Use GET /api/health to inspect readiness. Bootstrap through GET /api/auth/session. For authenticated writes, send the exact trusted Origin and the session-matched X-CIRNET-CSRF token. Control mutations require the appropriate role and ownership. Lease identities and operation keys preserve the outcome across reconnects. See [authentication](../architecture/auth-and-migrations.md) and [pending observations](../architecture/pending-observations.md).

CircuitGraph remains the authoritative logical design. The [circuit and physical Lab API](circuit-and-physical-lab.md) describes graph validation, preview, and its relationship to physical safety. [Contracts consumption](contracts-consumer.md) covers schemas, Hardware RPC and NCAP.
