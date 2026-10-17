# P23: kinh tế 4 tuần và cấp quán 7–10

Mô phỏng 28 ngày ở 3 độ khó × 3 chiến lược × 3 seed. Báo cáo này ghi số đo và lý do chọn mục tiêu tuần, thưởng cúp và cấp 7–10.

## Chạy lại

```sh
npx vitest run tests/integration/p23-long-run.test.ts --reporter=verbose
```

Test in bảng trung bình theo tuần và bảng từng seed, rồi kiểm:

- Tiền không bao giờ âm.
- Chơi lại cùng seed ra cùng số.
- Hết tuần 3, chiến lược c còn ≥ 1 nâng cấp chưa lên tới trần cuối (trần ở cấp 10).
- Tuần 2, chiến lược a không được 3 cúp ở độ khó nào, seed nào.

## Chiến lược

Mỗi sáng mọi chiến lược bật món đã mở và nhập hàng theo gợi ý.

| Chiến lược | Cách chơi |
| --- | --- |
| `a_basic` | Tự phục vụ một mình, không thuê, không mua nâng cấp. |
| `c_spend` | Thuê 1 barista ngày 1; mỗi sáng mua nâng cấp hay dụng cụ rẻ nhất đang mở, lặp tới khi tiền chỉ còn đủ lương tối nay và hàng nhập ngày mai. |
| `e_marketing` | Như c, thêm chiến dịch rẻ nhất vào ngày lẻ trong tuần khi đủ tiền. |

Seed 1, 42, 777. c và e mua mọi nâng cấp chứ không chỉ dụng cụ như bản P22, để đo xem người chi tiêu mạnh có hết đồ để mua không.

## Bảng 4 tuần (trung bình 3 seed)

`profit` là tổng lãi ngày (doanh thu − nguyên liệu − lương − marketing), chưa trừ nâng cấp. `spent` là tiền mua nâng cấp trong tuần. `buyable`: nâng cấp đang mở và còn dưới trần ở cấp hiện tại. `left`: nâng cấp còn dưới trần ở cấp 10.

| difficulty | strategy | week | revenue | profit | spent | reward | endMoney | level | xp | buyable | left | stars | score | cups |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | a_basic | 1 | 27,895k | 18,962k | 0k | 1,500k | 25,024k | 3.0 | 4323 | 15.0 | 15.0 | 4.07 | 99.7 | 3.00 |
| easy | a_basic | 2 | 30,843k | 20,799k | 0k | 1,000k | 48,625k | 4.0 | 8847 | 15.0 | 15.0 | 4.03 | 84.0 | 2.00 |
| easy | a_basic | 3 | 30,808k | 21,271k | 0k | 1,000k | 72,662k | 5.0 | 13326 | 15.0 | 15.0 | 4.03 | 73.0 | 2.00 |
| easy | a_basic | 4 | 30,768k | 20,862k | 0k | 0k | 95,129k | 5.0 | 17711 | 15.0 | 15.0 | 4.07 | 66.3 | 1.00 |
| easy | c_spend | 1 | 52,160k | 34,931k | 27,187k | 1,500k | 13,388k | 3.0 | 5915 | 4.7 | 10.0 | 4.90 | 100.0 | 3.00 |
| easy | c_spend | 2 | 87,637k | 58,154k | 23,665k | 1,500k | 50,709k | 5.0 | 13704 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| easy | c_spend | 3 | 88,878k | 60,536k | 0k | 1,500k | 114,838k | 6.0 | 21571 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| easy | c_spend | 4 | 88,255k | 58,889k | 30,255k | 1,500k | 146,991k | 7.0 | 29349 | 0.0 | 6.0 | 5.00 | 100.0 | 3.00 |
| easy | e_marketing | 1 | 48,763k | 32,000k | 23,673k | 1,500k | 14,010k | 3.0 | 5280 | 5.7 | 10.3 | 4.77 | 100.0 | 3.00 |
| easy | e_marketing | 2 | 92,460k | 60,193k | 27,179k | 1,500k | 49,819k | 5.0 | 13035 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| easy | e_marketing | 3 | 93,728k | 62,586k | 0k | 1,500k | 115,730k | 6.0 | 20832 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| easy | e_marketing | 4 | 95,502k | 62,422k | 20,170k | 1,500k | 161,159k | 7.0 | 28605 | 0.7 | 6.3 | 5.00 | 100.0 | 3.00 |
| normal | a_basic | 1 | 26,735k | 17,237k | 0k | 2,250k | 22,912k | 2.3 | 3438 | 13.7 | 15.0 | 4.03 | 99.3 | 3.00 |
| normal | a_basic | 2 | 29,907k | 19,039k | 0k | 1,500k | 45,158k | 3.3 | 6819 | 15.0 | 15.0 | 4.00 | 84.7 | 2.00 |
| normal | a_basic | 3 | 29,885k | 19,624k | 0k | 1,500k | 67,896k | 4.0 | 10150 | 15.0 | 15.0 | 4.00 | 73.0 | 2.00 |
| normal | a_basic | 4 | 29,330k | 18,815k | 0k | 0k | 88,133k | 5.0 | 13360 | 15.0 | 15.0 | 4.03 | 66.3 | 1.00 |
| normal | c_spend | 1 | 43,970k | 27,727k | 19,968k | 2,250k | 12,796k | 3.0 | 4302 | 8.0 | 11.0 | 4.80 | 100.0 | 3.00 |
| normal | c_spend | 2 | 86,900k | 53,925k | 36,535k | 2,250k | 33,111k | 4.0 | 10053 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| normal | c_spend | 3 | 90,568k | 57,836k | 0k | 2,250k | 95,299k | 5.0 | 16107 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| normal | c_spend | 4 | 91,630k | 57,002k | 0k | 2,250k | 156,020k | 6.0 | 22009 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| normal | e_marketing | 1 | 45,272k | 27,748k | 19,456k | 2,250k | 13,578k | 3.0 | 4233 | 8.3 | 11.0 | 4.70 | 100.0 | 3.00 |
| normal | e_marketing | 2 | 88,357k | 54,308k | 37,047k | 2,250k | 34,086k | 4.0 | 10163 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| normal | e_marketing | 3 | 88,292k | 56,001k | 0k | 2,250k | 94,315k | 5.0 | 16297 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| normal | e_marketing | 4 | 90,902k | 56,335k | 0k | 2,250k | 154,520k | 6.0 | 22303 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| hard | a_basic | 1 | 22,487k | 13,324k | 0k | 3,000k | 18,794k | 2.0 | 2443 | 13.0 | 15.0 | 4.03 | 96.3 | 3.00 |
| hard | a_basic | 2 | 27,298k | 15,934k | 0k | 2,000k | 38,432k | 3.0 | 5035 | 15.0 | 15.0 | 4.03 | 86.0 | 2.00 |
| hard | a_basic | 3 | 27,793k | 16,763k | 0k | 2,000k | 58,755k | 4.0 | 7577 | 15.0 | 15.0 | 4.03 | 74.7 | 2.00 |
| hard | a_basic | 4 | 28,345k | 16,490k | 0k | 667k | 77,376k | 4.0 | 9977 | 15.0 | 15.0 | 4.07 | 68.3 | 1.33 |
| hard | c_spend | 1 | 33,843k | 19,157k | 12,428k | 3,000k | 11,801k | 2.0 | 2993 | 7.7 | 11.7 | 4.73 | 100.0 | 3.00 |
| hard | c_spend | 2 | 71,930k | 40,109k | 39,186k | 3,000k | 16,782k | 4.0 | 7160 | 1.3 | 8.0 | 5.00 | 100.0 | 3.00 |
| hard | c_spend | 3 | 81,892k | 47,637k | 13,363k | 3,000k | 55,711k | 4.0 | 11719 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| hard | c_spend | 4 | 80,645k | 45,648k | 0k | 3,000k | 106,207k | 5.0 | 16193 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| hard | e_marketing | 1 | 35,227k | 19,219k | 12,428k | 3,000k | 12,201k | 2.0 | 2905 | 7.7 | 11.7 | 4.63 | 100.0 | 3.00 |
| hard | e_marketing | 2 | 76,180k | 42,074k | 39,186k | 3,000k | 18,920k | 3.7 | 7215 | 1.3 | 8.0 | 5.00 | 100.0 | 3.00 |
| hard | e_marketing | 3 | 83,537k | 48,302k | 13,363k | 3,000k | 58,595k | 4.3 | 11877 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |
| hard | e_marketing | 4 | 87,325k | 48,469k | 0k | 3,000k | 111,647k | 5.0 | 16454 | 0.0 | 7.0 | 5.00 | 100.0 | 3.00 |

Bảng từng seed in ra cùng lệnh trên.

## Đọc bảng

- Từ tuần 2, mọi món và nâng cấp của lịch tuần 1 đều mở. Người chi tiêu mạnh (c, e) mua hết 15 nâng cấp trong tuần 2 và có lãi 45–60 triệu mỗi tuần sau đó.
- Không có cấp 7–10 thì từ tuần 3 người chơi này không còn gì để mua. Với cấp 7–10 còn 7 nâng cấp chờ nâng trần (`left` = 7, 6 sau khi cấp 7 tới ở Dễ tuần 4).
- Chiến lược a giữ doanh thu gần như không đổi (khoảng 1,1 lần tuần 1) vì không đầu tư.

## Lý do chọn số

| Số | Giá trị | Lý do |
| --- | --- | --- |
| `WEEK_GOAL_GROWTH` | 0,5/tuần | Với 20%/tuần cũ, a vẫn 3 cúp ở tuần 2 (điểm 95–98). Muốn a dưới 90 điểm ở tuần 2, mục tiêu Dễ phải trên 37 triệu, Khó trên 32 triệu, tức khoảng ×1,4–1,5. Chọn ×1,5: a được 83–87 điểm (2 cúp), cao nhất 87 ở Khó seed 777. |
| `WEEK_GOAL_MAX_MULT` | 3 | Từ tuần 5 mục tiêu là Dễ 84 triệu, Thường 79,5 triệu, Khó 69 triệu, ngay dưới doanh thu tuần của c (80–92 triệu). Người đầu tư đủ vẫn giữ 3 cúp; người đầu tư nửa vời phải cố mới được 3 cúp; a xuống 1 cúp từ tuần 4. |
| `WEEK_REWARDS` | Dễ 1/1,5 · Thường 1,5/2,25 · Khó 2/3 triệu cho 2/3 cúp | Khoảng 5–15% lãi tuần của a: đủ thấy, không đổi nhịp mua sắm. Khó trả nhiều hơn vì giá cao hơn và khó đạt cúp hơn. 3 cúp trả gấp rưỡi 2 cúp. |
| Ngưỡng XP cấp 7–10 | 27.000 · 37.000 · 49.000 · 63.000 | Bước tăng 8k, 10k, 12k, 14k nối tiếp bước của cấp 2–6 (1,1k … 7k). c đạt khoảng 7.800 XP/tuần ở Dễ, 6.000 ở Thường, 4.500 ở Khó: Dễ lên cấp 7 trong tuần 4, Thường khoảng tuần 5, cấp 10 rơi vào khoảng tuần 8–11. |
| `maxLevelBonus` | 7: máy cao cấp, máy xay hạt · 8: bàn ghế, tủ bánh · 9: đèn, máy sinh tố · 10: máy cao cấp, máy rửa ly | Chỉ chọn nâng cấp mà cấp thêm không cần model mới hay chỗ đặt mới: máy và dụng cụ chỉ đổi hiệu ứng, model máy đã chặn ở bậc cao nhất; bàn thứ 7 lấy chỗ trống cuối cùng trong phòng; đèn thứ 3 treo trên bàn trong cùng hàng đầu. Không chọn: máy 2 group (máy thứ 4 đè máy rửa ly), cây và tranh (hết chỗ), quầy bar cửa sổ (hết chỗ bàn), mở rộng và ngoài trời (thêm khu mới), máy làm đá (đã giảm 90%). |
| `BONUS_LEVEL_PRICE_MULT` | 3 | Ở giá thường, 8 cấp thêm tốn khoảng 38 triệu ở Thường, dưới một tuần lãi của c. Nhân 3 thành khoảng 113 triệu: c ở Dễ chi 30 triệu ngay khi lên cấp 7 và vẫn phải dành tiền cho các cấp sau. |

## Ngưỡng test cũ

- `tests/integration/p22-strategies.test.ts`: không đổi, vẫn đạt.
- `tests/integration/level-balance.test.ts`: các mốc P20 nói về cấp 6, nay ghi là `FULL_UNLOCK_LEVEL` thay cho `MAX_SHOP_LEVEL` (giờ là 10). Bản tách quán đo hoàn vốn dụng cụ đặt `xp = -1e6` thay vì `1e6`, để quán giữ cấp 6 như khi đo. Không đổi ngưỡng số nào.
- `tests/sim/week-goal.test.ts`: kiểm công thức mới (×1,5 ở tuần 2, ×3 từ tuần 5).
- `tests/ui/level-ui.test.ts`: chip cấp tối đa kiểm `MAX_SHOP_LEVEL` thay cho số 6.
