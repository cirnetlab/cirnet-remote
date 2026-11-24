# Sử dụng Contracts

[English](../../en/api/contracts-consumer.md)

Contracts sở hữu schema chuẩn, Thư viện thiết bị, mô tả Hardware RPC 2.0 và NCAP. Remote biên dịch cùng cirnet-contracts-native ở phiên bản trong Cargo.toml và đọc tài nguyên chuẩn đã chọn qua CIRNET_CONTRACTS_ROOT. Tập lệnh dựng sinh client RPC từ mô tả chuẩn. Remote chiếu các tuyến thực tế sang OpenAPI cho SDK Interface.

Phát triển dùng checkout cirnet-contracts bên cạnh. Ứng viên hệ thống chọn snapshot nguồn chính xác và ghim artifact sinh ra trong manifest. Giữ phiên bản giao thức và schema độc lập với phiên bản ứng dụng. Chạy [bộ kiểm chứng](../contributing/verification.md) sau khi đổi lựa chọn.
