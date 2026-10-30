# E-18: Sổ khách quen, mốc và chuyện nhỏ

Báo cáo tổng hợp từ báo cáo của các builder và code. Mục nào chưa chạy được thì ghi rõ **chưa kiểm chứng**.

## Mốc

Dữ liệu ở `src/sim/data/regularMilestones.ts`. Mỗi khách quen có tên (8 người) có 3 mốc, cùng ngưỡng cho mọi người.

| Mốc | Lượt ghé | Tem |
| --- | --- | --- |
| 1 | 10 | 1 |
| 2 | 40 | 2 |
| 3 | 100 | 3 |

- Lượt ghé lấy từ `state.regulars[id].visits`. Đạt mốc khi số lượt đếm được ≥ ngưỡng.
- Đạt mốc phát sự kiện `regular_milestone` và trả Tem một lần, lý do Tem là `regular_milestone`.
- Truyện và món yêu thích chỉ để hiển thị, không đổi món khách gọi.

## Mô phỏng

Chiến lược `b_steady`, độ khó Normal, seed 1 và 42:

- Cả 8 khách quen đạt mốc 3 ở **tuần 15**; người cuối là `chu_tuan`.
- Tổng 48 Tem (8 người × 6 Tem).
- Chạy lại cùng seed cho cùng thứ tự mốc.
- Lưu ý: cả 8 khách ghé gần như mỗi ngày nên 8 toast mốc dồn vào tuần 15.

## p22 / p23 không đổi

- Kết quả p22/p23 giống hệt `d107342`: 29/29 test, 480 dòng bảng.
- Tem mốc bị loại khỏi cột vé của p23, giống Tem thử thách tuần E-16 (`tests/integration/p23-long-run.test.ts`, khoảng dòng 188), nên bảng không đổi.

## Save

- Version save giữ 6, không có migration.
- Save cũ: mốc đã qua hiển thị là đã đạt (suy từ bộ đếm lượt có sẵn), nhưng **không trả Tem** cho phần đã qua.

## UI

`tests/ui/e18-regular-book.test.ts`, 7 test:

- Nút bật/tắt "Sổ khách quen · N/24 mốc" trên thẻ Khách quen.
- 8 dòng × 3 ô, mở rộng ngay trong thẻ, không có modal.
- Ô cao tối thiểu 44 px: kiểm bằng test CSS (bằng chứng touch-target ở 390 px là qua CSS, không phải ảnh đo thật).
- Số draw call chưa đo; không sửa code render.

## Kết quả kiểm

- `npm run check` xanh: 2224 test. Test `css-order` flaky (timeout 20 s). Môi trường builder cần `--configLoader runner`.
- `LAYOUT_OFFLINE=1 check-layout`: 125 kiểm tra đạt. Đây là WebGL offline, **không tương đương** `npm run layout`.
- **Chưa kiểm chứng** (sandbox không chạy được): `npm run layout` thật, `perf:frames`, `npm run media`. Vì vậy **không khẳng định** tiêu chí "layout xanh".

## Script media

- Thêm kịch bản `scripts/scenarios/e17.mjs`, chạy bằng `npm run media -- --scenario e17`.
- Chụp 3 kiểu quán `mint`, `brick`, `royal` vào `docs/media/e17/`.
- Ảnh **chưa được tạo**, chưa kiểm chứng. Mục tương ứng đã thêm trong `docs/media.md`.
