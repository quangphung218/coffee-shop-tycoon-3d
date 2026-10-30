# P23: kinh tế dài hạn và cấp quán 7–10

Mô phỏng 56 ngày (8 tuần) ở 3 độ khó × 3 chiến lược × 3 seed. Báo cáo này ghi số đo và lý do chọn mục tiêu tuần, thưởng cúp và cấp 7–10. Bảng 4 tuần cũ (trước E-05) đã xóa vì lỗi thời; số hiện tại ở mục "Đã sửa ở E-12".

## Chạy lại

```sh
npx vitest run tests/integration/p23-long-run.test.ts --reporter=verbose
```

Test chạy khoảng 60–125 giây (giới hạn 3 phút; trước E-12 là 69 giây), in bảng trung bình theo tuần và bảng từng seed, rồi kiểm:

- Tiền không bao giờ âm, không phá sản.
- Chơi lại cùng seed ra cùng số.
- Điểm `c_spend` đạt 3 cúp ở tuần 5–8 trong 12/12 ván mỗi độ khó; `b_steady` không đạt 3 cúp ở toàn bộ ván tuần 5–8 (assert: dưới 100%; đo được 0/12); `a_basic` giữ ít nhất 1 cúp (từ E-12; trước đó cả `b_steady` cũng 12/12).
- `b_steady` có ít nhất 2 cúp ở ≥ 75% ván tuần 2–8 mỗi độ khó (đo được: Dễ 20/21, Thường 21/21, Khó 21/21).

## Chiến lược

Mỗi sáng mọi chiến lược bật món đã mở và nhập hàng theo gợi ý.

| Chiến lược | Cách chơi |
| --- | --- |
| `a_basic` | Tự phục vụ một mình, không thuê, không mua nâng cấp. |
| `c_spend` | Thuê 1 barista ngày 1; mỗi sáng mua nâng cấp hay dụng cụ rẻ nhất đang mở, lặp tới khi tiền chỉ còn đủ lương tối nay và hàng nhập ngày mai. |
| `b_steady` | Từ E-12: barista từ ngày 2, giá Chuẩn, không marketing; cứ 3 ngày một lần vào mục Nâng cấp, mua tối đa 1 món rẻ nhất có ảnh hưởng doanh thu; không mở thêm dụng cụ sau ngày 7. (Trước E-12: 1 barista ngày 1, mua nâng cấp khi tiền ≥ 2 lần giá, giữ quỹ lương, thuê mặt bằng và nhập hàng.) |

Seed 1, 42, 777.

## Lý do chọn số

| Số | Giá trị | Lý do |
| --- | --- | --- |
| `WEEK_GOAL_GROWTH` | 0,5/tuần | Với 20%/tuần cũ, a vẫn 3 cúp ở tuần 2 (điểm 95–98). Muốn a dưới 90 điểm ở tuần 2, mục tiêu Dễ phải trên 37 triệu, Khó trên 32 triệu, tức khoảng ×1,4–1,5. Chọn ×1,5: a được 83–87 điểm (2 cúp), cao nhất 87 ở Khó seed 777. (Bản cũ; đường mục tiêu nay ở mục E-12.) |
| `WEEK_GOAL_MAX_MULT` | 3 | Bản cũ, đã bỏ: từ tuần 5 mục tiêu từng được chặn ở ×3. Nay không có trần (xem E-12). |
| `WEEK_REWARDS` | Dễ 1/1,5 · Thường 1,5/2,25 · Khó 2/3 triệu cho 2/3 cúp | Khoảng 5–15% lãi tuần của a: đủ thấy, không đổi nhịp mua sắm. Khó trả nhiều hơn vì giá cao hơn và khó đạt cúp hơn. 3 cúp trả gấp rưỡi 2 cúp. |
| Ngưỡng XP cấp 7–10 | 27.000 · 37.000 · 49.000 · 63.000 | Bước tăng 8k, 10k, 12k, 14k nối tiếp bước của cấp 2–6 (1,1k … 7k). c đạt khoảng 7.800 XP/tuần ở Dễ, 6.000 ở Thường, 4.500 ở Khó: Dễ lên cấp 7 trong tuần 4, Thường khoảng tuần 5, cấp 10 rơi vào khoảng tuần 8–11. |
| `maxLevelBonus` (bản trước E-05; nay thay bằng 21 cấp thêm ở cấp quán 4–10, xem [p27-retention.md](../spec/p27-retention.md#cấp-thêm-và-đồ-cao-cấp-e-05)) | 7: máy cao cấp, máy xay hạt · 8: bàn ghế, tủ bánh · 9: đèn, máy sinh tố · 10: máy cao cấp, máy rửa ly | Lý do của bản trước E-05, nay không còn đúng với cây, tranh và mở rộng (đã có cấp thêm). Chỉ chọn nâng cấp mà cấp thêm không cần model mới hay chỗ đặt mới: máy và dụng cụ chỉ đổi hiệu ứng, model máy đã chặn ở bậc cao nhất; bàn thứ 7 lấy chỗ trống cuối cùng trong phòng; đèn thứ 3 treo trên bàn trong cùng hàng đầu. Không chọn: máy 2 group (máy thứ 4 đè máy rửa ly), cây và tranh (hết chỗ), quầy bar cửa sổ (hết chỗ bàn), mở rộng và ngoài trời (thêm khu mới), máy làm đá (đã giảm 90%). |
| ~~`BONUS_LEVEL_PRICE_MULT`~~ (bản trước E-05; hằng số đã bỏ, giá nay ghi từng cấp trong `extraLevels`) | 3 | Ở giá thường, 8 cấp thêm tốn khoảng 38 triệu ở Thường, dưới một tuần lãi của c. Nhân 3 thành khoảng 113 triệu: c ở Dễ chi 30 triệu ngay khi lên cấp 7 và vẫn phải dành tiền cho các cấp sau. |

## Đã sửa ở E-05

Vấn đề: c hết đồ để mua từ tuần 3 (`buyable` = 0 ở Dễ và Thường) và dồn tiền thành đống. E-05 thay phần thưởng cấp quán 4–10 bằng 21 cấp thêm có giá và hiệu ứng riêng, cộng 4 đồ trang trí cao cấp, và thêm hiệu ứng `priceBonus` (giá bán mọi món). Danh sách đầy đủ ở [p27-retention.md](../spec/p27-retention.md#cấp-thêm-và-đồ-cao-cấp-e-05). Số dưới đây là trung bình 3 seed của `c_spend`, in từ `p23-long-run.test.ts`; trong ngoặc là `a_basic`.

| Chỉ số | Độ khó | Trước | Sau |
|---|---|---|---|
| `spent` tuần 3 | Dễ | 1,35 triệu | 29,6 triệu |
| | Thường | 3,33 triệu | 36,0 triệu |
| | Khó | 36,4 triệu | 43,6 triệu |
| `spent` tuần 4 | Dễ | 88,5 triệu | 46,7 triệu |
| | Thường | 1,5 triệu | 29,5 triệu |
| | Khó | 0 | 31,8 triệu |
| `buyable` cuối tuần 2 / tuần 3 | Dễ | 0 / 0 | 1,3 / 1,0 |
| | Thường | 0,3 / 0 | 4,0 / 1,0 |
| | Khó | 5,3 / 0 | 5,3 / 2,3 |
| Tiền cuối tuần 4 | Dễ | 93,6 triệu | 169,5 triệu (89,5 triệu) |
| | Thường | 142,3 triệu | 137,9 triệu (77,8 triệu) |
| | Khó | 82,6 triệu | 67,7 triệu (57,8 triệu) |

- Từ tuần 3, c còn thứ để mua ở cả ba độ khó, chi đều hơn giữa tuần 3 và 4 thay vì một cú 88,5 triệu ở Dễ tuần 4.
- Hard seed 777 là seed sát nhất: biên 1,7 triệu.
- `p22-strategies.test.ts` không đổi, vẫn đạt.
- Hoàn vốn của các món có `priceBonus` khoảng 0,78–1,97 tuần.
- Bốn đồ trang trí chưa có model 3D.
- Các cấp thêm ở cấp quán 4–6 là chủ ý thiết kế, không phải thiếu sót.
- `BONUS_LEVEL_PRICE_MULT` (×3) ở bảng "Lý do chọn số" là số của bản trước E-05; giá cấp thêm nay ghi thẳng từng cấp trong `extraLevels`.

Các số "Sau" đã kiểm bằng cách chạy `p23-long-run`. Các số "Trước" lấy từ lần đo gốc của epic ở commit a2a5206 và chưa chạy lại.

## Đã sửa ở E-07

Vấn đề: lợi nhuận tuần trừ đủ tiền nâng cấp trong tuần mua, nên quán chi tiền tái đầu tư ở tuần 2 (`c_spend` 57–62 điểm) điểm thấp hơn quán không mua gì (`a_basic` 67–71), rồi vọt lên 100 ở tuần 3–4 khi mục tiêu tăng chậm. E-07 sửa hai chỗ trong `src/sim/week.ts` và `src/sim/data/week.ts`:

- Tiền nâng cấp mua từ tuần 2 chia đều 2 tuần (`UPGRADE_AMORTIZE_WEEKS` = 2: tuần mua và tuần kế tiếp). Tuần 1 vẫn trừ đủ (đã đổi ở E-11). Tuần đã chấm theo luật cũ không có `upgradeCharge` và không tính lại; không đổi `SAVE_VERSION`.
- Mục tiêu doanh thu tuần 2–4 là bội của tuần 1 (`WEEK_GOAL_MULTS`) thay cho `WEEK_GOAL_GROWTH` 0,6 (bội số E-07 đã bị thay ở E-11).
- Màn Tổng kết tuần có khối "Lợi nhuận tuần" ghi luật tính.

Điểm tuần 2 / 3 / 4, trung bình 3 seed, trước -> sau, in từ `p23-long-run.test.ts` (số E-07, lịch sử):

| Độ khó | Chiến lược | Trước | Sau |
|---|---|---|---|
| Dễ | `a_basic` | 67,3 / 55,3 / 47,0 | 60,0 / 42,0 / 41,0 |
| | `c_spend` | 59,0 / 100 / 100 | 97,7 / 82,0 / 97,3 |
| Thường | `a_basic` | 71,0 / 58,7 / 49,0 | 63,0 / 44,0 / 43,0 |
| | `c_spend` | 61,7 / 98,0 / 100 | 99,0 / 81,0 / 97,3 |
| Khó | `a_basic` | 70,0 / 58,0 / 47,0 | 62,0 / 48,7 / 41,3 |
| | `c_spend` | 57,0 / 58,0 / 96,7 | 90,7 / 64,0 / 82,3 |

## Đã sửa ở E-11

Vấn đề: tuần 1 trừ đủ tiền nâng cấp trong lợi nhuận nên điểm tuần 1 và tuần 2 lệch nhau, và đường mục tiêu E-07 (nhảy ×1,9 rồi ×3,5, chặn trần) làm điểm `c_spend` lên xuống mạnh. E-11 sửa ở `src/sim/week.ts` và `src/sim/data/week.ts`:

- Tuần 1 chia nhỏ tiền nâng cấp như các tuần sau: 2 tuần (Dễ, Thường), 3 tuần ở Khó (`UPGRADE_AMORTIZE_WEEKS_BY_DIFFICULTY`).
- Đường mục tiêu mượt hơn, bội của tuần 1 (`WEEK_GOAL_MULTS`), sau đó cộng thêm mỗi tuần, không có trần (`WEEK_GOAL_LATE_GROWTH`). Bảng dưới là số E-11 (v0.22.0, lịch sử), đã thay ở E-12:

  | Độ khó | Tuần 1 / 2 / 3 / 4 | Từ tuần 5 |
  | --- | --- | --- |
  | Dễ | 1 / 1,7 / 2,4 / 2,9 | +0,15/tuần |
  | Thường | 1 / 1,7 / 2,3 / 2,8 | +0,15/tuần |
  | Khó | 1 / 1,65 / 2,3 / 2,8 | +0,10/tuần |

- Kiểm tra tụt điểm bắt đầu ở tuần 2→3; tuần 1→2 vẫn có thể tụt tới 18 điểm ở Dễ.
- Hai chỗ riêng của Khó (chia 3 tuần và tuần 2 ×1,65) là lệch so với thiết kế gốc, người builder chọn và review chấp nhận: không đường mục tiêu nào khác giữ `c_spend` Khó trong 10 điểm ở tuần 2→3. Phương án dự phòng là nới kiểm tra tụt điểm.
- (Trước E-12, v0.22.0; đã thay ở E-12, xem mục "Đã sửa ở E-12") Quyết định Q-05, phương án A: bỏ assert "3 cúp < 100%"; thay bằng `c_spend` và `b_steady` đạt 3 cúp ở tuần 5–8 trong 12/12 ván mỗi độ khó, `a_basic` giữ ≥ 1 cúp, `b_steady` ≥ 2 cúp ở 21/21 ván tuần 2–8.
- Chiến lược `e_marketing` được thay bằng `b_steady` trong test. Không phá sản ở ván nào.
- Chữ luật ở màn Tổng kết tuần (`weekProfitRule`) nay ghi số tuần theo độ khó.

Điểm tuần trung bình 3 seed (1, 42, 777), tuần 1 → 8 (số E-11, v0.22.0, lịch sử: `b_steady` cũ giống `c_spend`; đã thay bằng bảng ở mục "Đã sửa ở E-12"):

| Độ khó | Chiến lược | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
|---|---|---|---|---|---|---|---|---|---|
| Dễ | `a_basic` | 89 | 65 | 52 | 46 | 44 | 44 | 43 | 42 |
| | `c_spend` | 100 | 89 | 97 | 100 | 100 | 100 | 100 | 100 |
| | `b_steady` | 100 | 90 | 97 | 100 | 100 | 100 | 100 | 100 |
| Thường | `a_basic` | 93 | 68 | 57 | 49 | 47 | 46 | 45 | 44 |
| | `c_spend` | 100 | 92 | 97 | 100 | 100 | 100 | 100 | 100 |
| | `b_steady` | 100 | 92 | 97 | 100 | 100 | 100 | 100 | 100 |
| Khó | `a_basic` | 85 | 68 | 56 | 47 | 47 | 46 | 44 | 44 |
| | `c_spend` | 98 | 100 | 93 | 95 | 100 | 100 | 100 | 100 |
| | `b_steady` | 98 | 100 | 95 | 94 | 100 | 100 | 100 | 100 |

## Đã sửa ở E-12

Vấn đề: ở v0.22.0 `b_steady` (chiến lược "chơi thong thả") ra cùng chi tiêu và cùng tiền cuối với `c_spend`, nên hai chiến lược không phân biệt được và 3 cúp tuần 5–8 đạt 12/12 cả hai. Người chơi thư giãn không nên được 3 cúp như người tối ưu.

Đổi ở `src/sim/data/week.ts` và test p23:

- `b_steady` viết lại: barista từ ngày 2, giá Chuẩn, mỗi 3 ngày một lần vào mục Nâng cấp mua tối đa 1 món rẻ nhất có ảnh hưởng doanh thu, không marketing, không mở thêm dụng cụ sau ngày 7. Có assert tổng chi nâng cấp tuần 1–8 của `b_steady` ≤ 50% của `c_spend` ở mỗi độ khó (đo được 3% / 4% / 4%). Tiền cuối chỉ được đo, không có assert.
- Đường mục tiêu mới (`WEEK_GOAL_MULTS`), sau tuần 4 cộng +0,1/tuần (`WEEK_GOAL_LATE_GROWTH`), mục tiêu không bao giờ giảm:

  | Độ khó | Tuần 1 / 2 / 3 / 4 | Từ tuần 5 |
  | --- | --- | --- |
  | Dễ | 1 / 1,7 / 2,2 / 2,35 | +0,1/tuần |
  | Thường | 1 / 1,7 / 2,2 / 2,4 | +0,1/tuần |
  | Khó | 1 / 1,65 / 2,1 / 2,25 | +0,1/tuần |

- Luật 30/10 của chủ quán: người chơi thư giãn đạt 2 cúp; muốn 3 cúp phải tối ưu.
- Kiểm 3 cúp tuần 5–8 chỉ áp cho `c_spend`.
- Không đổi: tiền thuê, giá nâng cấp, luật phá sản, `WEEK_REWARDS`.

Điểm / cúp trung bình 3 seed (1, 42, 777), tuần 1 → 8, in từ `p23-long-run.test.ts`:

| Độ khó | Chiến lược | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
|---|---|---|---|---|---|---|---|---|---|
| Dễ | `a_basic` | 89,0 / 2,33 | 64,7 / 1,00 | 55,3 / 1,00 | 52,0 / 1,00 | 50,7 / 1,00 | 49,7 / 1,00 | 48,7 / 1,00 | 47,3 / 1,00 |
| | `b_steady` | 100 / 3,00 | 91,7 / 2,67 | 79,7 / 2,00 | 75,7 / 2,00 | 76,7 / 2,00 | 75,7 / 2,00 | 73,3 / 2,00 | 72,0 / 1,67 |
| | `c_spend` | 100 / 3,00 | 88,7 / 2,33 | 99,7 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 |
| Thường | `a_basic` | 93,0 / 2,67 | 68,0 / 1,33 | 58,7 / 1,00 | 53,3 / 1,00 | 52,7 / 1,00 | 51,0 / 1,00 | 50,0 / 1,00 | 49,0 / 1,00 |
| | `b_steady` | 100 / 3,00 | 94,0 / 3,00 | 83,7 / 2,00 | 77,0 / 2,00 | 80,0 / 2,00 | 78,7 / 2,00 | 77,3 / 2,00 | 77,0 / 2,00 |
| | `c_spend` | 100 / 3,00 | 91,7 / 2,67 | 98,0 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 |
| Khó | `a_basic` | 85,0 / 2,00 | 68,3 / 1,33 | 59,3 / 1,00 | 53,7 / 1,00 | 53,3 / 1,00 | 52,0 / 1,00 | 50,3 / 1,00 | 49,0 / 1,00 |
| | `b_steady` | 97,7 / 3,00 | 90,0 / 2,67 | 80,7 / 2,00 | 77,0 / 2,00 | 80,7 / 2,00 | 81,0 / 2,00 | 79,3 / 2,00 | 77,7 / 2,00 |
| | `c_spend` | 98,3 / 3,00 | 100 / 3,00 | 97,7 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 | 100 / 3,00 |

Các chỉ số khác:

- `c_spend` đạt 3 cúp tuần 5–8 ở 12/12 ván (100%) mỗi độ khó; `b_steady` 0/12.
- `b_steady` có ít nhất 2 cúp ở tuần 2–8: Dễ 20/21, Thường 21/21, Khó 21/21.
- Tiền nâng cấp của `b_steady` so với `c_spend`: Dễ 3% (29.523k so với 967.986k), Thường 4% (31.902k so với 892.743k), Khó 4% (34.614k so với 815.855k).
- Tiền cuối tuần 8 trung bình (Dễ / Thường / Khó): `a_basic` 174k / 149k / 112k, `b_steady` 297k / 256k / 191k, `c_spend` 830k / 625k / 383k.
- Thời gian chạy p23: khoảng 60–125 giây (trước 69 giây), dưới giới hạn 3 phút.

## Đã sửa ở E-13

Vấn đề: Tem kiếm được không có chỗ tiêu. Ở cuối tuần 4, `c_spend` kiếm khoảng 116–130 Tem mà tiêu 0–3 (số tiêu trước E-13 lấy từ brief E-13, không chạy lại), vì Tem nằm ở máy espresso cao cấp cấp 4 (30 triệu + 150 Tem, đắt hơn cả cấp 5) và các món khác xa tầm. E-13 chuyển Tem sang đồ trang trí rẻ, mở sớm, và rẻ lại cấp 4 của máy. Danh sách ở [p27-retention.md](../spec/p27-retention.md#tem).

Đổi ở `src/sim/data/upgrades.ts` (T-34), UI ở T-35:

| Nâng cấp | Trước E-13 | Sau E-13 |
| --- | --- | --- |
| Máy espresso cao cấp cấp 4 | 30 triệu + 150 Tem, +17% giá bán | 10 triệu, không Tem, +6% giá bán (cấp 5: 12 triệu, cấp 6: 14 triệu) |
| Đèn trang trí cấp 1 / 2 / 3 | không Tem | 10 / 12 / 15 Tem |
| Cây xanh cấp 2 / 3 / 4 / 5 | không Tem | 12 / 12 / 15 / 20 Tem |
| Tranh treo tường cấp 2 / 3 / 4 | không Tem | 12 / 12 / 15 Tem |
| Cây xanh, Tranh treo tường cấp 1 | không Tem | không Tem |
| Thêm bàn ghế cấp 7 | 11 triệu | 10 triệu (hoàn vốn e05 từ 2,38 xuống 2,16 tuần) |

Dụng cụ không bao giờ cần Tem. Trong mỗi nâng cấp, cấp sau không rẻ hơn cấp trước cả về tiền lẫn Tem.

Tem kiếm và tiêu tới hết tuần 4 (p23, khoảng thấp nhất–cao nhất theo seed và độ khó; 3 seed × 3 độ khó; cột Kiếm và Tiêu sau là số sau E-13, cột Tiêu trước là số từ brief E-13, không chạy lại):

| Chiến lược | Kiếm | Tiêu trước | Tiêu sau |
| --- | --- | --- | --- |
| `c_spend` | 116–130 | 0–3 | 100–123 (83–95%) |
| `b_steady` | khoảng 110–122 | 0 | 34 (28–31%) |
| `a_basic` | khoảng 81–98 | 0 | 0 (không đổi, chỉ dùng dụng cụ) |

- Assert mới ở p23: `c_spend` tiêu ≥ 50% số Tem kiếm, `b_steady` ≥ 25%. `data.test` kiểm `extraLevels` không rẻ đi (tiền và Tem) theo cấp.
- `p22-strategies.test.ts` không đổi: 3 cốc Dễ 21/30, Thường 12/30, Khó 0/30; `f` phá sản 0/6, 6/6, 6/6.
- `SAVE_VERSION` giữ 6. Save cũ đã mua máy cấp 4 giữ cấp và số dư Tem.
- Biên hẹp: `b_steady` 28–31% sát ngưỡng 25%, `c_spend` 83–95% so với 50%.
- Ảnh chụp 390px của bảng Nâng cấp chưa chụp; dòng "Tem: X/Y" và "Giá bán +X%" mới chỉ được xem qua CSS.

## Ngưỡng test cũ

- `tests/integration/p22-strategies.test.ts`: một test đổi ở E-11, xem [p22-economy.md](p22-economy.md).
- `tests/integration/level-balance.test.ts`: các mốc P20 nói về cấp 6, nay ghi là `FULL_UNLOCK_LEVEL` thay cho `MAX_SHOP_LEVEL` (giờ là 10). Bản tách quán đo hoàn vốn dụng cụ đặt `xp = -1e6` thay vì `1e6`, để quán giữ cấp 6 như khi đo. Không đổi ngưỡng số nào.
- `tests/sim/week-goal.test.ts`: kiểm đường mục tiêu hiện tại (xem E-12).
- `tests/ui/level-ui.test.ts`: chip cấp tối đa kiểm `MAX_SHOP_LEVEL` thay cho số 6.
