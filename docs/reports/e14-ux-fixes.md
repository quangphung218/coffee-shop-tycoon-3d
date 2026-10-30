# E-14: sửa lỗi UX còn lại sau soát

E-14 sửa các mục UX còn lại sau đợt soát. **Không đổi kinh tế**: giá, lương, lãi, hạn mức nợ, mục tiêu tuần, công thức sim và `SAVE_VERSION` giữ nguyên. Chỉ đổi `src/ui/`, cảnh 3D (đèn chùm) và test; `src/sim/` không đổi (diff rỗng), nên số liệu `p22`/`p23` không đổi.

## Thay đổi

| Mã | Sửa | Vị trí |
| --- | --- | --- |
| UX-004 | Mọi nút "Mở cửa" đi qua một guard chung. Kho không làm được món nào hoặc chưa có nhân viên thì hiện một dòng xác nhận liệt kê từng cảnh báo, kèm liên kết "Mở Kho" / "Mở Nhân viên". Guard chỉ hỏi: "Vẫn mở cửa" luôn mở được quán, không bao giờ chặn. Không có cảnh báo thì gửi `start_day` ngay. | `src/ui/openGuard.ts`; dùng ở thanh HUD (`src/ui/hud/hud.ts`) và bảng Việc (`src/ui/panels/tasks.ts`) |
| UX-102 | Khi Báo cáo ngày đang mở, chồng toast tối đa 1 (đóng báo cáo thì về lại `MAX_TOASTS`). "Đã tự lưu ngày N" là một dòng ở chân báo cáo, không còn là toast. | `src/ui/core/toast.ts`, `src/ui/screens/game.ts`, `src/ui/report/` |
| UX-101 | Chọn: dòng cúp ghi điểm hiện có và ngưỡng kế tiếp, dạng "Hiện X điểm · cần 70 để 2 cúp" (cần 90 để 3 cúp; ở mức cao nhất là "Hiện X điểm · đủ 3 cúp"). Bỏ chữ "Đang hướng tới". Dòng có icon cúp. | `cupsLineText`, `weekGoalBlock` trong `src/ui/weekGoal.ts` |
| UX-103 | Footer tuần ở 480 px: "Sang tuần" chiếm trọn hàng đầu; "Về menu" và "Chơi lại" chia đôi hàng hai. | `src/ui/report/report.css` |
| UX-104 | Bảng Nâng cấp ẩn dòng "Giá bán +0%"; dòng Tem ghi nguồn: "Tem: N · nhận từ Quà hằng ngày". | `src/ui/panels/upgrades.ts` |
| UX-105 | Bảng Tiêu chí–Điểm ở màn cuối tuần rộng tối đa 360 px. | `src/ui/report/report.css` (`.rpt-margins.wk-points`) |
| UX-106 | Ở 390 px cúp luôn nằm cùng dòng với câu mục tiêu và tiêu đề cuối tuần; chữ co lại thay vì xuống dòng dưới cúp. | `src/ui/styles/ui.css` (`.wk-next`), `src/ui/report/report.css` |
| UX-107 | Dưới 1024 px, thẻ lẻ cuối của lưới tuần chiếm cả hàng, không còn thẻ mồ côi ở 768 px. | `src/ui/report/report.css` |
| UX-108 | "so TB tuần" chỉ hiện từ ngày thứ 3 của tuần (`WEEK_AVG_MIN_DAYS`); trước đó chỉ có so với hôm qua. | `src/ui/report/report.ts` |
| UX-109 | Toast luôn neo trên dock. Ở <= 640 px khi có bảng mở, chồng toast được nâng thêm `--panel-foot-h` (chiều cao chân bảng, đo trong HUD) để không che "Mở cửa". | `src/ui/hud/hud.ts`, `src/ui/styles/ui.css` |
| UX-110 | Câu mục tiêu tuần sau ghi "mục tiêu tuần N" thay cho "so tuần N". "Khách bỏ đi" giảm hiện mũi tên xuống (`i-trend-down`), vẫn màu xanh vì giảm là tốt. | `src/ui/screens/weekEnd.ts` |
| UX-012 | Đèn chùm hết nằm đè bàn/ghế: thân treo ở độ cao trần trên dây nối lên trần, và bóng đổ là một vệt mềm trên sàn, nằm trong lối đi, cách xa thân đèn, không bao giờ trên ô bàn hoặc ghế (kiểm qua nhiều bố cục). Vệt bóng và dây nằm chung geometry của đèn chùm, dùng lại vật liệu chung: không thêm draw call. | `src/render/scene/shop.ts` (`chandelierGeometry`, `chandelierShadowGeometry`) |

## Kiểm

- `vitest`: 2130 test đạt (gồm `tests/ui/t37-open-guard.test.ts`, `tests/ui/t38-ux-fixes.test.ts`, `tests/render/e06-premium-decor.test.ts`).
- `tsc`: sạch.
- `src/sim/`: diff rỗng; test `p22`/`p23` không đổi.
- Không dùng emoji trong chữ giao diện mới (test `t38` kiểm ở màn cuối tuần).

## Chưa kiểm

- `npm run layout` (bố cục 390/480/768 px: UX-103, 105, 106, 107, 109) **chưa chạy**: thiếu binary `vite` trong worktree. Các điểm này mới được kiểm bằng test CSS/DOM trong jsdom, chưa bằng trình duyệt.
- axe (truy cập) **chưa chạy**: sandbox chặn cổng preview.

Cần chạy cả hai trên máy có trình duyệt.
