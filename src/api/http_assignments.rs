//! Assignment HTTP contracts; every read retains the service's authority fence.
use crate::{
    auth::SessionContext,
    error::ApiError,
    http_api::AppState,
    http_projects::{contract_body_profile, decode_path},
};
use axum::response::{IntoResponse, Response};
use http::{Method, StatusCode};

fn error(mut error: ApiError) -> ApiError {
    if matches!(
        error.code.as_str(),
        "ASSIGNMENT_NOT_FOUND" | "ASSIGNMENT_REVISION_NOT_FOUND"
    ) {
        error.code = "NOT_FOUND".into();
        error.message = error.code.clone();
    }
    error
}
pub async fn dispatch(
    method: &Method,
    uri: &http::Uri,
    state: &AppState,
    context: &SessionContext,
    body: &[u8],
) -> Option<Result<Response, ApiError>> {
    let decoded = decode_path(uri.path());
    let route = decoded.strip_prefix("/api/v2/")?;
    let parts: Vec<_> = route.split('/').collect();
    let operation = match parts.as_slice() {
        ["assignments"] if *method == Method::GET => "legacy_list",
        ["assignments", _] if *method == Method::GET => "legacy_get",
        ["assignment-documents"] if *method == Method::GET => "list",
        ["assignment-documents"] if *method == Method::POST => "create",
        ["assignment-documents", _] if *method == Method::GET => "get",
        ["assignment-documents", _] if *method == Method::PUT => "save",
        ["assignment-documents", _, "publication"] if *method == Method::PATCH => "publish",
        _ => return None,
    };
    Some(
        async {
            let service = state
                .assignments
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))?;
            let result = match operation {
                "legacy_list" => service.legacy_list(context, true).await,
                "legacy_get" => service.legacy_view(context, parts[1], true).await,
                "list" => {
                    let (limit, cursor) = crate::http_api::page_query(uri.query())?;
                    service
                        .list_documents(context, limit as usize, cursor.as_deref(), true)
                        .await
                }
                "get" => service.get_document(context, parts[1], true).await,
                "create" | "save" | "publish" => {
                    let name = match operation {
                        "create" => "AssignmentAuthoringCreateV2",
                        "save" => "AssignmentAuthoringSaveV2",
                        _ => "AssignmentAuthoringPublicationV2",
                    };
                    let value = contract_body_profile(&state.registry, name, "structural", body)?;
                    match operation {
                        "create" => service.create(context, &value["definition"], true).await,
                        "save" => service.save(context, parts[1], &value, true).await,
                        _ => service.publish(context, parts[1], &value, true).await,
                    }
                }
                _ => unreachable!(),
            }
            .map_err(error)?;
            Ok((
                if operation == "create" {
                    StatusCode::CREATED
                } else {
                    StatusCode::OK
                },
                axum::Json(result),
            )
                .into_response())
        }
        .await,
    )
}
