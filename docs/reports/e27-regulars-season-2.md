# E-27: Sổ khách quen mùa 2 (sau tuần 39)

Sau tuần 39 cả 8 khách quen đầu đã đạt mốc 4 nên sổ khách quen hết mốc mới. E-27 thêm 8 khách quen mùa 2 (`NEW_REGULARS`). Mỗi người dọn tới khi một khách quen đầu đạt mốc 4. Báo cáo ghi lại số mốc theo tuần, danh sách khách mới, quy tắc rải mốc, kiểm tra cups trước/sau, ghi chú thiết kế và các mục chưa kiểm chứng.

## Số mốc theo tuần 40–60

Đo từ `npm run sim:long:s2`: `b_steady2`, độ khó Normal, 60 tuần. Cột là tuần 40 tới 60, theo thứ tự.

| Seed | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60 | Tuần ≥1 | Max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 1 | 2 | 1 | 1 | 1 | 2 | 1 | 2 | 1 | 2 | 2 | 1 | 1 | 1 | 2 | 1 | 2 | 1 | 2 | 19/21 | 2 |
| 42 | 0 | 0 | 2 | 1 | 2 | 0 | 2 | 2 | 0 | 2 | 1 | 2 | 1 | 1 | 2 | 2 | 0 | 3 | 1 | 0 | 3 | 15/21 | 3 |
| 7 | 0 | 0 | 1 | 2 | 1 | 1 | 1 | 1 | 3 | 1 | 1 | 2 | 0 | 3 | 1 | 1 | 2 | 1 | 1 | 2 | 2 | 18/21 | 3 |
| 2026 | 0 | 0 | 0 | 3 | 1 | 1 | 2 | 2 | 0 | 3 | 0 | 1 | 3 | 0 | 2 | 2 | 1 | 1 | 1 | 2 | 2 | 15/21 | 3 |

## Khách quen mới

Đọc từ `src/sim/data/regularMilestones.ts` (`MILESTONE_VISITS`, `NEW_REGULAR_BOOK`). Tem mỗi mốc là 1/2/3/3 như 8 khách đầu.

| Id | Mốc 1 | Mốc 2 | Mốc 3 | Mốc 4 | Chủ đề câu chuyện |
| --- | --- | --- | --- | --- | --- |
| `co_mai` | 51 | 94 | 138 | 172 | Thủ thư; kệ sách cho khách mượn, thành "thư viện cà phê" |
| `anh_duc` | 52 | 96 | 139 | 173 | Kiến trúc sư; phác thảo mặt tiền quán, công trình đầu tay |
| `chi_ngoc` | 53 | 97 | 131 | 174 | Cô dạy piano; học trò đàn trọn bài, mở lớp nhạc riêng |
| `chu_bay` | 54 | 98 | 132 | 176 | Thợ sửa xe đạp; xe cũ làm chỗ treo chậu cây, truyền nghề |
| `em_nam` | 56 | 99 | 133 | 177 | Sinh viên chạy giao hàng; mua xe máy, ra trường đi làm |
| `ba_tu` | 57 | 91 | 134 | 178 | Bà bán xôi; công thức xôi lá dứa, mừng thọ tại quán |
| `anh_phong` | 58 | 92 | 136 | 179 | Đầu bếp; thực đơn mới có cà phê của quán, mở nhà hàng riêng |
| `chi_linh` | 59 | 93 | 137 | 171 | Nhân viên ngân hàng; cả phòng ghé quán, lên trưởng chi nhánh |

## Quy tắc rải mốc (Q-14 phương án A)

Một lần rải lại, không tinh chỉnh thêm.

- Với mốc m = 0..3 của khách thứ i trong `NEW_REGULARS`: `visits = 50 + 40·m + OFFSETS[(i + 3·m) % 8]`, `OFFSETS = [1, 2, 3, 4, 6, 7, 8, 9]`.
- Khách mới dọn tới cách nhau khoảng 5 ngày (ngày 237..273). Seed chỉ chọn thứ tự ai vào ô nào.
- Ngưỡng gần bằng nhau trong mỗi mốc nên khoảng cách 5 ngày giữa các ô tự rải mốc, dù thứ tự thế nào. 40 lượt mỗi mốc là một vòng ô. Phép xoay `3·m` ngăn va chạm ở mốc này lặp lại ở mốc sau.
- Tối đa 3 mốc/tuần, đúng với cả 8! thứ tự dọn tới.
- Độ phủ 60% (số tuần có ≥1 mốc) không được đảm bảo cho thứ tự xấu nhất (11/21).
- 27 trong 32 mốc rơi vào tuần 41–60, 5 mốc rơi sau tuần 60.

## Kiểm tra cups trước/sau

- Tuần 1–40, các dòng `b_steady2` và `d_manage` (tỉ lệ cups, Tem/tuần, mốc/tuần, điểm, tỉ lệ thử thách) giống hệt v0.37.0, so bằng diff của lần chạy trên `git archive`, seed 1, 42, 7, 2026.
- `b_steady2` đạt 2 cups và `d_manage` đạt 3 cups ở 100% số tuần.
- Bảng p22/p23 không đổi.
- `sim:long`: 16 passed, 1 skipped.

## Ghi chú thiết kế

- Save vẫn là v7 (`succeededBy` là trường tùy chọn). Save cũ giữ các mốc đã đạt, không hoàn Tem.
- Tem từ mốc không tính vào p23/e05.
- UI không cần sửa `src`. Thêm `tests/ui/e27-new-regulars-ui.test.ts` (4 test).
- `npm run check`: 196 file, 2415 test, xanh.

## Chưa kiểm chứng và flaky

- Test css-order flaky.
- `npm run layout` thật, perf và media không chạy được trong sandbox, nên **chưa kiểm chứng**.
- Layout offline (`LAYOUT_OFFLINE=1`, 153/153) **không tương đương** layout thật và nhiều khả năng chưa render các hàng mùa 2.
- Reviewer chưa tự chạy lại diff cups bằng `git archive`.
