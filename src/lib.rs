// Keep crate-root names stable while placing implementations with their owners.
pub mod config;
pub mod error;

// API
#[path = "api/http_api.rs"]
pub mod http_api;
#[path = "api/http_assignments.rs"]
pub mod http_assignments;
#[path = "api/http_auth.rs"]
pub mod http_auth;
#[path = "api/http_body.rs"]
pub(crate) mod http_body;
#[path = "api/http_experiments.rs"]
pub mod http_experiments;
#[path = "api/http_projects.rs"]
pub mod http_projects;
#[path = "api/http_stations.rs"]
pub mod http_stations;
#[path = "api/openapi.rs"]
pub mod openapi;
#[path = "api/query.rs"]
pub(crate) mod query;
#[path = "api/websocket.rs"]
pub mod websocket;

// Application
#[path = "application/assignments.rs"]
pub mod assignments;
#[path = "application/auth/mod.rs"]
pub mod auth;
#[path = "application/events.rs"]
pub mod events;
#[path = "application/experiments/mod.rs"]
pub mod experiments;
#[path = "application/preview.rs"]
pub mod preview;
#[path = "application/projects.rs"]
pub mod projects;
#[path = "application/stations.rs"]
pub mod stations;

// Domain
#[path = "domain/compiler/mod.rs"]
pub mod compiler;
#[path = "domain/numeric.rs"]
pub(crate) mod numeric;

// Infrastructure
#[path = "infrastructure/db/mod.rs"]
pub mod db;
#[doc(hidden)]
#[path = "infrastructure/diagnostics/mod.rs"]
pub mod diagnostics;
#[path = "infrastructure/hardware.rs"]
pub mod hardware;
#[doc(hidden)]
#[path = "infrastructure/diagnostics/stop_probe/mod.rs"]
pub mod stop_probe;
