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

Mục tiêu tuần N lấy từ `weekGoal(difficulty, N)` (`src/sim/data/week.ts`) và lưu ở `state.week.goal`. Tuần 1 là `WEEK_GOALS`; từ tuần 2 doanh thu bằng mức tuần 1 nhân hệ số trong `WEEK_GOAL_MULTS` (tuần 1, 2, 3, 4), làm tròn tới 100.000; từ tuần 5 hệ số tăng thêm `WEEK_GOAL_LATE_GROWTH` mỗi tuần (+0,1 ở cả ba độ khó), không có trần và mục tiêu không bao giờ giảm. Mục tiêu sao giữ nguyên.

| Độ khó | Sao | Hệ số tuần 1 / 2 / 3 / 4 | Từ tuần 5 | Tuần 1 | Tuần 2 |
| --- | --- | --- | --- | --- | --- |
| Dễ | 3,8 | 1 / 1,7 / 2,2 / 2,35 | +0,1/tuần | 35.000.000 | 59.500.000 |
| Thường | 4,0 | 1 / 1,7 / 2,2 / 2,4 | +0,1/tuần | 32.000.000 | 54.400.000 |
| Khó | 4,2 | 1 / 1,65 / 2,1 / 2,25 | +0,1/tuần | 33.000.000 | 54.500.000 |

Đường cong E-12 (thay đường E-11) theo luật chủ quán 30/10: người chơi thư giãn (`b_steady`) được 2 cúp ở tuần 3–8, muốn 3 cúp phải tối ưu như `c_spend`; quán không mua gì (`a_basic`) giảm dần nhưng giữ ít nhất 1 cúp. Điểm trung bình tuần 1 → 8 (xem bảng đầy đủ ở báo cáo): `a_basic` Dễ 89 65 55 52 51 50 49 47, Thường 93 68 59 53 53 51 50 49, Khó 85 68 59 54 53 52 50 49. Các hệ số khớp với kinh tế hiện tại; sau khi đổi kinh tế phải đo lại bằng `p23-long-run.test.ts`. Số đo 8 tuần: [reports/p23-long-economy.md](../reports/p23-long-economy.md#đã-sửa-ở-e-12).

Save cũ giữ mục tiêu đã lưu ở `state.week.goal`; chỉ các tuần mới mở sau khi đổi mới dùng đường cong này. `SAVE_VERSION` vẫn là 6.

Mục tiêu tuần 1 được chọn bằng các chiến lược sau (số đo dưới đây là của lần chọn mục tiêu tuần 1 đó, chơi có lịch sự kiện):

| Chiến lược | Mỗi sáng | Test | Seed |
| --- | --- | --- | --- |
| Cơ bản | Nhập theo gợi ý, giữ menu ngày 1; tự phục vụ, không thuê, không nâng cấp | `a_basic` của `tests/integration/p22-strategies.test.ts`, 1 tuần | 1, 42, 777, 2024, 31337, 9001 |
| Cơ bản bật món | Bật mọi món đã mở khoá, rồi làm như Cơ bản | `a_basic` của `tests/integration/p23-long-run.test.ts`, 8 tuần | 1, 42, 777 |
| Nâng cấp | Như Cơ bản bật món, thêm thuê 1 barista ngày 1 và mua nâng cấp rẻ nhất khi còn đủ tiền | `c_spend` của `tests/integration/p23-long-run.test.ts`, 8 tuần | 1, 42, 777 |

Kết quả:

- Cơ bản đạt khoảng 80% mục tiêu tuần 1: trung bình Dễ 22,54 triệu (80,5%), Thường 21,07 triệu (79,5%), Khó 18,21 triệu (78,5%); từng seed 75,3–83,4%; 2 cúp (điểm 83–89).
- Cơ bản bật món (E-12, trung bình 3 seed, tuần 1 → 8): Dễ 89 65 55 52 51 50 49 47; Thường 93 68 59 53 53 51 50 49; Khó 85 68 59 54 53 52 50 49. Giữ ít nhất 1 cúp.
- Nâng cấp (`c_spend`): 3 cúp tuần 5–8 ở 12/12 ván mỗi độ khó; điểm trung bình tuần 2 là 89–100. Chi tiết ở [reports/p23-long-economy.md](../reports/p23-long-economy.md#đã-sửa-ở-e-12).
- Thong thả (`b_steady`, E-12): 0/12 ván 3 cúp tuần 5–8; ít nhất 2 cúp ở 62/63 ván tuần 2–8 (Dễ 20/21).

Số đo từng seed ở [reports/p24-ui.md](../reports/p24-ui.md#mục-tiêu-tuần-sau-khi-sửa-gợi-ý-nhập).

### Chấm điểm

Tối ngày 7, `closeDay` gọi `scoreWeek` (`src/sim/week.ts`) và lưu kết quả vào `state.week.result`:

- Doanh thu = tổng `revenue` của 7 ngày tuần (`history` và hôm nay).
- Sao = `state.rating` lúc đóng ngày 7, làm tròn 1 chữ số thập phân như số hiển thị; đạt khi sao ≥ mục tiêu sao.
- Lợi nhuận tuần = `weekProfit`: tổng lãi ngày (doanh thu trừ nguyên liệu, lương, marketing) trừ `weekUpgradeCharge`, phần tiền nâng cấp và dụng cụ mà tuần này phải gánh. Mục tiêu lợi nhuận = `weekProfitTarget` = mục tiêu doanh thu × `WEEK_PROFIT_SHARE` (Dễ 0,59, Thường 0,5, Khó 0,35), làm tròn 100.000. Lỗ không được điểm lợi nhuận.
- Điểm = round(25 × min(1, doanh thu / mục tiêu) + 55 × min(1, lợi nhuận / mục tiêu lợi nhuận) + 20 × min(1, sao / mục tiêu sao)), từ 0 tới 100 (`SCORE_REVENUE`, `SCORE_PROFIT`, `SCORE_STARS`).
- Cúp: điểm ≥ 90 được 3, ≥ 70 được 2, ≥ 40 được 1, còn lại 0.
- Thưởng tiền (`WEEK_REWARDS`), cộng ngay tối ngày 7:

  | Độ khó | 2 cúp | 3 cúp |
  | --- | --- | --- |
  | Dễ | 1.000.000 | 1.500.000 |
  | Thường | 1.500.000 | 2.250.000 |
  | Khó | 2.000.000 | 3.000.000 |
- `days`: mỗi ngày tuần một dòng gồm ngày, doanh thu, khách đã phục vụ, thời tiết và sự kiện theo lịch.

### Chia nhỏ tiền nâng cấp

Cách `weekUpgradeCharge` tính tiền nâng cấp trong lợi nhuận tuần:

- Từ E-11, tuần 1 chia nhỏ như các tuần sau. Mỗi khoản nâng cấp chia đều trong N tuần (`upgradeAmortizeWeeks`, `UPGRADE_AMORTIZE_WEEKS_BY_DIFFICULTY`): 2 tuần ở Dễ và Thường, 3 tuần ở Khó. Tuần mua và các tuần kế tiếp mỗi tuần trừ 1/N.
- Chi quá sức vẫn làm tụt điểm lợi nhuận ở tuần mua và tuần sau.
- Tuần đã chấm theo luật cũ (dòng `archive` không có `upgradeCharge`) không tính lại, và nâng cấp mua trong tuần đó không chuyển sang tuần sau. Không đổi `SAVE_VERSION`.
- Màn Tổng kết tuần có khối **Lợi nhuận tuần** ghi lợi nhuận, mục tiêu và luật trên (`weekProfitRule` trong `src/ui/screens/weekEnd.ts`).

Chọn 2 tuần vì chia dài hơn đẩy quán chi tiền lên điểm tối đa sớm; Khó dùng 3 tuần vì không đường mục tiêu nào giữ `c_spend` Khó trong 10 điểm ở tuần 2→3 với 2 tuần. Số đo: [reports/p23-long-economy.md](../reports/p23-long-economy.md#đã-sửa-ở-e-11).

### Mục tiêu tuần hiện rõ (E-09)

E-09 chỉ đổi giao diện: không đổi số kinh tế nào (mục tiêu, `WEEK_PROFIT_SHARE`, điểm, ngưỡng cúp, thưởng, `UPGRADE_AMORTIZE_WEEKS`, giá). Các khối dưới đây chỉ đọc số từ `scoreWeek` và `weekUpgradeCharge`.

**Mục tiêu sống** (`weekGoalView` và `weekGoalBlock` trong `src/ui/weekGoal.ts`). Hiện trong panel Việc (tiêu đề "Mục tiêu tuần N", `src/ui/panels/tasks.ts`) và trong dải tuần của báo cáo ngày (`weekStrip`, `src/ui/report/report.ts`):

- 3 thanh: Doanh thu, Lợi nhuận, Sao, mỗi thanh so với mục tiêu của nó. Lợi nhuận là lãi các ngày đã trừ `weekUpgradeCharge`. Phần trăm = giá trị / mục tiêu, làm tròn; lỗ tính 0%; thanh vẽ tối đa 100%, số có thể vượt.
- Dòng "Đang hướng tới N cúp · M điểm": cúp và điểm nếu tuần đóng với số hiện tại.
- Dòng "Nâng cấp tuần này gánh: X đ", chỉ hiện khi `weekUpgradeCharge` > 0.
- Save cũ không có `week` không có khối này: tiêu đề và khối trong panel Việc ẩn; dải tuần của báo cáo giữ thanh doanh thu như trước.

**Bảng điểm cuối tuần** (`scoreRows` và `scoreDetail` trong `src/ui/screens/weekEnd.ts`), dưới ô Điểm tuần:

- Bảng Tiêu chí/Điểm: Doanh thu x/25, Lợi nhuận x/55, Sao x/20, dòng Tổng n/100. Mỗi điểm lấy phần nguyên của phần điểm đúng, điểm còn thiếu đến điểm đã lưu chia cho phần dư lớn nhất, nên tổng khớp `result.score`.
- Dòng công thức: "Lãi các ngày X − khấu hao nâng cấp Y = Z" (X là tổng lãi ngày của tuần, Y = X − lợi nhuận tuần, Z là lợi nhuận tuần; âm ghi dấu −).
- Dòng luật cúp: "Từ 70 điểm được 2 cúp: thưởng …; từ 90 điểm được 3 cúp: thưởng ….", lấy ngưỡng từ `weekCups` và thưởng từ `weekReward`.

**Khối Lợi nhuận tuần** có thêm thanh tiến độ, huy hiệu đạt hoặc chưa và "N% mục tiêu" như khối Doanh thu. Ba khối Doanh thu, Lợi nhuận, Đánh giá chia 3 cột khi cửa sổ rộng từ 1024px (`.rpt-grid.wk-grid`, `src/ui/report/report.css`); hẹp hơn thì xếp dọc.

**Khối tuần kế**: câu "Mục tiêu: … doanh thu (×hệ số so tuần 1), … lợi nhuận và N sao." (`nextWeekGoalText`). Hệ số = doanh thu mục tiêu tuần sau / tuần 1, một chữ số thập phân (ví dụ ×1,9); lợi nhuận = `weekProfitTarget` của doanh thu đó.

**Chuẩn bị tuần 2** (`weekOneBlock`, `weekOneHints`): chỉ hiện ở tổng kết tuần 1 khi dưới 3 cúp; ẩn khi đủ 3 cúp và từ tuần 2. Gồm dòng doanh thu mỗi ngày tuần 2 cần so với mức đạt tuần 1, và tối đa 2 gợi ý đọc từ quán:

- chưa có nhân viên: "Thuê pha chế";
- tiền đủ mua cấp kế của một nâng cấp hoặc dụng cụ đang mở, không cần vé và không chờ nâng cấp khác: "Mua nâng cấp, tiền chia ra các tuần".

Không có gợi ý nào đúng thì chỉ còn dòng doanh thu mỗi ngày.

**Save cũ**: tuần chấm trước khi có lợi nhuận (kết quả không có `profit` hay `profitTarget`) không có bảng điểm, dòng công thức và khối Lợi nhuận tuần. Save không có `week` ẩn mục tiêu sống và các khối tổng kết tuần. Không đổi `SAVE_VERSION`.

Khi chấm điểm, sim cũng thêm một dòng vào `state.week.archive` (`WeekSummary`: `index`, `startedDay`, `revenue`, `profit`, `customersServed`, `stars`, `score`, `cups`, và `upgradeCharge` từ tuần 2) rồi phát `week_ended` (`result`) ngay sau `dayEnded`. Nút **Xem tổng kết tuần** của báo cáo mở màn Tổng kết tuần; nút **Sang tuần N+1** ở đó gửi `next_day`.

### Sang tuần mới

`next_day` từ báo cáo ngày 7 mở tuần tiếp theo: `index` + 1, `startedDay` = ngày mới, `plan` = `rollWeekPlan(seed, index)`, `goal` = `weekGoal(difficulty, index)`, xoá `result`, giữ `archive`. `state.history` chỉ giữ 28 ngày gần nhất (`HISTORY_DAYS`); số liệu các tuần cũ đọc từ `archive`.

Save cũ không có `week` không bao giờ có `week_ended` và chơi tiếp như trước.

## Cấp quán 7–10

Tới cấp 6 quán đã mở mọi món và mọi nâng cấp, trừ những thứ mở ở cấp 7–8: cấp 7 mở Tháp cold brew và món Cold brew, cấp 8 mở Lò nướng, Bánh quy sô-cô-la và Góc sofa ([p31-equipment.md](p31-equipment.md)). Cấp 7–10 (`LEVELS` trong `src/sim/data/levels.ts`) còn cho mua thêm 1 cấp của vài nâng cấp đã có (`maxLevelBonus`). Từ E-05, các cấp thêm ghi giá và cấp quán cần riêng trong `extraLevels` ([p27-retention.md](p27-retention.md)). Mở rộng diện tích cấp 3–4: [p27-retention.md](p27-retention.md#mở-rộng-diện-tích).

| Cấp | Tên | KN cần | Thêm 1 cấp cho |
| --- | --- | --- | --- |
| 7 | Điểm hẹn của quận | 27.000 | Máy espresso cao cấp, Máy xay hạt, Mở rộng diện tích |
| 8 | Thương hiệu được săn đón | 37.000 | Thêm bàn ghế, Tủ bánh |
| 9 | Biểu tượng cà phê phố | 49.000 | Đèn trang trí, Máy xay sinh tố, Mở rộng diện tích |
| 10 | Huyền thoại thành phố | 63.000 | Máy espresso cao cấp, Máy rửa ly |

Số đo 8 tuần: [reports/p23-long-economy.md](../reports/p23-long-economy.md).

## Save cũ

Định dạng save hiện tại là phiên bản 3 (`SAVE_VERSION` trong `src/save/save.ts`). Khi tải save phiên bản 2:

- `week` thiếu `index` thì nhận `index = 1`; thiếu `archive` thì nhận `archive` rỗng;
- tuần đã chấm (`result` có sẵn, save lưu sau ngày 7) được ghi một dòng vào `archive` và giữ `result`, nên báo cáo vẫn mở màn Tổng kết tuần 1 và **Sang tuần 2** chơi tiếp; lợi nhuận và khách của dòng đó cộng từ các ngày tuần 1 còn trong `history` và `today`, không có thì 0;
- `history` dài hơn 28 ngày bị cắt còn 28 ngày cuối.

Save không có `week` không nhận `week`. Tiền, món, nâng cấp, cấp quán và XP không đổi.
