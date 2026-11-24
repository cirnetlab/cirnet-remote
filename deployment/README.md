# Native deployment

The [Windows launcher](windows-native/cirnet-native.ps1) verifies the candidate manifest and inventory before installation. Use an external install and data directory. The launcher supports migration, backup and restore with paired database and capture data.

The [Linux systemd units](systemd/native/) apply the production configuration and use a Unix-domain socket between Remote and Hardware. Review the example environment files for PostgreSQL, the exact HTTPS origin, the Contracts resources and the approved Simulator worker SHA-256. See the [system architecture](../docs/en/architecture/system.md).

## Tiếng Việt

[Trình chạy Windows](windows-native/cirnet-native.ps1) kiểm tra manifest ứng viên và danh mục tệp trước khi cài. Dùng thư mục cài và dữ liệu bên ngoài. Trình chạy hỗ trợ chuyển đổi, sao lưu và khôi phục với dữ liệu cơ sở dữ liệu và bản thu tương ứng.

[Các unit systemd Linux](systemd/native/) áp dụng cấu hình production và dùng socket Unix giữa Remote và Hardware. Xem tệp môi trường mẫu để cấu hình PostgreSQL, origin HTTPS chính xác, tài nguyên Contracts và SHA-256 worker Simulator đã duyệt. Xem [kiến trúc hệ thống](../docs/vi/architecture/system.md).
