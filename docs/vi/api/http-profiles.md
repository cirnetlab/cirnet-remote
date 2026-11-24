# Hồ sơ HTTP và chuyển sang Remote native

[English](../../en/api/http-profiles.md) · [Chính sách release](https://github.com/cirnetlab/cirnet-remote/blob/df11ba3f53e33bf119217c396343b0bae1149faa/docs/vi/operations/release-version-policy.md)

| Hồ sơ | Hợp đồng và client được hỗ trợ |
| --- | --- |
| Hệ thống 0.1.4 đã phát hành, Python API 0.1.2 | Handoff bất biến của Contracts 0.1.2 mô tả 63 operation. Python API đã phát hành phục vụ các route chưa có tiền tố V2 bên dưới và các bản V2 tương ứng nếu có. Ghép với Interface 0.1.4 đã phát hành. |
| Ứng viên Windows native, Remote 0.2.4 | Từ handoff đã kiểm tra digest, runtime chiếu 46 operation vào `/openapi.json`. Ghép với Interface Next và SDK sinh từ đúng bản chiếu đó. Sau bước kiểm quyền, method đã ngừng trả 404 hoặc 405. |

[Commit chuyển đổi](https://github.com/cirnetlab/cirnet-remote/commit/06d205755acd956d42bdbab27efabadd51a37a9f)
và [mục Unreleased](../../changelogs/README.md) ghi nhận
quyết định ngừng hỗ trợ. Các client bị ảnh hưởng có thay đổi phá vỡ tương
thích source, wire HTTP và hành vi. Cặp Python đã phát hành là hồ sơ
tương thích và khôi phục. Nâng cấp client trước khi chuyển cặp đó sang native.

## Operation đã ngừng hỗ trợ

Method và path lấy từ handoff đóng băng. Mã thành công của từng thao tác
thay thế giữ nguyên. Hậu tố `V2` trong operation ID xác định hợp đồng đó.

| Operation và route Python | Thay thế trên native | Thay đổi request hoặc response |
| --- | --- | --- |
| `validateCircuit` POST `/api/circuits/validate` | `validateCircuitV2` POST `/api/v2/circuits/validate` | Dùng `AnySupportedCircuitGraph`, gồm graph 1.2. Kết quả vẫn là `CircuitValidationResult`. |
| `previewCircuit` POST `/api/circuits/physical-preview` | `previewCircuitV2` POST `/api/v2/circuits/physical-preview` | Cùng mở rộng graph. Kết quả vẫn là `PhysicalPreviewResult`. |
| `listCircuits` GET `/api/projects/{project_id}/circuits` | `listCircuitsV2` GET `/api/v2/projects/{project_id}/circuits` | Giữ tham số phân trang. Trả `CircuitPageV2`. |
| `createCircuit` POST `/api/projects/{project_id}/circuits` | `createCircuitV2` POST `/api/v2/projects/{project_id}/circuits` | `CircuitCreateV2` mở rộng nhóm schema graph và trả `CircuitDocumentV2`. |
| `getCircuit` GET `/api/circuits/{document_id}` | `getCircuitV2` GET `/api/v2/circuits/{document_id}` | Trả `CircuitDocumentV2`. DELETE ở path cũ vẫn hiện hành. |
| `saveCircuit` PUT `/api/circuits/{document_id}` | `saveCircuitV2` PUT `/api/v2/circuits/{document_id}` | `CircuitSaveV2` mở rộng graph, giữ `base_revision`. Trả `CircuitDocumentV2`. |
| `listAssignments` GET `/api/assignments` | `listAssignmentsV2` GET `/api/v2/assignments` | Kiểu phần tử đổi từ `AssignmentView` sang `AssignmentViewV2`. |
| `createAssignment` POST `/api/assignments` | `createAssignmentDocumentV2` POST `/api/v2/assignment-documents` | Bọc định nghĩa trong `{definition}`. Trả `AssignmentAuthoringDocumentV2` thay cho `InstructorAssignmentDocument`. |
| `getAssignment` GET `/api/assignments/{assignment_id}` | `getAssignmentV2` GET `/api/v2/assignments/{assignment_id}` | Trả `AssignmentViewV2`, giữ phân quyền theo vai trò. |
| `publishAssignment` PATCH `/api/assignments/{assignment_id}/publication` | `publishAssignmentDocumentV2` PATCH `/api/v2/assignment-documents/{assignment_id}/publication` | Đọc tài liệu soạn thảo hiện hành, truyền `base_revision` cùng `published`. Trả `AssignmentAuthoringDocumentV2`. |
| `listAssignmentDocuments` GET `/api/assignment-documents` | `listAssignmentDocumentsV2` GET `/api/v2/assignment-documents` | Giữ tham số phân trang. Trả `AssignmentAuthoringPageV2`. |
| `createAssignmentDocument` POST `/api/assignment-documents` | `createAssignmentDocumentV2` POST `/api/v2/assignment-documents` | Giữ trường `definition`, mở rộng sang `AnySupportedAssignmentDefinition`. Trả `AssignmentAuthoringDocumentV2`. |
| `getAssignmentDocument` GET `/api/assignment-documents/{assignment_id}` | `getAssignmentDocumentV2` GET `/api/v2/assignment-documents/{assignment_id}` | Trả `AssignmentAuthoringDocumentV2`. |
| `saveAssignmentDocument` PUT `/api/assignment-documents/{assignment_id}` | `saveAssignmentDocumentV2` PUT `/api/v2/assignment-documents/{assignment_id}` | Giữ kiểm tra revision, mở rộng nhóm định nghĩa. Trả `AssignmentAuthoringDocumentV2`. |
| `publishAssignmentDocument` PATCH `/api/assignment-documents/{assignment_id}/publication` | `publishAssignmentDocumentV2` PATCH `/api/v2/assignment-documents/{assignment_id}/publication` | Giữ `base_revision`, `published` và chính sách phản hồi tùy chọn. Trả `AssignmentAuthoringDocumentV2`. |
| `createExperiment` POST `/api/experiments` | `createExperimentV2` POST `/api/v2/experiments` | `ExperimentCreateV2` nhận graph 1.2 và cấu trúc chọn V2. Kết quả vẫn là `ExperimentRecord`. GET ở path cũ vẫn hiện hành. |
| `getExperimentDocumentReference` GET `/api/experiments/{experiment_id}/document-reference` | `getExperimentDocumentReferenceV2` GET `/api/v2/experiments/{experiment_id}/document-reference` | Trả `ExperimentDocumentReferenceV2`, schema response 2.0 và hỗ trợ graph 1.2. |

Interface 0.1.4 đã phát hành gọi 15 operation đã ngừng có ID V2 tương ứng.
Hai thao tác ghi bài tập trực tiếp ảnh hưởng client ngoài workbench. Dự án,
xóa mạch, xác thực, capture, trạm và các thao tác thí nghiệm còn lại giữ
route hiện hành theo OpenAPI native.

Chọn hồ sơ và operation trước khi gửi lệnh ghi. Tự theo redirect, đổi route
hoặc gửi lại sau timeout, 404, 405 hoặc lỗi phiên bản có thể lặp lệnh ghi.
Đối soát kết quả chưa rõ bằng thao tác đọc hoặc trạng thái operation theo khóa
ban đầu. Nếu xung đột revision, tải lại tài liệu và yêu cầu quyết định ghi
mới. Schema của graph đã lưu độc lập với phiên bản route HTTP.

[Kiểm tra bản chiếu qua CLI](../../../tests/cli.rs) ·
[MIME capture và tương thích](https://github.com/cirnetlab/cirnet-remote/blob/df11ba3f53e33bf119217c396343b0bae1149faa/docs/vi/operations/namespace-compatibility.md)
