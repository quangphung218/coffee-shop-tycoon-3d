# Tháp cold brew, lò nướng và hai món theo cấp

Trang này ghi luật và con số của hai dụng cụ mở ở cấp quán 7–8 và hai món đi kèm. Số liệu lấy từ `src/sim/data/upgrades.ts`, `src/sim/data/menu.ts`, `src/sim/data/levels.ts` và `MENU_REQUIRES` trong `src/sim/upgrades.ts`; cách code chạy ở [architecture.md](../architecture.md#nâng-cấp-và-dụng-cụ).

- [Tổng quan](#tổng-quan)
- [Dụng cụ](#dụng-cụ)
- [Món](#món)
- [Điều kiện cần dụng cụ](#điều-kiện-cần-dụng-cụ)
- [Chỗ đặt trên quầy sau](#chỗ-đặt-trên-quầy-sau)
- [Save cũ](#save-cũ)

## Tổng quan

| Cấp quán | Dụng cụ mở | Món mở | Mở khác |
| --- | --- | --- | --- |
| 7 | `cold_brew_tower` Tháp cold brew | `cold_brew` Cold brew | Trần +1: máy cao cấp, máy xay hạt, mở rộng diện tích |
| 8 | `oven` Lò nướng | `cookie` Bánh quy sô-cô-la | Góc sofa; trần +1: bàn ghế, tủ bánh |

- Hai dụng cụ và hai món không có trong lịch tuần 1 (`WEEK_UNLOCKS`): chỉ mở theo cấp quán, kể cả từ tuần 2.
- `FULL_UNLOCK_LEVEL` vẫn là 6: cân bằng cấp 1–6 không đổi.
- Không thêm nguyên liệu mới.

## Dụng cụ

`category: 'equipment'`, `maxLevel` 2, `costGrowth` 1,6. Giá làm tròn tới 1.000 đ, nhân `priceMult` của độ khó.

| Dụng cụ | Cấp | Dễ (×0,9) | Vừa (×1) | Khó (×1,15) | Hiệu ứng mỗi cấp |
| --- | --- | --- | --- | --- | --- |
| Tháp cold brew | 1 | 1.620.000 đ | 1.800.000 đ | 2.070.000 đ | `coldBrewSpeed` +0,15 (đồ lạnh nhanh hơn 15%), `appeal` +0,05 (+5% khách) |
| Tháp cold brew | 2 | 2.592.000 đ | 2.880.000 đ | 3.312.000 đ | như cấp 1 |
| Lò nướng | 1 | 1.800.000 đ | 2.000.000 đ | 2.300.000 đ | `foodBrewSpeed` +0,2 (món ăn nhanh hơn 20%), `foodAppeal` +0,2 (+20% khách gọi và mua kèm món ăn) |
| Lò nướng | 2 | 2.880.000 đ | 3.200.000 đ | 3.680.000 đ | như cấp 1 |

Hiệu ứng cộng dồn với dụng cụ cũ: tháp cùng trường với máy xay sinh tố, lò cùng trường với tủ bánh.

## Món

Giá vốn tính theo giá gốc nguyên liệu (`ingredientCost`), chưa tính máy làm đá và sự kiện ngày.

| Món | Loại | Nóng/lạnh | Nguyên liệu mỗi phần | Giá vốn | Giá bán | Lãi mỗi phần | Pha (phút) | Phổ biến |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cold brew | drink | cold | 22 g cà phê hạt, 150 g đá, 1 ly | 8.550 đ | 40.000 đ | 31.450 đ (79%) | 2 | 0,6 |
| Bánh quy sô-cô-la | food | hot | 50 g bột bánh, 20 g bơ, 15 g đường, 8 g cacao | 10.075 đ | 30.000 đ | 19.925 đ (66%) | 2 | 0,5 |

Cold brew có cà phê nên máy xay hạt cũng tăng tốc; là đồ lạnh nên máy xay sinh tố và tháp tăng tốc. Bánh quy là món ăn nên tủ bánh và lò tăng tốc.

## Điều kiện cần dụng cụ

| Món | Cần | Bật món khi thiếu | Mua cấp 1 dụng cụ |
| --- | --- | --- | --- |
| Cold brew | Tháp cold brew ≥ 1 | `set_menu_item` trả `false`, `notify` lỗi "Cần Tháp cold brew" | Món tự bật, `notify` info "Món mới: Cold brew đã lên Menu" |
| Bánh quy sô-cô-la | Lò nướng ≥ 1 | `set_menu_item` trả `false`, `notify` lỗi "Cần Lò nướng" | Món tự bật, `notify` info "Món mới: Bánh quy sô-cô-la đã lên Menu" |

| Trường hợp | Kết quả |
| --- | --- |
| Món chưa mở khóa theo cấp | Báo "… chưa mở khóa ở cấp quán này" trước, không xét dụng cụ |
| Tắt món | Luôn được, không cần dụng cụ |
| Mua cấp 2 | Không bật lại món, không báo lại |
| Mua dụng cụ khi món chưa mở khóa (chỉ qua `buyUpgrade` trực tiếp) | Món giữ tắt, không báo |
| Gỡ dụng cụ | Không có: dụng cụ không gỡ được, điều kiện không mất |

## Chỗ đặt trên quầy sau

`EQUIPMENT_SPOTS` và `MACHINE_SIZE` ở `src/sim/upgrades.ts` và `src/sim/nav/footprints.ts`; mọi máy cùng z = −3,3.

| Máy | x | Rộng × sâu | Nằm giữa |
| --- | --- | --- | --- |
| Lò nướng | −2,97 | 0,5 × 0,5 | Đầu trái quầy sau và máy xay hạt (−2,45) |
| Tháp cold brew | −0,32 | 0,28 × 0,4 | Máy espresso (−1) và máy 2 group thứ nhất (0,2) |

- Quầy sau không bắt đầu xa hơn `BACK_COUNTER_MIN_X` = −3,45 bên trái, để tránh chậu cây góc trái sau. Đây cũng là mép trái khi có máy xay hạt, nên quầy của quán cũ không đổi.
- Không hai máy nào chồng nhau ở mọi tổ hợp máy và cấp, tới cấp quán 10 (`tests/sim/equipment.test.ts`, `tests/sim/p31-equipment.test.ts`). Lối nhân viên giữa hai quầy không đổi.

## Save cũ

`SAVE_VERSION` vẫn là 3. Save cũ khi nạp được thêm hai món mới ở trạng thái tắt (`src/save/save.ts`); `state.upgrades` không có hai dụng cụ thì coi là cấp 0.
