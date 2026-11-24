# HTTP profiles and migration to native Remote

[Tiếng Việt](../../vi/api/http-profiles.md) · [Release policy](https://github.com/cirnetlab/cirnet-remote/blob/df11ba3f53e33bf119217c396343b0bae1149faa/docs/en/operations/release-version-policy.md)

| Profile | Contract and supported client |
| --- | --- |
| Published system 0.1.4, Python API 0.1.2 | The immutable Contracts 0.1.2 handoff describes 63 operations. The published Python API serves the unversioned operations below and their V2 counterparts where present. Pair it with published Interface 0.1.4. |
| CIRNET Remote Next | The authenticated handoff is projected to 46 HTTP operations in the served `/openapi.json`. Pair it with Interface Next and the SDK generated from this exact projection. After authorization, retired methods return 404 or 405. |

The [cutover commit](https://github.com/cirnetlab/cirnet-remote/commit/06d205755acd956d42bdbab27efabadd51a37a9f)
and [Unreleased notes](../../changelogs/README.md) record the
retirement decision. This is a source, HTTP wire and behavioral break for
affected clients. The published Python pair remains the compatibility and
rollback profile. A client upgrade is required before switching that pair to
native.

## Retired operations

Methods and paths below are from the frozen handoff. Success status remains
the same for each replacement. `V2` in an operation ID identifies that contract.

| Python operation and route | Native replacement | Request or response change |
| --- | --- | --- |
| `validateCircuit` POST `/api/circuits/validate` | `validateCircuitV2` POST `/api/v2/circuits/validate` | Request uses `AnySupportedCircuitGraph`, including graph 1.2. Result stays `CircuitValidationResult`. |
| `previewCircuit` POST `/api/circuits/physical-preview` | `previewCircuitV2` POST `/api/v2/circuits/physical-preview` | Same graph expansion. Result stays `PhysicalPreviewResult`. |
| `listCircuits` GET `/api/projects/{project_id}/circuits` | `listCircuitsV2` GET `/api/v2/projects/{project_id}/circuits` | Same paging inputs. Response is `CircuitPageV2`. |
| `createCircuit` POST `/api/projects/{project_id}/circuits` | `createCircuitV2` POST `/api/v2/projects/{project_id}/circuits` | `CircuitCreateV2` expands the graph union and returns `CircuitDocumentV2`. |
| `getCircuit` GET `/api/circuits/{document_id}` | `getCircuitV2` GET `/api/v2/circuits/{document_id}` | Returns `CircuitDocumentV2`. DELETE on the old path remains current. |
| `saveCircuit` PUT `/api/circuits/{document_id}` | `saveCircuitV2` PUT `/api/v2/circuits/{document_id}` | `CircuitSaveV2` expands the graph union and keeps `base_revision`. Returns `CircuitDocumentV2`. |
| `listAssignments` GET `/api/assignments` | `listAssignmentsV2` GET `/api/v2/assignments` | Array elements change from `AssignmentView` to `AssignmentViewV2`. |
| `createAssignment` POST `/api/assignments` | `createAssignmentDocumentV2` POST `/api/v2/assignment-documents` | Wrap the definition in `{definition}`. Returns `AssignmentAuthoringDocumentV2` instead of `InstructorAssignmentDocument`. |
| `getAssignment` GET `/api/assignments/{assignment_id}` | `getAssignmentV2` GET `/api/v2/assignments/{assignment_id}` | Returns `AssignmentViewV2` and retains role-specific views. |
| `publishAssignment` PATCH `/api/assignments/{assignment_id}/publication` | `publishAssignmentDocumentV2` PATCH `/api/v2/assignment-documents/{assignment_id}/publication` | Read the current authoring document first and supply `base_revision` with `published`. Returns `AssignmentAuthoringDocumentV2`. |
| `listAssignmentDocuments` GET `/api/assignment-documents` | `listAssignmentDocumentsV2` GET `/api/v2/assignment-documents` | Same paging inputs. Returns `AssignmentAuthoringPageV2`. |
| `createAssignmentDocument` POST `/api/assignment-documents` | `createAssignmentDocumentV2` POST `/api/v2/assignment-documents` | Still wraps `definition`, now with `AnySupportedAssignmentDefinition`. Returns `AssignmentAuthoringDocumentV2`. |
| `getAssignmentDocument` GET `/api/assignment-documents/{assignment_id}` | `getAssignmentDocumentV2` GET `/api/v2/assignment-documents/{assignment_id}` | Returns `AssignmentAuthoringDocumentV2`. |
| `saveAssignmentDocument` PUT `/api/assignment-documents/{assignment_id}` | `saveAssignmentDocumentV2` PUT `/api/v2/assignment-documents/{assignment_id}` | Keeps the revision fence and accepts the expanded definition union. Returns `AssignmentAuthoringDocumentV2`. |
| `publishAssignmentDocument` PATCH `/api/assignment-documents/{assignment_id}/publication` | `publishAssignmentDocumentV2` PATCH `/api/v2/assignment-documents/{assignment_id}/publication` | Keeps `base_revision`, `published` and optional feedback policy. Returns `AssignmentAuthoringDocumentV2`. |
| `createExperiment` POST `/api/experiments` | `createExperimentV2` POST `/api/v2/experiments` | `ExperimentCreateV2` accepts graph 1.2 and V2 selection shapes. Response remains `ExperimentRecord`. GET on the old path remains current. |
| `getExperimentDocumentReference` GET `/api/experiments/{experiment_id}/document-reference` | `getExperimentDocumentReferenceV2` GET `/api/v2/experiments/{experiment_id}/document-reference` | Returns `ExperimentDocumentReferenceV2` with response schema 2.0 and graph 1.2 support. |

Published Interface 0.1.4 calls the 15 retired operations with corresponding
V2 IDs. The two direct assignment writes affect external clients. Projects,
circuit deletion, authentication, captures, stations and remaining experiment
actions keep their current routes as listed by the native OpenAPI.

Choose the profile and operation before sending a write. Following a redirect,
changing the route or retrying automatically after a timeout, 404, 405 or an
unsupported-version response can duplicate a mutation. Reconcile unknown
outcomes through the current read or operation status with the original key.
For a revision conflict, load the current document and ask for a new explicit
write decision. Saved graph schemas remain independent of HTTP route versions.

[CLI projection verification](../../../tests/cli.rs) ·
[Capture media and compatibility](https://github.com/cirnetlab/cirnet-remote/blob/df11ba3f53e33bf119217c396343b0bae1149faa/docs/en/operations/namespace-compatibility.md)
