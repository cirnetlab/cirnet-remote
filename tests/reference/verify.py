"""Prepare independent regression fixtures and run the Remote Next fixture checks."""

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


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
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
AUTHORITY_CHECKS = (
    "authority_loss_after_seal_never_publishes_capture",
    "stale_worker_cannot_overwrite_successor_release",
    "stale_worker_cannot_overwrite_successor_quarantine",
)


def run(args, *, env=None, cwd=ROOT, capture=False):
    return subprocess.run(
        [str(arg) for arg in args], cwd=cwd, env=env, check=True,
        encoding="utf-8" if capture else None,
        stdout=subprocess.PIPE if capture else None,
    ).stdout


def bootstrap(lane, env, wheelhouse):
    venv = lane / "venv"
    run([sys.executable, "-I", "-B", "-m", "venv", venv], env=env)
    python = venv / "Scripts/python.exe"
    pip = [python, "-I", "-B", "-m", "pip", "--isolated", "--disable-pip-version-check", "install",
           "--no-cache-dir", "--only-binary=:all:", "--require-hashes", "-r",
           HERE / "requirements-windows.lock"]
    if wheelhouse:
        pip += ["--no-index", "--find-links", wheelhouse]
    run(pip, env=env)
    fixtures = HERE / "seed_source"
    rpc = lane / "rpc"
    rpc.mkdir()
    proto = Path(env["CIRNET_CONTRACTS_ROOT"]) / "contracts/hardware/v2"
    run([python, "-I", "-B", "-m", "grpc_tools.protoc", f"-I{proto}", f"--python_out={rpc}",
         f"--grpc_python_out={rpc}", proto / "rpc_v2.proto"], env=env)
    (venv / "Lib/site-packages/cirnet_reference.pth").write_text(
        f"{fixtures}\n{rpc}\n", encoding="utf-8"
    )
    return python


def sqlite_url(path):
    return "sqlite:///" + path.as_posix()


def prepare_fixtures(lane, env, python):
    def seed(script, *args, cwd=lane, **overrides):
        return run([python, "-I", "-B", "-X", "utf8", HERE / (script + ".py"), *args],
                   env={**env, **overrides}, cwd=cwd, capture=True)

    corpus = HERE / "corpus"
    expected = json.loads((corpus / "provenance.json").read_bytes())["sha256"]
    for name, digest in expected.items():
        if hashlib.sha256((corpus / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Regression corpus integrity failure in {name}.")
    for key, name in (("COMPILER", "compiler.json"), ("COMPILER_NUMERIC", "compiler_numeric_fixture.json"),
                      ("TOPOLOGY_EDGE", "topology_fixture.json"), ("HTTP_BODY", "http_body_fixture.json")):
        env[f"CIRNET_REMOTE_{key}_CORPUS"] = str(corpus / name)

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


def select_candidate(manifest, expected, env):
    data = manifest.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError("Selected candidate manifest SHA-256 mismatch.")
    package = json.loads(data)
    if (package["product"], package["version"], package["target"]) != (
        "cirnet-native-candidate", "0.3.0-dev.1", "x86_64-pc-windows-msvc"
    ):
        raise ValueError("Unexpected native candidate identity.")
    for variable, name in (("CIRNET_NATIVE_STAGE3_HARDWARE", "cirnet-hardware.exe"),
                           ("CIRNET_SIM_CPP_WORKER", "cirnet-simulator-worker.exe")):
        path = "bin/" + name
        (record,) = [item for item in package["files"] if item["path"] == path]
        binary = manifest.parent / path
        content = binary.read_bytes()
        if len(content) != record["size"] or hashlib.sha256(content).hexdigest() != record["sha256"]:
            raise ValueError(f"Selected candidate digest mismatch for {name}.")
        env.update({variable: str(binary), variable + "_SHA256": record["sha256"]})


def check_tests(lane, env, offline):
    for variable in (
        "CIRNET_REMOTE_EXPERIMENT_TEST_DIR", "CIRNET_REMOTE_CLI_DIR", "CIRNET_REMOTE_CAPTURE_TEST_DIR",
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
    if "CIRNET_NATIVE_STAGE3_HARDWARE" in env:
        checks.extend(("lib", name) for name in (
            "candidate_routes_preview_and_absent_physical_hardware",
            "candidate_native_manager_run_capture_idempotency_and_safe_release",
            "real_restart_retains_legacy_physical_lease_without_safe_ack",
            "revoked_same_owner_session_cannot_stop_an_experiment",
            "shutdown_drains_accepted_work_even_after_its_caller_disconnects",
            "failed_cleanup_commit_blocks_another_slot_on_the_station",
            "last_control_disconnect_ignores_late_start_and_quarantines_failed_cleanup",
            "releases_only_after_confirmed_safe_stop",
        ))
    else:
        print("NOT_RUN candidate Hardware/worker cases (supply selected manifest and SHA-256)", flush=True)
    if "CIRNET_REMOTE_AUTH_POSTGRES" in env:
        checks.extend((target, "postgres") for target in (
            "auth_lifecycle", "assignment_records", "db_migrations", "db_readonly", "db_write",
            "project_records", "project_numeric", "runtime_captures", "runtime_operations",
            "runtime_records", "scheduler_authority", "stop_claim_authority",
        ))
        checks.append(("lib", "postgres_connection_rejects_durable_dml"))
    for name in AUTHORITY_CHECKS:
        if name in env:
            checks.append(("lib", name))
    failures = []
    for target, name in checks:
        selector = ["--lib"] if target == "lib" else ["--test", target]
        test = [*command, *selector, name, "--", "--ignored"]
        label = f"{target}:{name}" if name else target
        test_env = dict(env, CIRNET_REMOTE_AUTHORITY_CAPTURE_FIXTURE=env[name]) if name in AUTHORITY_CHECKS else env
        result = subprocess.run(test, cwd=ROOT, env=test_env, text=True, encoding="utf-8",
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
    parser.add_argument("--wheelhouse", type=Path, help="read hashed wheels from this offline directory")
    parser.add_argument("--offline-cargo", action="store_true")
    parser.add_argument("--prepare-only", action="store_true", help="prepare fixtures and record hashes")
    parser.add_argument("--postgres-dsn-file", type=Path,
                        help="file with an administrator URL for a disposable loopback PostgreSQL server")
    parser.add_argument("--candidate-manifest", type=Path, help="manifest inside the selected native package")
    parser.add_argument("--candidate-manifest-sha256", help="reviewed SHA-256 of the selected manifest")
    args = parser.parse_args()
    if bool(args.candidate_manifest) != bool(args.candidate_manifest_sha256):
        parser.error("Supply the candidate manifest and its reviewed SHA-256 together.")
    if args.prepare_only and args.postgres_dsn_file:
        parser.error("PostgreSQL fixtures are allocated only for a complete verification run.")
    if sys.version_info[:2] != (3, 14) or sys.platform != "win32" or platform.machine() != "AMD64":
        parser.error("The locked reference wheels require Windows x64 Python 3.14.")

    contracts = Path(os.environ.get("CIRNET_CONTRACTS_ROOT", ROOT.parent / "cirnet-contracts-next"))
    contracts = contracts.resolve(strict=True)
    allocator = contracts / "tools/artifact-paths/artifact-paths.mjs"
    context = json.dumps({"owner": "cirnet-remote-regression",
                          "roots": list(map(str, [ROOT, contracts]))})
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
               CIRNET_ENV="test",
               CIRNET_ALLOW_GUEST="true", TEMP=str(lane), TMP=str(lane))
    wheelhouse = args.wheelhouse.resolve(strict=True) if args.wheelhouse else None
    if args.candidate_manifest:
        select_candidate(args.candidate_manifest.resolve(strict=True), args.candidate_manifest_sha256, env)
    python = bootstrap(lane, env, wheelhouse)
    postgres = None
    if args.postgres_dsn_file:
        dsn = args.postgres_dsn_file.read_text(encoding="utf-8-sig").strip()
        names = [f"cirnet_stage4_db_{suffix}_{uuid.uuid4().hex[:8]}"
                 for suffix in POSTGRES_FIXTURES.values()]

        if args.candidate_manifest:
            names.extend("cirnet_stage4_cutover_native_" + uuid.uuid4().hex[:12] for _ in AUTHORITY_CHECKS)

        def postgres(operation):
            return subprocess.run(
                [python, "-I", "-B", HERE / "postgres_fixtures.py", operation, *names],
                cwd=lane, env=env, input=dsn, check=True, encoding="utf-8", stdout=subprocess.PIPE
            ).stdout

        urls = json.loads(postgres("create"))
        env.update((f"CIRNET_REMOTE_{key}", url)
                   for key, url in zip(POSTGRES_FIXTURES, urls[:len(POSTGRES_FIXTURES)], strict=True))
    else:
        print("NOT_RUN PostgreSQL fixtures (supply --postgres-dsn-file)", flush=True)
    try:
        prepare_fixtures(lane, env, python)
        if postgres and args.candidate_manifest:
            data = Path(postgres("data-directory").strip())
            if data.is_absolute() and data.is_dir() and data.resolve(strict=True).is_relative_to(session):
                data = data.resolve(strict=True)
                for name, url in zip(AUTHORITY_CHECKS, urls[len(POSTGRES_FIXTURES):], strict=True):
                    proof = lane / (name + ".json")
                    run([python, "-I", "-B", HERE / "seed_session_fixtures.py", "authority"],
                        env=dict(env, CIRNET_AUTHORITY_DB=url, CIRNET_AUTHORITY_PROOF=str(proof),
                                 CIRNET_AUTHORITY_DATA=str(data)), cwd=lane)
                    env[name] = str(proof)
            else:
                print("NOT_RUN authority-loss cases (PostgreSQL data must be inside the allocator session)",
                      flush=True)
        corpus_hashes = {Path(path).name: hashlib.sha256(Path(path).read_bytes()).hexdigest()
                         for key, path in env.items()
                         if key.startswith("CIRNET_REMOTE_") and key.endswith("_CORPUS")}
        (lane / "corpus-sha256.json").write_text(
            json.dumps({"sha256": corpus_hashes}, indent=2) + "\n",
            encoding="utf-8",
        )
        if not args.prepare_only:
            check_tests(lane, env, args.offline_cargo)
    finally:
        if postgres:
            postgres("drop")


if __name__ == "__main__":
    main()
