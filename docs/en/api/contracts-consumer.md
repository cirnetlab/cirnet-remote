# Consuming Contracts

[Tiếng Việt](../../vi/api/contracts-consumer.md)

Contracts Next owns canonical schemas, the Device Library, Hardware RPC 2.0 descriptors and NCAP. Remote compiles against cirnet-contracts-native at the version in Cargo.toml and reads the selected canonical resources through CIRNET_CONTRACTS_ROOT. The build script generates its RPC client from the canonical descriptor. Remote projects its actual routes into OpenAPI for the Interface SDK.

Development uses the sibling cirnet-contracts-next checkout. A system candidate selects the exact source snapshot and pins the resulting artifacts in its manifest. Keep wire and schema versions independent from the application version. Run the [verification suite](../contributing/verification.md) after changing a selection.
