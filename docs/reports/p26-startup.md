# P26 — Main Menu dưới 1 s trên điện thoại

Báo cáo P26 so với `57d7559`: thời gian tới Main Menu và cảnh 3D, kích thước chunk gzip, kết quả kiểm các ngưỡng. Kế hoạch: [startup-under-1s-plan.md](startup-under-1s-plan.md).

| Phần | Lệnh |
| --- | --- |
| Khởi động, bảng chunk | `PORT=<cổng> node scripts/measure-startup.mjs --base 57d7559 --runs 5` |
| Khung hình 5 s đầu, long task | `MEDIA_PORT=<cổng> npm run perf:frames -- --base 57d7559 --runs 3`, thêm `--headed` để lấy p95 thật |
| Lề, tràn ngang, vùng chạm | `LAYOUT_PORT=<cổng> npm run layout` |
| Màn chờ, dòng tiến độ, nút khoá, Thử lại | `MEDIA_PORT=<cổng> npm run media:loading` |
| Kiểm tra code | `npm run check` |

## 1. Tóm tắt

- Main Menu trên Phone 390×844 (150 ms RTT, 1,6 Mbps, CPU 4x): 896 ms, base 1324 ms (−428 ms, −32%).
- JS chính `index-*.js`: 75,8 → 14,7 kB gzip. Sim, HUD, panel, báo cáo, save, audio nằm ở chunk `game-*.js` (40,9 kB) và `iconMap-*.js` (23,9 kB), tải bằng `import()` sau khung hình đầu của menu.
- Cảnh 3D chậm hơn base 3,5% trên Phone 390×844 và 3,6% trên Mobile, trong ngưỡng 10%.
- Khung hình máy bàn headed: p95 28 ms (base 46 ms), chưa đạt 16,7 ms. Còn long task sau `cst:world` ở di động headless và ở headed, base cũng có ([mục 3](#3-số-đo)).
- Font Nunito ở màn chờ và định dạng save giữ nguyên.

## 2. Kết quả kiểm

| Kiểm | Ngưỡng | Kết quả |
| --- | --- | --- |
| `npm run check` | tsc, test, build xanh | PASS: 93 file, 1312 test |
| Main Menu, Phone 390×844 | < 1000 ms | PASS: 896 ms (base 1324 ms) |
| Main Menu, Mobile | Không chậm hơn base | PASS: 862 ms (base 1262 ms) |
| Cảnh 3D so với `57d7559` | ≤ base + 10% | PASS: Phone 3644 / 3521 ms (+3,5%), Mobile 3532 / 3408 ms (+3,6%), Desktop 534 / 554 ms (−3,6%) |
| JS chính gzip | Tăng ≤ 2 kB | PASS: 75,8 → 14,7 kB (−61,1 kB) |
| `perf:frames`, máy bàn headless | 0 long task | PASS: 0 ở cả 3 lượt (base 0) |
| `perf:frames`, di động headless | 0 long task | FAIL: trung vị 2 long task, 128 ms (lượt 0 / 128 / 240 ms); base cùng lượt trung vị 1 long task, 0 ms (lượt 0 / 0 / 628 ms) |
| p95 máy bàn (`--headed`) | ≤ 16,7 ms | FAIL: 28 ms; base cùng lượt 46 ms. Nợ từ P25 (P25 đo 18 ms) |
| Long task máy bàn (`--headed`) | 0 long task | FAIL: trung vị 2 long task, 125 ms; base 7 long task, 473 ms |
| `npm run layout` | PASS | Chờ số đo |
| `npm run media:loading` | Màn chờ có %, dòng tiến độ, nút khoá "Đang chuẩn bị n%", Thử lại khi lỗi | Chờ số đo |

## 3. Số đo

`measure-startup.mjs --base 57d7559 --runs 5`: Chrome headless, ANGLE Metal (Apple M2), trung vị 5 lần.

| Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu | Cảnh 3D |
| --- | --- | --- | --- | --- |
| Máy bàn | `57d7559` | 100 ms | 146 ms | 554 ms |
| Máy bàn | P26 | 72 ms | 80 ms | 534 ms |
| Di động, CPU 4x | `57d7559` | 388 ms | 1262 ms | 3408 ms |
| Di động, CPU 4x | P26 | 372 ms | 862 ms | 3532 ms |
| Phone 390×844 @3x, CPU 4x | `57d7559` | 432 ms | 1324 ms | 3521 ms |
| Phone 390×844 @3x, CPU 4x | P26 | 448 ms | 896 ms | 3644 ms |

Di động và Phone dùng mạng 150 ms RTT, 1,6 Mbps.

| Chunk | `57d7559` gzip | P26 gzip | Tải lúc |
| --- | --- | --- | --- |
| JS chính `index-*.js` | 75,8 kB | 14,7 kB | Trước Main Menu |
| CSS `index-*.css` | 13,6 kB | 9,5 kB | Trước Main Menu |
| `game-*.js` | – | 40,9 kB | Sau khung hình đầu của menu |
| `game-*.css` | – | 5,2 kB | Cùng `game-*.js` |
| `iconMap-*.js` | – | 23,9 kB | Cùng `game-*.js` |
| `src/render` `index-*.js` | 36,3 kB | 36,4 kB | Sau khung hình đầu của menu |
| `three-*.js` | 126,1 kB | 126,1 kB | Cùng `src/render` |
| `confetti-*.js` | 1,2 kB | 1,2 kB | Khi báo cáo có lên cấp |

`perf:frames --base 57d7559 --runs 3`: Chrome 155, 1280×800, 5 s sau `cst:world`, trung vị 3 lần. Headless cấp khung theo bội số nhịp màn hình, nên p95 headless chỉ dùng để so; dòng headed là thời gian khung thật. Confetti và atlas `tiers` không tải ở mọi dòng.

| Chế độ | Hồ sơ | Bản | Cảnh 3D | p50 / p95 / dài nhất | Khung > 50 ms | Long task |
| --- | --- | --- | --- | --- | --- | --- |
| Headless | Máy bàn | `57d7559` | 247 ms | 83 / 133 / 133 ms | 46 (40/49/46) | 0 |
| Headless | Máy bàn | P26 | 227 ms | 83 / 133 / 133 ms | 43 (43/43/42) | 0 |
| Headless | Di động | `57d7559` | 3482 ms | 83 / 133 / 150 ms | 44 (54/44/37) | 1, 0 ms |
| Headless | Di động | P26 | 3570 ms | 83 / 150 / 150 ms | 43 (43/43/38) | 2, 128 ms |
| Headed | Máy bàn | `57d7559` | 2687 ms | 17 / 46 / 187 ms | 11 (11/19/7) | 7, 473 ms |
| Headed | Máy bàn | P26 | 1074 ms | 17 / 28 / 79 ms | 4 (2/6/4) | 2, 125 ms |
| Headed | Di động | `57d7559` | 5408 ms | 20 / 66 / 136 ms | 19 (19/18/39) | 14, 848 ms |
| Headed | Di động | P26 | 4462 ms | 18 / 66 / 131 ms | 25 (25/26/1) | 16, 1125 ms |

- Số đo headed dao động mạnh giữa các lượt: p95 base máy bàn 46 / 184 / 37 ms, P26 di động 66 / 83 / 18 ms.
- Long task sau `cst:world` có ở cả base và P26 trong cùng lượt đo. P26 không sửa `src/render`, nơi chứa warm-up `world.prepare()`.
