# Nhân viên lên cấp, quà ngày và mở rộng quán

Trang này ghi luật và con số của bốn mảng giữ chân người chơi: nhân viên có đặc điểm và lên cấp, quà mỗi ngày cùng Tem và thành tựu, đơn đặc biệt và khách VIP, nội thất mới và mở rộng quán 4 cấp. Số liệu lấy từ `src/sim/data/` và các module sim ghi ở từng mục; cách code chạy ở [architecture.md](../architecture.md#nhân-viên-đặc-điểm-và-cấp).

- [Tổng quan](#tổng-quan)
- [Quà ngày](#quà-ngày)
- [Tem](#tem)
- [Thành tựu](#thành-tựu)
- [Đơn đặc biệt](#đơn-đặc-biệt)
- [Khách VIP](#khách-vip)
- [Nhân viên: đặc điểm và cấp](#nhân-viên-đặc-điểm-và-cấp)
- [Mở rộng diện tích](#mở-rộng-diện-tích)
- [Nội thất](#nội-thất)
- [Save cũ](#save-cũ)

## Tổng quan

| Mảng | Người chơi làm gì | Nhận gì |
| --- | --- | --- |
| Quà ngày | Mở game mỗi ngày thật, bấm nhận ở thẻ **Quà hằng ngày** của bảng Việc | Tiền và Tem, ngày 7 của chuỗi nhiều nhất |
| Thành tựu | Chơi tiếp: phục vụ, doanh thu, review 5 sao, ngày đủ nhiệm vụ, tuần 3 cúp, nhân viên cấp cao | Tem ở mỗi mốc, một lần |
| Đơn đặc biệt | Giao đủ số phần một món trước giờ hạn | Tiền và Tem |
| Khách VIP | Phục vụ khách có ngôi sao trên đầu | Tem |
| Nhân viên | Cho nhân viên làm việc để có kinh nghiệm, rồi đào tạo lúc chuẩn bị | Nhân viên làm nhanh hơn, lương cao hơn |
| Nội thất, mở rộng | Mua ở bảng Nâng cấp | Khách, sao, bàn, chỗ nhân viên |

Tem là tiền phụ chỉ kiếm trong game; không có mua bằng tiền thật hay quảng cáo. Mọi phần ngẫu nhiên (đặc điểm nhân viên, món của đơn đặc biệt, giờ hạn, ngày có VIP) chọn bằng hash của seed với id hay ngày, không rút từ `rngState`.

Tiền thưởng nhân hệ số giá của độ khó (`priceMult` trong `src/sim/data/difficulty.ts`): Dễ 0,9 · Thường 1 · Khó 1,15. Các bảng dưới ghi số ở Thường.

## Quà ngày

Nguồn: `GIFT_REWARDS` trong `src/sim/data/retention.ts`, luật trong `src/sim/retention.ts`.

| Ngày của chuỗi | Tiền (Thường) | Dễ | Khó | Tem |
| --- | --- | --- | --- | --- |
| 1 | 50.000đ | 45.000đ | 58.000đ | 1 |
| 2 | 60.000đ | 54.000đ | 69.000đ | 1 |
| 3 | 80.000đ | 72.000đ | 92.000đ | 2 |
| 4 | 100.000đ | 90.000đ | 115.000đ | 1 |
| 5 | 120.000đ | 108.000đ | 138.000đ | 2 |
| 6 | 150.000đ | 135.000đ | 173.000đ | 2 |
| 7 | 250.000đ | 225.000đ | 288.000đ | 5 |

Một vòng 7 ngày ở Thường cho 810.000đ và 14 Tem. Tiền làm tròn tới 1.000đ.

| Ngày trên máy so với lần nhận trước | Kết quả |
| --- | --- |
| Chưa nhận lần nào | Nhận quà ngày 1 |
| Ngày kế tiếp | Nhận quà ngày tiếp theo của chuỗi; sau ngày 7 quay về ngày 1 |
| Cách từ 2 ngày trở lên | Chuỗi đứt, nhận quà ngày 1 |
| Cùng ngày | Không nhận được: "Hôm nay đã nhận quà" |
| Lùi về trước | Không nhận được: "Ngày trên máy lùi lại, không nhận được quà"; chuỗi giữ nguyên |

- Ngày là ngày lịch theo giờ địa phương của máy (`'YYYY-MM-DD'`), không phải ngày trong game.
- Nhận được ở mọi pha. Mỗi save có chuỗi riêng.
- Main Menu ghi "Quà ngày N đang chờ" dưới **Tiếp tục** khi save gần nhất chưa nhận quà hôm nay.

## Tem

| Nguồn | Tem |
| --- | --- |
| Quà ngày | 1–5 mỗi ngày ([bảng trên](#quà-ngày)) |
| Mốc thành tựu | 2, 4 hoặc 8 |
| Đơn đặc biệt hoàn thành | 2 |
| Phục vụ khách VIP | 3 |

| Tiêu | Tem |
| --- | --- |
| Đào tạo nhân viên lên cấp 4 | 3 |
| Đào tạo nhân viên lên cấp 5 | 5 |
| Máy hát đĩa | 3 |
| Góc sofa | 5 |

Số dư Tem hiện trên HUD cạnh tiền. Gỡ nội thất không hoàn Tem.

## Thành tựu

Nguồn: `ACHIEVEMENTS` trong `src/sim/data/retention.ts`. Mỗi thành tựu có 3 mốc, thưởng 2 / 4 / 8 Tem (`TIER_TICKETS`), chấm lúc cuối ngày. Thành tựu không cho XP.

| Id | Tên | Đo gì | Mốc 1 | Mốc 2 | Mốc 3 |
| --- | --- | --- | --- | --- | --- |
| `served` | Khách quen của phố | Tổng khách đã phục vụ | 100 | 500 | 2.000 |
| `revenue` | Két tiền đầy | Tổng doanh thu | 5.000.000đ | 30.000.000đ | 150.000.000đ |
| `five_star` | Năm sao lấp lánh | Số review 5 sao | 10 | 50 | 200 |
| `perfect_day` | Ngày hoàn hảo | Số ngày xong cả 3 nhiệm vụ | 1 | 5 | 20 |
| `three_cups` | Tuần ba cúp | Số tuần kết thúc với 3 cúp | 1 | 3 | 10 |
| `staff_master` | Đội ngũ lành nghề | Số nhân viên đang có ở cấp ≥ 3 (`STAFF_MASTER_LEVEL`) | 1 | 3 | 6 |

Một tối vượt nhiều mốc cùng lúc thì nhận Tem của từng mốc. Mốc đã nhận không mất khi giá trị giảm (ví dụ cho nghỉ nhân viên cấp 3).

## Đơn đặc biệt

Nguồn: hằng số trong `src/sim/specialOrders.ts`.

| Luật | Giá trị |
| --- | --- |
| Có từ ngày | 2 (`SPECIAL_ORDER_FROM_DAY`) |
| Món | Một món đang bật và đủ nguyên liệu lúc bấm **Mở cửa** |
| Hạn | 13:00 hoặc 19:00 (`SPECIAL_ORDER_DEADLINES`) |
| Số phần cần | 3 + cấp quán / 2, làm tròn xuống: cấp 1 → 3, cấp 2–3 → 4, cấp 4–5 → 5, cấp 10 → 8 |
| Tính phần | Mỗi khách được phục vụ: +1 nếu đồ uống là món đó, +1 nếu món kèm là món đó |
| Thưởng | 60.000đ (`SPECIAL_ORDER_MONEY`; Dễ 54.000đ, Khó 69.000đ) và 2 Tem (`SPECIAL_ORDER_TICKETS`), nhận ngay lúc đủ |
| Hụt | Quá hạn hay hết ngày mà chưa đủ: không phạt |

Ngày không có món nào đủ điều kiện thì không có đơn. Bảng Việc hiện đơn, tiến độ và giờ hạn; xong hay hụt đều có toast.

## Khách VIP

| Luật | Giá trị |
| --- | --- |
| Có từ ngày | 3 (`VIP_FROM_DAY`) |
| Ngày có VIP | Khoảng 35% số ngày (`VIP_DAY_CHANCE`) |
| Ai là VIP | Khách đầu tiên vào cửa từ 10:00 (`VIP_FROM_MINUTE`) của ngày có VIP; mỗi ngày tối đa 1 |
| Kiên nhẫn | × 0,8 (`VIP_PATIENCE_MULT`) |
| Thưởng | 3 Tem (`VIP_TICKETS`) khi được phục vụ |

Khách VIP có ngôi sao trên đầu trong cảnh 3D; lúc vào cửa có toast "Khách VIP vừa tới!".

## Nhân viên: đặc điểm và cấp

Đặc điểm: `STAFF_TRAITS` trong `src/sim/data/staffTraits.ts`. Mỗi ứng viên có một đặc điểm cố định theo seed của ván và id.

| Id | Tên | Tác dụng |
| --- | --- | --- |
| `quick` | Nhanh nhẹn | Mọi việc nhanh hơn 6% |
| `barista_pro` | Tay pha cứng | Pha và nhận order nhanh hơn 10% |
| `tidy` | Gọn gàng | Dọn bàn và thu tiền nhanh hơn 12% |
| `charming` | Duyên dáng | Mang đồ nhanh hơn 10%; người tiếp thị kéo khách hơn 10% |

Cấp: hằng số trong `src/sim/staffGrowth.ts`.

| Lên cấp | Kinh nghiệm cần (`STAFF_LEVEL_EXP`, phút bận cộng dồn) | Tem (`TRAIN_TICKETS`) | Tốc độ ở cấp đó |
| --- | --- | --- | --- |
| 2 | 240 | 0 | +6% |
| 3 | 600 | 0 | +12% |
| 4 | 1.100 | 3 | +18% |
| 5 | 1.800 | 5 | +24% |

- Kinh nghiệm: +1 mỗi phút game nhân viên đang làm một việc, từ lúc mở cửa tới khi khách cuối rời quán; không tính lúc chuẩn bị và báo cáo. Từ 07:00 tới 20:00 là 780 phút game.
- Cấp chỉ lên khi bấm **Đào tạo** ở bảng Nhân viên, lúc chuẩn bị, khi đủ kinh nghiệm.
- Tiền đào tạo: 2 × lương ngày × cấp hiện tại, làm tròn 10.000đ. Ví dụ nhân viên lương 150.000đ cấp 1 → 300.000đ để lên cấp 2.
- Mỗi lần lên cấp, lương ngày × 1,08 (`PROMOTION_WAGE_MULT`), làm tròn 1.000đ.
- Tốc độ của cấp nhân với hệ số đặc điểm và hệ số Mức lương.

Số nhân viên tối đa: 6 (`BASE_MAX_STAFF`), thêm 1 ở Mở rộng diện tích cấp 3 và 1 ở cấp 4, tối đa 8 (`TOP_MAX_STAFF`).

## Mở rộng diện tích

Nguồn: `expand_area` trong `src/sim/data/upgrades.ts` (`baseCost` 5.000.000, `costGrowth` 2, `maxLevel` 2), `maxLevelBonus` trong `src/sim/data/levels.ts`. Cấp trên `maxLevel` đắt gấp 3 (`BONUS_LEVEL_PRICE_MULT`).

| Cấp | Mở khi | Giá Thường | Dễ | Khó | Thêm |
| --- | --- | --- | --- | --- | --- |
| 1 | Cấp quán 6, hoặc tặng sáng ngày 7 tuần 1 | 5.000.000đ | 4.500.000đ | 5.750.000đ | Phòng bên, 3 bàn (6 ghế) |
| 2 | Cùng cấp 1 | 10.000.000đ | 9.000.000đ | 11.500.000đ | 3 bàn |
| 3 | Cấp quán 7 | 60.000.000đ | 54.000.000đ | 69.000.000đ | 3 bàn, 1 chỗ nhân viên |
| 4 | Cấp quán 9 | 120.000.000đ | 108.000.000đ | 138.000.000đ | 3 bàn, 1 chỗ nhân viên |

Mỗi cấp còn +10% khách đến (`appeal` 0,1) và nới phòng bên thêm một cột bàn.

## Nội thất

Nguồn: `src/sim/data/upgrades.ts` (giá, hiệu ứng), `src/sim/data/levels.ts` (cấp mở). Nhóm Trang trí của bảng Nâng cấp; giá cấp 2 = giá cấp 1 × 1,5 (`costGrowth`).

| Id | Tên | Mở ở cấp quán | Cấp tối đa | Giá cấp 1 / cấp 2 (Thường) | Tem | Mỗi cấp: khách đến / sao |
| --- | --- | --- | --- | --- | --- | --- |
| `neon_sign` | Biển neon | 3 | 2 | 600.000đ / 900.000đ | — | +5% / +0,04 |
| `bookshelf` | Kệ sách | 4 | 2 | 800.000đ / 1.200.000đ | — | +4% / +0,06 |
| `record_player` | Máy hát đĩa | 6 | 1 | 1.500.000đ | 3 | +6% / +0,06 |
| `sofa_corner` | Góc sofa | 8 | 1 | 2.500.000đ | 5 | +8% / +0,05 |

- Góc sofa đặt trong phòng bên: cần Mở rộng diện tích cấp 1 trở lên.
- Cả bốn gỡ được bằng nút **Gỡ**: hoàn 50% tiền của cấp đó, không hoàn Tem.

## Save cũ

- Save vẫn là phiên bản 3; mọi trường mới là tùy chọn, save cũ tải và chơi tiếp không cần nâng.
- Save cũ có Tem 0, chưa nhận quà ngày nào, nhân viên ở cấp 1 với kinh nghiệm 0 và đặc điểm tính lại từ seed.
- Tổng khách đã phục vụ và tổng doanh thu cho thành tựu được tính lại từ các tuần và ngày đã lưu; các bộ đếm khác bắt đầu từ 0. Mốc đạt nhờ phần tính lại được trả Tem ở cuối ngày đầu tiên chơi tiếp.
