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

Đường cơ sở (trước) là `b_steady2`: không bao giờ mua phong cách, nên Tem chỉ tích lũy. `b2_styles` (sau, mới ở T-93) được dựng từ `b_steady2` và mua phong cách theo mùa. `d_manage` chỉ là tham chiếu thứ hai (cũng không mua). Độ khó Normal, 40 tuần, seed 1/42/7/2026.

Tem cuối tuần 40:

| Chiến lược | Tem cuối tuần 40 (seed 1/42/7/2026) | Ghi chú |
| --- | --- | --- |
| `b_steady2` | 945 / 955 / 903 / 917 | không mua phong cách |
| `b2_styles` | 65 / 75 / 23 / 37 | mua 10 phong cách trong 3 mùa (0, 1, 2) |

- `b2_styles` giống hệt `b_steady2` trong 23 tuần đầu (trước mùa đầu tiên).
- `d_manage` không bao giờ mua. Tem cuối seed 1 là 1001, seed 42 là 990.

Tem theo tuần, `b_steady2` (trước) và `b2_styles` (sau), seed 1 và 42 (dòng "normal sN <bot> Tem by week" của longsim, qua báo cáo reviewer). `b_steady2` giống hệt `b2_styles` đến hết tuần 23, nên các tuần đó ghi một số chung. Tuần 24-39 của `b_steady2` không có trong báo cáo, chỉ có tuần 40 (945 / 955).

| Tuần | s1 `b_steady2` | s1 `b2_styles` | s42 `b_steady2` | s42 `b2_styles` |
| --- | --- | --- | --- | --- |
| 1 | 34 | 34 | 35 | 35 |
| 2 | 67 | 67 | 68 | 68 |
| 3 | 77 | 77 | 82 | 82 |
| 4 | 86 | 86 | 87 | 87 |
| 5 | 118 | 118 | 107 | 107 |
| 6 | 134 | 134 | 118 | 118 |
| 7 | 149 | 149 | 131 | 131 |
| 8 | 158 | 158 | 144 | 144 |
| 9 | 180 | 180 | 168 | 168 |
| 10 | 205 | 205 | 193 | 193 |
| 11 | 231 | 231 | 222 | 222 |
| 12 | 259 | 259 | 240 | 240 |
| 13 | 285 | 285 | 262 | 262 |
| 14 | 307 | 307 | 288 | 288 |
| 15 | 343 | 343 | 314 | 314 |
| 16 | 383 | 383 | 340 | 340 |
| 17 | 401 | 401 | 350 | 350 |
| 18 | 414 | 414 | 382 | 382 |
| 19 | 431 | 431 | 411 | 411 |
| 20 | 449 | 449 | 439 | 439 |
| 21 | 475 | 475 | 442 | 442 |
| 22 | 483 | 483 | 471 | 471 |
| 23 | 512 | 512 | 498 | 498 |
| 24 | n/a | 213 | n/a | 210 |
| 25 | n/a | 239 | n/a | 220 |
| 26 | n/a | 241 | n/a | 252 |
| 27 | n/a | 267 | n/a | 280 |
| 28 | n/a | 301 | n/a | 309 |
| 29 | n/a | 317 | n/a | 337 |
| 30 | n/a | 341 | n/a | 358 |
| 31 | n/a | 370 | n/a | 373 |
| 32 | n/a | 82 | n/a | 83 |
| 33 | n/a | 101 | n/a | 109 |
| 34 | n/a | 131 | n/a | 136 |
| 35 | n/a | 157 | n/a | 165 |
| 36 | n/a | 188 | n/a | 200 |
| 37 | n/a | 214 | n/a | 232 |
| 38 | n/a | 249 | n/a | 269 |
| 39 | n/a | 278 | n/a | 295 |
| 40 | 945 | 65 | 955 | 75 |

Tem `d_manage` theo tuần (tham chiếu thứ hai, số từ báo cáo của builder):

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

## Longsim trước và sau

- Chạy Normal, 4 seed (1/42/7/2026), 40 tuần.
- Dòng tóm tắt của `b_steady2` và `d_manage` giống hệt đường cơ sở v0.36.0+T-92: 28 dòng tóm tắt/mốc giống hệt (báo cáo reviewer T-93).
- Lời hứa E-21: 6/6 assert đạt trên Normal, 4 seed (báo cáo reviewer T-93).
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
