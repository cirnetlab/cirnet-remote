# Bản ứng viên native Windows x64

[English](../../en/operations/native-candidate.md)

Remote quản lý việc chọn đầu vào phát hành. Nguồn thế hệ mới dùng dải phiên bản
`0.3.0-dev.N`. Contracts quản lý phiên bản giao thức. Bản đã đóng gói ở trạng
thái ứng viên phát triển. Khi chấp nhận ứng viên, lưu phạm vi kiểm tra và SHA-256
của manifest. Công bố bản phát hành là thao tác riêng.

## Build từ bộ nguồn đã chốt

Đặt sáu checkout thế hệ mới cạnh nhau. Chạy PowerShell 7.4+ trong môi trường
MSVC Developer dành cho x64, với Rust theo cấu hình của repo, Node.js 26.12.1,
CMake và Windows SDK. Chọn một thư mục đầu ra có sẵn theo đường dẫn tuyệt
đối, nằm ngoài các checkout.

Từ checkout Remote, dùng một tệp lựa chọn mới:

```powershell
$output = (Resolve-Path 'E:/cirnet-output').Path
$selection = Join-Path $output 'next-selection.json'
node scripts/native-source-selection.mjs lock $selection
./scripts/build-native-windows.ps1 -Selection $selection -OutputParent $output
```

Tệp lựa chọn ghi đường dẫn tương đối, kích thước và SHA-256 của mã nguồn được
theo dõi hoặc không bị Git bỏ qua. Revision Git ghi ngữ cảnh nguồn. Các digest
chốt chính xác nội dung, gồm cả thay đổi đang chờ commit. Bước chuẩn bị từ chối
nguồn lệch với lựa chọn và chỉ sao chép nguồn đã chọn vào phiên build riêng.
Hardware và Remote biên dịch với Contracts trong phiên đó. SDK của Interface
được sinh với OpenAPI xuất từ Remote vừa build. Gói nguồn Embedded Hardware
ghi schema giao thức FPGA đã chọn của Contracts. Dùng `-Offline` khi cache đã
có các phụ thuộc Rust và npm theo lockfile.

`assembly-result.json` trong phiên build ghi thư mục ứng viên, tệp nén và các
digest. Manifest ghi từng bộ nguồn, phiên bản công cụ và kích thước, SHA-256
của từng tệp đóng gói. Lưu tệp lựa chọn và SHA-256 của manifest đã duyệt cùng
bằng chứng kiểm tra. Các môi trường biên dịch khác nhau có thể tạo sản phẩm
khác byte với cùng bộ nguồn đầu vào.

## Kiểm tra bản đã cài đặt

Trên máy Windows phát triển, đọc biên nhận build đã duyệt:

```powershell
$result = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
node scripts/verify-native-windows.mjs $result.directory $result.manifestSha256
node scripts/test-native-windows.mjs $result.directory $result.manifestSha256 $chromiumCache
```

`$chromiumCache` là đường dẫn tuyệt đối tới thư mục chứa bản Chromium cài
theo phiên bản Playwright trong lockfile của Interface ở phiên build. Bài test
cài ứng viên vào thư mục mới, kiểm tra việc từ chối tệp bị sửa, chạy Remote,
Hardware và Simulator qua launcher, rồi kiểm tra thực thi ảo bằng trình
duyệt, Stop, lưu dữ liệu và khôi phục snapshot. Bỏ đối số Chromium sẽ chạy
phạm vi kiểm tra bản cài và API.

FPGA vật lý và ngspice vẫn ở trạng thái **UNAVAILABLE** trong ứng viên phát
triển này. Để nghiệm thu sản xuất, cần bằng chứng tương ứng với máy triển
khai, khả năng phần cứng và các điều kiện an toàn được hỗ trợ.
