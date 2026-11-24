"""Seed Station route oracle cases with pinned Python Remote and scripted Hardware."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sys

from uuid import uuid4
import grpc
from google.protobuf.json_format import ParseDict

from app.services.persistence import Repository
import rpc_v2_pb2 as pb
import rpc_v2_pb2_grpc as rpc


VIRTUAL = "virtual-station-01"
PHYSICAL = "physical-station-01"
UNKNOWN = "never-declared"
QUEUE = ["foreign_first", "own_second", "foreign_third", "own_fourth"]


def station_values(station, scenario):
    physical = station == PHYSICAL
    value = {
        "schema_version": "1.0", "station_id": station,
        "mode": "hardware" if physical else "simulation", "available": True,
        "virtual_digital": not physical, "virtual_analog": False,
        "physical_digital": physical, "physical_analog_routing": physical,
        "physical_execution_slots": int(physical), "topology_scan_supported": physical,
        "safety_gate_supported": physical, "guarded_run_supported": physical,
        "component_resolution_modes": ["HYBRID"] if physical else [],
        "instrument_capabilities": {
            "logic_analyzer": {"channels": 4, "runtime_reconfiguration_supported": False},
            "oscilloscope": {"channels": int(physical), "runtime_reconfiguration_supported": False},
            "generator": {"channels": int(physical), "runtime_reconfiguration_supported": physical,
                          **({"status": "READY", "supported_waveforms": ["SINE"], "offset_min_v": -1.0} if physical else {})},
        },
        "routing_resources": [
            {"resource_id": "private-route", "roles": ["INPUT_SOURCE"], "node_ids": ["private-node"]},
        ] if physical else [],
        "hardware_rpc_version": "2.0", "fpga_protocol_version": "fixture-fpga",
        "firmware_version": "" if scenario == "invalid" else "fixture-firmware",
        "hardware_profile_version": "fixture-profile",
        "breadboards": [{"id": "board1", "model": "board-fixture"}] if physical else [],
    }
    return ParseDict(value, pb.StationCapabilities())


def seed_scenario(directory, scenario):
    owners = [uuid4().hex for _ in range(3)]
    repo = Repository("sqlite:///" + (directory / scenario["database"]).as_posix())

    def record(owner, identity, station):
        repo.create_experiment(owner, {
            "experiment_id": identity, "station_id": station, "state": "CREATED",
            "revision": 1, "capture": None, "lease_expires_at": None,
        })

    try:
        for index, identity in enumerate(scenario["queue"]):
            record(owners[1 - index % 2], identity, VIRTUAL)
        if scenario["scenario"] == "busy":
            for station, identity in [(VIRTUAL, "busy-virtual-private"),
                                      (PHYSICAL, "quarantine-physical-private")]:
                record(owners[1], identity, station)
                assert repo.reserve(station, 0, identity, 1.0)
            repo.quarantine("quarantine-physical-private")
        for case in scenario["cases"]:
            case["owner"] = owners[case["owner"]]
    finally:
        repo.close()


@contextmanager
def fixture_hardware():
    class Hardware(rpc.HardwareServiceServicer):
        def __init__(self, scenario):
            self.scenario = scenario

        def GetCapabilities(self, request, context):
            if request.station_id not in (VIRTUAL, PHYSICAL) or request.experiment_id:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, "unrecognized fixture target")
            if self.scenario == "offline":
                context.abort(grpc.StatusCode.UNAVAILABLE, "isolated fixture offline")
            return station_values(request.station_id, self.scenario)

    servers = {}
    addresses = {}
    for name in ("ready", "offline", "invalid"):
        server = grpc.server(ThreadPoolExecutor(max_workers=2))
        rpc.add_HardwareServiceServicer_to_server(Hardware(name), server)
        port = server.add_insecure_port("127.0.0.1:0")
        assert port > 0
        server.start()
        addresses[name] = f"127.0.0.1:{port}"
        servers[name] = server
    try:
        yield addresses
    finally:
        for server in servers.values():
            server.stop(grace=2).wait(timeout=3)


def main():
    if sys.argv[1:] == ["serve"]:
        with fixture_hardware() as addresses:
            print(json.dumps(addresses), flush=True)
            sys.stdin.buffer.read()
        return
    assert sys.argv[1:] == ["seed"]
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    folder = Path.cwd().resolve(strict=True)
    assert folder != session and folder.is_relative_to(session)
    values = json.loads((Path(__file__).parent / "corpus/stations.json").read_bytes())
    for scenario in values:
        seed_scenario(folder, scenario)
    with (folder / "oracle.json").open("x", encoding="utf-8") as file:
        json.dump(values, file, indent=2)
        file.write("\n")
    print(f"Generated {sum(len(value['cases']) for value in values)} exact Python station-route observations.")


if __name__ == "__main__":
    main()
