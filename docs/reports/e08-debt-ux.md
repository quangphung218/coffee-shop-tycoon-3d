# E-08: nợ và phá sản dễ đọc hơn (UX)

E-08 sửa năm chỗ giao diện quanh nợ và phá sản. Không đổi số kinh tế nào: hạn mức nợ, số ngày phá sản (`BANKRUPT_DAYS`), giá, lương, lãi, mục tiêu tuần và `SAVE_VERSION` giữ nguyên. Chỉ đổi `src/ui/` và test UI; `src/sim/` không đổi. Luật phá sản nằm ở `src/sim/economy.ts` (`debtLimit`, `isOverDebtLimit`, `debtDaysLeft`).

## Năm sửa

| Mã | Sửa | Code |
| --- | --- | --- |
| UX-001 | Từ 480 px trở xuống, nút chân màn Tổng kết ngày và Tổng kết tuần xếp dọc, rộng hết dòng, nút chính lên đầu. "Xem đánh giá" lấy lại chữ. | `src/ui/report/report.css` (`@media (max-width: 480px)`) |
| UX-003 | Khi đang đếm ngược phá sản, Tổng kết ngày có khối đỏ ở đầu: "Còn N ngày trước khi phá sản", tiền hiện tại, hạn mức nợ, và tối đa 3 gợi ý (`debtHints`). Khi tiền dưới 0, dòng "Lãi" không còn màu xanh (dùng màu trung tính). | `src/ui/report/report.ts` (`reportDebt`, `debtBlock`, `reportResult` tone) |
| UX-005 | Ô tiền trên HUD đổi sang màu nguy hiểm khi tiền dưới 0, và title ghi luật: "Đóng cửa với tiền dưới −500.000đ N ngày liền là phá sản" (số theo `debtLimit`, `BANKRUPT_DAYS`). Biểu ngữ cảnh báo nêu rõ ngưỡng: "Tiền dưới −500.000đ: còn N ngày trước khi phá sản". | `src/ui/hud/hud.ts` (`debtWarning`, `debtRule`, `labelMoney`) |
| UX-006 | HUD hẹp (`NARROW_MONEY`, tối đa 480 px) viết tắt số âm: −2.150.000đ thành "−2,15tr". Số âm viết tắt từ 1tr (2 chữ số thập phân, tới dưới 10tr); số dương vẫn chỉ viết tắt từ 10tr (một chữ số thập phân). Số đầy đủ nằm trong title. | `src/ui/core/format.ts` (`formatMoneyShort`, `SHORT_DEBT_FROM`) |
| UX-004 | Bấm "Mở cửa" khi kho không đủ nguyên liệu cho món nào (`stockMakesNoDish`) hỏi ngay trong chân bảng: "Kho trống: không bán được món nào", với nút "Mở Kho" (sang bảng Kho, chưa mở quán) và "Vẫn mở cửa". Menu không có món nào thì không hỏi, mở luôn. Hỏi không chặn mở cửa. | `src/ui/panels/tasks.ts` |

Gợi ý nợ (`debtHints`), theo thứ tự, lấy tối đa 3: cho nhân viên nghỉ bớt, đưa chính sách lương về chuẩn (khi đang `high`), đưa chính sách giá về chuẩn (khi đang `low`), không mở marketing mới (khi hôm nay có chi marketing), dùng hết nguyên liệu trong kho. Trống nếu không còn gì để cắt.

## Màn phá sản

Màn "Quán đã phá sản" (`src/ui/screens/bankrupt.ts`) thêm một dòng ghi ba số: tiền lúc phá sản, hạn mức nợ, và số ngày liền vượt hạn mức. Số lấy từ `bankruptSummary`, không tính lại.

## Kiểm

- `tests/ui/bankruptcy.test.ts`: biểu ngữ HUD, `debtHints`, `debtRule`, màn phá sản.
- `tests/ui/report-debt.test.ts`: khối nợ trong Tổng kết, tối đa 3 gợi ý, tone của "Lãi".
- `tests/ui/t19-open-confirm.test.ts`: hỏi khi kho trống, "Mở Kho" không mở quán, không hỏi khi menu không có món.

Số kinh tế: không đổi, nên không phải đo lại `p23-long-run` hay chỉnh `WEEK_GOAL_MULTS`.

## Chưa kiểm

`npm run layout` không chạy được trong sandbox của task này, nên bố cục ở 480 px trở xuống (nút xếp dọc, khối nợ, ô tiền viết tắt) chưa được kiểm bằng ảnh chụp. Cần chạy lại ngoài sandbox.
