# coffee-shop-tycoon-3d

Game web 3D low-poly quản lý quán cà phê (Three.js), chơi ngay trên trình duyệt.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[▶ Chơi thử](https://quangphung218.github.io/coffee-shop-tycoon-3d/)** · [Video mp4](docs/media/demo.mp4)

![Một ngày ở quán: mở cửa, khách vào, phục vụ, báo cáo cuối ngày](docs/media/demo.gif)

- **Cho ai:** người thích game quản lý nhẹ nhàng, chơi một ngày trong khoảng 7 phút.
- **Trạng thái:** chơi được trọn vòng ngày, có nhân viên, nâng cấp, phố xá và save/load.
- **Ngôn ngữ:** chữ trong game là tiếng Việt, tiền tính bằng đồng (vd `25.000đ`).

## Mục lục

- [Tính năng](#tính-năng)
- [Cài và chạy](#cài-và-chạy)
- [Cách chơi một ngày](#cách-chơi-một-ngày)
- [Điều khiển](#điều-khiển)
- [Lưu game](#lưu-game)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Phát triển và kiểm thử](#phát-triển-và-kiểm-thử)
- [Phát hành và version](#phát-hành-và-version)
- [Tài liệu khác](#tài-liệu-khác)
- [License](#license)

## Tính năng

| Tính năng | Chi tiết |
| --- | --- |
| Vòng ngày | Chuẩn bị → mở cửa → cao điểm → đóng cửa → Daily Report. |
| Quản lý quán | Bật/tắt món, nhập nguyên liệu, tuyển và phân vai nhân viên, chạy marketing, mua nâng cấp. |
| Tự phục vụ | Bấm khách, quầy hay bàn trong cảnh để nhận order, pha, mang đồ, thu tiền, dọn bàn. |
| Khách và đánh giá | Khách xếp hàng, gọi món, bỏ về khi chờ lâu; để lại review 1–5 sao. |
| Cảnh 3D | Quán, nhân vật và phố sinh bằng code; đèn ấm buổi tối; 3 mức đồ họa. |
| Âm thanh | Tổng hợp bằng Web Audio, không dùng file âm thanh. |
| Lưu game | Slot tự động cuối ngày và 3 slot lưu tay trong trình duyệt. |

| | |
| --- | --- |
| ![Main Menu](docs/media/main-menu.png)<br>Main Menu, quán chạy nền phía sau | ![Bảng Kho](docs/media/prep-inventory.png)<br>Chuẩn bị: nhập hàng ở bảng Kho |
| ![Giờ cao điểm](docs/media/peak.png)<br>Cao điểm trưa: khách xếp hàng, nhân viên pha và mang món | ![Daily Report](docs/media/daily-report.png)<br>Daily Report: lãi/lỗ, khách, món bán chạy |
| ![Đánh giá](docs/media/reviews.png)<br>Đánh giá của khách sau một ngày | ![Bảng Menu](docs/media/menu-icons.png)<br>Bảng Menu với icon 3D |
| ![Mặt tiền ban ngày](docs/media/facade-day.png)<br>Mặt tiền quán buổi sáng | ![Mặt tiền chiều tối](docs/media/facade-evening.png)<br>Chiều tối: cửa sổ và biển hiệu sáng ấm |
| ![Hàng chờ](docs/media/queue.png)<br>Hàng chờ đi theo lối trống giữa các bàn | |

## Cài và chạy

Yêu cầu:

- Node.js và npm.
- Trình duyệt có WebGL (Chrome, Edge, Firefox, Safari bản mới).

Các bước:

1. Cài thư viện: `npm install`.
2. Chạy dev server: `npm run dev`.
3. Mở địa chỉ Vite in ra (mặc định `http://localhost:5173`); Main Menu hiện ra.

Build bản tĩnh và deploy lên GitHub Pages: xem [docs/deploy.md](docs/deploy.md).

## Cách chơi một ngày

1. **Main Menu** → **Ván mới**: đặt tên quán, chọn độ khó Dễ/Thường/Khó.
2. **Chuẩn bị** (đồng hồ dừng ở 07:00): mở các bảng ở dock giữa đáy màn hình (Việc, Menu, Kho, Nhân viên, Marketing, Nâng cấp), rồi bấm **Mở cửa** trên HUD.
3. **Mở cửa** và **Cao điểm** (11:00–13:00, 17:00–19:00): khách vào, xếp hàng, gọi món; thiếu nhân viên thì tự bấm vào khách, quầy, bàn để phục vụ.
4. **Đóng cửa** (từ 20:00): không nhận khách mới; ngày kết thúc khi khách cuối rời quán.
5. **Daily Report**: xem lãi/lỗ, thu chi, khách, món bán chạy, rating, review và gợi ý; game tự lưu trước khi báo cáo hiện. Bấm **Ngày tiếp theo** để sang ngày mới.

Bảng **Đánh giá** ở dock liệt kê các review gần nhất bất cứ lúc nào.

## Điều khiển

| Thao tác | Phím / chuột |
| --- | --- |
| Xoay camera | Kéo chuột trái; giữ `Q` / `E` |
| Zoom | Cuộn chuột |
| Di chuyển (pan) | `W` `A` `S` `D`, phím mũi tên, hoặc đưa chuột sát mép màn hình |
| Đặt lại camera | Nút camera trên HUD hoặc `Home` |
| Tạm dừng / tiếp tục | `Space` hoặc nút **Dừng** trên HUD |
| Mở bảng quản lý | Nút ở dock giữa đáy màn hình; bấm lại để đóng |
| Tốc độ 1x / 2x / 4x | `1` / `2` / `3` |
| Đóng bảng, mở menu tạm dừng | `Esc` |

**Cài đặt** có:

| Mục | Giá trị |
| --- | --- |
| Nhạc nền, Hiệu ứng | Âm lượng 0–100% |
| Chất lượng | Thấp / Vừa / Cao |
| Tốc độ khi mở cửa | 1x / 2x / 4x |
| Di chuyển camera bằng WASD | Bật: `Q`/`E` xoay, `WASD` và mũi tên pan. Tắt: `Q`/`A` (hoặc `E`) xoay, chỉ mũi tên pan. |

Version đang chạy (vd `v0.1.0`) hiện ở chân Main Menu và cuối màn Cài đặt.

## Lưu game

- Lưu trong `localStorage` của trình duyệt: slot tự động (ghi cuối mỗi ngày) và 3 slot lưu tay trong menu Tạm dừng.
- **Tải game** ở Main Menu mở mọi slot; slot hỏng được báo, không bị xóa.

## Cấu trúc thư mục

| Thư mục | Nội dung |
| --- | --- |
| `src/sim/` | Lõi mô phỏng thuần TypeScript, tất định: giờ, pha, khách, đơn, kho, nhân viên, kinh tế, rating, review, báo cáo ngày. |
| `src/sim/data/` | Bảng dữ liệu: menu, nguyên liệu, nâng cấp, marketing, độ khó. |
| `src/render/` | Three.js: `scene/` (renderer, camera, quán), `actors/` (nhân vật, animation), `street/` (phố, xe, người đi đường). |
| `src/ui/` | Lớp phủ HTML/CSS: `core/`, `screens/`, `hud/`, `panels/`, `report/`, `styles/`. |
| `src/audio/` | Âm thanh tổng hợp bằng Web Audio. |
| `src/save/` | Lưu/tải game và cài đặt. |
| `src/version.ts` | Version của game, lấy từ `package.json` lúc build. |
| `tests/` | Test Vitest theo cùng cấu trúc, cộng `integration/` chạy cả ngày chơi. |
| `scripts/` | Deploy, phát hành version, chụp ảnh demo, dựng icon, đo khởi động. |
| `design/` | Token và mockup giao diện. |

Chi tiết các lớp: [docs/architecture.md](docs/architecture.md).

## Phát triển và kiểm thử

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Dev server có hot reload. |
| `npm test` | Chạy test Vitest một lần. |
| `npm run check` | `tsc --noEmit`, toàn bộ test, rồi `vite build`. Chạy trước khi commit. |
| `npm run build` | Kiểm tra kiểu và build ra `dist/`. |
| `npm run preview` | Mở bản build. |
| `npm run media` | Build rồi chụp lại ảnh, GIF, mp4 vào `docs/media/` ([docs/media.md](docs/media.md)). |
| `npm run icons` | Dựng lại atlas icon 3D trong `public/icons3d/`. |

- Xem nhân vật và animation riêng: `npm run dev` rồi mở `/?preview=actors`.
- Commit theo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `perf:`…); version tự tăng theo các commit này.

## Phát hành và version

Mỗi lần deploy bằng `sh scripts/deploy-pages.sh`, script tự tăng version theo commit kể từ tag `v*` gần nhất:

| Commit kể từ tag trước | Version mới |
| --- | --- |
| Có `BREAKING CHANGE` hoặc `!` (vd `feat!:`) | Tăng major; khi còn `0.x` thì tăng minor |
| Có `feat` | Tăng minor (`0.1.0` → `0.2.0`) |
| Chỉ có `fix` hoặc `perf` | Tăng patch (`0.1.0` → `0.1.1`) |
| Không có các loại trên | Giữ nguyên |

- Version mới được ghi vào `package.json`, `package-lock.json` và [CHANGELOG.md](CHANGELOG.md), commit `chore(release): vX.Y.Z` và tag `vX.Y.Z`.
- Script không push commit hay tag; nó in sẵn lệnh `git push` cần chạy.

Các bước đầy đủ, cách tạo tag gốc lần đầu: [docs/deploy.md](docs/deploy.md#version-và-phát-hành).

## Tài liệu khác

| Trang | Nội dung |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Ba lớp sim/render/ui, lệnh và sự kiện, vòng ngày, FSM khách, save, hiệu năng. |
| [docs/deploy.md](docs/deploy.md) | Build, version và deploy lên GitHub Pages. |
| [docs/media.md](docs/media.md) | Tạo lại ảnh chụp, GIF/mp4 demo và atlas icon 3D. |
| [CHANGELOG.md](CHANGELOG.md) | Thay đổi theo từng version. |

## License

- Mã nguồn: [MIT](LICENSE), © 2026 Quang Phung.
- Thư viện và font đóng gói kèm (three.js MIT, font Nunito SIL OFL 1.1): [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
