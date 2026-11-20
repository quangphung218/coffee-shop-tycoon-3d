# E-29: Đòn bẩy làm một lần không mua tuần 21–40

Mục tiêu: các cách làm một lần (huấn luyện nhân viên, Lương Cao, bỏ trang trí) không còn giữ 3 cúp ở tuần 21–40. Báo cáo ghi số đo trước/sau theo bot, k và sàn đã chọn kèm lý do, kiểm tra p22/p23, test flaky và các mục chưa kiểm chứng. Chỉ có số đã đo; mục không đo ghi "không đo".

## Số đo: tỉ lệ tuần đạt 3 cúp, tuần 21–40

Độ khó Normal và Easy, trung bình seed 1/42/7/2026.

### Trước (v0.39.0, lấy từ epic)

| Bot | Normal | Easy |
| --- | --- | --- |
| `b2_wage_train` | 50% | 55% |
| `b2_train` | 22% | 32% |
| `b2_nodecor` | 50% (3 cúp ở tuần 21–30) | 49% (3 cúp ở tuần 21–30) |
| `b_steady2` | 0% | 0% |
| `b2_hi_weekly` | không đo | 71.2% |
| `d_manage`, `c4_set` | không đo | không đo |

### Sau (cây epic có T-104 + T-105 + T-106, reviewer chạy)

| Bot | Normal | Easy | Ghi chú |
| --- | --- | --- | --- |
| `b2_train` | 16.3% (seed 40/5/0/20) | 17.5% (45/25/0/0) | Band nới lên ≤20% (Q-16, xem dưới). |
| `b2_wage_train` | 16.3% | 17.5% | Bằng `b2_train`: Lương Cao nay hết sau 7 ngày nên không còn tác dụng đo được ở tuần 21–40. Band ≤30% giữ nguyên. |
| `b2_nodecor` | 0% | 0% | Trước: 50% / 49%. |
| `d_manage` | 100% | 100% | |
| `c4_set` | 100% (mọi seed) | 100% (mọi seed) | |
| `b2_hi_weekly` | 87.5% | 71.2% (s1 100, s42 95, s7 85, s2026 5) | Normal: không đo theo seed. Easy trước cũng 71.2% nên không giảm. |
| `b_steady2` | số cúp từng tuần (40 tuần) giống hệt v0.39.0 | giống hệt v0.39.0 | Diff rỗng. |

Mọi assert cũ (E-21, `a2`/`a_manage` ≤10%, `b2_hi` ≤30%, regulars, styles, determinism) đều pass. File `hard` bị bỏ qua (chỉ chạy với `LONGSIM_HARD=1`).

### Q-16: chủ chọn phương án A

Band của `b2_train` được nới từ ≤10% lên ≤20%. Mục tiêu ban đầu ≤10% **không đạt** (16.3% / 17.5%). Huấn luyện một lần vẫn cho 3 cúp ở khoảng 1/6 số tuần, khớp 16.3% / 17.5%.

## Quyết định thiết kế và lý do

Sau quyết định của chủ, k và sàn **không** được chỉnh lại.

- **k = 1** (`TRAINING_ROW_LEVELS`, `src/sim/data/week.ts`). Comment trong code: tính lại với k từ 0.5 đến 8 trên tuần 21–40 (seed 1/42/7/2026, Normal và Easy) cho `b2_train` và `b2_wage_train` cùng một tỉ lệ tuần 3 cúp, nên lấy k nguyên nhỏ nhất. `b_steady2` không huấn luyện nên các hàng của nó không đổi. Đầu ra thô của lần tính lại không được commit; các con số đó chỉ có trong comment code, báo cáo này không có thêm số.
- **Sàn 1.6 × số cấp không phải trang trí** (`NON_DECOR_FLOOR_RATIO`, áp dụng tuần 21–30 qua `NON_DECOR_FLOOR_WEEKS`). Comment trong code: quán bỏ trang trí và dồn tiền vào nâng cấp doanh thu nhận hàng của quán có cùng nâng cấp doanh thu cộng phần trang trí mà `b_steady2` mua kèm. Tỉ lệ nằm ngay dưới tỉ lệ nhỏ nhất (tổng cấp / cấp không phải trang trí) mà `b_steady2` có ở các tuần đó (1.629 trên các seed), nên cách chơi chuẩn giữ nguyên hàng.
- Hàng SIZE_GOAL đọc ở chỉ số lớn nhất của: tổng cấp + k × cấp huấn luyện; `floor(LEVEL_FLOOR_SHARE × LEVEL_CURVE[tuần])` (E-24); và trong tuần 21–30 là `floor(1.6 × cấp không phải trang trí)`.
- **T-104**: Lương Cao hết sau 7 ngày (`highWageSinceDay`, `HIGH_WAGE_DAYS`). Đặt lại Lương Cao thì đếm lại từ đầu. Khi hết, game phát thông báo "Lương cao đã hết sau N ngày, quán về lương thường" (`src/sim/policies.ts`). Migration 8→9 đặt `highWageSinceDay` cho save đang ở Lương Cao (thêm 7 ngày), có test `tests/save/migration-v8.test.ts`.
- **T-107**: panel nhân viên hiện "Lương Cao còn N ngày" và nút "Đặt lại lương Cao".
- Thông báo "Lương cao đã hết…" hiện ngoài panel nhân viên, giống thông báo giá của E-28. Epic hoãn thông báo ngoài panel (UX-401/402).

## Không đổi

- Test p22 và p23: 29/29 pass, các bảng không đổi.
- Không tạo lại bảng SIZE_GOAL và bảng thử thách. Comment trong `scripts/gen-size-goal.mjs`: `b_steady2` không huấn luyện và giữ tỉ lệ tổng/không phải trang trí trên 1.6, nên các hàng của nó và bảng này không đổi.
- Hard (`LONGSIM_HARD`) không chạy.

## Test

- `npm run check`: 2448 test pass, build ok.
- Flaky: test css-order, không flake ở các lần chạy cuối.
- Timeout: chạy song song 11 file longsim trên 8 CPU thì 6 test chạm timeout 1200 giây mỗi test. Không assert nào fail. Chạy lại riêng thì pass trong 590–658 giây (dư khoảng 2 lần so với timeout).

## Chưa kiểm chứng

- `npm run layout` thật, perf và media: không chạy được trong sandbox.
- Số đo tính lại k 0.5–8: đầu ra thô không được commit, chỉ có kết luận trong comment code.
