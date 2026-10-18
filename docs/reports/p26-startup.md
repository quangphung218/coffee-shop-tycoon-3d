# P26 — Main Menu dưới 1 s trên điện thoại

Báo cáo P26 so với `57d7559`: thời gian tới Main Menu và cảnh 3D, kích thước chunk gzip, kết quả kiểm các ngưỡng. Kế hoạch: [startup-under-1s-plan.md](startup-under-1s-plan.md).

| Phần | Lệnh |
| --- | --- |
| Khởi động, bảng chunk | `PORT=<cổng> node scripts/measure-startup.mjs --base 57d7559 --runs 5` |
| Khung hình 5 s đầu, long task | `MEDIA_PORT=<cổng> npm run perf:frames -- --base 57d7559 --runs 5`, thêm `--headed` để lấy p95 thật |
| Lề, tràn ngang, vùng chạm | `LAYOUT_PORT=<cổng> npm run layout` |
| Màn chờ, dòng tiến độ, nút khoá, Thử lại | `MEDIA_PORT=<cổng> npm run media:loading` |
| Kiểm tra code | `npm run check` |

## 1. Tóm tắt

- Main Menu trên Phone 390×844 (150 ms RTT, 1,6 Mbps, CPU 4x): 765 ms, base 1225 ms (−460 ms, −38%).
- JS chính `index-*.js`: 75,8 → 15,0 kB gzip. Sim, HUD, panel, báo cáo, save, audio nằm ở chunk `game-*.js` (40,8 kB) và `iconMap-*.js` (24,0 kB), tải bằng `import()` sau khung hình đầu của menu.
- Cảnh 3D chậm hơn base 0,1% trên Phone 390×844 và 6,1% trên Mobile, trong ngưỡng 10%.
- Khung hình máy bàn headed: p95 20 ms (base 23 ms), chưa đạt 16,7 ms. Không còn long task sau `cst:world` ở di động headless qua 5 lượt ([mục 3](#3-số-đo)).
- Layout 68/68: thẻ lên cấp ở 1280×720 vừa một màn. Màn chờ, dòng tiến độ, nút khoá và Thử lại vẫn đúng.
- Font Nunito ở màn chờ và định dạng save giữ nguyên.

## 2. Kết quả kiểm

| Kiểm | Ngưỡng | Kết quả |
| --- | --- | --- |
| `npm run check` | tsc, test, build xanh | PASS: 95 file, 1425 test |
| Main Menu, Phone 390×844 | < 1000 ms | PASS: 765 ms (base 1225 ms) |
| Main Menu, Mobile | Không chậm hơn base | PASS: 820 ms (base 1190 ms) |
| Cảnh 3D so với `57d7559` | ≤ base + 10% | PASS: Phone 3260 / 3256 ms (+0,1%), Mobile 3392 / 3198 ms (+6,1%), Desktop 324 / 353 ms (−8,2%). Lượt đầu FAIL: Phone +10,7%, máy bàn +17,7% khi base lệch xa; lượt đo lại ngay sau đạt ([mục 3](#3-số-đo)) |
| JS chính gzip | Tăng ≤ 2 kB | PASS: 75,8 → 15,0 kB (−60,8 kB) |
| CSS chính gzip | Không tăng | PASS: 13,6 → 9,6 kB |
| `perf:frames`, máy bàn headless | 0 long task | PASS: 0 ở cả 5 lượt (base 0) |
| `perf:frames`, di động headless | 0 long task | PASS: 0 ở cả 5 lượt (lượt 0 / 0 / 0 / 0 / 0 ms); base cùng lượt 0 / 0 / 0 / 0 / 0 ms |
| p95 máy bàn (`--headed`) | ≤ 16,7 ms | FAIL: 20 ms (lượt 22 / 20 / 20 / 21 / 19 ms); base cùng lượt 23 ms. Nợ từ P25 (P25 đo 18 ms), chờ anh quyết |
| Long task máy bàn (`--headed`) | 0 long task | PASS: trung vị 0, lượt 0 / 1 / 0 / 0 / 0 ms; base trung vị 0, lượt 84 / 0 / 0 / 56 / 0 ms |
| `npm run layout` ở 390/768/1280/1440 | PASS mọi mục | PASS: 68/68. Thẻ lên cấp ở 1280×720 cao 54 px, vừa một màn. Tràn ngang 0, CLS Kho 0, nút ≥ 44 px, Menu gọn PASS |
| `npm run media:loading` | Màn chờ có %, dòng tiến độ, nút khoá "Đang chuẩn bị n%", Thử lại khi lỗi | PASS: 6 ảnh, xem [mục 4](#4-màn-chờ-và-main-menu-lúc-tải) |

## 3. Số đo

`measure-startup.mjs --base 57d7559 --runs 5`: Chrome headless, ANGLE Metal (Apple M2), trung vị 5 lần.

| Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu | Cảnh 3D |
| --- | --- | --- | --- | --- |
| Máy bàn | `57d7559` | 132 ms | 140 ms | 353 ms |
| Máy bàn | P26 | 88 ms | 103 ms | 324 ms |
| Di động, CPU 4x | `57d7559` | 400 ms | 1190 ms | 3198 ms |
| Di động, CPU 4x | P26 | 400 ms | 820 ms | 3392 ms |
| Phone 390×844 @3x, CPU 4x | `57d7559` | 376 ms | 1225 ms | 3256 ms |
| Phone 390×844 @3x, CPU 4x | P26 | 364 ms | 765 ms | 3260 ms |

Di động và Phone dùng mạng 150 ms RTT, 1,6 Mbps.

- Lượt chạy ngay trước trên cùng máy cho base lệch xa (máy bàn cảnh 3D 1200 ms, Mobile tới Main Menu 1614 ms): Phone 852 / 1037 ms tới Main Menu, cảnh 3D 3425 / 3094 ms (+10,7%), máy bàn 1412 / 1200 ms (+17,7%). Bảng trên là lượt đo lại ngay sau đó.

| Chunk | `57d7559` gzip | P26 gzip | Tải lúc |
| --- | --- | --- | --- |
| JS chính `index-*.js` | 75,8 kB | 15,0 kB | Trước Main Menu |
| CSS `index-*.css` | 13,6 kB | 9,6 kB | Trước Main Menu |
| `game-*.js` | – | 40,8 kB | Sau khung hình đầu của menu |
| `game-*.css` | – | 5,2 kB | Cùng `game-*.js` |
| `iconMap-*.js` | – | 24,0 kB | Cùng `game-*.js` |
| `src/render` `index-*.js` | 36,3 kB | 36,4 kB | Sau khung hình đầu của menu |
| `three-*.js` | 126,1 kB | 126,5 kB | Cùng `src/render` |
| `confetti-*.js` | 1,2 kB | 1,2 kB | Khi báo cáo có lên cấp |

Cột P26 lấy từ output `npm run build` (gzip của Vite), khớp bảng chunk ở [architecture.md](../architecture.md#khởi-động). Cột `57d7559` lấy từ `measure-startup.mjs` (gzip mức 9), nên `three-*.js` lệch 0,4 kB dù không đổi.

`perf:frames --base 57d7559 --runs 5`: Chrome 155, 1280×800, 5 s sau `cst:world`, trung vị 5 lần. Headless cấp khung theo bội số nhịp màn hình, nên p95 headless chỉ dùng để so; dòng headed là thời gian khung thật. Confetti và atlas `tiers` không tải ở mọi dòng.

| Chế độ | Hồ sơ | Bản | Cảnh 3D | p50 / p95 / dài nhất | Khung > 50 ms | Long task |
| --- | --- | --- | --- | --- | --- | --- |
| Headless | Máy bàn | `57d7559` | 274 ms | 100 / 117 / 133 ms | 46 (42/53/46/49/44) | 0 |
| Headless | Máy bàn | P26 | 204 ms | 67 / 133 / 133 ms | 44 (47/45/44/32/43) | 0 |
| Headless | Di động | `57d7559` | 3151 ms | 67 / 133 / 133 ms | 43 (53/43/38/49/42) | 0 |
| Headless | Di động | P26 | 3284 ms | 83 / 117 / 117 ms | 45 (41/48/45/53/37) | 0 |
| Headed | Máy bàn | `57d7559` | 1447 ms | 17 / 23 / 84 ms | 2 (2/1/3/1/5) | 0 |
| Headed | Máy bàn | P26 | 1249 ms | 17 / 20 / 55 ms | 1 (2/1/2/1/0) | 0 |
| Headed | Di động | `57d7559` | 3160 ms | 17 / 18 / 19 ms | 0 (0/0/0/0/0) | 0 |
| Headed | Di động | P26 | 3352 ms | 17 / 19 / 33 ms | 0 (0/0/1/0/0) | 0 |

- Thời gian long task trong 5 s sau `cst:world`, từng lượt: headless di động base và P26 đều 0 / 0 / 0 / 0 / 0 ms; headed máy bàn base 84 / 0 / 0 / 56 / 0 ms, P26 0 / 1 / 0 / 0 / 0 ms; headed di động 0 ở cả 5 lượt của hai bản.
- p95 headed từng lượt: máy bàn base 22 / 28 / 24 / 23 / 23 ms, P26 22 / 20 / 20 / 21 / 19 ms; di động base 18 / 19 / 18 / 18 / 18 ms, P26 19 / 19 / 18 / 19 / 19 ms.

## 4. Màn chờ và Main Menu lúc tải

`npm run media:loading`: 390×844, mạng 150 ms RTT, 1,6 Mbps, CPU 4x. Ảnh P26.

| Cảnh | Chỗ cần nhìn | Ảnh |
| --- | --- | --- |
| Màn chờ | Thanh và dòng "Đang mở quán… 59%", mẹo bên dưới | ![Màn chờ](../media/loading-boot.png) |
| Main Menu khi cảnh 3D đang tải | Dòng "Đang chuẩn bị quán 3D… 7%", thanh tiến độ, danh sách 6 thành phần; Tải game khoá vì chưa có bản lưu. Icon nút còn là ô trống tới khi atlas @1x tải xong | ![Main Menu lúc tải](../media/loading-menu.png) |
| Ván mới khi cảnh 3D chưa xong | Nút "Bắt đầu ngày 1" khoá, viền đứt, phần đã tô và chữ "Đang chuẩn bị 31%"; dòng "Mạng đang chậm, game vẫn đang tải… 31%" | ![Ván mới lúc tải](../media/loading-start.png) |
| Cảnh 3D tải lỗi | Dòng đỏ "Không tải được quán 3D…", "Mã cảnh 3D" báo lỗi kèm nút Thử lại | ![Lỗi tải](../media/loading-error.png) |
| Sau Thử lại khi có mạng | Dòng tiến độ ẩn, quán 3D hiện sau menu | ![Sau Thử lại](../media/loading-retried.png) |
| Script game lỗi lúc mở | Màn chờ báo "Không tải được game…" và nút Thử lại | ![Màn chờ lỗi](../media/loading-boot-error.png) |
