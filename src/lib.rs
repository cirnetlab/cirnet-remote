#[path = "application/assignments.rs"]
pub mod assignments;
#[path = "application/auth/mod.rs"]
pub mod auth;
#[path = "domain/compiler/mod.rs"]
pub mod compiler;
pub mod config;
#[path = "infrastructure/db/mod.rs"]
pub mod db;
pub mod error;
#[path = "application/events.rs"]
pub mod events;
#[path = "application/experiments/mod.rs"]
pub mod experiments;
#[path = "infrastructure/hardware.rs"]
pub mod hardware;
#[path = "api/http_api.rs"]
pub mod http_api;
#[path = "api/http_auth.rs"]
pub mod http_auth;
#[path = "api/http_projects.rs"]
pub mod http_projects;
#[path = "domain/numeric.rs"]
pub(crate) mod numeric;
#[path = "application/preview.rs"]
pub mod preview;
#[path = "application/projects.rs"]
pub mod projects;
#[path = "api/websocket.rs"]
pub mod websocket;

#[path = "api/http_assignments.rs"]
pub mod http_assignments;
#[path = "api/http_stations.rs"]
pub mod http_stations;
pub(crate) mod query;
#[path = "application/stations.rs"]
pub mod stations;

#[path = "api/http_experiments.rs"]
pub mod http_experiments;

#[path = "api/http_body.rs"]
pub(crate) mod http_body;
#[path = "api/openapi.rs"]
pub mod openapi;

#[doc(hidden)]
pub mod stop_probe;

#[doc(hidden)]
pub mod diagnostics;
