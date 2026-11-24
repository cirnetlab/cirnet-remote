# Khởi động

[English](../../en/guides/getting-started.md)

Đặt cirnet-contracts-next bên cạnh checkout này. Dùng toolchain Rust đã ghim và chạy cargo build --locked --bin cirnet-remote. Chạy cirnet-remote --help để xem CLI native.

Trên Windows phát triển, dùng [trình chạy native](../../../deployment/windows-native/cirnet-native.ps1) trong gói để cài ứng viên với SHA-256 dự kiến của manifest, sau đó khởi tạo và kiểm tra cơ sở dữ liệu. Trình chạy khởi động Remote cùng Interface, dịch vụ Hardware, worker Simulator và tài nguyên Contracts trong gói. Xem [triển khai](../../../deployment/README.md).

Cấu hình production yêu cầu PostgreSQL, origin HTTPS khai báo rõ và tắt quyền khách. Khi khôi phục, luôn ghép cơ sở dữ liệu với kho bản thu tương ứng. Chạy FPGA vật lý và ngspice vẫn ở trạng thái UNAVAILABLE trong ứng viên ảo.
