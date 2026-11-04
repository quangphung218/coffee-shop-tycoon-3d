# E-24: Sàn theo cỡ quán và thử thách neo theo cỡ quán (T-84 – T-87)

Số "sau" được chép từ báo cáo của builder. Số "trước" lấy từ `docs/reports/e24-baseline.txt` / `e24-baseline.json`. Baseline là đầu nhánh v0.34.0 (`5d3f872`), không phải v0.33.0. Không số nào được suy ra thêm.

## 1. Phương pháp và quyết định

- **Phần A (T-84):** thêm `LEVEL_CURVE` và một hàng sàn theo cấp quán trong bảng mục tiêu. Mức ép lợi nhuận (profit clamp) được thực hiện bằng cách tăng doanh thu và giảm lợi nhuận, giữ nguyên số điểm. Foreman đã chấp nhận cách này; các hàng 72-77 không chọn tay.
- **Phần B (T-85):** bảng thử thách neo theo hàng size-goal, sinh bởi `scripts/gen-challenge-standard.mjs`. Bảng chỉ áp dụng từ tuần 21 để khẳng định E-16 của `c_spend` (hoàn thành 70-95% ở tuần 5-20) vẫn đúng.
- Hệ số: served 1, sell 2, regular 1, calm 1.
- Bảng của `d_manage` gần như phẳng (78 hàng giống nhau). Khách quen bị chặn ở 56 nên `regular_visits` không tách được các bot.
- **Phần C (T-86):** gợi ý `sizeGoalHint` theo trạng thái quán và dòng cuối tuần (xem mục 5).
- Ngưỡng được đánh giá trên trung bình 4 seed (1, 42, 7, 2026), mỗi độ khó normal/easy. Hai ngoại lệ đơn seed: `b_steady2` s42 (85% normal, 80% easy) và `d_manage` easy s7 (60%).

## 2. Tỷ lệ tuần có 3 ly, tuần 21-40

Trước (v0.34.0) -> sau, theo seed 1, 42, 7, 2026 của normal và easy (8 lượt mỗi bot).

| Bot | Trước | Sau |
|---|---|---|
| a2 | 80-100% | 0% ở cả 8 lượt |
| a_manage | 90-100% | 0% |
| b_steady2 | 0% | 0% (số ly từng tuần giống hệt baseline v0.34.0) |
| d_manage | 85-100% | 100% |

a2 và a_manage rơi xuống 0-1 ly ở các tuần cuối.

Các tuần `d_manage` thay đổi (đều từ 2 lên 3 ly, do profit clamp):
- normal s1: tuần 10
- normal s7: tuần 10, 12, 16, 30, 32
- easy s7: tuần 9, 12, 13, 16, 26, 30, 32

`c_spend` easy s2026: tuần 20 và 34 đổi từ 1 lên 2 ly.

## 3. Hoàn thành thử thách, tuần 21-40

Thứ tự seed: 1 / 42 / 7 / 2026.

| Bot | Độ khó | Trước | Sau |
|---|---|---|---|
| b_steady2 | normal | 95/100/95/90 | 70/85/55/55, TB 66% |
| b_steady2 | easy | 100/95/100/95 | 60/80/60/60, TB 65% |
| d_manage | normal | 100/95/100/100 | 95/95/85/100, TB 94% |
| d_manage | easy | 100/100/100/100 | 95/100/60/80, TB 84% |
| a2 | normal | 30/45/30/20 | chưa đo lại sau thay đổi |
| a2 | easy | 35/50/30/25 | chưa đo lại sau thay đổi |
| a_manage | normal | 20/30/15/10 | chưa đo lại sau thay đổi |
| a_manage | easy | 20/35/15/20 | chưa đo lại sau thay đổi |

Hàng a2 và a_manage chỉ có số baseline; không có số mới hơn trong báo cáo builder.

## 4. Gợi ý UI (`sizeGoalHint`)

| Trạng thái quán | Gợi ý |
|---|---|
| Dưới 2 nhân viên | "Thuê thêm người" |
| 2-3 nhân viên | "Thuê đủ 4 người" |
| Giá chưa ở mức Cao | thêm "đặt giá Cao" |
| 4 nhân viên và giá Cao | không có gợi ý |

Dòng cuối tuần (week-end line) cũng thuộc T-86.

## 5. Bố cục (layout): chưa xác minh

- `LAYOUT_OFFLINE=1`: PASS 137 kiểm tra. Đây là WebGL phần mềm, không tương đương trình duyệt thật.
- `npm run layout` thật: **CHƯA XÁC MINH**.
- Không thêm kiểm tra trình duyệt 390 px cho dòng cuối tuần: CSS tự xuống dòng, chỉ có test cấu trúc.

## 6. Test không ổn định và lưu ý

- Test `css-order` không ổn định (flaky).
- Các file `sim:long` seed 7 bị timeout ở 1200 s chỉ khi chạy song song dưới tải; chạy riêng thì qua (normal 85 s, easy 136 s).
- Các file `challenges-*.sim.ts` mới làm `sim:long` chậm hơn.
- `npm run check` xanh: 187 file, 2371 test.

## 7. Phát hiện STOP

Không có phát hiện STOP nào được báo cáo.
