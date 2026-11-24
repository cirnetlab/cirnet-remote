//! The native release API projected from the verified Contracts handoff.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, path::Path};
pub const SHA256: &str = "dc39c874386eba2b58f8b5c631cbee0d63ded86cf287aea63f54e4a237ff8f08";
const RETIRED_OPERATIONS: &[&str] = &[
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
];
pub fn load(root: &Path, implemented: &[&str]) -> Result<Vec<u8>, String> {
    let bytes = std::fs::read(root.join("contracts/api/openapi.json"))
        .map_err(|_| "OpenAPI handoff unavailable")?;
    if format!("{:x}", Sha256::digest(&bytes)) != SHA256 {
        return Err("OpenAPI handoff digest mismatch".into());
    }
    let mut value: Value = serde_json::from_slice(&bytes).map_err(|_| "OpenAPI handoff invalid")?;
    let paths = value["paths"]
        .as_object_mut()
        .ok_or("OpenAPI paths unavailable")?;
    for methods in paths.values_mut() {
        let methods = methods.as_object_mut().ok_or("OpenAPI path invalid")?;
        methods.retain(|_, operation| {
            operation["operationId"]
                .as_str()
                .is_none_or(|id| !RETIRED_OPERATIONS.contains(&id))
        });
    }
    paths.retain(|_, methods| {
        !methods
            .as_object()
            .is_some_and(|methods| methods.is_empty())
    });
    value["info"]["version"] = Value::String(env!("CARGO_PKG_VERSION").into());
    let capture = value
        .pointer_mut("/paths/~1api~1captures~1{capture_id}~1payload/get/responses")
        .and_then(Value::as_object_mut)
        .ok_or("OpenAPI capture responses unavailable")?;
    let content = capture
        .get_mut("200")
        .and_then(|value| value["content"].as_object_mut())
        .ok_or("OpenAPI capture content unavailable")?;
    if !content.contains_key(crate::http_experiments::CAPTURE_MEDIA_TYPE)
        || content
            .remove(crate::http_experiments::LEGACY_CAPTURE_MEDIA_TYPE)
            .is_none()
    {
        return Err("OpenAPI capture handoff media differ from the reviewed profile".into());
    }
    capture.insert("406".into(), serde_json::json!({
        "description": "Only the legacy capture media type was requested",
        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorEnvelope"}}}
    }));
    check_inventory(&value, implemented)?;
    serde_json::to_vec(&value).map_err(|_| "OpenAPI serialization failed".into())
}
fn check_inventory(document: &Value, implemented: &[&str]) -> Result<(), String> {
    let mut exported = BTreeSet::new();
    let paths = document["paths"]
        .as_object()
        .ok_or("OpenAPI paths unavailable")?;
    for methods in paths.values() {
        for operation in methods.as_object().ok_or("OpenAPI path invalid")?.values() {
            if let Some(id) = operation.get("operationId") {
                let id = id.as_str().ok_or("OpenAPI operation invalid")?;
                if !exported.insert(id) {
                    return Err("Duplicate OpenAPI operation".into());
                }
            }
        }
    }
    let registered: BTreeSet<_> = implemented.iter().copied().collect();
    if registered.len() != implemented.len() || registered != exported {
        return Err("OpenAPI and implemented route inventories differ".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn registration_is_complete_and_unique() {
        let value = json!({"paths":{"/one":{"get":{"operationId":"read"}},"/two":{"post":{"operationId":"write"}}}});
        assert!(check_inventory(&value, &["read", "write"]).is_ok());
        for ids in [
            vec!["read"],
            vec!["read", "write", "extra"],
            vec!["read", "write", "write"],
        ] {
            assert!(check_inventory(&value, &ids).is_err());
        }
        let duplicate =
            json!({"paths":{"/one":{"get":{"operationId":"same"},"post":{"operationId":"same"}}}});
        assert!(check_inventory(&duplicate, &["same"]).is_err());
    }
}

#[derive(Clone)]
pub struct Routes {
    entries: Vec<Route>,
}
#[derive(Clone)]
struct Route {
    parts: Vec<String>,
    method: String,
    body: Option<&'static str>,
}
pub enum Boundary {
    Matched { body_profile: Option<&'static str> },
    MethodNotAllowed,
    Redirect(String),
    NotFound,
}
impl Routes {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        let value: Value = serde_json::from_slice(bytes).map_err(|_| "OpenAPI handoff invalid")?;
        let mut entries = Vec::new();
        for (path, methods) in value["paths"]
            .as_object()
            .ok_or("OpenAPI paths unavailable")?
        {
            for (method, operation) in methods.as_object().ok_or("OpenAPI path invalid")? {
                if operation.get("operationId").is_none() {
                    continue;
                }
                let reference = operation
                    .pointer("/requestBody/content/application~1json/schema/$ref")
                    .and_then(Value::as_str);
                let body = reference.map(|reference| {
                    let name = reference.rsplit('/').next().unwrap_or("");
                    if name.starts_with("Project")
                        || name.starts_with("CircuitCreate")
                        || name.starts_with("CircuitSave")
                        || name == "CircuitDelete"
                        || name.starts_with("AssignmentAuthoring")
                        || name == "ExperimentCreateV2"
                    {
                        "structural"
                    } else {
                        "transport"
                    }
                });
                entries.push(Route {
                    parts: path.split('/').map(str::to_owned).collect(),
                    method: method.to_uppercase(),
                    body,
                });
            }
        }
        Ok(Self { entries })
    }
    pub fn resolve(&self, path: &str, method: &str) -> Boundary {
        let mut partial = false;
        for route in &self.entries {
            if route.matches(path) {
                if route.method == method {
                    return Boundary::Matched {
                        body_profile: route.body,
                    };
                }
                partial = true;
            }
        }
        if partial {
            return Boundary::MethodNotAllowed;
        }
        if path != "/" {
            let alternate = if path.ends_with('/') {
                path.trim_end_matches('/').to_owned()
            } else {
                format!("{path}/")
            };
            if self.entries.iter().any(|route| route.matches(&alternate)) {
                return Boundary::Redirect(alternate);
            }
        }
        Boundary::NotFound
    }
}
impl Route {
    fn matches(&self, path: &str) -> bool {
        let parts: Vec<_> = path.split('/').collect();
        parts.len() == self.parts.len()
            && parts.iter().zip(&self.parts).all(|(value, pattern)| {
                if pattern.starts_with('{') && pattern.ends_with('}') {
                    !value.is_empty()
                } else {
                    *value == pattern
                }
            })
    }
}
pub fn redirect_location(
    path: &str,
    uri: &http::Uri,
    headers: &http::HeaderMap,
) -> Result<String, crate::error::ApiError> {
    let host = headers
        .get("host")
        .and_then(|value| value.to_str().ok())
        .or_else(|| uri.authority().map(|a| a.as_str()))
        .ok_or_else(|| crate::error::ApiError::new("INVALID_REQUEST_FRAMING", 400))?;
    let location = format!(
        "{}://{}{}{}",
        uri.scheme_str().unwrap_or("http"),
        host,
        path,
        uri.query().map(|q| format!("?{q}")).unwrap_or_default()
    );
    let mut quoted = String::new();
    for byte in location.bytes() {
        if byte.is_ascii_alphanumeric() || b":/%#?=@[]!$&'()*+,;-._~".contains(&byte) {
            quoted.push(char::from(byte));
        } else {
            use std::fmt::Write;
            write!(quoted, "%{byte:02X}").expect("String write");
        }
    }
    Ok(quoted)
}
#[cfg(test)]
mod route_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn method_and_slash_boundary_preserves_nonempty_parameters() {
        let bytes = serde_json::to_vec(&json!({"paths":{
         "/api/projects":{"get":{"operationId":"list"},"post":{"operationId":"create"}},
         "/api/projects/{project_id}":{"get":{"operationId":"read"}}
        }}))
        .unwrap();
        let routes = Routes::from_bytes(&bytes).unwrap();
        assert!(matches!(
            routes.resolve("/api/projects", "GET"),
            Boundary::Matched { .. }
        ));
        assert!(matches!(
            routes.resolve("/api/projects", "PUT"),
            Boundary::MethodNotAllowed
        ));
        assert!(matches!(
            routes.resolve("/api/projects/id", "POST"),
            Boundary::MethodNotAllowed
        ));
        assert!(
            matches!(routes.resolve("/api/projects///","GET"),Boundary::Redirect(path) if path=="/api/projects")
        );
        assert!(
            matches!(routes.resolve("/api/projects/id/","GET"),Boundary::Redirect(path) if path=="/api/projects/id")
        );
        assert!(matches!(
            routes.resolve("/api/projects/id/extra", "GET"),
            Boundary::NotFound
        ));
    }
}
