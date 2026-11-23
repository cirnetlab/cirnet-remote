# Kiểm chứng Remote

[English](../../en/contributing/verification.md)

Workflow kiểm chứng thành phần Windows x64 chạy khi push lên `master` với commit chính xác của Contracts Next được ghim trong workflow. Có thể chọn lại commit khi chạy thủ công. Workflow ứng viên native Windows x64 vẫn chạy thủ công với các commit thành phần được chỉ định.

Tạo Actions secret `CIRNET_DEPENDENCIES_READ_TOKEN` trong [cài đặt tổ chức cirnetlab](https://github.com/organizations/cirnetlab/settings/secrets/actions). Chọn **Selected repositories** và thêm các repo chạy workflow. Dùng fine-grained token có resource owner là `cirnetlab` và quyền `Contents: read` trên các repo private được liệt kê bên dưới. Workflow thành phần cần `cirnet-contracts-next`. Workflow ứng viên native thủ công cần thêm `cirnet-simulator-next` và `cirnet-embedded-hardware`. Để giữ phạm vi token dùng chung cho CI thành phần, dùng secret cùng tên ở cấp repo Remote với các quyền mà workflow ứng viên cần.

Cấp phiên bên ngoài bằng công cụ phân bổ artifact của Contracts Next. Đặt đích Cargo, tệp cơ sở dữ liệu và nhật ký tại đó. Đặt CIRNET_CONTRACTS_ROOT thành checkout Contracts Next đã chọn rồi chạy cargo fmt --all --check và cargo test --locked. Để kiểm chứng CLI chuyển đổi cơ sở dữ liệu, đặt CIRNET_REMOTE_CLI_DIR thành thư mục mới trong phiên rồi chạy cargo test --locked --test cli -- --ignored.

Các bài kiểm thử có fixture bổ sung kiểm tra tương thích dữ liệu cũ, chuyển đổi SQLite và PostgreSQL, lỗi truyền tải khi chạy, thẩm quyền bộ lập lịch và toàn vẹn bản thu. Thông báo ignore nêu các đầu vào bắt buộc. Fixture Python tùy chọn trong tests/reference chạy trong môi trường kiểm chứng riêng. Binary production dùng Rust và artifact native.

Chạy kiểm chứng toàn hệ thống trên gói ứng viên theo manifest trước khi chấp nhận. Ghi lại chính xác nguồn, toolchain, đầu vào và các bài đã qua, thất bại hoặc chưa thể chạy. Dẫn từ bản tóm tắt đã duyệt đến bằng chứng nằm ngoài Git.
