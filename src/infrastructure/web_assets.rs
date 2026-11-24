use axum::{
    body::Body,
    extract::Request,
    middleware::Next,
    response::{IntoResponse, Response},
};
use http::{Method, StatusCode, header};
use std::path::{Path, PathBuf};
use tokio::{fs::File, io::AsyncReadExt};

pub fn validate_root(root: PathBuf) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "Interface root unavailable")?;
    let index = root.join("index.html");
    if !std::fs::symlink_metadata(index).is_ok_and(|entry| entry.is_file()) {
        return Err("Interface index.html unavailable".into());
    }
    Ok(root)
}

fn app_boundary(path: &str) -> bool {
    path == "/openapi.json"
        || ["/api", "/ws"].iter().any(|prefix| {
            path.strip_prefix(prefix)
                .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        })
}

fn relative_path(path: &str) -> Option<PathBuf> {
    let path = path.strip_prefix('/')?;
    if path.is_empty() {
        return Some(PathBuf::from("index.html"));
    }
    let mut relative = PathBuf::new();
    for part in path.trim_end_matches('/').split('/') {
        if part.is_empty()
            || part.starts_with('.')
            || part.ends_with(['.', ' '])
            || !part
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_. ".contains(&b))
        {
            return None;
        }
        let stem = part.split('.').next()?.trim_end().to_ascii_uppercase();
        if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.len() == 4
                && stem.as_bytes()[3].is_ascii_digit()
        {
            return None;
        }
        relative.push(part);
    }
    Some(relative)
}

async fn open(root: &Path, path: &Path) -> Option<(File, u64)> {
    let full = tokio::fs::canonicalize(root.join(path)).await.ok()?;
    if !full.starts_with(root) {
        return None;
    }
    let file = File::open(full).await.ok()?;
    let metadata = file.metadata().await.ok()?;
    metadata.is_file().then_some((file, metadata.len()))
}

pub async fn serve(root: PathBuf, request: Request, next: Next) -> Response {
    let path = cirnet_remote_native::http_projects::decode_path(request.uri().path());
    if app_boundary(&path) || !matches!(*request.method(), Method::GET | Method::HEAD) {
        return next.run(request).await;
    }
    let Some(mut relative) = relative_path(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let found = open(&root, &relative).await;
    let found = if found.is_none()
        && relative.extension().is_none()
        && !["/assets", "/models"].iter().any(|prefix| {
            path.strip_prefix(prefix)
                .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        }) {
        relative = PathBuf::from("index.html");
        open(&root, &relative).await
    } else {
        found
    };
    let Some((file, size)) = found else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let kind = match relative.extension().and_then(|value| value.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("gltf") => "model/gltf+json",
        Some("glb") => "model/gltf-binary",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    };
    let body = if *request.method() == Method::HEAD {
        Body::empty()
    } else {
        Body::from_stream(futures_util::stream::try_unfold(
            file,
            |mut file| async move {
                let mut buffer = vec![0; 64 * 1024];
                let count = file.read(&mut buffer).await?;
                buffer.truncate(count);
                Ok::<_, std::io::Error>((count != 0).then_some((buffer, file)))
            },
        ))
    };
    Response::builder()
        .header(header::CONTENT_TYPE, kind)
        .header(header::CONTENT_LENGTH, size)
        .header(header::CACHE_CONTROL, "no-cache")
        .header("x-content-type-options", "nosniff")
        .body(body)
        .expect("fixed response headers")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_leave_api_and_websocket_to_the_existing_router() {
        assert!(app_boundary("/api"));
        assert!(app_boundary("/api/health"));
        assert!(app_boundary("/ws/events"));
        assert!(app_boundary("/openapi.json"));
        assert!(!app_boundary("/apis"));
        for path in [
            "/../index.html",
            "/assets\\file.js",
            "/file.js:stream",
            "/assets/aux.txt",
            "/x//y",
            "/assets/file.js.",
        ] {
            assert!(relative_path(path).is_none(), "{path}");
        }
        assert_eq!(relative_path("/"), Some("index.html".into()));
        assert_eq!(
            relative_path("/models/a.glb"),
            Some(PathBuf::from("models/a.glb"))
        );
    }
}
