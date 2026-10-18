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
- Font Nunito ở màn chờ và định dạng save giữ nguyên.

## 2. Kết quả kiểm

| Kiểm | Ngưỡng | Kết quả |
| --- | --- | --- |
| `npm run check` | tsc, test, build xanh | PASS: 93 file, 1312 test |
| Main Menu, Phone 390×844 | < 1000 ms | PASS: 896 ms (base 1324 ms) |
| Main Menu, Mobile | Không chậm hơn base | PASS: 862 ms (base 1262 ms) |
| Cảnh 3D so với `57d7559` | ≤ base + 10% | PASS: Phone 3644 / 3521 ms (+3,5%), Mobile 3532 / 3408 ms (+3,6%), Desktop 534 / 554 ms (−3,6%) |
| JS chính gzip | Tăng ≤ 2 kB | PASS: 75,8 → 14,7 kB (−61,1 kB) |
| `perf:frames` | 0 long task | Chờ số đo |
| p95 máy bàn (`--headed`) | ≤ 16,7 ms | Chờ số đo |
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
