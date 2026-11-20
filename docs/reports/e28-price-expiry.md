# E-28: Giá Cao hết hạn sau 7 ngày

Mục tiêu: giá Cao chỉ có hiệu lực 7 ngày trong game, nên muốn giữ 3 cúp thì phải chỉnh lại giá mỗi tuần. Báo cáo ghi lại số đo trước/sau theo bot, các lựa chọn thiết kế và lý do, phần không đổi, test flaky và các mục chưa kiểm chứng.

## Số đo: tỉ lệ tuần đạt 3 cúp, tuần 21–40

Độ khó Normal và Easy, seed 1/42/7/2026. Giá trị theo thứ tự seed.

### Trước (v0.38.0, lấy từ epic)

| Bot | Normal | Easy |
| --- | --- | --- |
| `b_steady2` + Giá Cao một lần từ tuần 9 (= cách chơi cũ của `b2_hi`) | 75–95% | 5–100% |
| `b_steady2` giá chuẩn | 0% | 0% |

### Sau (số của builder và reviewer T-101)

| Bot | Normal (% tuần 3 cúp) | Easy (% tuần 3 cúp) | Ghi chú |
| --- | --- | --- | --- |
| `b_steady2` | 0/0/0/0; điểm TB 83.2/81.5/81.3/81.3 | 0/0/0/0; điểm TB 83.7/81.8/81.7/74.7 | Đúng 2 cúp ở 100% số tuần. Giống hệt v0.38.0 (44 dòng tóm tắt mỗi độ khó, diff bằng nhau). |
| `b2_hi` (mới) | 0/0/0/0 | 5/0/0/0 | Assert ≤30% mỗi seed. |
| `b2_hi_weekly` (mới) | 95/90/90/75, TB 87.5 | 100/95/85/5, TB 71.2 | Assert: trung bình 4 seed ≥70% mỗi độ khó. |
| `d_manage` | 100 mọi seed | 100 mọi seed | Điểm Normal 100.0/98.4/96.6/99.0; Easy 99.6/97.7/94.7/96.8. Như v0.38.0. |
| `a_manage` | 0 mọi seed | 0 mọi seed | Như v0.38.0. |
| `a2` | 0 mọi seed | 0 mọi seed | Như v0.38.0. |

### Q-15: chủ chọn phương án A

`b2_hi_weekly` được assert theo trung bình 4 seed ≥70% mỗi độ khó, không assert theo từng seed. Lý do: Easy seed 2026 là điểm ngoại lai (5%): 3 cúp ở tuần 9–12 rồi phần lớn chỉ 2 cúp, điểm TB 84.5 so với khoảng 92–94 ở các seed Easy khác. Trung bình Easy 71.2% chỉ vừa trên ngưỡng 70%.

## Quyết định thiết kế và lý do

- Trạng thái hết hạn là `highPriceSinceDay`; `HIGH_PRICE_DAYS = 7`. Ngày D đến D+6 là giá Cao, ngày D+7 về giá chuẩn.
- Đặt lại giá Cao thì đếm lại từ đầu. Giá Thấp và giá chuẩn không hết hạn. Chính sách lương `high` không đổi.
- `SAVE_VERSION` 7 lên 8. Migration đặt `highPriceSinceDay = state.day` cho save cũ đang ở giá Cao, để người chơi không mất giá Cao ngay khi tải.
- `d_manage`, `a_manage` và chiến lược `d` của p22 đặt lại giá Cao khi hết hạn. Tuần p22 dài 7 ngày nên các hàng p22 không đổi.
- Các bot `b2_hi`, `b2_hi_weekly` nằm trong `tests/longsim/run.ts`, không phải `src/sim/policies.ts`.
- UI:
  - Hiện "Giá Cao còn N ngày." Đếm cả hôm nay: 7 vào ngày đặt, 1 vào ngày cuối.
  - Thông báo trong panel "Đặt lại giá Cao để giữ thêm 7 ngày." kèm nút "Đặt lại giá Cao". Chỉ hiện trong giai đoạn chuẩn bị; không dùng modal, không emoji.
  - Gợi ý kích thước: "Thuê người thứ hai để giữ 2 cúp; chỉnh giá mỗi tuần để lên 3." khi có dưới 2 nhân viên, ngược lại "Chỉnh giá mỗi tuần để lên 3 cúp."
- Trường save tùy chọn mới `highPriceEndedDay` chỉ dùng cho UI, không ảnh hưởng sim. Save cũ tải không có thông báo, không cần migration.
- Xóa `SIZE_GOAL_FULL_STAFF`.

## Không đổi

- Test p22/p23 giống hệt và pass.
- Đầu ra generator `SIZE_GOAL` giống bản đã commit.
- Các hàng Normal/Easy của bảng thử thách giống bản đã commit.
- 78 hàng Hard khác bản đã commit. Builder báo giống ở v0.38.0 (chạy generator v0.38.0 trên bản sao v0.38.0 cho cùng đầu ra); reviewer **chưa kiểm chứng** điều này. Giữ bảng đã commit, không tạo lại.
- Hard (`LONGSIM_HARD`) không chạy.

## Test

- Các bước của `npm run check` đều pass: tsc, vitest 199 file / 2426 test, vite build.
- Flaky: test css-order.

## Chưa kiểm chứng

- `npm run layout` thật: chỉ chạy `LAYOUT_OFFLINE=1` (PASS 153 kiểm tra), **không tương đương** layout thật.
- Perf và media.
- Reviewer không chạy lại `sim:long` sau T-102 (có chạy trước đó cho T-101).
- Còn sót nhỏ: comment ở `src/ui/weekGoal.ts:33` nói gợi ý có thể rỗng, đã lỗi thời.
