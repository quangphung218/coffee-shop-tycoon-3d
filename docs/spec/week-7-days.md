# Tuần 7 ngày

Trang này mô tả luật tuần mà mọi ván mới chơi: món, dụng cụ và khu mở theo ngày ở tuần 1, ngày 7 mở rộng quán, sự kiện và thời tiết theo ngày, mục tiêu, chấm điểm và cúp cuối tuần, sang tuần mới, cấp quán 7–10 và cách save cũ được nâng. Ván không giới hạn số ngày: hết tuần thì sang tuần tiếp theo (`state.week.index` tăng 1). Luật và số liệu nằm trong `src/sim/week.ts` và `src/sim/data/week.ts`.

- [Lịch mở khoá](#lịch-mở-khoá)
- [Mở khoá theo cấp hoặc theo ngày](#mở-khoá-theo-cấp-hoặc-theo-ngày)
- [Ngày 7: mở rộng quán](#ngày-7-mở-rộng-quán)
- [Sự kiện và thời tiết](#sự-kiện-và-thời-tiết)
- [Mục tiêu tuần](#mục-tiêu-tuần)
- [Cấp quán 7–10](#cấp-quán-710)
- [Save cũ](#save-cũ)

## Lịch mở khoá

Lịch chỉ áp cho tuần 1. Từ tuần 2, mọi thứ trong lịch đã mở và không khoá lại; sáng các ngày không còn `week_unlocks` hay tặng mở rộng.

| Ngày | Món | Dụng cụ | Khu, trang trí |
| --- | --- | --- | --- |
| 1 | Espresso, Americano, Latte, Trà sữa, Trà chanh, Bánh croissant | | Thêm bàn ghế, Cây xanh |
| 2 | Cappuccino | Máy xay hạt, Máy làm đá | |
| 3 | Nước cam | Tủ bánh | |
| 4 | Mocha | Máy rửa ly | Tranh treo tường, Đèn trang trí |
| 5 | Cà phê đá xay | Máy xay sinh tố | Khu ngồi ngoài trời |
| 6 | Bánh ngọt | | Quầy bar cửa sổ |
| 7 | | | Mở rộng diện tích (tặng cấp 1) |

Luật của lịch:

- Từ ngày 2 tới ngày 7, không quá 2 ngày liền nhau không mở thêm gì.
- Mọi dụng cụ mở muộn nhất ngày 5.

Sáng mỗi ngày có mở khoá, sim phát sự kiện `week_unlocks` (`day`, `unlocks`) để giao diện báo.

## Mở khoá theo cấp hoặc theo ngày

Một món hay nâng cấp mở khi một trong hai điều kiện đạt trước:

- cấp quán đạt cấp cần (`LEVELS` trong `src/sim/data/levels.ts`);
- ván có tuần (`state.week`) và ngày trong tuần đã tới ngày mở theo lịch (tuần 1), hoặc ván đã sang tuần 2 trở đi.

Ngày trong tuần = `state.day − week.startedDay + 1`. Những gì không có trong lịch (Máy espresso 2 group, Máy espresso cao cấp, Quầy lớn hơn) chỉ mở theo cấp quán.

Save cũ không có `week` chơi như trước: chỉ mở theo cấp, không có lịch, không tặng mở rộng.

## Ngày 7: mở rộng quán

Sáng ngày 7, nếu quán chưa có Mở rộng diện tích thì được tặng cấp 1, không trừ tiền: phòng bên mở ra và thêm bàn ở khu `expansion`. Giao diện hiện thông báo "Quán mở rộng!". Quán đã mua Mở rộng diện tích từ trước thì không được tặng thêm.

## Sự kiện và thời tiết

Mỗi ngày trong tuần có một thời tiết và một sự kiện, lập sẵn khi tuần bắt đầu (`state.week.plan`, hàm `rollWeekPlan(seed, weekIndex)` trong `src/sim/week.ts`). Hệ số sự kiện nằm trong `DAY_EVENTS` (`src/sim/data/week.ts`).

| Biến số | Khách tới | Giá nguyên liệu |
| --- | --- | --- |
| Nắng | ×1 | ×1 |
| Mưa | ×0,75 | ×1 |
| Nóng | ×1,1 | ×1 |
| Khai trương | ×1,15 | ×1 |
| Hội chợ | ×1,4 | ×1 |
| Nhà cung cấp tăng giá | ×1 | ×1,25 |
| Ngày thường (không sự kiện) | ×1 | ×1 |

Hệ số thời tiết và sự kiện nhân với nhau, rồi nhân vào tốc độ khách tới (`arrivalRate`). Giá nguyên liệu tăng áp dụng cho cả giá mua gói và giá vốn các phần làm ra trong ngày đó.

Luật sinh lịch:

- Tuần 1: ngày 1 luôn nắng và khai trương. Từ tuần 2 không có khai trương; ngày 1 rút như các ngày khác.
- Các ngày còn lại rút thời tiết (nắng 50%, mưa 25%, nóng 25%) và sự kiện (ngày thường 40%, hội chợ 30%, tăng giá 30%); rút lại khi ra nắng và ngày thường.
- Hai ngày liền nhau không cùng cặp thời tiết và sự kiện.
- Tuần có ít nhất một ngày mưa, một hội chợ và một ngày tăng giá.
- Tuần sai luật thì rút lại cả tuần. Mỗi lần rút dùng hash của seed, số tuần và ngày, không dùng `rngState`, nên cùng seed luôn ra cùng lịch cho từng tuần.

Sáng mỗi ngày, thời tiết lấy theo lịch. Save cũ không có `week` vẫn rút thời tiết ngẫu nhiên và không có sự kiện.

## Mục tiêu tuần

Ván mới nhận mục tiêu tuần theo độ khó (`WEEK_GOALS` trong `src/sim/data/week.ts`, lưu ở `state.week.goal`):

| Độ khó | Doanh thu 7 ngày | Số sao cuối tuần |
| --- | --- | --- |
| Dễ | 28.000.000 | 3,8 |
| Thường | 26.500.000 | 4,0 |
| Khó | 23.000.000 | 4,2 |

Cách đặt doanh thu: chơi 7 ngày với chiến lược cơ bản (mỗi sáng nhập hàng theo gợi ý, tự phục vụ một mình, không thuê, không nâng cấp), có lịch sự kiện, seed 1, 42, 777, 2024, 31337, 9001. Doanh thu trung bình: Dễ khoảng 22,6 triệu, Thường 21,2 triệu, Khó 18,2 triệu. Mục tiêu đặt để chiến lược này đạt khoảng 80% (từng seed 75–86%).

Bảng trên là tuần 1. Mục tiêu tuần N lấy từ `weekGoal(difficulty, N)`: doanh thu tăng 50% mỗi tuần sau tuần 1, tối đa gấp 3 tuần 1 (từ tuần 5), làm tròn tới 100.000; mục tiêu sao giữ nguyên. Số đo 4 tuần ở [reports/p23-long-economy.md](../reports/p23-long-economy.md).

### Chấm điểm

Tối ngày 7, `closeDay` gọi `scoreWeek` (`src/sim/week.ts`) và lưu kết quả vào `state.week.result`:

- Doanh thu = tổng `revenue` của 7 ngày tuần (`history` và hôm nay).
- Sao = `state.rating` lúc đóng ngày 7, làm tròn 1 chữ số thập phân như số hiển thị; đạt khi sao ≥ mục tiêu sao.
- Điểm = round(60 × min(1, doanh thu / mục tiêu) + 40 × min(1, sao / mục tiêu sao)), từ 0 tới 100.
- Cúp: điểm ≥ 90 được 3, ≥ 70 được 2, ≥ 40 được 1, còn lại 0.
- Thưởng tiền (`WEEK_REWARDS`), cộng ngay tối ngày 7:

  | Độ khó | 2 cúp | 3 cúp |
  | --- | --- | --- |
  | Dễ | 1.000.000 | 1.500.000 |
  | Thường | 1.500.000 | 2.250.000 |
  | Khó | 2.000.000 | 3.000.000 |
- `days`: mỗi ngày tuần một dòng gồm ngày, doanh thu, khách đã phục vụ, thời tiết và sự kiện theo lịch.

Cùng lúc, sim thêm một dòng vào `state.week.archive` (`WeekSummary`: `index`, `startedDay`, `revenue`, `profit`, `customersServed`, `stars`, `score`, `cups`) rồi phát `week_ended` (`result`) ngay sau `dayEnded`. Nút **Xem tổng kết tuần** của báo cáo mở màn Tổng kết tuần; nút **Sang tuần N+1** ở đó gửi `next_day`.

### Sang tuần mới

`next_day` từ báo cáo ngày 7 mở tuần tiếp theo: `index` + 1, `startedDay` = ngày mới, `plan` = `rollWeekPlan(seed, index)`, `goal` = `weekGoal(difficulty, index)`, xoá `result`, giữ `archive`. `state.history` chỉ giữ 28 ngày gần nhất (`HISTORY_DAYS`); số liệu các tuần cũ đọc từ `archive`.

Save cũ không có `week` không bao giờ có `week_ended` và chơi tiếp như trước.

## Cấp quán 7–10

Tới cấp 6 quán đã mở mọi món và nâng cấp. Cấp 7–10 (`LEVELS` trong `src/sim/data/levels.ts`) không mở gì mới; mỗi cấp cho mua thêm 1 cấp của hai nâng cấp đã có (`maxLevelBonus`). Cấp vượt trần gốc đắt gấp 3 (`BONUS_LEVEL_PRICE_MULT`).

| Cấp | Tên | KN cần | Thêm 1 cấp cho |
| --- | --- | --- | --- |
| 7 | Điểm hẹn của quận | 27.000 | Máy espresso cao cấp, Máy xay hạt |
| 8 | Thương hiệu được săn đón | 37.000 | Thêm bàn ghế, Tủ bánh |
| 9 | Biểu tượng cà phê phố | 49.000 | Đèn trang trí, Máy xay sinh tố |
| 10 | Huyền thoại thành phố | 63.000 | Máy espresso cao cấp, Máy rửa ly |

Số đo 4 tuần dùng để chọn ngưỡng: [reports/p23-long-economy.md](../reports/p23-long-economy.md).

## Save cũ

Định dạng save hiện tại là phiên bản 3 (`SAVE_VERSION` trong `src/save/save.ts`). Khi tải save phiên bản 2:

- `week` thiếu `index` thì nhận `index = 1`; thiếu `archive` thì nhận `archive` rỗng;
- tuần đã chấm (`result` có sẵn, save lưu sau ngày 7) được ghi một dòng vào `archive` và giữ `result`, nên báo cáo vẫn mở màn Tổng kết tuần 1 và **Sang tuần 2** chơi tiếp; lợi nhuận và khách của dòng đó cộng từ các ngày tuần 1 còn trong `history` và `today`, không có thì 0;
- `history` dài hơn 28 ngày bị cắt còn 28 ngày cuối.

Save không có `week` không nhận `week`. Tiền, món, nâng cấp, cấp quán và XP không đổi.
