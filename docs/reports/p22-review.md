# P22 — Review giao diện, bố cục, nhân vật, nghiệp vụ và hiệu năng

Danh sách vấn đề tìm được khi chơi tuần 7 ngày ở khổ điện thoại và desktop, so với v0.4.0 `f720b6f`: bằng chứng, điểm tác động × công sức, phần đã sửa kèm ảnh trước/sau, số đo hiệu năng và phần để đợt sau.

- [1. Cách review](#1-cách-review)
- [2. Mọi vấn đề](#2-mọi-vấn-đề)
- [3. Đã sửa](#3-đã-sửa)
- [4. Hiệu năng](#4-hiệu-năng)
- [5. Để đợt sau](#5-để-đợt-sau)
- [6. Kiểm tra](#6-kiểm-tra)

## 1. Cách review

| Phần | Lệnh | Khổ màn | Seed, độ khó | Mốc |
| --- | --- | --- | --- | --- |
| Chơi tuần, chụp, đo từng màn | `npm run review:p22` ([media.md](../media.md#review-tuần-p22)) | 390×844 (điện thoại, tỉ lệ 3, cảm ứng), 1440×900 | `3758375936`, Vừa | Mã game của `f3e8b3a` trùng `f720b6f` (chỉ thêm script) |
| Mô phỏng kinh tế | `npx vitest run tests/integration/p22-strategies.test.ts` ([p22-economy.md](p22-economy.md)) | | `1, 42, 777, 2024, 31337, 9001`; Dễ, Vừa, Khó; 5 chiến lược | `f720b6f` |
| Bảng trước/sau | `npm run media:p22` ([media.md](../media.md#ảnh-trướcsau-p22)) | 390×844 (menu, Kho), 1280×800 (cận cảnh) | `3758375936`, Vừa, sáng ngày 2 | `f720b6f` |
| Khởi động và FPS | `node scripts/measure-startup.mjs --base f720b6f --runs 9`, rồi `--runs 5 --fps-only` ([perf.txt](p22-review/perf.txt)) | Máy bàn; di động 150 ms RTT, 1,6 Mbps, CPU 4x; FPS 1280×800 @2x | Ngày 1 Dễ, 4x | `f720b6f` |

Các bước `review:p22`:

1. Ngày 1 chơi qua UI ở 4x: Main Menu, mọi bảng dock, cao điểm 11:00, hàng chờ 11:45, Daily Report.
2. Ngày 2–7 nạp ván sáng do sim dựng (nhập theo gợi ý, tự phục vụ), chụp HUD và bảng Việc, nhập hàng, thuê 2 nhân viên, chụp cao điểm.
3. Ngày 7 chụp thêm báo cáo và màn kết tuần. Tuần review: doanh thu 20.890k / mục tiêu 26.500k, 4,1 / 4,0 sao, 87 điểm, 2 cúp.
4. Ảnh nằm ở `p22-review/390/` và `p22-review/1440/`; số đo ở [metrics.json](p22-review/metrics.json), vấn đề tự rút ở [findings.json](p22-review/findings.json).

Điểm = impact / effort (mỗi thang 1–3). Mục "cao" khi điểm ≥ 1,5; đợt này chỉ sửa mục cao có công sức 1 và không đổi `WEEK_GOALS`, `DAY_EVENTS`, giá món, lương.

## 2. Mọi vấn đề

Xếp theo điểm, rồi theo impact.

| Id | Mảng | Mô tả | Bằng chứng | Impact | Effort | Điểm | Quyết định |
| --- | --- | --- | --- | --- | --- | --- | --- |
| layout-blocked-suggest-390 | Bố cục | Chân bảng Kho dính (~190 px) che nút Gợi ý nhập và đầu danh sách ở 390 | [d2](p22-review/390/d2-blocked-suggest.jpg), [d5](p22-review/390/d5-blocked-suggest.jpg), [d7](p22-review/390/d7-blocked-suggest.jpg); `blocked.390/d2-suggest` | 3 | 1 | 3 | Đã sửa |
| actors-persona-motion | Nhân vật | Các cá tính chỉ khác một phụ kiện, đi và đứng chờ như nhau | [390 d4](p22-review/390/d4-peak.jpg), [1440 d4](p22-review/1440/d4-peak.png) | 3 | 1 | 3 | Đã sửa |
| E2 | Nghiệp vụ | Khó đạt 3 cúp dễ như Thường | Khó b: 3 cúp 6/6 seed; mục tiêu Khó 23.000k < Thường 26.500k ([E2](p22-economy.md#vấn-đề)) | 3 | 1 | 3 | Để đợt sau: đổi `WEEK_GOALS`, phá cân bằng P21 |
| E6 | Nghiệp vụ | Giá Cao luôn thắng giá Chuẩn | d − c: lãi +2.143k đến +3.075k, 18/18 ván; cúp vẫn 3 ([E6](p22-economy.md#vấn-đề)) | 3 | 1 | 3 | Để đợt sau: cần đổi chấm điểm tuần |
| ui-icons-blank-390 | Giao diện | 5/5 ô icon trống lúc Main Menu hiện (atlas@2x chưa tải) | [d0-menu-first](p22-review/390/d0-menu-first.png); `menu.390.icons` | 2 | 1 | 2 | Đã sửa |
| ui-icons-blank-1440 | Giao diện | 5/5 ô icon trống lúc Main Menu hiện (atlas@1x chưa tải) | [d0-menu-first](p22-review/1440/d0-menu-first.png); `menu.1440.icons` | 2 | 1 | 2 | Đã sửa |
| actors-persona-accessory | Nhân vật | Khách quen và gia đình không có phụ kiện, trông như nhau | [390 d4](p22-review/390/d4-peak.jpg), [1440 d4](p22-review/1440/d4-peak.png) | 2 | 1 | 2 | Đã sửa |
| actors-impatient-silhouette | Nhân vật | Dáng sốt ruột (gõ chân nhẹ) khó thấy từ camera chéo | [390 d4](p22-review/390/d4-peak.jpg) | 2 | 1 | 2 | Đã sửa |
| E5 | Nghiệp vụ | Máy rửa ly mở ngày 7, máy làm đá ngày 6: mua là lỗ | Lỗ 36/36 ván, có bật món hay không ([E5](p22-economy.md#vấn-đề)) | 2 | 1 | 2 | Đã sửa |
| E1 | Nghiệp vụ | Điểm tuần chạm trần: mọi chiến lược có thuê người đều 3 cúp | Điểm 95–100 ở 72/72 ván ([E1](p22-economy.md#vấn-đề)) | 3 | 2 | 1,5 | Để đợt sau: cần đổi `scoreWeek` |
| E4 | Nghiệp vụ | Dụng cụ không hoàn vốn trong tuần, càng khó càng lỗ | Hoàn vốn 47% / 36% / 19% ([E4](p22-economy.md#vấn-đề)) | 3 | 2 | 1,5 | Để đợt sau: E5 nâng lên 69% / 51% / 27% |
| perf-startup-mobile | Hiệu năng | Main Menu và cảnh 3D trên di động chậm hơn v0.4.0 | Lượt đầu, trung vị 5 lần: Main Menu 1008 / 890 ms, cảnh 3D 3050 / 2773 ms ([perf.txt](p22-review/perf.txt)) | 2 | 2 | 1 | Đã sửa |
| perf-fps-1440 | Hiệu năng | FPS cao điểm 3 (< 55) ở 7/7 ngày | `peaks.1440/d1.fps`–`d7.fps` (SwiftShader) | 3 | 3 | 1 | Để đợt sau |
| perf-fps-390 | Hiệu năng | FPS cao điểm 2,4 (< 55) ở 7/7 ngày | `peaks.390/d1.fps`–`d7.fps` (SwiftShader) | 3 | 3 | 1 | Để đợt sau |
| E7 | Nghiệp vụ | Marketing rẻ nhất gần như luôn lỗ: khách thêm bỏ về | e − c: lãi −217k đến −483k, thắng 3/18 ([E7](p22-economy.md#vấn-đề)) | 2 | 2 | 1 | Để đợt sau |
| E8 | Nghiệp vụ | Không có áp lực tiền: cuối tuần dư gấp 6–11 lần vốn đầu | Tiền thấp nhất toàn bộ 184k, không âm ở 90/90 ván ([E8](p22-economy.md#vấn-đề)) | 2 | 2 | 1 | Để đợt sau |
| E9 | Nghiệp vụ | Điểm tuần không tính lãi, chi tiền không bị phạt | c lãi thấp hơn b 1.917k–3.719k, điểm c ≥ b ([E9](p22-economy.md#vấn-đề)) | 2 | 2 | 1 | Để đợt sau |
| E3 | Nghiệp vụ | Thuê 1 pha chế luôn lãi hơn tự làm | b − a: 18/18 ván thắng ([E3](p22-economy.md#vấn-đề)) | 2 | 2 | 1 | Không sửa: lựa chọn luôn lãi, không phải lỗi |
| E10 | Nghiệp vụ | Ngày nhàm (không mở khóa, không sự kiện) | 0 ở 90/90 ván ([E10](p22-economy.md#vấn-đề)) | 1 | 1 | 1 | Không sửa: không có ngày nhàm |
| actors-stuck-walking | Nhân vật | Người bước tại chỗ > 5 s | `stuckWalking` = 0 ở 14/14 lần đo cao điểm | | | | Không sửa: không có lỗi |
| actors-queue-overlap | Nhân vật | Khách chồng lên nhau trong hàng | Ảnh cao điểm không có ai lồng vào nhau; `separate()` trong `sync.ts` đã đẩy ra | | | | Không sửa: không có bằng chứng |
| actors-wait-expression | Nhân vật | Mặt khách chờ lâu | Thanh kiên nhẫn và mặt trên đầu (`labels.ts`) đã có | | | | Không sửa: phần dáng người nằm ở actors-impatient-silhouette |

Nguồn: mục `layout-*`, `ui-*`, `perf-fps-*` từ [findings.json](p22-review/findings.json); `actors-*` từ [fixed-actors.json](p22-review/fixed-actors.json); `E1`–`E10` từ [p22-economy.md](p22-economy.md#vấn-đề); `perf-startup-mobile` từ [perf.txt](p22-review/perf.txt).

## 3. Đã sửa

v0.4.0 khoanh nét đứt cam, P22 nét liền xanh.

| Id | Đã sửa gì | Test |
| --- | --- | --- |
| ui-icons-blank-390, ui-icons-blank-1440 | Ô icon hiện ô chờ tới khi atlas @1x tải xong; atlas @2x chỉ tải sau khi cảnh 3D hiện (`cst:world`). Bảng: 0/5 ô trống (v0.4.0 5/5). | `tests/ui/icons-loading.test.ts`, `tests/ui/icons.test.ts`, `tests/ui/styles.test.ts` |
| layout-blocked-suggest-390 | Thân bảng thấp dưới 30rem thì chân gọn (hai tổng chung một hàng, nút Nhập hàng 44 px); vùng nội dung thân dưới 12rem thì chân cuộn sau danh sách; desktop, tablet giữ chân đầy đủ. Bảng: nút Gợi ý chạm được, 1/12 dòng chạm được khi cuộn (v0.4.0 0/12). | `tests/ui/layout-overflow.test.ts`, `tests/ui/p22-review-fixes.test.ts` |
| actors-persona-motion | Mỗi cá tính có dáng đi và thói quen lúc chờ riêng (văn phòng xem điện thoại, sinh viên tay đút túi, sành cà phê chắp tay sau lưng, gia đình nhìn quanh); tốc độ và đường đi không đổi. | `tests/render/actors.test.ts` |
| actors-persona-accessory | Khách quen đội mũ len tím, gia đình xách túi vải vàng; dùng chung ô mesh phụ kiện, không đổ bóng. | `tests/render/actors.test.ts` |
| actors-impatient-silhouette | Khách sốt ruột khoanh tay, gõ chân 0,5 rad (trước 0,35), mỗi vòng gỡ tay xem đồng hồ. | `tests/render/actors.test.ts` |
| E5 | Máy làm đá mở ngày 2, giá gốc 80k (trước ngày 6, 200k); máy rửa ly mở ngày 4, giá gốc 400k (trước ngày 7, 800k). Hoàn vốn dụng cụ trong tuần 47/36/19% → 69/51/27%. | `tests/sim/week-tool-payback.test.ts`, `tests/sim/week-unlocks.test.ts` |
| perf-startup-mobile | Nguyên nhân: `watchIconAtlas()` chạy ngay đầu `start()`, nên `atlas@1x.webp` (116 kB) dùng chung đường 1,6 Mbps với `three-*.js` (126 kB gzip) và chunk cảnh. Giờ `main.ts` chỉ xin chunk cảnh sau khi menu đã vẽ, và chỉ tải atlas @1x (`fetchPriority = 'low'`) khi chunk cảnh đã tải xong hoặc lỗi. Phụ kiện nhân vật không phải nguyên nhân: dùng chung material, không thêm shader. | `tests/ui/icons-loading.test.ts` |
| Chân bảng Kho 390 (làm lại) | Thêm mức chân gọn: thân dưới 30rem thì chân vẫn dính đáy, chỉ cuộn khi vùng nội dung thân dưới 12rem (192 px). Đo bằng `media:p22` ở 390×844, ván ngày 2: thân 207 px nhưng vùng nội dung (trừ padding `--space-4`) 191 px, dưới 192 px, nên chân vẫn cuộn sau danh sách và nút Nhập hàng không thấy khi mở Kho. Chưa đạt ở khổ này. | `tests/ui/layout-overflow.test.ts`, `tests/ui/p22-review-fixes.test.ts` (so 12rem với 207 px gồm cả padding) |
| Ô chờ icon theo token | Ô chờ lấy nền `--surface-sunken`, viền trong `--size-icon-stroke` màu `--border-outline`, bo `--radius-sm`; không còn mã màu hay px viết tay. | `tests/ui/styles.test.ts` |
| Bảng kinh tế | [p22-economy.md](p22-economy.md) ghi rõ bảng nào là số trước khi sửa E5, bảng nào sau. | |
| Lệnh `layout` | Sửa khoảng trắng thiếu ở mục `layout` của `package.json`. | |
| Chụp Cài đặt | `media:p20`, `media:p21` chụp cả form Cài đặt thay vì phần nằm trong cửa sổ. | |

Bảng trước/sau:

- Ô icon Main Menu 390: ![Main Menu icon v0.4.0 và P22](../media/main-menu-icons-p22.png)
- Main Menu 390 trên mạng di động, lúc icon hiện: ![Main Menu 390 di động, thời điểm tải atlas](../media/main-menu-atlas-390-p22.png)
- Nút Gợi ý và danh sách Kho 390: ![Bảng Kho 390 v0.4.0 và P22](../media/layout-blocked-suggest-390-p22.png)
- Chân bảng Kho 390: ![Chân bảng Kho 390 v0.4.0 và P22](../media/kho-foot-390-p22.png)
- Dáng chờ theo cá tính: ![Dáng chờ văn phòng và sinh viên](../media/actors-persona-motion-p22.png)
- Phụ kiện khách quen và gia đình: ![Phụ kiện khách quen và gia đình](../media/actors-persona-accessory-p22.png)
- Dáng sốt ruột: ![Khách sốt ruột v0.4.0 và P22](../media/actors-impatient-silhouette-p22.png)
- Cài đặt cả form (P21): ![Cài đặt, Số liệu chơi](../media/settings-playlog-p21.png)

E5 không có ảnh; số trước/sau ở [p22-economy.md](p22-economy.md#đã-sửa).

## 4. Hiệu năng

Chrome headless, Apple M2 (ANGLE Metal), `vite preview`, không cache. Số đầy đủ ở [perf.txt](p22-review/perf.txt).

Khởi động, trung vị 9 lần, lượt `--runs 9` cuối (sau khi sửa perf-startup-mobile):

| Số đo | Cấu hình | v0.4.0 `f720b6f` | P22 | Ngưỡng | Đạt |
| --- | --- | --- | --- | --- | --- |
| Main Menu hiện | Di động: 150 ms RTT, 1,6 Mbps, CPU 4x | 1131 ms | 1185 ms | < 1000 ms | Không |
| Cảnh 3D hiện | Di động: 150 ms RTT, 1,6 Mbps, CPU 4x | 3177 ms | 2670 ms | ≤ 2829 ms | Có |
| Nội dung đầu tiên | Di động | 428 ms | 400 ms | | |
| Main Menu hiện | Máy bàn, không giới hạn | 146 ms | 122 ms | | |
| Cảnh 3D hiện | Máy bàn, không giới hạn | 298 ms | 365 ms | | |

Chênh lệch P22 trừ v0.4.0 trên di động, cùng lượt đo:

| Mã | Lệnh | Main Menu | Cảnh 3D |
| --- | --- | --- | --- |
| Trước khi sửa | `--runs 5` | +118 ms | +277 ms |
| Trước khi sửa (`f289da8`, cùng mã game) | `--runs 9` | +17 ms | +53 ms |
| Atlas @1x sau chunk cảnh | `--runs 9`, hai lượt | +85 ms, +84 ms | −486 ms, −512 ms |
| Thêm: xin chunk cảnh sau khi menu vẽ | `--runs 9` | +54 ms | −507 ms |

- Cảnh 3D: nhanh hơn v0.4.0 khoảng 500 ms ở ba lượt riêng, đạt ngưỡng 2829 ms.
- Main Menu: chậm hơn v0.4.0 54 ms, nằm trong khoảng dao động +17 đến +118 ms của cùng một mã game. Ngưỡng 1000 ms không đạt: chính v0.4.0 đo 1083–1163 ms trên máy này.

Icon Main Menu trên di động (`npm run media:p22`, 390×844, tỉ lệ điểm ảnh 1, một lần tải mỗi bản, ms tính từ lúc điều hướng):

| Mốc | v0.4.0 `f720b6f` | P22 |
| --- | --- | --- |
| Main Menu hiện | 1108 | 1196 |
| `three-*.js` tải xong | 2820 | 2215 |
| Xin atlas @1x | 1096 | 2229 |
| Atlas @1x tải xong | 2779 | 3413 |
| Cảnh 3D hiện | 3049 | 2436 |
| Xin atlas @2x | 3039 | 2425 |
| Mọi ô vẽ icon | 2808 | 5736 |

- P22 giữ ô chờ khoảng 4,5 s sau khi menu hiện, lâu hơn v0.4.0 (ô trống khoảng 1,7 s). Atlas @1x về lúc 3413 ms nhưng ô chỉ vẽ icon lúc 5736 ms, khi cảnh 3D đang chạy và atlas @2x đang tải.

FPS cao điểm ngày 1 (Dễ, 4x), 1280×800 @2x, 10 s mỗi lần, hai bản xen kẽ. Chỉ kết luận từ lượt đo đủ 5 lần:

| Mức đồ họa | Lượt đo | v0.4.0 `f720b6f` | P22 | Ngưỡng | Đạt |
| --- | --- | --- | --- | --- | --- |
| Vừa | `--runs 5 --fps-only`, bản đã sửa, trung vị 5 lần | 12,9 (12,0–13,5) | 13,1 (12,1–13,7) | 60 | Không |
| Cao | Chưa có lượt đủ 5 lần (lệnh hết giờ ở lần 2) | | | 60 | Chưa đo |
| Vừa, SwiftShader, hai khổ cùng lúc | `review:p22`, thấp nhất 7 ngày | 2,4 (390), 3 (1440) | | 60 | Không |

- Mức Vừa: P22 hơn v0.4.0 1,6%, nhỏ hơn độ dao động giữa các lần của mỗi bản (khoảng 1,5 FPS, 12%). Không có dấu hiệu tụt.
- Cùng một bản, trung vị đổi theo phiên đo: v0.4.0 mức Vừa đo 24,0 FPS ở lượt đầu và 12,9 FPS ở lượt sau. Chỉ so hai bản trong cùng một lượt.
- Các lượt `--runs 3` không dùng để kết luận: ba lần đo v0.4.0 mức Vừa trải từ 16,0 tới 23,7 FPS.

## 5. Để đợt sau

| Thứ tự | Id | Điểm | Việc cần làm |
| --- | --- | --- | --- |
| 1 | E2 | 3 | Mục tiêu và ngưỡng cúp riêng cho Khó (`WEEK_GOALS`). |
| 2 | E6 | 3 | Làm giá Cao có cái giá rõ hơn (sao, khách bỏ về) hoặc tính vào điểm tuần. |
| 3 | E1 | 1,5 | Giãn thang điểm tuần để chơi tốt và chơi tồi khác điểm (`scoreWeek`). |
| 4 | E4 | 1,5 | Tủ bánh, máy xay sinh tố: hoàn vốn trong tuần, hoặc gợi ý bật món đi kèm. |
| 5 | Chân bảng Kho 390 | | Hạ ngưỡng cuộn chân `@container panel-body (max-height: 12rem)` dưới vùng nội dung 191 px của Kho ở 390×844, để chân gọn vẫn dính khi mở Kho. |
| 6 | Icon Main Menu di động | | Rút thời gian ô chờ trên di động (icon vẽ lúc 5736 ms, v0.4.0 2808 ms): tìm vì sao ô vẽ icon sau atlas @1x hơn 2 s. |
| 7 | perf-fps-1440, perf-fps-390 | 1 | Giảm draw call giờ cao điểm để tiến tới 60 FPS; đo mức Cao đủ 5 lần. |
| 8 | E7 | 1 | Marketing: hiệu quả khi quán còn chỗ, hoặc báo quán đã đầy. |
| 9 | E8 | 1 | Áp lực tiền trong tuần (chi phí cố định, giá vốn). |
| 10 | E9 | 1 | Tính lãi vào điểm tuần. |

## 6. Kiểm tra

| Lệnh | Kiểm gì | Kết quả |
| --- | --- | --- |
| `npm run check` | `tsc --noEmit`, `vitest run`, `vite build` | Pass: 66 file test, 917 test; build xong |
| `npm run layout` | Tràn ngang ở 390×844, 768×1024, 1440×900; CLS = 0 ở bảng Kho khi đổi số gói ([media.md](../media.md#kiểm-lề-và-cls)) | Pass: 27/27 kiểm (24 màn × khổ không tràn ngang, không lệch khung; CLS bảng Kho 0,000000 ở cả 3 khổ, khung tổng và danh sách lệch 0,0 px) |
