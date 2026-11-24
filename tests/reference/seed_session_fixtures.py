"""Generate the legacy guest and signed session data required by Rust fixtures."""

import json
import os
from pathlib import Path
from secrets import token_urlsafe
import sys
from time import time

from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository
from app.services.projects import ProjectService


def auth_fixture(url):
    repo = Repository(url)
    try:
        owner = "stage4-auth-legacy-guest"
        # A migrated guest owns the project before obtaining a signed session.
        with repo.engine.begin() as database:
            database.execute(repo.auth_principals.insert().values(
                principal_id=owner, kind="GUEST", created_at=1.0
            ))
            database.execute(repo.sessions.insert().values(
                session_id=owner, expires_at=time() + 3600
            ))
        ProjectService(repo).create_project(
            owner, {"name": "Legacy owned project", "description": ""}
        )
        auth = AuthService(repo, Settings(environment="test", database_url=url, allow_guest=True))
        auth._create_user("stage4_python", "stage4-python-password", "STUDENT", None, None)
    finally:
        repo.close()


def websocket_fixture(url):
    repo = Repository(url)
    try:
        auth = AuthService(repo, Settings(environment="test", database_url=url, allow_guest=True))
        password = token_urlsafe(24)
        auth.bootstrap_admin("stage4_admin", password)
        guest, _ = auth.ensure_session(None)
        admin, _ = auth.login(guest, "stage4_admin", password)
        result = {}
        for username in ("stage4_alice", "stage4_bob"):
            auth.create_user(username, password, actor=admin)
            guest, _ = auth.ensure_session(None)
            user, token = auth.login(guest, username, password)
            result[username] = {"token": token, "csrf": user.csrf_token}
        guest, _ = auth.ensure_session(None)
        revoked, token = auth.login(guest, "stage4_alice", password)
        auth.logout(revoked)
        result["revoked"] = token
        return result
    finally:
        repo.close()


def project_fixture(url):
    repo = Repository(url)
    try:
        auth = AuthService(repo, Settings(environment="test", database_url=url, allow_guest=True))
        result = {}
        for role in ("owner", "other", "revoked"):
            context, token = auth.ensure_session(None)
            result[role] = {
                "token": token, "session_id": context.session_id, "owner_id": context.owner_id
            }
            if role == "owner":
                with repo.engine.begin() as database:
                    peer, peer_token = auth._new_session(database, context.principal_id)
                result["peer"] = {
                    "token": peer_token, "session_id": peer.session_id, "owner_id": peer.owner_id
                }
            if role == "revoked":
                auth.logout(context)
        return result
    finally:
        repo.close()


if __name__ == "__main__":
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    folder = Path.cwd().resolve(strict=True)
    if folder == session or not folder.is_relative_to(session):
        raise RuntimeError("Session fixtures must use the owned artifact session.")

    def sqlite(name):
        return "sqlite:///" + (folder / name).as_posix()

    if sys.argv[1:] == ["postgres"]:
        auth_fixture(os.environ["CIRNET_REMOTE_AUTH_POSTGRES"])
        path = folder / "projects.json"
        fixtures = json.loads(path.read_text(encoding="utf-8"))
        fixtures["postgres"] = project_fixture(os.environ["CIRNET_REMOTE_PROJECT_POSTGRES"])
        path.write_text(json.dumps(fixtures), encoding="utf-8")
    else:
        auth_fixture(sqlite("auth.sqlite"))
        with (folder / "fixture.json").open("x", encoding="utf-8") as stream:
            json.dump(websocket_fixture(sqlite("websocket.sqlite")), stream)
        with (folder / "projects.json").open("x", encoding="utf-8") as stream:
            url = sqlite("projects.sqlite")
            json.dump({"sqlite": {"url": url, **project_fixture(url)}}, stream)
