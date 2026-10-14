# Icon 3D

Bộ quy tắc phong cách của icon 3D trong game: cách dựng, chiếu sáng, đóng gói atlas và hiển thị ở cỡ nhỏ. Mô hình nằm trong `src/icon-studio/`, `npm run icons` dựng lại atlas; trang xem toàn bộ icon là `public/icons3d/index.html`.

![So sánh SVG phẳng cũ (giữa) và 3D (phải) ở 16 / 24 / 48 px](../../docs/reports/p18-icons-sample.png)

## 1. Bộ quy tắc phong cách (`src/icon-studio/style.ts`)

| Quy tắc | Giá trị | Ghi chú |
|---|---|---|
| Camera | Trực giao (orthographic), ba tư thế: `object` nhìn xuống 30°, xoay 35° sang phải; `glyph` nhìn thẳng, xuống 12°; `top` nhìn xuống 58°, xoay 25° | Mô hình khai tư thế bằng `posed()`, không tự chỉnh góc. |
| Ánh sáng | Hemisphere kem `#fff6e8` / nâu nhạt `#d9c2a5` (1,5); đèn chính ấm `#ffe2b8` (2,1) ở **trên-trái màn hình**; đèn phụ lạnh `#cfe6ff` (0,6) phải-dưới; đèn viền `#fff0d0` (1,1) phía sau | Đèn đặt theo hệ trục camera nên "trên-trái" luôn đúng trên ảnh. |
| Vật liệu | `MeshLambertMaterial` tô phẳng (flat shading), mỗi mặt một sắc | Giống `src/render/scene/shop.ts`. |
| Viền | Vỏ mặt sau đẩy ra theo pháp tuyến, màu mực `neutral.900` #3a2216; ô 24 có thêm dải mực phẳng quanh hình (mục 2) | Chi tiết nhỏ có thể tắt viền (`outline: false`). |
| Bảng màu | `PALETTE`, lấy thẳng từ `design/tokens.json`: ink, honey, coffee, cream, mint, berry ("coral"), sky, leaf, tangerine, skin 1–4, hair 3–4 | Mô hình chỉ chọn tên màu trong `PALETTE`, không tự đặt hex. |
| Bóng | Bóng tiếp xúc: elip mềm dưới chân, mực 55% → 0 | Chỉ ở ô 48. |

## 2. Atlas: ô 48 và ô 24

Atlas có **113 icon**: 105 icon của `src/ui/core/icons.ts` và 8 avatar theo `AVATAR_LOOKS` (`src/ui/core/iconMap.ts`). Mỗi icon có hai ô, đóng trong `public/icons3d/atlas@1x.webp` và `atlas@2x.webp` (khe 2 px); `atlas.json` ghi toạ độ.

| Ô | @1x / @2x | Hiển thị ở | Cách vẽ |
|---|---|---|---|
| Lớn | 48 / 96 px | 32 và 48 px: dock, đầu panel, báo cáo | Viền vỏ 3,5% khung, lề 8%, có bóng tiếp xúc. |
| Nhỏ | 24 / 48 px | 16 và 24 px: nút, toast, dòng kho | Dải mực phẳng ≈ 1,8 px quanh hình (≈ 1,2 px khi hiện 16 px), vỏ mỏng hơn chỉ để kẻ mực giữa các phần, lề 3%, không bóng, bỏ phần hẹp dưới 6% khung, tăng tương phản và độ bão hoà. |

Ô nhỏ của các nút chỉ có icon dùng mô hình riêng (`src/icon-studio/models/small.ts`), nhìn thẳng, ít phần hơn:

| Icon | Ô 24 |
|---|---|
| `i-coin` | Đồng xu vàng nhìn thẳng, vòng và vạch màu mực như SVG |
| `i-camera` | Thân và loa che màu sky, một ống kính kem to có tròng mực |
| `i-close` | Dấu X thân coral viền mực, không trùng nền kem của HUD |
| `i-settings` | Bánh răng 6 răng to, lỗ giữa màu mực |
| `i-pause` | Hai thanh cách xa hơn để thấy mực ở giữa |
| `i-speed-4` | Ba đầu mũi tên cao hơn |

Lúc build, `npm run icons` đo từng ô 24 trên ảnh @1x đã nén và ghi vào `atlas.json` (`smallQuality`); `tests/icons/atlas.test.ts` giữ các ngưỡng trong `SMALL_QUALITY` (`src/icon-studio/atlas.ts`):

| Số đo | Ngưỡng |
|---|---|
| `edgeInk`: tỉ lệ pixel mực ở mép hình | ≥ 0,6 |
| `edgeContrast`: tương phản của mép so với nền kem HUD `#fffaf2` | ≥ 3:1 (WCAG 1.4.11) |
| `creamShare`: tỉ lệ pixel gần như trùng nền kem (dưới 1,25:1), xét ở nút chỉ có icon và `i-coin` | ≤ 0,5 |

Ngân sách dung lượng: 120 kB @1x, 300 kB @2x (`BUDGET`); build tự hạ chất lượng WebP cho tới khi vừa.

Atlas tải sau Main Menu, không chặn gì. Lúc đang tải, ô icon là khoảng trống giữ đúng kích thước, không hiện SVG thay thế.

## 3. Quy ước theo nhóm

Quy tắc chung: một vật chính, tối đa 3 màu tô + mực; vật phụ (hơi nước, tia sáng) nhỏ hơn 1/3 vật chính; cùng nhóm cùng tư thế, cùng tỉ lệ đáy; không chữ, không số trong icon (chữ "x2" của tốc độ do HTML vẽ). Nhãn `aria-label` và chữ cạnh icon giữ nguyên.

| Nhóm | Icon | Tư thế | Quy ước |
|---|---|---|---|
| HUD / điều hướng | tasks, people, marketing, camera, settings, open, next-day, home, load, save, delete, music, sound, quality, clock, coin, chart, trophy, lock, tip, busy, auto | `object` | Đồ thật cỡ trung: bảng kẹp giấy, chuông, máy quay, bánh răng dày, đồng xu vàng nhìn nghiêng thấy cạnh. Màu chủ đạo honey/cream, điểm nhấn 1 màu. |
| Ký hiệu điều khiển & trạng thái | pause, speed-1/2/4, close, back, forward, check, equal, chevron-down, retry, reset, ok, error, warning, info, trend-up/down, star, star-empty, dot, dot-empty, todo, free, rest, sparkle | `glyph` | Khối đùn dày như kẹo, nhìn thẳng. Màu theo nghĩa giống SVG (mint = tốt, berry = lỗi, honey = cảnh báo, sky = thông tin) **và luôn kèm hình khác nhau** (tích, gạch, chấm than, chữ i). `star-empty`, `dot-empty`: thân cream-200, cùng khối. |
| Món (10) | espresso, americano, latte, cappuccino, mocha, bubble-tea, lemon-tea, orange-juice, croissant, cake | `object` | Đồ uống cùng một đáy ly, phân biệt bằng **dáng ly** và topping. Món nóng có 2 sợi hơi nước kem; món lạnh có 2 viên đá. Bánh đặt trên đĩa nhỏ cream. |
| Nguyên liệu (12) | beans, milk, sugar, cacao, tea, pearls, lemon, orange, flour, butter, ice, cup | `top` cho vật dẹt/viên (beans, sugar, pearls, lemon, orange, butter, ice); `object` cho bao/hộp (milk, cacao, tea, flour, cup) | Vật nguyên liệu thô, không có ly. Bao/hộp có nhãn một màu, không chữ. |
| Nâng cấp (10) | tables, machine, fast-machine, counter, outdoor, expand, plants, paintings, lights, window-bar | `object` | Dựng đúng đồ trong cảnh (`src/render/scene`) để người chơi nhận ra món đồ sẽ xuất hiện trong quán. |
| Marketing (4) | flyer, happy-hour, social, kol | `object` | Đồ vật cầm tay, điểm nhấn berry chung cho cả nhóm. |
| Vai | cup-hot, role-server, role-cleaner, chef | `object` | Dụng cụ của vai, không vẽ người, cùng nền đáy tròn cream-200. |
| Pha | phase-prep, phase-open, flame, phase-close | `object` | Giỏ, cửa quán có biển, ngọn lửa, trăng. |
| Lý do review | thumb-up, thumb-down, face-happy/ok/worried/angry | `glyph` | Tay ngón cái: lên mint, xuống berry, **hướng tay** là tín hiệu chính. Mặt khách: quả cầu nhìn thẳng, nét mặt khác hẳn nhau. |
| Avatar | `i-avatar-0` … `i-avatar-7` | `object` khung chặt | Một ô cho mỗi tổ hợp da/tóc của `AVATAR_LOOKS`, đầu ≈ 70% ô. |
| Độ khó, nhiệt độ | easy, cold | `object` | Mầm cây, bông tuyết khối. |

## 4. Chuyển động CSS nhẹ ("4D")

Không làm sprite hoạt ảnh; icon là một ảnh tĩnh, chỉ biến đổi bằng `transform`. Theo quy tắc trạng thái (`design/p17-states/README.md`), icon chỉ chuyển động **bên trong** nút, không vượt khỏi viền nút, không che vòng focus.

| Trạng thái | Icon | Token |
|---|---|---|
| Mặc định | Đứng yên. Không nhún liên tục trên HUD/dock. | – |
| Rê chuột (hover) | Nghiêng −6° và nhấc 2 px, phóng 1,06; gốc xoay ở đáy icon | `duration.pop`, `easing.bounce` |
| Nhấn (active) | Ép dẹt: `scale(1.06, 0.92)` gốc đáy, rồi bật về | `duration.instant` |
| Focus bàn phím | Không thêm chuyển động; dùng vòng focus quế của nút | – |
| Đang chọn (dock) | Giữ nghiêng nhẹ −3°, không lặp | – |
| Vô hiệu | `grayscale(1)` + mờ 55%, không phản hồi hover; luôn kèm `i-lock` / chữ lý do | – |
| Báo hiệu một lần | Toast mới, xu bay về HUD: nảy 1 lần (lên 4 px rồi về), tối đa 400 ms | `duration.float`, `easing.out` |

`prefers-reduced-motion: reduce`: bỏ mọi `transform` và nảy; hover/nhấn chỉ còn đổi nền nút. Không có chuyển động nào lặp quá 5 giây (WCAG 2.2.2).

## 5. Tự soát

- **Không chỉ bằng màu (1.4.1)**: nhóm trạng thái và review phân biệt bằng hình (tích/gạch/chấm than, hướng ngón tay). Avatar khác nhau bằng tóc và da.
- **Tương phản biểu tượng (1.4.11)**: viền mực so với nền kem ≈ 14:1; ô 24 được đo và giữ ≥ 3:1 ở mép (mục 2). Icon luôn có chữ hoặc `aria-label` đi kèm.
- **Đích bấm (2.5.8)**: icon nằm trong nút đã ≥ 44 px.
- **Focus (2.4.7, 2.4.11)**: chuyển động icon nằm trong nút, không che vòng focus.
- **Nhất quán token**: mọi màu có sẵn trong `design/tokens.json`; thời lượng dùng `duration.*` / `easing.*`.
