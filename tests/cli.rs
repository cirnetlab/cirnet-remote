use std::{
    path::PathBuf,
    process::{Command, Output},
};
fn command(url: &str, args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_cirnet-remote"));
    for (key, _) in std::env::vars() {
        if key.starts_with("CIRNET_") || key.starts_with("NETCIRCUIT_") {
            command.env_remove(key);
        }
    }
    command
        .env("CIRNET_DATABASE_URL", url)
        .args(args)
        .output()
        .unwrap()
}
#[test]
fn native_release_reports_its_version_and_rejects_old_cli() {
    let version = command("", &["--version"]);
    assert!(version.status.success());
    assert_eq!(
        String::from_utf8(version.stdout).unwrap().trim(),
        concat!("cirnet-remote ", env!("CARGO_PKG_VERSION"))
    );
    assert!(!command("", &["--legacy"]).status.success());
}
#[test]
#[ignore = "requires allocator-owned CIRNET_REMOTE_CLI_DIR"]
fn migrations_are_explicit_and_idempotent() {
    let root = PathBuf::from(std::env::var_os("CIRNET_REMOTE_CLI_DIR").unwrap());
    let db = root.join("cli.sqlite");
    assert!(!db.exists());
    let url = format!("sqlite:///{}", db.to_string_lossy().replace('\\', "/"));
    let implicit = command(&url, &["--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]);
    assert!(!implicit.status.success());
    assert!(!db.exists());
    let first = command(&url, &["--migrate"]);
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(report["to"], "0007_auth_maintenance");
    assert_eq!(report["applied"], 7);
    assert!(db.is_file());
    let again = command(&url, &["--migrate"]);
    assert!(again.status.success());
    let report: serde_json::Value = serde_json::from_slice(&again.stdout).unwrap();
    assert_eq!(report["applied"], 0);
    assert_eq!(report["from"], "0007_auth_maintenance");
}

#[test]
#[ignore = "requires the pinned Contracts root, no database or Hardware service"]
fn openapi_export_matches_current_route_inventory() {
    use cirnet_remote_native::openapi::{Boundary, Routes};
    use serde_json::Value;
    use std::collections::{BTreeMap, BTreeSet};

    fn inventory(document: &Value) -> BTreeMap<&str, (&str, &str)> {
        let mut operations = BTreeMap::new();
        for (path, methods) in document["paths"].as_object().unwrap() {
            for (method, operation) in methods.as_object().unwrap() {
                if let Some(id) = operation["operationId"].as_str() {
                    assert!(
                        operations
                            .insert(id, (path.as_str(), method.as_str()))
                            .is_none(),
                        "{id}"
                    );
                }
            }
        }
        operations
    }
    let root = PathBuf::from(std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap());
    let exported = Command::new(env!("CARGO_BIN_EXE_cirnet-remote"))
        .args(["--export-openapi"])
        .env("CIRNET_CONTRACTS_ROOT", &root)
        .output()
        .unwrap();
    assert!(
        exported.status.success(),
        "{}",
        String::from_utf8_lossy(&exported.stderr)
    );
    let document: serde_json::Value = serde_json::from_slice(&exported.stdout).unwrap();
    assert_eq!(document["info"]["version"], env!("CARGO_PKG_VERSION"));
    assert!(document["paths"]["/api/assignments"].is_null());
    assert!(document["paths"]["/api/v2/assignments"]["get"].is_object());
    assert!(document["paths"]["/api/circuits/{document_id}"]["get"].is_null());
    assert!(document["paths"]["/api/circuits/{document_id}"]["delete"].is_object());
    assert!(document["paths"]["/api/experiments"]["post"].is_null());
    assert!(document["paths"]["/api/experiments"]["get"].is_object());
    let baseline: Value =
        serde_json::from_slice(&std::fs::read(root.join("contracts/api/openapi.json")).unwrap())
            .unwrap();
    let old = inventory(&baseline);
    let current = inventory(&document);
    let expected_removed: BTreeSet<_> = [
        "validateCircuit",
        "previewCircuit",
        "listCircuits",
        "createCircuit",
        "getCircuit",
        "saveCircuit",
        "listAssignments",
        "createAssignment",
        "getAssignment",
        "publishAssignment",
        "listAssignmentDocuments",
        "createAssignmentDocument",
        "getAssignmentDocument",
        "saveAssignmentDocument",
        "publishAssignmentDocument",
        "createExperiment",
        "getExperimentDocumentReference",
    ]
    .into_iter()
    .collect();
    let routes = Routes::from_bytes(&exported.stdout).unwrap();
    let removed: BTreeSet<_> = old
        .keys()
        .filter(|id| !current.contains_key(*id))
        .copied()
        .collect();
    assert_eq!(removed, expected_removed);
    for id in removed {
        let (path, method) = old[id];
        let path = path
            .split('/')
            .map(|part| {
                if part.starts_with('{') {
                    "fixture"
                } else {
                    part
                }
            })
            .collect::<Vec<_>>()
            .join("/");
        assert!(
            matches!(
                routes.resolve(&path, &method.to_uppercase()),
                Boundary::NotFound | Boundary::MethodNotAllowed
            ),
            "{id}"
        );
    }
    for (id, route) in &current {
        assert_eq!(old.get(id), Some(route), "{id}");
    }
    let capture_path = "/api/captures/{capture_id}/payload";
    let capture = &document["paths"][capture_path]["get"]["responses"];
    let old_capture = &baseline["paths"][capture_path]["get"]["responses"];
    assert!(
        old_capture["200"]["content"]["application/vnd.netcircuit.capture; version=1"].is_object()
    );
    assert!(capture["200"]["content"]["application/vnd.netcircuit.capture; version=1"].is_null());
    assert!(capture["200"]["content"]["application/vnd.cirnet.capture; version=1"].is_object());
    assert_eq!(
        capture["406"]["content"]["application/json"]["schema"]["$ref"],
        "#/components/schemas/ErrorEnvelope"
    );
    let operations: BTreeSet<_> = current.keys().copied().collect();
    assert_eq!(operations.len(), 46);
    let registered = Command::new(env!("CARGO_BIN_EXE_cirnet-remote"))
        .arg("--route-inventory")
        .output()
        .unwrap();
    assert!(registered.status.success());
    let registered: Vec<String> = serde_json::from_slice(&registered.stdout).unwrap();
    assert_eq!(registered.len(), 46);
    assert_eq!(
        registered
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>(),
        operations
    );
}
