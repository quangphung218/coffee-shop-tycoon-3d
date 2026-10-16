# Tuần 7 ngày

Trang này mô tả luật của tuần 7 ngày mà mọi ván mới chơi: món, dụng cụ và khu mở theo ngày, và ngày 7 mở rộng quán. Lịch nằm trong `src/sim/data/week.ts` (`WEEK_UNLOCKS`).

## Lịch mở khoá

| Ngày | Món | Dụng cụ | Khu, trang trí |
| --- | --- | --- | --- |
| 1 | Espresso, Americano, Latte, Trà sữa, Trà chanh, Bánh croissant | | Thêm bàn ghế, Cây xanh |
| 2 | Cappuccino | Máy xay hạt | |
| 3 | Nước cam | Tủ bánh | |
| 4 | Mocha | | Tranh treo tường, Đèn trang trí |
| 5 | Cà phê đá xay | Máy xay sinh tố | Khu ngồi ngoài trời |
| 6 | Bánh ngọt | Máy làm đá | Quầy bar cửa sổ |
| 7 | | Máy rửa ly | Mở rộng diện tích (tặng cấp 1) |

Luật của lịch: từ ngày 2 tới ngày 7, không quá 2 ngày liền nhau không mở thêm gì.

Sáng mỗi ngày có mở khoá, sim phát sự kiện `week_unlocks` (`day`, `unlocks`) để giao diện báo.

## Mở khoá theo cấp hoặc theo ngày

Một món hay nâng cấp mở khi một trong hai điều kiện đạt trước:

- cấp quán đạt cấp cần (`LEVELS` trong `src/sim/data/levels.ts`);
- ván có tuần (`state.week`) và ngày trong tuần đã tới ngày mở theo lịch.

Ngày trong tuần = `state.day − week.startedDay + 1`. Những gì không có trong lịch (Máy espresso 2 group, Máy espresso cao cấp, Quầy lớn hơn) chỉ mở theo cấp quán.

Save cũ không có `week` chơi như trước: chỉ mở theo cấp, không có lịch, không tặng mở rộng.

## Ngày 7: mở rộng quán

Sáng ngày 7, nếu quán chưa có Mở rộng diện tích thì được tặng cấp 1, không trừ tiền: phòng bên mở ra và thêm bàn ở khu `expansion`. Giao diện hiện thông báo "Quán mở rộng!". Quán đã mua Mở rộng diện tích từ trước thì không được tặng thêm.

## Sự kiện và thời tiết

Mỗi ngày trong tuần có một thời tiết và một sự kiện, lập sẵn khi tạo ván (`state.week.plan`, hàm `rollWeekPlan` trong `src/sim/week.ts`). Hệ số sự kiện nằm trong `DAY_EVENTS` (`src/sim/data/week.ts`).

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

- Ngày 1 luôn nắng và khai trương.
- Ngày 2–7 rút thời tiết (nắng 50%, mưa 25%, nóng 25%) và sự kiện (ngày thường 40%, hội chợ 30%, tăng giá 30%); rút lại khi ra nắng và ngày thường.
- Hai ngày liền nhau không cùng cặp thời tiết và sự kiện.
- Tuần có ít nhất một ngày mưa, một hội chợ và một ngày tăng giá.
- Tuần sai luật thì rút lại cả tuần. Mỗi lần rút dùng hash của seed và ngày, không dùng `rngState`, nên cùng seed luôn ra cùng lịch.

Sáng mỗi ngày, thời tiết lấy theo lịch. Save cũ không có `week` vẫn rút thời tiết ngẫu nhiên và không có sự kiện.

## Mục tiêu tuần

Tuần chưa có mục tiêu doanh thu, số sao hay màn kết tuần.
