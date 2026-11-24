# Kiểm chứng Remote

[English](../../en/contributing/verification.md)

Workflow kiểm chứng thành phần Windows x64 chạy khi push lên `master` với commit chính xác của Contracts Next được ghim trong workflow. Có thể chọn lại commit khi chạy thủ công. Workflow ứng viên native Windows x64 vẫn chạy thủ công với các commit thành phần được chỉ định.

Tạo Actions secret `CIRNET_DEPENDENCIES_READ_TOKEN` trong [cài đặt tổ chức cirnetlab](https://github.com/organizations/cirnetlab/settings/secrets/actions). Chọn **Selected repositories** và thêm các repo chạy workflow. Dùng fine-grained token có resource owner là `cirnetlab` và quyền `Contents: read` trên các repo private được liệt kê bên dưới. Workflow thành phần cần `cirnet-contracts-next`. Workflow ứng viên native thủ công cần thêm `cirnet-simulator-next` và `cirnet-embedded-hardware`. Để giữ phạm vi token dùng chung cho CI thành phần, dùng secret cùng tên ở cấp repo Remote với các quyền mà workflow ứng viên cần.

Cấp phiên bên ngoài bằng công cụ phân bổ artifact của Contracts Next. Đặt đích Cargo, tệp cơ sở dữ liệu và nhật ký tại đó. Đặt CIRNET_CONTRACTS_ROOT thành checkout Contracts Next đã chọn rồi chạy cargo fmt --all --check và cargo test --locked. Để kiểm chứng CLI chuyển đổi cơ sở dữ liệu, đặt CIRNET_REMOTE_CLI_DIR thành thư mục mới trong phiên rồi chạy cargo test --locked --test cli -- --ignored.

## Fixture hồi quy legacy

Chạy bộ kiểm chứng fixture Windows x64 từ checkout Remote Next với Python 3.14,
Node, Git và toolchain Rust đã ghim. Đặt `CIRNET_ARTIFACTS_DIR` thành thư mục cha
đầu ra tuyệt đối bên ngoài checkout và `CIRNET_CONTRACTS_ROOT` thành checkout
Contracts Next đã chọn.

```powershell
python -I -B tests/reference/verify.py
python -I -B tests/reference/verify.py --postgres-dsn-file <tệp-dsn-của-phiên>
```

Remote Next lưu bộ dữ liệu JSON đã kiểm chứng cùng mã tạo cơ sở dữ liệu trong
`tests/reference`. Trình chạy kiểm tra SHA-256, tạo phiên cơ sở dữ liệu mới và sinh
mã RPC cho trạm kiểm thử từ Contracts Next. [Nguồn và giấy phép](../../../tests/reference/README.md).
Để chạy ngoại tuyến, dùng `--wheelhouse` với wheel đã khóa cùng `--offline-cargo`.
Để kiểm tra bộ quản lý thí nghiệm, khôi phục và Stop với binary đã chọn, truyền đường dẫn
manifest trong gói qua `--candidate-manifest` cùng SHA-256 đã duyệt qua
`--candidate-manifest-sha256`.

Công cụ phân bổ của Contracts quản lý bộ dữ liệu đối chiếu, fixture SQLite và
phiên, bản dựng Cargo cùng nhật ký. `--prepare-only` tạo fixture SQLite và
ghi mã băm bộ dữ liệu mà không chạy Cargo. Với PostgreSQL, dùng máy chủ dùng một
lần và tệp chứa URL quản trị loopback dạng
`postgresql://user:password@127.0.0.1:port/postgres`. Trình chạy tạo và xóa các
cơ sở dữ liệu riêng có tên duy nhất.

Các bài kiểm thử được chọn bao phủ đối chiếu trình biên dịch, topo, định tuyến,
thân HTTP, xác thực, dự án và bài tập, chuyển đổi dữ liệu và chặn ghi cạnh
tranh, thẩm quyền lập lịch, quyền yêu cầu Stop, giao thức WebSocket và toàn vẹn
bản thu. Bộ dữ liệu đơn vị cho trạm dùng thành phần kiểm thử gRPC loopback.
Kiểm chứng gói native chạy Hardware và Simulator thật. Đo thời gian trên Linux và HIL vật lý có đầu vào và trạng thái kết quả
riêng. Python chỉ chạy trong môi trường fixture cô lập.

Chạy kiểm chứng toàn hệ thống trên gói ứng viên theo manifest trước khi chấp nhận. Ghi lại chính xác nguồn, toolchain, đầu vào và các bài đã qua, thất bại hoặc chưa thể chạy. Dẫn từ bản tóm tắt đã duyệt đến bằng chứng nằm ngoài Git.
