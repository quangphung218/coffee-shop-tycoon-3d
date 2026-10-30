# E-17: Phong cách quán

Người chơi dùng tiền và Tem để đổi màu bốn phần của quán: tường, sàn, biển hiệu, mái hiên. Báo cáo này ghi lại thiết kế, bảng giá, migration save, số đo từ các task khác, panel UI và các mục chưa kiểm chứng.

## Thiết kế

- Định nghĩa ở `src/sim/data/styles.ts` (`STYLES`, `STYLE_SLOTS`). Có 4 ô (`wall`, `floor`, `sign`, `awning`), tổng 20 phong cách.
- Phong cách chỉ đổi màu (`color`, `accent`). Sao, khách và kinh tế không đổi.
- Mua một lần bằng tiền cộng Tem. Giá cố định, không nhân theo độ khó.
- Mỗi ô có một phong cách mặc định giá 0 (mục đầu của ô), khớp bảng màu của cảnh.
- Phong cách có cờ `challenge` phải được mở trước bằng phần thưởng thử thách tuần (`{kind:'decor', id}`, xem E-16) rồi mới mua được. `id` của phong cách chính là `ChallengeUnlock.id`.
- Bot không bao giờ mua phong cách.
- 3D (T-50): phong cách chỉ tô lại màu cho hình khối và vật liệu có sẵn qua `recolor()`: màu đỉnh đã nướng của `geo.wall`, các mesh sàn, vùng đỉnh của mái hiên và bảng hiệu, các sọc diềm mái, cộng với vẽ lại canvas biển trên `signMaterial` sẵn có. Không thêm mesh, vật liệu hay draw call. Phong cách mặc định khớp màu cũ. Xem trước đi qua `World.setStylePreview` (`src/render/scene/shop.ts:884`, nối ở `src/main.ts:108`) mà không mua.

## Bảng giá

Đọc từ `src/sim/data/styles.ts`. Giá tiền tính bằng đồng (M = triệu). "Mở bằng thử thách" là phong cách có `challenge: true`.

| Ô | Id | Tên | Tiền | Tem | Mở bằng thử thách |
| --- | --- | --- | --- | --- | --- |
| Tường | `wall_cream` | Tường kem | 0 (mặc định) | 0 | |
| Tường | `wall_mint` | Tường bạc hà | 3M | 5 | |
| Tường | `wall_brick` | Tường gạch đỏ | 15M | 15 | |
| Tường | `wall_wood` | Ốp gỗ ấm | 60M | 30 | có |
| Tường | `wall_mural` | Tranh tường cà phê | 300M | 80 | có |
| Sàn | `floor_oak` | Sàn gỗ sồi | 0 (mặc định) | 0 | |
| Sàn | `floor_tile` | Gạch bông | 2.5M | 5 | |
| Sàn | `floor_terrazzo` | Đá mài terrazzo | 12M | 12 | |
| Sàn | `floor_herringbone` | Gỗ xương cá | 50M | 25 | |
| Sàn | `floor_checker` | Sàn caro đen trắng | 120M | 45 | có |
| Sàn | `floor_marble` | Đá cẩm thạch | 350M | 90 | |
| Biển | `sign_wood` | Bảng gỗ | 0 (mặc định) | 0 | |
| Biển | `sign_chalk` | Bảng phấn | 2M | 5 | |
| Biển | `sign_neon` | Biển neon | 20M | 18 | có |
| Biển | `sign_brass` | Biển đồng | 250M | 70 | |
| Mái hiên | `awning_coral` | Mái hiên san hô | 0 (mặc định) | 0 | |
| Mái hiên | `awning_mint` | Mái hiên bạc hà | 3M | 5 | |
| Mái hiên | `awning_navy` | Mái hiên sọc xanh | 18M | 15 | |
| Mái hiên | `awning_gold` | Mái hiên vàng nắng | 80M | 35 | có |
| Mái hiên | `awning_royal` | Mái hiên nhung đỏ | 400M | 100 | |

Có 16 phong cách mua được (không tính 4 mặc định).

## Migration save

- Không tăng version của save, vẫn là 6.
- `state.styles` là trường tùy chọn. Save cũ không có trường này thì dùng phong cách mặc định của từng ô.
- Chưa mua gì thì cảnh giống hệt trước E-17.

## Cân bằng

- Số p22 và p23 giống hệt trước E-17: diff rỗng, 29/29 test.
- Test: `tests/integration/e17-styles-balance.test.ts`. Chiến lược `b_steady`, độ khó Normal, 20 tuần.

| Seed | Sở hữu tuần 20 | Còn thiếu | Tiền cuối | Tem cuối |
| --- | --- | --- | --- | --- |
| 1 | 13/16 | `wall_mural` 300M, `floor_marble` 350M, `awning_royal` 400M | 164.8M | 92 |
| 42 | 13/16 | `wall_mural` 300M, `floor_marble` 350M, `awning_royal` 400M | 188.7M | 112 |

- Cả hai seed không bao giờ sở hữu đủ 16. Vậy tiêu chí 1 (không đủ bộ trước tuần 18) đạt.
- Bot này tiêu tiền vào phong cách, nên đường cong tiền của nó không phải con số 814M của lần kiểm toán (người chơi không mua gì).

## Panel UI (T-51)

- Nút thứ 8 trên dock mở panel Phong cách quán.
- 4 tab, mỗi tab một ô.
- Xem trước và xác nhận mua ngay trong panel.
- Vùng bấm từ 44px trở lên.

## Đã chạy

- `npm run check` xanh trong các lần chạy của builder: tsc, 2201 test, build.
- `tests/render/shop-styles.test.ts` (T-50), 5 test: với mọi phong cách ở chất lượng low, medium và high, số mesh, số đỉnh và danh sách vật liệu không đổi. Đây là bằng chứng cấu trúc về draw call, tách biệt với thời gian khung hình, vốn chưa đo (`perf:frames` chưa kiểm chứng, xem dưới).
- Layout của panel phong cách: 24/24, chỉ khi chạy với `LAYOUT_OFFLINE=1`.

## Chưa kiểm chứng

- **Layout:** 24/24 ở trên KHÔNG tương đương `npm run layout`. Bản đầy đủ 98/98 chưa kiểm chứng.
- **Hiệu năng (`npm run perf:frames`):** chưa chạy được, nên không có số khung hình.
- **Media (`npm run media`):** chưa chạy được, nên không có ảnh chụp. Script media cũng chưa có ảnh cho phong cách.
- Nguyên nhân chặn perf và media: `EPERM` khi listen `127.0.0.1:4173`, và vite không có trong worktree.

### Chủ dự án cần chạy

```
npm run layout
npm run perf:frames
npm run media
```

Sau đó thêm số đo và ảnh vào báo cáo này.

## Test chập chờn

- `tests/ui/css-order.test.ts`: quá thời gian khi máy tải nặng. T-51 nâng timeout từ 5s lên 20s. Đây là test duy nhất thấy lỗi.
- `full-day`, `ui-flow`, `no-emoji`, `p29-invariants`: đã biết là chập chờn. Không thấy lỗi nào trong các lần chạy của E-17.
