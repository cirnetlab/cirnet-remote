# API ứng dụng

[English](../../en/api/application.md) · [Kiến trúc hệ thống](../architecture/system.md)

Dịch vụ Rust công bố các thao tác REST hiện tại tại /openapi.json và phục vụ cập nhật thao tác tương ứng qua WebSocket. Chạy cirnet-remote --export-openapi cùng tài nguyên Contracts Next đã chọn để xuất cùng phép chiếu cho SDK Interface. [Cấu hình HTTP](http-profiles.md) ghi các tuyến hiện tại và đã ngừng.

Dùng GET /api/health để xem trạng thái sẵn sàng. Khởi tạo phiên qua GET /api/auth/session. Với yêu cầu ghi đã xác thực, gửi Origin khớp chính xác và token X-CIRNET-CSRF của phiên. Thao tác điều khiển yêu cầu vai trò và quyền sở hữu phù hợp. Định danh lease và khóa thao tác giữ kết quả qua lần kết nối lại. Xem [xác thực](../architecture/auth-and-migrations.md) và [kết quả chưa xác định](../architecture/pending-observations.md).

CircuitGraph vẫn là thiết kế logic có thẩm quyền. [API mạch và Lab vật lý](circuit-and-physical-lab.md) mô tả xác thực đồ thị, xem trước và liên hệ với an toàn vật lý. [Sử dụng Contracts](contracts-consumer.md) trình bày schema, Hardware RPC và NCAP.
