# Kiến trúc hệ thống

[English](../../en/architecture/system.md)

[Kiến trúc Lab-First](lab-first-v3-1.md) chi phối quyền sở hữu hệ thống và an toàn trạm. Interface chỉnh sửa CircuitGraph logic và dùng API REST, WebSocket của Remote. Remote sở hữu xác thực, phân quyền, dự án, bài tập, lập lịch, lease bền vững và kho bản thu. Hardware sở hữu RPC loopback, vòng đời trạm và Stop an toàn. Worker Simulator native cách ly thực thi số và DC trong giới hạn. Contracts sở hữu schema chuẩn, dữ liệu thiết bị, mô tả RPC và NCAP. Embedded Hardware sở hữu RTL và nghiệm thu phía phần cứng.

Remote phục vụ tài nguyên trình duyệt cùng origin với API trong ứng viên Windows. Hardware RPC 2.0 cục bộ vẫn tách riêng. Hardware xác minh SHA-256 của binary Simulator khi khởi động. Gói Windows chứa đủ tài nguyên native và Remote kiểm chứng lựa chọn ứng viên tại ranh giới artifact.

Production hướng đến Linux với PostgreSQL và origin HTTPS khai báo rõ. Chạy vật lý yêu cầu bảo vệ đã kiểm chứng, quan sát dây nối và năng lực trạm được cấp phép. FPGA vật lý và ngspice vẫn UNAVAILABLE khi chưa có cấu hình đủ điều kiện. Xem [hợp đồng an toàn vật lý](physical-lab-safety-contract.md) và [hướng dẫn triển khai](../../../deployment/README.md).
