# Kiến trúc hệ thống

[English](../../en/architecture/system.md)

[Kiến trúc Ecosystem](https://github.com/cirnetlab/cirnet-rules/blob/master/docs/tai-lieu-kien-tuc-he-thong/cirnetlab-architecture-vi.md) xác định đích cấp tổ chức. [CIRNET Lab-First](https://github.com/cirnetlab/cirnet-rules/blob/master/docs/tai-lieu-kien-tuc-he-thong/cirnet-architecture-lab-first-vi.md) quy định thực thi Lab, quyền sở hữu và an toàn trạm. [Kiến trúc FPGA](https://github.com/cirnetlab/cirnet-rules/blob/master/docs/cirnetlab-FPGA-architecture-vi.md) xác định đích FPGA và bo mạch trong phạm vi các quy tắc an toàn đó.

Trong bản triển khai native, Interface chỉnh sửa CircuitGraph logic và dùng API REST, WebSocket của Remote. Remote sở hữu xác thực, phân quyền, dự án, bài tập, lập lịch, lease bền vững, kho bản thu và lựa chọn bản phát hành hệ thống. Hardware sở hữu RPC loopback, vòng đời trạm và Stop an toàn. Worker Simulator native cách ly thực thi số và DC trong giới hạn. Contracts sở hữu schema chuẩn, dữ liệu thiết bị, mô tả RPC và NCAP. Embedded Hardware sở hữu RTL và nghiệm thu phía phần cứng.

Remote phục vụ tài nguyên trình duyệt cùng origin với API trong ứng viên Windows. Hardware RPC 2.0 cục bộ vẫn tách riêng. Hardware xác minh SHA-256 của binary Simulator khi khởi động. Gói Windows chứa đủ tài nguyên native và Remote kiểm chứng lựa chọn ứng viên tại ranh giới artifact.

## Cấu trúc kho mã

Các repo lõi giữ mã production trong thư mục gốc phù hợp với ngôn ngữ như `src/` và `rtl/`. Điểm vào build và kiểm thử nằm trong `scripts/` hoặc manifest của toolchain. Test, fixture và tài nguyên sinh tự động nằm cùng tính năng hoặc bộ sinh sở hữu chúng. Mỗi repo duy trì tài liệu tham chiếu riêng trong `docs/en/` và `docs/vi/`. Remote ghi mã băm chính xác của nguồn và artifact trong ứng viên, còn mỗi repo sản xuất duy trì lock phụ thuộc của mình.

| Đường dẫn | Trách nhiệm |
| --- | --- |
| [`src/api/`](../../../src/api/) | Tuyến HTTP, giải mã query và body, xuất OpenAPI và truyền sự kiện WebSocket. |
| [`src/application/`](../../../src/application/) | Thao tác xác thực, dự án, bài tập, trạm và thí nghiệm, gồm điều phối lease và Stop. |
| [`src/domain/`](../../../src/domain/) | Quy tắc biên dịch, topology, định tuyến và ngữ nghĩa số. |
| [`src/infrastructure/`](../../../src/infrastructure/) | Cơ sở dữ liệu và migration, client Hardware cục bộ, phục vụ web cùng origin và bằng chứng chẩn đoán. |
| [`deployment/`](../../../deployment/README.md) | Trình chạy ứng viên Windows và đầu vào systemd, nginx cho Linux. |
| [`scripts/`](../../../scripts/) | Chọn nguồn, hợp nhất bản dựng native, xác minh manifest và kiểm thử smoke trên gói. |
| [`tests/`](../../../tests/) | Kiểm thử tích hợp Rust và fixture đối chiếu ngoại tuyến. |

Binary trong `src/main.rs` lắp ghép dịch vụ và `src/lib.rs` cung cấp các đường dẫn module crate hiện có. Pipeline ứng viên đóng gói tệp trình duyệt từ bản dựng Interface đã chọn. Thư mục `assets/` của repo lưu artwork và ảnh mẫu lịch sử để tham khảo nguồn.

## Môi trường đích và nghiệm thu

Production hướng đến Linux với PostgreSQL và origin HTTPS khai báo rõ. Chạy vật lý yêu cầu bảo vệ đã kiểm chứng, quan sát dây nối và năng lực trạm được cấp phép. FPGA vật lý và ngspice vẫn UNAVAILABLE khi chưa có cấu hình đủ điều kiện. Xem [hợp đồng an toàn vật lý](physical-lab-safety-contract.md) và [hướng dẫn triển khai](../../../deployment/README.md).
