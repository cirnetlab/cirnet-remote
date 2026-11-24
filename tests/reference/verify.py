"""Build the pinned legacy oracle and run the Remote Next fixture checks."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import uuid
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PINS = {
    "cirnet-remote": "d0a28e8ba3ec9c6b93f70932c45843d35f75a499",
    "cirnet-contracts": "c913108a78db5e51c6ea1fb2e30a9cb4c6e199a4",
    "cirnet-simulator": "7cdee6420a204f9b0cd2120ff9e65ee5ffd52b1c",
}
REMOTE_DB_REVISION = "3e75787f3143f7c9e913d93d3dc95e7359687aec"
POSTGRES_FIXTURES = {
    "DB_FIXTURE_POSTGRES": "read",
    "DB_WRITE_POSTGRES": "write",
    "DB_MIGRATION_POSTGRES": "migration",
    "DB_MIGRATION_POSTGRES_DUPLICATE": "duplicate",
    "AUTH_POSTGRES": "auth",
    "ASSIGNMENT_FIXTURE_POSTGRES": "assignment",
    "PROJECT_POSTGRES": "project",
    "RUNTIME_FIXTURE_POSTGRES": "runtime_records",
    "RUNTIME_EXTRA_PG": "runtime_operations",
    "RUNTIME_CAPTURE_PG": "runtime_captures",
    "STOP_CLAIM_POSTGRES": "stop_claim",
    "AUTHORITY_FIXTURE_POSTGRES": "scheduler",
}


def run(args, *, env=None, cwd=ROOT, capture=False):
    return subprocess.run(
        [str(arg) for arg in args], cwd=cwd, env=env, check=True,
        encoding="utf-8" if capture else None,
        stdout=subprocess.PIPE if capture else None,
    ).stdout


def snapshot(source, target, revision, paths):
    resolved = run(["git", "-C", source, "rev-parse", "--verify", revision + "^{commit}"],
                   capture=True).strip()
    if resolved != revision:
        raise RuntimeError(f"Incorrect reference revision for {source.name}.")
    archive = target.with_suffix(".zip")
    run(["git", "-C", source, "archive", "--format=zip", "-o", archive, revision, *paths])
    with ZipFile(archive) as contents:
        contents.extractall(target)


def bootstrap(lane, sources, env, wheelhouse):
    reference = lane / "reference"
    reference.mkdir()
    remote, contracts, simulator = (reference / name for name in PINS)
    reference_path = "migration/python-reference"
    snapshot(sources[remote.name], remote, PINS[remote.name], [f"{reference_path}/services/api/app"])
    # Git ignored the relocated app/db directory when the FastAPI runtime was retired.
    # Recover its original tracked files from the parent of that migration.
    db_source = reference / "remote-db"
    snapshot(sources[remote.name], db_source, REMOTE_DB_REVISION, ["services/api/app/db"])
    shutil.copytree(db_source / "services/api/app/db", remote / reference_path / "services/api/app/db")
    snapshot(sources[contracts.name], contracts, PINS[contracts.name],
             [f"{reference_path}/contracts", "contracts"])
    snapshot(sources[simulator.name], simulator, PINS[simulator.name],
             [f"{reference_path}/cirnet_sim"])
    package = contracts / reference_path / "contracts"
    shutil.copytree(contracts / "contracts", package, dirs_exist_ok=True)

    venv = lane / "venv"
    run([sys.executable, "-I", "-B", "-m", "venv", venv], env=env)
    python = venv / "Scripts/python.exe"
    pip = [python, "-I", "-B", "-m", "pip", "--isolated", "--disable-pip-version-check", "install",
           "--no-cache-dir", "--only-binary=:all:", "--require-hashes", "-r",
           HERE / "requirements-windows.lock"]
    if wheelhouse:
        pip += ["--no-index", "--find-links", wheelhouse]
    run(pip, env=env)
    locations = [
        remote / reference_path / "services/api",
        contracts / reference_path,
        simulator / reference_path,
    ]
    (venv / "Lib/site-packages/cirnet_reference.pth").write_text(
        "\n".join(map(str, locations)) + "\n", encoding="utf-8"
    )
    run([python, "-I", "-B", "-m", "contracts.codegen.generate_hardware_rpc"], env=env)
    return python


def sqlite_url(path):
    return "sqlite:///" + path.as_posix()


def prepare_fixtures(lane, env, python):
    def seed(script, *args, cwd=lane, **overrides):
        return run([python, "-I", "-B", "-X", "utf8", HERE / (script + ".py"), *args],
                   env={**env, **overrides}, cwd=cwd, capture=True)

    compiler = lane / "compiler.json"
    seed("compiler_fixture", compiler)
    env["CIRNET_REMOTE_COMPILER_CORPUS"] = str(compiler)
    for key, script, args in (
        ("COMPILER_NUMERIC", "compiler_numeric_fixture", ()),
        ("TOPOLOGY_EDGE", "topology_fixture", ("all",)),
        ("HTTP_BODY", "http_body_fixture", ()),
    ):
        path = lane / (script + ".json")
        contents = seed(script, *args)
        json.loads(contents)
        path.write_text(contents, encoding="utf-8")
        env[f"CIRNET_REMOTE_{key}_CORPUS"] = str(path)

    for key, child, script in (
        ("DB_FIXTURE_DIR", "sqlite-read", "db_seed_legacy"),
        ("DB_MIGRATION_SQLITE_DIR", "sqlite-migrations", "db_seed_migrations"),
        ("ASSIGNMENT_FIXTURE_DIR", "assignments", "seed_assignment_records"),
        ("STOP_CLAIM_DIR", "stop", "seed_stop_claim"),
        ("RUNTIME_FIXTURE_DIR", "runtime-records", "seed_runtime_records"),
    ):
        env[f"CIRNET_REMOTE_{key}"] = str(lane / child)
        seed(script)
    read = lane / "sqlite-read"
    write = lane / "sqlite-write"
    shutil.copytree(read, write)
    env["CIRNET_REMOTE_DB_WRITE_SQLITE_DIR"] = str(write)
    authority = lane / "sqlite-authority"
    authority.mkdir()
    shutil.copyfile(read / "legacy.sqlite", authority / "authority.sqlite")
    env["CIRNET_REMOTE_AUTHORITY_FIXTURE_DIR"] = str(authority)

    for key, child, captures, pg_variable in (
        ("EXTRA", "runtime-operations", "false", "CIRNET_REMOTE_RUNTIME_EXTRA_PG"),
        ("CAPTURE", "runtime-captures", "true", "CIRNET_REMOTE_RUNTIME_CAPTURE_PG"),
    ):
        folder = lane / child
        seed("seed_runtime_records", CIRNET_REMOTE_RUNTIME_FIXTURE_DIR=str(folder),
             CIRNET_REMOTE_RUNTIME_FIXTURE_POSTGRES=env.get(pg_variable, ""),
             CIRNET_REMOTE_RUNTIME_CAPTURE_FIXTURE=captures)
        env[f"CIRNET_REMOTE_RUNTIME_{key}_DIR"] = str(folder)

    sessions = lane / "sessions"
    sessions.mkdir()
    seed("seed_session_fixtures", cwd=sessions)
    env.update(CIRNET_REMOTE_AUTH_SQLITE=sqlite_url(sessions / "auth.sqlite"),
               CIRNET_REMOTE_WS_FIXTURE_DIR=str(sessions),
               CIRNET_REMOTE_PROJECT_FIXTURE=str(sessions / "projects.json"))
    stations = lane / "stations"
    stations.mkdir()
    shutil.copyfile(HERE / "stations_fixture.py", stations / "stations_fixture.py")
    seed("stations_fixture", "seed", cwd=stations)
    env.update(CIRNET_STATION_FIXTURE_DIR=str(stations), CIRNET_NATIVE_STAGE3_PYTHON=str(python))
    if "CIRNET_REMOTE_AUTH_POSTGRES" in env:
        seed("seed_session_fixtures", "postgres", cwd=sessions)
        # Run the write seeder against its own database and disposable SQLite copies.
        seed("db_seed_legacy", CIRNET_REMOTE_DB_FIXTURE_DIR=str(lane / "sqlite-pg-write"),
             CIRNET_REMOTE_DB_FIXTURE_POSTGRES=env["CIRNET_REMOTE_DB_WRITE_POSTGRES"])


def check_tests(lane, env, offline):
    for variable in (
        "CIRNET_REMOTE_CLI_DIR", "CIRNET_REMOTE_CAPTURE_TEST_DIR",
        "CIRNET_STAGE4_SQLITE_WRITER_GATE_DIR", "CIRNET_STAGE4_SQLITE_WRITER_PROBE_DIR",
    ):
        path = lane / variable.lower()
        path.mkdir()
        env[variable] = str(path)

    command = ["cargo", "test", "--locked", "--target", "x86_64-pc-windows-msvc"]
    if offline:
        command.append("--offline")
    checks = [
        ("cli", ""),
        ("compiler_cases", ""),
        ("lib", "compiler_numeric_boundary_matches_python"),
        ("lib", "topology::tests"),
        ("lib", "pinned_json_offsets_nonfinite_values_and_media_types"),
        ("lib", "public_graph_versions_match_legacy_boundaries"),
        ("lib", "v2_one_of_errors_preserve_python_public_detail"),
        ("lib", "physical_binding_validation_matches_reference_mounting_rules"),
        ("lib", "experiments::captures::tests"),
        ("lib", "sqlite_connection_rejects_durable_dml"),
        ("lib", "sqlite_writer_gate_tests"),
        ("lib", "sqlite_writer_wait_splits_pool_and_begin"),
        ("lib", "websocket::tests"),
        ("lib", "station_routes_match_pinned_python"),
        ("auth_lifecycle", "sqlite"),
        ("assignment_records", "sqlite"),
        ("db_migrations", "sqlite"),
        ("db_readonly", "reads_legacy_sqlite"),
        ("db_write", "sqlite"),
        ("project_records", "sqlite"),
        ("project_numeric", "sqlite"),
        ("runtime_captures", "sqlite"),
        ("runtime_operations", "sqlite"),
        ("runtime_records", "sqlite"),
        ("scheduler_authority", "sqlite"),
        ("stop_claim_authority", "sqlite"),
    ]
    if "CIRNET_REMOTE_AUTH_POSTGRES" in env:
        checks.extend((target, "postgres") for target in (
            "auth_lifecycle", "assignment_records", "db_migrations", "db_readonly", "db_write",
            "project_records", "project_numeric", "runtime_captures", "runtime_operations",
            "runtime_records", "scheduler_authority", "stop_claim_authority",
        ))
        checks.append(("lib", "postgres_connection_rejects_durable_dml"))
    failures = []
    for target, name in checks:
        selector = ["--lib"] if target == "lib" else ["--test", target]
        test = [*command, *selector, name, "--", "--ignored"]
        label = f"{target}:{name}" if name else target
        result = subprocess.run(test, cwd=ROOT, env=env, text=True, encoding="utf-8",
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        output = result.stdout
        for key in POSTGRES_FIXTURES:
            value = env.get(f"CIRNET_REMOTE_{key}")
            if value:
                output = output.replace(value, "[fixture URL]").replace(
                    value.replace("postgresql+psycopg", "postgresql", 1), "[fixture URL]"
                )
        (lane / (label.replace(":", "-") + ".log")).write_text(output, encoding="utf-8")
        passed = result.returncode == 0 and re.search(r"test result: ok\. [1-9]\d* passed;", result.stdout)
        print(f"{'PASS' if passed else 'FAIL'} {label}", flush=True)
        if not passed:
            failures.append(label)
            print(output, end="", flush=True)
    if failures:
        raise RuntimeError("Remote reference checks failed: " + ", ".join(failures))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy-root", type=Path, default=ROOT.parent,
                        help="directory containing the three named legacy Git repositories")
    parser.add_argument("--wheelhouse", type=Path, help="read hashed wheels from this offline directory")
    parser.add_argument("--offline-cargo", action="store_true")
    parser.add_argument("--prepare-only", action="store_true", help="prepare fixtures and record hashes")
    parser.add_argument("--postgres-dsn-file", type=Path,
                        help="file with an administrator URL for a disposable loopback PostgreSQL server")
    args = parser.parse_args()
    if args.prepare_only and args.postgres_dsn_file:
        parser.error("PostgreSQL fixtures are allocated only for a complete verification run.")
    if sys.version_info[:2] != (3, 14) or sys.platform != "win32" or platform.machine() != "AMD64":
        parser.error("The locked reference wheels require Windows x64 Python 3.14.")

    sources = {name: (args.legacy_root / name).resolve(strict=True) for name in PINS}
    contracts = Path(os.environ.get("CIRNET_CONTRACTS_ROOT", ROOT.parent / "cirnet-contracts-next"))
    contracts = contracts.resolve(strict=True)
    allocator = contracts / "tools/artifact-paths/artifact-paths.mjs"
    context = json.dumps({"owner": "cirnet-remote-regression",
                          "roots": list(map(str, [ROOT, contracts, *sources.values()]))})
    env = dict(os.environ, CIRNET_ARTIFACTS_CONTEXT=context, CIRNET_CONTRACTS_ROOT=str(contracts))
    session = Path(run(["node", allocator], env=env, capture=True).strip())
    lane = session / ("remote-reference-" + uuid.uuid4().hex[:8])
    lane.mkdir()
    print(f"Remote reference session: {lane}", flush=True)
    for key in list(env):
        if key.startswith(("CIRNET_", "NETCIRCUIT_")) and key not in {
            "CIRNET_ARTIFACTS_DIR", "CIRNET_ARTIFACTS_CONTEXT", "CIRNET_CONTRACTS_ROOT",
            "CIRNET_PROTOC_SHA256",
        }:
            env.pop(key)
    env.update(CIRNET_ARTIFACTS_SESSION=str(session), CARGO_TARGET_DIR=str(session / "target"),
               CIRNET_CAPTURE_DIR=str(lane / "captures"), CIRNET_DATABASE_URL="sqlite://",
               CIRNET_ENV="test", CIRNET_SIMULATION_BACKEND="legacy",
               CIRNET_ALLOW_GUEST="true", TEMP=str(lane), TMP=str(lane))
    wheelhouse = args.wheelhouse.resolve(strict=True) if args.wheelhouse else None
    python = bootstrap(lane, sources, env, wheelhouse)
    postgres = None
    if args.postgres_dsn_file:
        dsn = args.postgres_dsn_file.read_text(encoding="utf-8-sig").strip()
        names = [f"cirnet_stage4_db_{suffix}_{uuid.uuid4().hex[:8]}"
                 for suffix in POSTGRES_FIXTURES.values()]

        def postgres(operation):
            return subprocess.run(
                [python, "-I", "-B", HERE / "postgres_fixtures.py", operation, *names],
                cwd=lane, env=env, input=dsn, check=True, encoding="utf-8", stdout=subprocess.PIPE
            ).stdout

        urls = json.loads(postgres("create"))
        env.update((f"CIRNET_REMOTE_{key}", url)
                   for key, url in zip(POSTGRES_FIXTURES, urls, strict=True))
    else:
        print("NOT_RUN PostgreSQL fixtures (supply --postgres-dsn-file)", flush=True)
    try:
        prepare_fixtures(lane, env, python)
        corpus_hashes = {Path(path).name: hashlib.sha256(Path(path).read_bytes()).hexdigest()
                         for key, path in env.items()
                         if key.startswith("CIRNET_REMOTE_") and key.endswith("_CORPUS")}
        revisions = {**PINS, "cirnet-remote-db": REMOTE_DB_REVISION}
        (lane / "corpus-sha256.json").write_text(
            json.dumps({"legacy_revisions": revisions, "sha256": corpus_hashes}, indent=2) + "\n",
            encoding="utf-8",
        )
        if not args.prepare_only:
            check_tests(lane, env, args.offline_cargo)
    finally:
        if postgres:
            postgres("drop")


if __name__ == "__main__":
    main()
