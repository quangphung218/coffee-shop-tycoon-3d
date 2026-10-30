# E-19: Vòng tuần sau cấp 10 co giãn theo quán

Báo cáo tổng hợp từ báo cáo của các builder và code. Mục nào chưa chạy được thì ghi rõ **chưa kiểm chứng**.

## Lời hứa của epic KHÔNG đạt

Epic hứa tuần 21–40: chơi đều tay được 2 cúp, chơi tối ưu mới được 3 cúp. **Điều này chưa đạt.**

- Chơi đều tay (`b_steady`) vẫn đạt 3 cúp gần như mọi tuần sau tuần 21: 90–100%. Mục tiêu là ≥70% tuần 2 cúp, ≤30% tuần 3 cúp.
- Tỉ lệ hoàn thành thử thách của `b_steady` ở tuần 21–40 là 85–100%. Mục tiêu là 40–70%.
- Chủ epic chọn phương án B (Q-09): giữ T-58/T-59, bỏ các assert tuần 21–40, **không chỉnh thêm**.
- T-60 vì vậy được đổi phạm vi: từ "chỉnh cho vào dải mục tiêu" thành "thêm sim đo".
- Cần một epic thiết kế riêng. Hướng gợi ý: mục tiêu tuyệt đối cho cuối game, tăng từ tuần 9, cộng với làm lại mục tiêu lợi nhuận. Biên ước tính khoảng 1 điểm.

## Đã làm

- **T-58, mục tiêu tuần**: từ cấp quán 10 trở lên, mục tiêu doanh thu = `max(công thức cũ, round(0.9 × doanh thu trung bình 4 tuần gần nhất đã lưu))`. Hàm `scaledWeekGoal` ở `src/sim/data/week.ts`, áp dụng trong `startNextWeek`. Mục tiêu sao không đổi.
- **T-59, thử thách đếm**: các mẫu `served_week`, `sell_item`, `regular_visits`, `calm_day` co giãn từ tuần 9 (`CHALLENGE_SCALE_FIRST_WEEK = 9`). Mục tiêu = `max(sàn của mẫu, round(trung bình × hệ số / bước) × bước)`, trung bình lấy trên 4 tuần gần nhất của lịch sử. Các kiểu quán từng bị thử thách khóa nay mở bằng thử thách hoàn thành bất kỳ, theo thứ tự cố định `CHALLENGE_STYLE_ORDER` (`sign_neon`, `wall_wood`, `awning_gold`, `floor_checker`, `wall_mural`).
- **T-61, UI**: dòng "Quán đã lớn: mục tiêu theo 4 tuần gần nhất" trong Mục tiêu tuần khi mục tiêu đã co giãn. Bản xem trước tuần sau ở màn kết tuần giờ dùng `nextWeekGoal(state)`.
- **T-60, sim 40 tuần**: bộ sim riêng, xem mục Lệnh chạy.

## Trước / sau

"Trước" lấy từ báo cáo PO, **không đo lại**: `b_steady` 3 cúp mọi tuần từ khoảng tuần 21, hoàn thành thử thách 85–100%, seed 1 không bao giờ mở `awning_gold` (0/4).

"Sau" đo bằng sim 40 tuần, chiến lược `b_steady`, tuần 21–40:

| Độ khó | Seed | Tuần có 3 cúp | Tuần có 2 cúp |
| --- | --- | --- | --- |
| Normal | 1 | 100% | 0% |
| Normal | 42 | 100% | 0% |
| Easy | 1 | 90% | 10% |
| Easy | 42 | 90% | 10% |

Chiến lược `c_spend` có 3 cúp 100% ở các lần chạy đã đo.

Hoàn thành thử thách và tuần mở đủ 5 kiểu quán:

| Độ khó | Seed | Chiến lược | Thử thách tuần 5–20 | Thử thách tuần 21–40 | Mở đủ 5 kiểu ở tuần |
| --- | --- | --- | --- | --- | --- |
| Easy | 1 | c_spend | 81% | 100% | 11 |
| Easy | 1 | b_steady | 75% | 85% | 12 |
| Easy | 42 | c_spend | 94% | 85% | 10 |
| Easy | 42 | b_steady | 69% | 90% | 12 |
| Normal | 1 | c_spend | 81% | 100% | 11 |
| Normal | 1 | b_steady | 56% | 85% | 15 |
| Normal | 42 | c_spend | 88% | 80% | 10 |
| Normal | 42 | b_steady | 69% | 100% | 12 |

`b_steady` mở đủ 5 kiểu ở tuần 12–15, `c_spend` ở tuần 10–11. Seed 1 giờ mở được `awning_gold`.

## Công thức và tỉ lệ đã chọn

- Mục tiêu doanh thu cấp 10+: hệ số 0.9 trên trung bình 4 tuần gần nhất, không bao giờ thấp hơn công thức cũ.
- Thử thách đếm: từ tuần 9, làm tròn theo bước của mẫu, không thấp hơn sàn của mẫu. Hệ số và bước từng mẫu nằm trong `src/sim/data/challenges.ts`.
- Mở kiểu quán: thử thách hoàn thành bất kỳ mở kiểu khóa kế tiếp theo `CHALLENGE_STYLE_ORDER`.

## Lệnh chạy sim 40 tuần

- `npm run sim:long`: chạy `tests/longsim/*.sim.ts`, dùng cấu hình vitest riêng, **không nằm trong** `npm run check`.
- Thời gian khoảng 108 s tổng; mỗi file độ khó khoảng 65–75 s, các file chạy song song.

## Tương thích save cũ

- Save đang ở cấp 10 giữ mục tiêu của tuần đang chạy. Luật mới áp dụng từ tuần kế tiếp.
- Trường `goalScaled` là tùy chọn, không tăng version save.
- `minServed` của `calm_day` là tùy chọn và được kiểm trong `save.ts`.
- Save cũ có `reward.unlock` nêu kiểu quán của mẫu vẫn nạp được.

## Không đổi

- Công thức điểm, tiền thuê, phá sản, `WEEK_REWARDS`, đường cong tuần 1–8.
- Bảng p22/p23 giống hệt (so 480 dòng).
- Tem E-16/E-18 vẫn bị loại khỏi cột vé của p23.

## Kết quả kiểm

- T-59/T-60: `npm run check` chạy đủ, xanh: 176 file / 2243 test.
- Sau T-61: vitest đủ 177 file / 2247 test qua; `vite build` chạy riêng, ok.
- Test `css-order` flaky; các lần chạy gần nhất đều qua.
- **Chưa kiểm chứng** (sandbox không chạy được): layout, perf, media. Vì vậy **không khẳng định** tiêu chí layout xanh.
