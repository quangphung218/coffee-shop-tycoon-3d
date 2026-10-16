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

Thời tiết mỗi ngày là nắng, mưa hoặc nóng; ngày 1 luôn nắng. Mưa giảm khách còn 0,75 lần, nóng tăng lên 1,1 lần. Tuần chưa có sự kiện theo ngày.

## Mục tiêu tuần

Tuần chưa có mục tiêu doanh thu, số sao hay màn kết tuần.
