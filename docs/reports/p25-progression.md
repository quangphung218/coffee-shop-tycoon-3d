# P25 — Menu gọn, cảm giác lên cấp và nâng cấp

Báo cáo P25 so với P24 `5d33195`: các ý đã làm và để sau, ảnh trước/sau có khoanh ở 390 và 1280 px, kết quả kiểm layout, khởi động và khung hình lúc có hiệu ứng.

| Phần | Lệnh |
| --- | --- |
| Ảnh trước/sau | `npm run media:p25` ([media.md](../media.md#ảnh-trướcsau-p25)) |
| Lề, tràn ngang, cao dòng Menu, thẻ lên cấp | `npm run layout` |
| Khởi động Main Menu | `node scripts/measure-startup.mjs --base 5d33195 --runs 5` |
| Khung hình 5 s đầu, khung hình quanh hiệu ứng | `npm run perf:frames`, `npm run perf:frames -- --fx` |
| Kiểm tra code | `npm run check` |

## 1. Tóm tắt

- Menu: mỗi món một dòng thấp (P24: 150 px, món thiếu hàng 236 px ở 390 px); công tắc nhỏ trên dòng, "Thiếu Cam" là nút mở Kho. Tên món và dòng giá xuống dòng thay vì bị cắt.
- Lên cấp: thẻ có huy hiệu cấp bật lên, chip icon các mục mở khoá và confetti 1,4 s không chặn bấm.
- Nâng cấp: máy pha, máy xay, tủ bánh, quầy, bàn ghế, cây, tranh, đèn đổi hình theo 3 bậc; vừa mua thì máy nảy và rắc sao; mỗi bậc có icon riêng và dòng "Bậc n/3".
- Kiểm: `npm run check`, `npm run layout` và `npm run media:p25` đạt; Main Menu di động 1230 ms so với base 1227 ms (+0,2%); JS chính +2,2 kB gzip, vượt ngưỡng 2 kB; `perf:frames` thường và `--fx` 0 long task, confetti chạy ở mọi lượt lên cấp ([mục 4](#4-kết-quả-kiểm)).

## 2. Ý đã làm và để sau

| Ý | Trạng thái | Ở đâu |
| --- | --- | --- |
| Thẻ lên cấp: huy hiệu bật lên, confetti, danh sách mở khoá có icon | Đã làm | `src/ui/report/report.ts`, `src/ui/fx/confetti.ts` (chunk riêng, tải khi cần) |
| Vật thể đổi hình theo bậc, lấp lánh và nảy lúc vừa mua | Đã làm | `src/render/scene/equipment.ts`, `shop.ts`, `upgradeFx.ts` |
| Icon riêng cho từng bậc, "Bậc n/3" và "mua để lên bậc n+1" | Đã làm | Atlas `public/icons3d/tiers*`, `src/ui/panels/upgrades.ts` |
| Tiếng lên cấp và tiếng nâng cấp tổng hợp Web Audio | Đã làm | `src/audio/index.ts` |
| Chấm "Mới" trên dock, nhãn "Mới" trên hàng vừa mở | Đã làm | `src/ui/core/fresh.ts`, `src/ui/hud/hud.ts` |
| Nợ P24: số mục tiêu tuần, cỡ số và chân màn Tổng kết tuần | Đã làm | `docs/spec/week-7-days.md`, [p24-ui.md](p24-ui.md), `src/ui/screens/weekEnd.ts` |
| Menu gọn: công tắc nhỏ trên dòng, dòng thấp hơn | Đã làm | `src/ui/panels/menu.ts`, `widgets.ts`, `panels.css` |
| Mặt tiền và biển hiệu đổi theo cấp quán | Để sau | Đổi cảnh lớn; đo P25 trước |
| Khách hiện biểu cảm "wow" cạnh đồ mới | Để sau | Đổi hành vi khách |
| Số tiền, KN đếm dần lên | Để sau | Trùng toast và báo cáo |
| Thành tích, cột mốc | Để sau | Đổi gameplay |
| Camera bay tới vật vừa nâng | Để sau | Đổi camera |
| So sánh quán theo tuần | Để sau | Trùng Tổng kết tuần |
| Prestige | Để sau | Đổi gameplay |

## 3. Ảnh trước/sau

Khung trái là P24 `5d33195` (nét đứt cam), các khung phải là P25 (nét liền xanh). Nhãn ghi chỗ đã sửa; số đọc từ trang lúc chụp. Mỗi bản dùng save do sim của chính nó chơi (ván Vừa, seed `1760400000000 >>> 0`); save bậc là ván mới ở cấp quán 10 mua tới bậc 1, 2, 3.

Icon bậc 2–3 của máy espresso và máy 2 group lấy màu thân của máy 3D cùng bậc: bậc 2 thân xanh bạc hà, nắp vàng; bậc 3 thân vàng, nắp nâu đậm. Bậc 1 giữ icon của atlas chính. Xem ảnh "Icon bậc cạnh máy 3D cùng bậc".

| Cảnh | 390×844 | 1280×800 |
| --- | --- | --- |
| Menu, bấm công tắc Nước cam khi thiếu Cam | ![Menu 390](p25-review/menu-390-p25.jpg) | ![Menu 1280](p25-review/menu-1280-p25.jpg) |
| Nâng cấp: icon bậc 1/2/3 | ![Nâng cấp 390](p25-review/upgrades-390-p25.jpg) | ![Nâng cấp 1280](p25-review/upgrades-1280-p25.jpg) |
| Icon bậc cạnh máy 3D cùng bậc | ![Icon và máy 390](p25-review/tier-pair-390-p25.jpg) | ![Icon và máy 1280](p25-review/tier-pair-1280-p25.jpg) |
| Máy espresso bậc 1/2/3 | ![Espresso 390](p25-review/scene-espresso-390-p25.jpg) | ![Espresso 1280](p25-review/scene-espresso-1280-p25.jpg) |
| Máy xay, tủ bánh bậc 1/2/3 | ![Máy xay 390](p25-review/scene-grinder-390-p25.jpg) | ![Máy xay 1280](p25-review/scene-grinder-1280-p25.jpg) |
| Bàn ghế bậc 1/2/3 | ![Bàn ghế 390](p25-review/scene-tables-390-p25.jpg) | ![Bàn ghế 1280](p25-review/scene-tables-1280-p25.jpg) |
| Cây, đèn bậc 1/2/3 | ![Cây đèn 390](p25-review/scene-decor-390-p25.jpg) | ![Cây đèn 1280](p25-review/scene-decor-1280-p25.jpg) |
| Hiệu ứng vừa mua, 0 / 0,2 / 0,5 s | ![Hiệu ứng 390](p25-review/fx-390-p25.jpg) | ![Hiệu ứng 1280](p25-review/fx-1280-p25.jpg) |
| Báo cáo có thẻ lên cấp: confetti đang bay, 2 s sau | ![Lên cấp 390](p25-review/levelup-390-p25.jpg) | ![Lên cấp 1280](p25-review/levelup-1280-p25.jpg) |
| Dock có chấm "Mới" | ![Dock 390](p25-review/dock-390-p25.jpg) | ![Dock 1280](p25-review/dock-1280-p25.jpg) |
| Tổng kết tuần 1 | ![Tuần 1 390](p25-review/week1-390-p25.jpg) | |

Hiệu ứng vừa mua, phần điểm ảnh trong khung máy khác khung lúc yên (1,5 s sau khi mua, kênh màu lệch > 24):

| Khổ | P24, 0,2 s | P25, 0 s | P25, 0,2 s | P25, 0,5 s |
| --- | --- | --- | --- | --- |
| 390 | 0,0% | 0,0% | 24,9% | 0,0% |
| 1280 | 0,0% | 0,0% | 7,7% | 0,0% |

Máy đã ở hình bậc 2 ngay khung đầu; nảy thấy rõ ở 0,2 s. Lúc 0,5 s chỉ còn vài sao nhỏ, dưới ngưỡng đo.

## 4. Kết quả kiểm

| Kiểm | Ngưỡng | Kết quả |
| --- | --- | --- |
| `npm run check` | tsc, test, build xanh | PASS: 90 file, 1280 test |
| `npm run layout` ở 390/768/1280/1440 | Không tràn ngang, CLS Kho = 0, mọi nút ≥ 44 px, tên món và dòng giá Menu không bị cắt (`scrollWidth ≤ clientWidth`, không "…"), báo cáo có thẻ lên cấp vừa 1280×720 | PASS: lệnh thoát mã 0 ở 390/768/1280/1440 |
| Cao một dòng Menu ở 390 px | ≤ 72 px khi không nhãn, ≤ 96 px khi có nhãn ("Thiếu …", "Mở …", "Mới"): đủ chỗ cho tên và "Giá … · lãi …%" xuống dòng mà vẫn đọc trọn | PASS: 56 px không nhãn, 89 px "Thiếu Cam" (P24: 150 / 236 px); 6/11 món thấy trọn (P24: 3) |
| Main Menu di động so với `5d33195` | ≤ base + 5% | PASS: 1230 ms so với 1227 ms (+0,2%) |
| JS chính gzip | Tăng ≤ 2 kB: `fresh.ts` và phần atlas bậc của `icons.ts` nằm trong chunk chính nhưng không tải file nào ở Main Menu | FAIL: 73,7 → 75,9 kB (+2,2 kB); 0,2 kB tăng sau lần đo khởi động đến từ `icons.ts` (đổi atlas `tiers` sang @2x khi bật HD), `menu.ts`, `widgets.ts`, `report.ts` |
| Confetti, atlas `tiers` ngoài đường tải Main Menu | Không tải trước và 5 s sau `cst:world` | PASS: không file nào ở cả hai hồ sơ (`perf:frames`, cột cuối) |
| `npm run perf:frames` | 0 long task | PASS: 0 ở máy bàn và di động |
| `npm run perf:frames -- --fx` | 0 long task; level-up tải chunk confetti và có `canvas.fx-confetti` trong DOM (thiếu thì lượt đó FAIL, lệnh thoát mã 1); tỉ lệ khung > 50 ms không hơn chế độ thường quá 10% | PASS: 0 long task ở mọi hiệu ứng và hồ sơ; 6/6 lượt level-up tải chunk confetti và có canvas; tỉ lệ khung > 50 ms 48–70% so với 63% chế độ thường |
| 60 FPS máy bàn khi có hiệu ứng (`--fx --headed`) | p95 ≤ 16,7 ms | Chưa đạt, cần đo trên máy thật: p95 18 ms, trên 16,7 ms; headless khoá nhịp khung nên chưa kết luận được 60 FPS |
| `npm run media:p25` | Không `!!`, nhãn chỉ đúng chỗ sửa; icon bậc đặt cạnh hình 3D cùng bậc | PASS: 21 bảng, thoát mã 0; `tier-pair` ghép icon và máy espresso cùng save ở mỗi bậc |

### Số đo

`measure-startup.mjs --base 5d33195 --runs 5`: Chrome 155 headless, ANGLE Metal (Apple M2), trung vị 5 lần.

| Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu | Cảnh 3D |
| --- | --- | --- | --- | --- |
| Máy bàn | `5d33195` | 96 ms | 68 ms | 302 ms |
| Máy bàn | P25 | 56 ms | 44 ms | 282 ms |
| Di động, CPU 4x | `5d33195` | 404 ms | 1227 ms | 3346 ms |
| Di động, CPU 4x | P25 | 524 ms | 1230 ms | 3403 ms |

| Chunk | `5d33195` gzip | P25 gzip |
| --- | --- | --- |
| JS chính `index-*.js` | 73,7 kB | 75,9 kB |
| CSS `index-*.css` | 13,0 kB | 13,7 kB |
| `src/render` `index-*.js` | 32,8 kB | 36,3 kB |
| `confetti-*.js` | – | 1,2 kB, chỉ khi báo cáo có lên cấp |

`perf:frames`, trung vị 3 lần, 1280×800. Headless cấp khung theo bội số nhịp màn hình, nên p95 133 ms và số khung > 50 ms chỉ dùng để so; dòng headed là thời gian khung thật.

| Chế độ | Hồ sơ | Cửa sổ | p50 / p95 / dài nhất | Khung > 50 ms | Long task |
| --- | --- | --- | --- | --- | --- |
| Thường, headless | Máy bàn | 5 s sau `cst:world` | 83 / 133 / 133 ms | 45/71 | 0 |
| Thường, headless | Di động | 5 s sau `cst:world` | 67 / 133 / 150 ms | 46/73 | 0 |
| `--fx` upgrade, headless | Máy bàn | 3 s quanh Mua | 50 / 133 / 133 ms | 22/46 | 0 |
| `--fx` level-up, headless | Máy bàn | 3 s từ Tiếp tục | 83 / 133 / 133 ms | 28/40 | 0 |
| `--fx` upgrade, headless | Di động | 3 s quanh Mua | 83 / 133 / 133 ms | 26/41 | 0 |
| `--fx` level-up, headless | Di động | 3 s từ Tiếp tục | 67 / 117 / 133 ms | 24/43 | 0 |
| Thường, headed | Máy bàn | 5 s sau `cst:world` | 17 / 18 / 19 ms | 0 | 0 |
| `--fx` upgrade, headed | Máy bàn | 3 s quanh Mua | 17 / 18 / 19 ms | 0 | 0 |
| `--fx` level-up, headed | Máy bàn | 3 s từ Tiếp tục | 17 / 18 / 33 ms | 0 | 0 |

- p95 máy bàn: 18 ms trong cửa sổ thật (headed), lúc thường cũng như lúc có hiệu ứng.
- Main Menu di động trên 1,1 s là nợ có từ trước: base `5d33195` đo cùng lượt cũng 1227 ms. Tối ưu Main Menu là một dự án riêng.
