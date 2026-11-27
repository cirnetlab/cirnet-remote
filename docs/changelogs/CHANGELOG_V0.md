# Remote version 0 changelog · Nhật ký thay đổi phiên bản 0

[Changelog index · Chỉ mục](README.md)

## Unreleased

### Changed

- Consolidated English and Vietnamese development history in this version file.
- Hợp nhất lịch sử phát triển tiếng Anh và tiếng Việt trong tệp theo phiên bản.

## v0.3.0-dev.1 — Development

This is the Windows x64 Native Candidate development line. The available Git tags and GitHub Releases provide no publication date for this version.

Đây là dòng phát triển ứng viên Windows x64 Native Candidate. Các Git tag và GitHub Release hiện có không cung cấp ngày phát hành cho phiên bản này.

### Added

- Establish Remote Next ownership of the Windows native candidate.
  - VI · Xác lập quyền sở hữu ứng viên native Windows tại Remote Next.

### Changed

- Group HTTP decoding, diagnostic evidence and Linux deployment files by responsibility.
  - VI · Nhóm bộ giải mã HTTP, bằng chứng chẩn đoán và tệp triển khai Linux theo trách nhiệm.
- Align repository references with the canonical CIRNET names.
  - VI · Đồng bộ tham chiếu với tên kho CIRNET chính thức.
- Migrate the Rust REST and WebSocket service into API, domain, application and infrastructure directories.
  - VI · Chuyển dịch vụ REST và WebSocket Rust vào các thư mục API, domain, application và infrastructure.
- Build against Contracts Next and keep the existing RPC and data compatibility.
  - VI · Dựng cùng Contracts Next và giữ tương thích RPC cùng dữ liệu hiện có.
- Preserve native deployment, migrations, capture persistence and scheduler safety regression tests.
  - VI · Giữ triển khai native, chuyển đổi dữ liệu, lưu bản thu và bộ hồi quy an toàn bộ lập lịch.
- Adopt the Ecosystem, CIRNET Lab-First and FPGA target references and archive Lab-First v3.1.
  - VI · Áp dụng các tham chiếu kiến trúc đích Ecosystem, CIRNET Lab-First và FPGA, đồng thời lưu trữ Lab-First v3.1.
- Run Windows component CI on master pushes with pinned private dependencies.
  - VI · Chạy CI thành phần Windows khi push lên master với phụ thuộc riêng tư đã ghim.
- Document the Actions secret permissions for component CI and manual candidates.
  - VI · Ghi rõ quyền của Actions secret cho CI thành phần và ứng viên chạy thủ công.
- Reproduce legacy compiler, HTTP and database fixtures from pinned Python references and run the ignored Rust regression tests.
  - VI · Tái tạo fixture trình biên dịch, HTTP và cơ sở dữ liệu legacy từ nguồn tham chiếu Python đã ghim và chạy các bài hồi quy Rust bị bỏ qua mặc định.
- Exercise browser reconnect, NCAP parity, hard reload and native process cleanup in the installed candidate.
  - VI · Kiểm tra kết nối lại của trình duyệt, đối chiếu NCAP, tải lại trang hoàn toàn và dọn tiến trình native trên ứng viên đã cài.
- Store verified corpora and database seeding sources in Remote Next and check native peers against the selected candidate manifest.
  - VI · Lưu dữ liệu đối chiếu và mã tạo cơ sở dữ liệu tại Remote Next, kiểm tra binary native theo manifest của ứng viên đã chọn.
- Reused compatible candidates only after checking source provenance, toolchain identity, package digests and pinned E2E evidence. Kept native assembly output in the owned Remote session.
  - VI · Chỉ dùng lại ứng viên tương thích sau khi kiểm tra nguồn, toolchain, mã băm gói và bằng chứng E2E đã ghim. Giữ đầu ra lắp ráp native trong phiên do Remote sở hữu.

### Sources · Nguồn đối chiếu

- [Version manifest · Manifest phiên bản](../../Cargo.toml)
- [Native implementation baseline · Mốc triển khai native](https://github.com/cirnetlab/cirnet-remote/commit/343247ec96cb5c85dae4e7e259511a745d634aec)
- [Latest source milestone recorded here · Mốc mã nguồn mới nhất ghi ở đây](https://github.com/cirnetlab/cirnet-remote/commit/6ca8abf41f0c371abfebaf6319545f96c9a66c4c)
- [Earlier version index placeholder · Tệp chỉ mục phiên bản trước đây](https://github.com/cirnetlab/cirnet-remote/blob/f149ef68499b5687db6b7ac37147e06688446ae1/docs/changelogs/CHANGELOG_V0.md)
