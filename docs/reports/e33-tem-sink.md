# E-33: Nơi tiêu Tem sau khi mua hết

## Vấn đề

Trước epic, `b2_styles` (bot mua mọi kiểu) mua hết 11 kiểu ở tuần 41–42, rồi Tem cứ dồn lại không có chỗ tiêu.

## Thiết kế

- Biến thể màu do `seasonalVariant` trong `src/sim/data/seasons.ts` tạo, dùng `recolor()` sẵn có. Không thêm mesh, không thêm tiền tệ. Doanh thu và điểm không đổi.
- Biến thể bán từ tuần 48 (chu kỳ 1 trở đi). Một chu kỳ = 3 mùa = 24 tuần (chu kỳ 0 là tuần 24–47). Biến thể chỉ bán trong mùa của bộ kiểu gốc và vẫn bán ở các mùa sau của bộ đó.
- Id biến thể: `<id gốc>_c<chu kỳ>`. Biến thể không nằm trong `ALL_STYLES`; `styleById` dựng chúng từ id.

### Bảng màu và quy tắc giá

- Bảng màu: 6 màu (`VARIANT_TINTS`): `#2b59c3`, `#7b2d8e`, `#1b998b`, `#e4572e`, `#3d3b30`, `#f2e8cf`. Chu kỳ c dùng màu số `(c − 1) mod 6`. Màu và màu nhấn của kiểu gốc được trộn 40% về phía màu này (`VARIANT_TINT_SHARE = 0.4`).
- Giá: một quy tắc cố định, **Tem = Tem gốc × (1 + chu kỳ)**. Chỉ tính bằng Tem, không tốn tiền. Không tinh chỉnh, không có quy tắc thứ hai.

## Tem của b2_styles theo tuần

Normal, 60 tuần. Trước epic: v0.39.0, PO, seed 1/42. Sau epic: `npm run sim:long:tem`.

| | tuần 40 | tuần 48 | tuần 56 | tuần 60 |
|---|---|---|---|---|
| Trước (seed 1/42) | 65–75 | 169–180 | 401–412 | 503–519 |

Sau epic:

| seed | tuần 40 | tuần 48 | tuần 56 | tuần 60 | mùa mua ở tuần 41–60 |
|---|---|---|---|---|---|
| 1 | 65 | 29 | 101 | 203 | 2, 3 |
| 42 | 75 | 40 | 112 | 19 | 2, 3, 4 |
| 7 | 23 | 22 | 101 | 205 | 2, 3 |
| 2026 | 37 | 142 | 55 | 166 | 2, 3 |

## Tiêu chí tuần 60 — quyết định của chủ sản phẩm (Q-18, phương án A)

- Tiêu chí gốc: Tem tuần 60 ≤ 200.
- **200 KHÔNG đạt ở seed 1 và 7** (203, 205), vì hai seed này nằm gần đỉnh dao động "dành rồi tiêu".
- Chủ sản phẩm quyết định nới lên ≤ 250. **250 đạt ở cả 4 seed.**

## Tương thích save

- `SAVE_VERSION` giữ nguyên 9.
- Test tương thích giữ nguyên kiểu đã sở hữu và đang chọn của v0.43.0; `save.ts` nhận id biến thể qua `styleById`.
- Test render (`tests/render/shop-styles.test.ts`): số mesh, đỉnh và material không đổi với mọi biến thể.

## UI (T-125)

- Biến thể hiện trong khối "Mùa này" và dòng mùa cuối tuần, giá ghi "N Tem". Không emoji, không modal.
- Dấu "Mới" trên nút dock vẫn chỉ đếm kiểu gốc.
- Test: `tests/ui/t125-season-variants.test.ts` (7 test).

## Không đổi và đã kiểm

- Số ly mỗi tuần của `b_steady2`, tuần 1–100, 4 seed: giống từng byte với v0.43.0.
- p22/p23: 29/29 đạt.
- `npm run sim:long`: 28 đạt, 1 bỏ qua. Các assert giữ nguyên, assert E-26 cũ đạt.
- `npm run check` xanh (217 file, 2523 test).

## Chưa kiểm chứng

- `npm run layout` thật, perf và media không chạy được trong sandbox. Thay vào đó chạy `LAYOUT_OFFLINE=1 node scripts/check-layout.mjs`: 169 kiểm tra, 0 FAIL; ở bề ngang 390 có 4 biến thể và 16 nút ≥ 44 px. Kết quả này **không tương đương** `npm run layout` thật. Chưa chạy so sánh với nhánh gốc, nên "không có lỗi mới" chỉ dựa vào 0 FAIL.
- Test css-order không ổn định (flaky). Nó không lỗi trong các lần chạy ở trên.
- Sim 60 tuần mất khoảng 90 giây nên nằm trong script riêng `sim:long:tem`.
