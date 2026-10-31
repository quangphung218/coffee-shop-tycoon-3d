# E-21: Mục tiêu tuần theo cỡ quán (T-69 – T-72)

Báo cáo này chỉ dùng số liệu từ báo cáo của builder/reviewer. Không có số "trước" nào ngoài `c_spend` Hard (mục 4); không số nào được suy ra thêm.

## 1. Nguyên nhân gốc

Mục tiêu E-19 tự tham chiếu: nó bằng 0,9x doanh thu 4 tuần gần nhất của chính người chơi. Vì vậy mọi lối chơi ổn định đều đạt điểm ≥97,5. Bot `c_spend` không thuê người và không chỉnh giá, nên không phải là người chơi tối ưu, nhưng vẫn đạt 3 ly.

## 2. Thiết kế

- `SIZE_GOAL` theo từng độ khó, đánh chỉ số bằng tổng số cấp nâng cấp tại đầu tuần (cấp 0..77, 77 cấp).
- Giá trị: doanh thu 1,0x và lợi nhuận 1,5x của mức chuẩn. Mức chuẩn lấy từ `b_steady2` (bot steady thuê 2 nhân viên, giá chuẩn).
- `nextWeekGoal` dùng bảng khi cấp quán ≥10 và tuần ≥9.
- `goal.profit` (tuỳ chọn) được `scoreWeek` dùng; nếu không có thì dùng `weekProfitTarget`.
- `goal.levels` (tuỳ chọn) dùng cho UI.
- Không tăng phiên bản save. Tuần đang chạy giữ mục tiêu cũ.
- Sinh bảng: `scripts/gen-size-goal.mjs`; bộ lấy mẫu `tests/longsim/size-goal.gen.ts`, chạy với `LONGSIM_GEN=1`, khoảng 147 s.
- Bot mới: `d_manage` = `c_spend` + 4 nhân viên + giá cao từ tuần 9. `b_steady` 2 nhân viên là `b_steady2`.
- UI: dòng "Mục tiêu theo cỡ quán (N cấp nâng cấp)" thay dòng E-19, kèm gợi ý.

**Không đổi:** tuần 1–8, p22/p23, công thức điểm, tiền thuê, phá sản, `WEEK_REWARDS`.

## 3. Sau: tuần 21–40 (20 tuần)

Định dạng: số tuần có đúng 2 ly / 3 ly / <2 ly, rồi điểm trung bình. "lead" là chênh điểm của `d_manage` so với `b_steady2`.

| Độ khó | Seed | b_steady2 | d_manage | lead | b_steady (1 NV) |
|---|---|---|---|---|---|
| Normal | 1 | 20/0/0, 82,7 | 0/20/0, 96,6 | 13,9 | 4/0/16, 68,8 |
| Normal | 42 | 20/0/0, 81,3 | 0/20/0, 92,3 | 11,0 | 0/0/20, 64,0 |
| Normal | 7 | 20/0/0, 81,3 | 2/18/0, 91,0 | 9,7 | 0/0/20, 63,5 |
| Normal | 2026 | 20/0/0, 81,2 | 0/20/0, 92,7 | 11,5 | 1/0/19, 66,8 |
| Easy | 1 | 20/0/0, 82,8 | 0/20/0, 94,7 | 11,9 | 1/0/19, 68,3 |
| Easy | 42 | 20/0/0, 81,5 | 0/20/0, 91,5 | 10,0 | 1/0/19, 65,5 |
| Easy | 7 | 20/0/0, 81,5 | 6/14/0, 89,5 | 8,0 | 0/0/20, 61,6 |
| Easy | 2026 | 20/0/0, 74,7 | 0/20/0, 91,3 | 16,6 | 0/0/20, 60,6 |
| Hard | 1 | 20/0/0, 82,5 | 0/20/0, 97,5 | 15,0 | 13/0/7, 70,3 |
| Hard | 42 | 20/0/0, 79,9 | 0/20/0, 94,5 | 14,6 | 2/0/18, 66,8 |
| Hard | 7 | 20/0/0, 82,0 | 2/18/0, 91,7 | 9,7 | 15/0/5, 70,5 |
| Hard | 2026 | 20/0/0, 80,5 | 0/20/0, 94,0 | 13,5 | 2/0/18, 67,5 |

### Hard `c_spend` (chỉ báo cáo, không assert)

| Seed | 2 / 3 / <2 ly, điểm TB |
|---|---|
| 1 | 20/0/0, 77,9 |
| 42 | 20/0/0, 73,5 |
| 7 | 17/0/3, 70,0 |
| 2026 | 20/0/0, 73,5 |

Không có phá sản. Hard được báo cáo, không assert.

## 4. Hệ quả và ngưỡng đã chấp nhận

1. **Hệ quả đã chấp nhận (chủ sở hữu Q-11, phương án A):** người chơi steady 1 nhân viên kết thúc dưới 2 ly trong 80–100% số tuần 21–40 ở phần lớn seed Normal/Easy. Vì vậy gợi ý UI đổi thành "Quán cỡ này thường lãi X. Thuê người thứ hai, chỉnh giá để vượt." (trước: "Thêm người, chỉnh giá để vượt").
2. **Ngưỡng `d_manage` được nới:** assert ≥70% tuần đạt 3 ly và lead ≥8 (epic gốc: 90% / 10 điểm). Số đo xấu nhất: Easy s7 70% / 8,0 (không còn dư), Normal s7 90% / 9,7. `d_manage` không được làm mạnh thêm.
3. **`b_steady2` assert:** ≥70% tuần đúng 2 ly, ≤30% tuần 3 ly, ≤10% tuần <2 ly (đo được 100%). Tiêu chí gốc cũng đòi điều này với `b_steady` 1 nhân viên; chủ sở hữu đã bỏ phần đó.

## 5. Ghi chú thay đổi (cho người chơi)

Người chơi đã quen đạt 3 ly với kiểu chơi `c_spend` (chi tiêu, không thuê người, không chỉnh giá) sẽ thấy số ly giảm từ khoảng tuần 10–11. Muốn giữ 3 ly cần thuê thêm người và chỉnh giá.

## 6. Kiểm tra

- `tsc` sạch; `npm run check` thoát 0 (2292 test, build ổn).
- Reviewer chỉ chạy `easy.sim` (seed 1, 42 đạt, 181 s).
- Builder đã chạy các sim normal, normal2, easy2 (mọi assertion đạt) và `LONGSIM_HARD=1 npm run sim:long` (14 test đạt). **Reviewer không chạy lại.**

## 7. Chưa xác minh

- `npm run layout` thật: **CHƯA XÁC MINH** (thiếu vite trong worktree, EPERM cổng 4173).
- `LAYOUT_OFFLINE=1 node scripts/check-layout.mjs` đạt 135 kiểm tra, nhưng chỉ dùng WebGL phần mềm, **không tương đương** `npm run layout`.
- Hiệu năng và media: chưa chạy.

## 8. Test không ổn định

- Test css-order: không ổn định, đạt ở lần chạy gần nhất.
