# E-26: Phong cách theo mùa (chỗ tiêu Tem sau tuần 28)

Sau tuần 28 Tem chất đống mà không có chỗ tiêu. E-26 thêm các phong cách theo mùa, trả chủ yếu bằng Tem. Báo cáo này ghi lại danh sách mùa, số đo Tem theo tuần, kết quả longsim trước/sau, khối UI "Mùa này", tương thích save và các mục chưa kiểm chứng.

## Thiết kế

- Định nghĩa ở `src/sim/data/seasons.ts` (`SEASONAL_STYLES`, `SEASON_SETS`, `seasonFor`). Mọi thứ là hàm thuần của số tuần.
- `seasonFor(week)` trả `null` trước tuần 24 (`SEASON_FIRST_WEEK`). Từ tuần 24, mỗi mùa dài 8 tuần (`SEASON_WEEKS`).
- 3 bộ, mỗi bộ 3-4 phong cách, xoay vòng theo thứ tự xuân, hè, thu. Bộ bỏ lỡ quay lại sau 3 mùa.
- Chỉ đổi màu (`color`, `accent`) như phong cách E-17. Không thêm mesh hay vật liệu.
- Chỉ bán trong mùa của nó (`styleOnSale`). Đã mua thì giữ mãi.
- Giá Tem 70-110. Biển hiệu tốn thêm 5M tiền, các ô khác 0 tiền.

## Danh sách mùa

Đọc từ `src/sim/data/seasons.ts`. Tuần của mùa lặp lại: mùa 3 (tuần 48-55) lại là Mùa xuân, v.v.

| Mùa | Tuần (lượt đầu) | Ô | Id | Tên | Tiền | Tem |
| --- | --- | --- | --- | --- | --- | --- |
| Mùa xuân (bộ 0) | 24-31 | Tường | `wall_peach` | Tường hoa đào | 0 | 70 |
| | | Sàn | `floor_jade` | Gạch ngọc bích | 0 | 80 |
| | | Biển | `sign_lacquer` | Biển sơn mài | 5M | 90 |
| | | Mái hiên | `awning_apricot` | Mái hiên hoa mai | 0 | 80 |
| Mùa hè (bộ 1) | 32-39 | Tường | `wall_seafoam` | Tường xanh biển | 0 | 100 |
| | | Biển | `sign_lagoon` | Biển đầm phá | 5M | 110 |
| | | Mái hiên | `awning_sunset` | Mái hiên hoàng hôn | 0 | 110 |
| Mùa thu (bộ 2) | 40-47 | Tường | `wall_maple` | Tường lá phong | 0 | 75 |
| | | Sàn | `floor_walnut` | Sàn gỗ óc chó | 0 | 80 |
| | | Biển | `sign_lantern` | Biển đèn lồng | 5M | 85 |
| | | Mái hiên | `awning_harvest` | Mái hiên mùa gặt | 0 | 80 |

Tổng 11 phong cách theo mùa.

## Tem theo tuần, trước và sau

Chiến lược `d_manage` (trước) không bao giờ mua phong cách, nên Tem chỉ tích lũy. Chiến lược `b2_styles` (sau, mới ở T-93) mua phong cách theo mùa. Độ khó Normal, 40 tuần, seed 1/42/7/2026.

Tem cuối tuần 40:

| Chiến lược | Tem cuối tuần 40 (seed 1/42/7/2026) | Ghi chú |
| --- | --- | --- |
| `b_steady2` | 945 / 955 / 903 / 917 | không mua phong cách |
| `b2_styles` | 65 / 75 / 23 / 37 | mua 10 phong cách trong 3 mùa (0, 1, 2) |

- `b2_styles` giống hệt `b_steady2` trong 23 tuần đầu (trước mùa đầu tiên).
- `d_manage` không bao giờ mua. Tem cuối seed 1 là 1001, seed 42 là 990.

Tem `d_manage` theo tuần (số từ báo cáo của builder):

| Tuần | Seed 1 | Seed 42 | Tuần | Seed 1 | Seed 42 |
| --- | --- | --- | --- | --- | --- |
| 1 | 12 | 15 | 21 | 459 | 463 |
| 2 | 13 | 10 | 22 | 487 | 492 |
| 3 | 20 | 8 | 23 | 516 | 521 |
| 4 | 3 | 6 | 24 | 541 | 553 |
| 5 | 41 | 38 | 25 | 572 | 584 |
| 6 | 54 | 57 | 26 | 595 | 614 |
| 7 | 66 | 84 | 27 | 617 | 642 |
| 8 | 91 | 98 | 28 | 651 | 668 |
| 9 | 115 | 122 | 29 | 675 | 697 |
| 10 | 142 | 155 | 30 | 701 | 718 |
| 11 | 170 | 182 | 31 | 730 | 736 |
| 12 | 198 | 200 | 32 | 762 | 766 |
| 13 | 227 | 228 | 33 | 787 | 790 |
| 14 | 253 | 256 | 34 | 819 | 819 |
| 15 | 289 | 280 | 35 | 845 | 842 |
| 16 | 327 | 309 | 36 | 876 | 875 |
| 17 | 354 | 336 | 37 | 902 | 907 |
| 18 | 382 | 368 | 38 | 940 | 940 |
| 19 | 409 | 412 | 39 | 968 | 966 |
| 20 | 427 | 434 | 40 | 1001 | 990 |

Báo cáo của builder không có Tem theo từng tuần của `b2_styles`, chỉ có giá trị cuối tuần 40 ở trên.

## Longsim trước và sau

- Chạy Normal, 4 seed (1/42/7/2026), 40 tuần.
- Dòng tóm tắt của `b_steady2` và `d_manage` giống hệt đường cơ sở v0.36.0+T-92 (so 28 dòng).
- Lời hứa E-21: 6/6 assert đạt.
- `b2_styles` (T-93) chạy cả ở Easy và Hard (7 bot thay vì 6, thêm khoảng 1/6 thời gian mô phỏng), nhưng chỉ được assert ở Normal. Thời gian Easy/Hard chưa đo.
- Thời gian chạy Normal 4 seed: đường cơ sở 582s so với task 490s. Số đo nhiễu, không dùng để kết luận về tốc độ.

## Khối "Mùa này" (T-94)

- Khối trong panel Phong cách quán, hiển thị mùa đang chạy theo `seasonFor` và các phong cách đang bán.
- Xem lại chi tiết ở T-94; báo cáo này không thêm số đo mới cho khối.

## Tương thích save

- `SAVE_VERSION` vẫn là 7, không migration.
- Save v7 cũ giữ nguyên các phong cách đã mua.
- Mùa tính từ số tuần nên không lưu thêm trạng thái.

## Kiểm tra đã chạy

- Test: 193 file / 2397 test (T-94: 2397) đạt. `tsc` và `vite build` đạt.
- Layout offline: 38/38, gồm cả 390px (chỉ với `LAYOUT_OFFLINE=1`).

## Chưa kiểm chứng

- **Layout:** `npm run layout` đầy đủ không chạy được trong sandbox. 38/38 ở trên chỉ là kiểm tra `LAYOUT_OFFLINE=1` cho phong cách, KHÔNG tương đương.
- **Hiệu năng (`npm run perf:frames`):** không chạy được trong sandbox, không có số khung hình.
- **Media (`npm run media`):** không chạy được trong sandbox, không có ảnh chụp.
- **Thời gian longsim Easy/Hard** với `b2_styles`: chưa đo.

### Chủ dự án cần chạy

```
npm run layout
npm run perf:frames
npm run media
```

## Khoảng trống đã biết

- Xem trước phong cách theo mùa có thể còn lại (cũ) sau khi mùa kết thúc, và lúc đó không mua được vì `styleOnSale` trả false.

## Test chập chờn

- Không ghi nhận test chập chờn nào trong E-26.
