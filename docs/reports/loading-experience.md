# Màn tải: tiến độ thật, mạng chậm và thử lại

Báo cáo này cho biết file nào nặng nhất khi mở game, và so thời gian khởi động trước (`d35f4d9`, P21) với sau khi có màn tải mới. Cách màn tải hoạt động: [architecture.md → Khởi động](../architecture.md#khởi-động).

## File tải khi mở game

Bản build hiện tại, xếp theo dung lượng:

| File | Raw | Gzip | Cần cho | Tải khi |
| --- | --- | --- | --- | --- |
| `three-*.js` | 502,0 kB | 125,7 kB | Cảnh 3D | Sau khi Main Menu chạy, tải nền |
| `icons3d/atlas@2x.webp` (màn 2x) / `atlas@1x.webp` | 288,7 kB / 116,1 kB | (đã nén) | Icon trên menu và HUD | Khi icon đầu tiên hiện |
| `index-*.js` (chunk chính) | 194,0 kB | 66,8 kB | Main Menu | Ngay khi mở trang |
| `index-*.js` (`src/render`) | 85,5 kB | 31,8 kB | Cảnh 3D | Sau khi Main Menu chạy, tải nền |
| `index-*.css` | 67,9 kB | 10,9 kB | Main Menu | Ngay khi mở trang, sau màn chờ |
| `nunito-*.woff2` (4 file) | 6,0–16,3 kB mỗi file | (đã nén) | Chữ | Khi trang dùng tới chữ, không chặn |

Game không có model, texture hay file âm thanh: quán, nhân vật và phố dựng bằng code, âm thanh tổng hợp bằng Web Audio. Khi đang chơi không tải thêm file nào.

## Thời gian khởi động

`node scripts/measure-startup.mjs --base d35f4d9 --runs 5`: Chrome headless không cache, Apple M2 (ANGLE Metal), trung vị 5 lần.

| Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu hiện | Cảnh 3D hiện |
| --- | --- | --- | --- | --- |
| Máy bàn, không giới hạn | `d35f4d9` | 92 ms | 197 ms | 348 ms |
| Máy bàn, không giới hạn | Màn tải mới | 68 ms | 154 ms | 283 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | `d35f4d9` | 560 ms | 932 ms | 3041 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | Màn tải mới | 300 ms | 872 ms | 2829 ms |

- Màn chờ hiện sớm hơn 260 ms trên di động: stylesheet nằm dưới `#boot`, nên màn chờ không đợi CSS.
- Chunk chính tăng 4,7 kB (1,8 kB gzip) cho phần tiến độ và khoá nút; Main Menu và cảnh 3D vẫn nhanh hơn bản gốc trong cùng lượt đo.
- Số đo đổi giữa các lượt đo; chỉ so hai bản trong cùng một lượt.

## Ảnh màn tải

Chụp bằng `npm run media:loading`: điện thoại 390×844, mạng Slow 4G giả lập (150 ms RTT, 1,6 Mbps), CPU chậm 4 lần, không cache. Chunk chính bị giữ 3 s và `three-*.js` bị giữ 11 s để kịp chụp từng trạng thái; lỗi giả bằng cách chặn file ([media.md → Ảnh màn tải](../media.md#ảnh-màn-tải)).

| | |
| --- | --- |
| ![Màn chờ 26%](../media/loading-boot.png)<br>**1. Màn chờ.** CSS đã tải xong, chunk chính đang tải: thanh và chữ 26% tính theo dung lượng file thật. Dưới thanh là một mẹo chơi. | ![Main Menu đang tải cảnh 3D](../media/loading-menu.png)<br>**2. Main Menu hiện trước, cảnh 3D tải nền.** Dòng "Đang chuẩn bị quán 3D…" kèm % và cùng mẹo với màn chờ. Các ô icon còn trống tới khi atlas icon tải xong. |
| ![Ván mới chờ cảnh 3D](../media/loading-start.png)<br>**3. Nút vào quán chờ cảnh 3D.** Sau 8 s dòng chữ đổi thành "Mạng đang chậm, game vẫn đang tải…". Nút **Bắt đầu ngày 1** bị khoá, nền tô tới 11% và ghi "Đang chuẩn bị 11%". | ![Lỗi tải cảnh 3D](../media/loading-error.png)<br>**4. Tải cảnh 3D lỗi.** Thông báo đỏ "Không tải được quán 3D. Kiểm tra mạng rồi bấm Thử lại." và nút **Thử lại**; menu vẫn dùng được. |
| ![Sau Thử lại](../media/loading-retried.png)<br>**5. Sau khi bấm Thử lại lúc mạng đã có lại.** Cảnh 3D hiện sau menu, dòng tải biến mất. | ![Lỗi ở màn chờ](../media/loading-boot-error.png)<br>**6. Chunk chính tải lỗi.** Màn chờ báo "Không tải được game. Kiểm tra mạng rồi bấm Thử lại." và nút **Thử lại** (tải lại trang); không còn màn trắng hay thanh chạy mãi. |
