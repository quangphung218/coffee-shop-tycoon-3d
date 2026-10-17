# Thiết kế UI overlay — Coffee Shop Tycoon 3D (P14)

Tài liệu giải thích (Diátaxis: explanation): giao diện HTML/CSS phủ lên cảnh 3D được sắp xếp thế nào và vì sao. Đây là bản tham khảo UI; hiệu ứng, cách render và độ mượt do Lead/FE quyết.

| File | Nội dung |
|---|---|
| `design/tokens.json` | Token (Design Tokens Format Module), kèm `contrastPairs` |
| `design/main-menu.html` | Main Menu (có/không bản lưu), Ván mới (mặc định, lỗi), Tải game (slot có dữ liệu/trống/hỏng, xác nhận xóa tại chỗ, đang tải, tải lỗi), Cài đặt, bảng trạng thái Button |
| `design/hud.html` | HUD theo 4 pha, nút HUD đủ trạng thái, Toast 4 loại, nhãn trên đầu khách, lớp phủ Tạm dừng |
| `design/prep.html` | Panel cạnh phải 6 tab (Việc, Menu, Kho, Nhân viên, Marketing, Nâng cấp) và bảng trạng thái Tabs/Stepper/Toggle/Dropdown/Badge |
| `design/report.html` | Daily Report (lãi, lỗ, không khách, đang tổng kết, lỗi tự lưu), Đánh giá (có dữ liệu, rỗng) |
| `design/p14-overlay/index.html` | Trang tóm tắt một màn gameplay + một báo cáo, để hệ thống chụp ảnh gửi duyệt |

Mỗi file HTML là mockup tĩnh: mỗi trạng thái là một khu có tiêu đề riêng, xếp dọc. Lớp `is-hover`, `is-focus`, `is-active` chỉ để minh họa; bản thật dùng `:hover`, `:focus-visible`, `:active`.

## Mục tiêu và người dùng

- Người chơi trên trình duyệt máy tính (chuột + bàn phím là chính: kéo xoay camera, WASD, phím tắt). Màn hẹp 390 px vẫn dùng được nhưng không phải nền tảng chính.
- Việc họ cần làm mỗi ngày: chuẩn bị (nhập hàng, chọn menu, xếp người) → mở cửa và theo dõi → đọc báo cáo → sang ngày mới. UI phải trả lời nhanh 3 câu: *mấy giờ, đang pha nào*, *có bao nhiêu tiền, khách chấm mấy sao*, *việc gì đang có vấn đề*.
- Chữ tiếng Việt, tiền dạng `25.000đ` (dấu chấm ngăn nghìn, `đ` dính liền), số thập phân dùng dấu phẩy (`3,8`).

## Luồng

```
Main Menu ─┬─ Tiếp tục ───────────────┐
           ├─ Ván mới (tên, độ khó, slot) ─┤
           ├─ Tải game (chọn slot) ───┤
           └─ Cài đặt                 ▼
                     Chuẩn bị (panel 6 tab, giờ đứng ở 07:00)
                        │ "Mở cửa"
                        ▼
                     Mở cửa → Cao điểm → Đóng cửa (HUD + toast + nhãn khách;
                        │                       panel mở được bất cứ lúc nào)
                        ▼ khách cuối rời đi → tự lưu
                     Daily Report (Tổng kết | Đánh giá) ── "Sang ngày mới" ──► Chuẩn bị
```

Đường lỗi đã vẽ: tên quán trống; slot hỏng; tải lỗi; thiếu tiền nhập hàng / mua nâng cấp / chạy marketing; món bị khóa vì thiếu nguyên liệu hoặc chưa mở khóa; khách bỏ đi; tự lưu thất bại; ngày không có khách.

## Quyết định bố cục chính

1. **Giữa màn hình luôn là quán.** HUD là một thanh ở mép trên; panel 360 px ở cạnh phải (tối đa 42% bề ngang); toast ở góc dưới trái; nhãn khách nổi theo nhân vật. Khi panel mở, camera lệch sang trái để quán nằm giữa phần còn trống (mockup minh họa bằng cách dịch cảnh). Ở ≤ 640 px, panel thành tấm kéo từ đáy, cao tối đa 60%.
2. **Chỉ hai lớp phủ:** Daily Report và Tạm dừng. Mọi thứ khác là sửa tại chỗ hoặc menu sổ: xác nhận xóa slot và xác nhận mua nâng cấp nằm ngay trong thẻ; phân vai bằng menu sổ; giá món bằng stepper. Lý do: thao tác nhỏ không nên chặn cả màn, và người chơi vẫn thấy quán chạy.
3. **Vô hiệu nhưng vẫn giải thích được.** Nút thiếu tiền, món bị khóa, menu vai khi đang bật Auto-assign: dùng `aria-disabled="true"` (vẫn focus được, trình đọc màn hình đọc được lý do qua `aria-describedby`), nền xám hoặc viền gạch, và một dòng 🔒 lý do + con số cụ thể + lối ra ("Thiếu 110.000đ… Bớt hạt cà phê xuống 3 kg là đủ").
4. **Không truyền đạt chỉ bằng màu.** Kiên nhẫn của khách = độ dài thanh + mặt cảm xúc + %. Tồn kho = biểu tượng + chữ (✅ Đủ / ⚠️ Sắp hết / ⛔ Hết). Lãi/lỗ = mũi tên ▲▼ + chữ "Lãi/Lỗ" + dấu +/−. Tab đang chọn = gạch chân 4 px + chữ đậm. Nút tốc độ đang chọn = nền + `aria-pressed`.
5. **Icon luôn kèm chữ.** Emoji làm icon (không cần tài nguyên ngoài) và luôn có nhãn chữ; ở 390 px, chữ phụ "Đặt lại"/"Cài đặt" có thể ẩn nhưng vẫn còn "camera" và `aria-label`.
6. **Pha Chuẩn bị không có đồng hồ chạy.** Nhóm nút tốc độ được thay bằng nút "🔔 Mở cửa" (hành động chính của pha). Task Board chỉ gợi ý, không chặn mở cửa.
7. **Panel trong suốt nhẹ, chữ đặt trên nền đặc.** `surface.panel` là kem 94% (+ backdrop blur tùy FE), nhưng mọi khối chứa chữ (thẻ món, đầu/chân panel) dùng `surface.panel-solid`, nên tương phản không phụ thuộc cảnh 3D phía sau.
8. **Hai màu vòng focus.** Xanh `focus.500` trên nền sáng, vàng `focus.300` trên HUD tối, vì xanh không đủ 3:1 trên nền cà phê.
9. **Báo cáo đọc theo câu hỏi:** kết quả → vì sao → đánh giá cũ→mới → món → gợi ý ngày mai. Mỗi gợi ý có nút dẫn thẳng tới tab liên quan. Tự lưu xảy ra trước khi báo cáo hiện; lỗi lưu không khóa nút "Sang ngày mới".

## Token và ánh xạ sang CSS

Repo chưa có token trong code, nên đây là bộ đầu tiên. Tên CSS variable trong mockup ánh xạ 1-1:

| Token | CSS variable |
|---|---|
| `color.<palette>.<step>` (vd `color.coffee.700`) | `--color-coffee-700` |
| `color.text.*`, `color.surface.*`, `color.border.*`, `color.accent.*` | `--text-*`, `--surface-*`, `--border-*`, `--accent-*` |
| `color.data.*`, `color.patience.*`, `color.rating.*` | `--data-*`, `--patience-*`, `--rating-*` |
| `color.focus-ring.default` / `.inverse` | `--focus-ring` / `--focus-ring-inverse` |
| `font.size.*`, `font.weight.*`, `font.line-height.*`, `font.family.base` | `--font-size-*`, `--font-weight-*`, `--line-height-*`, `--font-family-base` |
| `space.1…16` (lưới 4 px: 4, 8, 12, 16, 24, 32, 48, 64) | `--space-1…16` |
| `radius.*`, `shadow.*`, `duration.*`, `easing.standard` | `--radius-*`, `--shadow-*`, `--duration-*`, `--easing-standard` |
| `size.*` (target 44, panel 360, focus 3 px…) | `--size-*` |

Bảng màu: cà phê (thương hiệu, nút chính), kem (nền), mint (hành động tích cực, trạng thái đang chọn trên HUD), cùng ok/cảnh báo/lỗi. `color.scene.*` chỉ để vẽ cảnh minh họa trong mockup; cảnh 3D thật tự quản màu.

### Thang P24

Mọi khung, nút và chữ trong game lấy cỡ từ bảng dưới. Tên biến cũ vẫn dùng được; `--size-outline` nay bằng `--size-frame-outline` (2 px).

| Nhóm | Token CSS | Giá trị | Dùng cho |
|---|---|---|---|
| Chữ | `--font-size-caption` | 12 px | chú thích |
| | `--font-size-label` | 14 px | nhãn, meta |
| | `--font-size-value` | 16 px | giá trị, nội dung |
| | `--font-size-panel-title` | 20 px | tiêu đề bảng (bậc lớn nhất trong UI game) |
| | `--font-size-screen-title` và `--font-size-xl` trở lên | 24 px+ | chỉ tiêu đề màn hình và báo cáo |
| Điều khiển | `--size-control-sm` | 32 px | nút gọn đặt trong vùng chạm lớn hơn |
| | `--size-control-md` | 44 px | nút, tab, stepper mặc định |
| | `--size-control-lg` | 56 px | nút hành động chính |
| | `--size-hud-row` | 48 px | chiều cao mọi cụm HUD |
| Viền | `--size-frame-outline` | 2 px | khung, cụm HUD, dock, panel, toast, nút |
| Bóng | `--shadow-sm` | `0 1px 0` mực | nút đang nhấn |
| | `--shadow-md` | `0 2px 0` mực | nút nghỉ |
| | `--shadow-lg` | `0 3px 0` mực | nút hover |
| | `--shadow-soft` | `0 6px 14px rgba(58,34,22,.12)` | quầng mờ dưới khung nổi |
| | `--shadow-card` | `shadow-md` + `shadow-soft` | thẻ, báo cáo |
| | `--frame-shadow` | `shadow-sm` + `shadow-soft` | khung nổi: cụm HUD, dock, panel |

Quy tắc:

- **Nút có bóng, nhãn phẳng.** Nút giữ ba mức nghỉ/hover/nhấn (`--btn-shadow-rest/hover/press`), chỉ đổi độ nổi. Nhãn, badge, chip không có bóng và không có con trỏ tay.
- **Mỗi trạng thái đổi một tín hiệu.** Hover đổi độ nổi, nhấn đổi độ nổi, đang chọn đổi nền, focus đổi viền + vòng trong; không trạng thái nào đổi cùng lúc cỡ, viền và bóng.
- **Chỉ báo pha không dùng chấm.** Pha trong ngày luôn hiện bằng chữ (Chuẩn bị, Mở cửa, Cao điểm, Đóng cửa); chấm không nhãn không được dùng làm chỉ báo.
- **Số kết quả của màn tổng kết dùng một cỡ.** Số lãi Báo cáo ngày và "Điểm tuần" ở Tổng kết tuần cùng `--font-size-2xl`; số khác `--font-size-value`, nhãn `--font-size-label`. Cột 7 ngày giữ chữ nhỏ của biểu đồ để vừa 390 px.
- **Chân màn tổng kết không cắt nút.** Ở ≤ 640 px, chân Tổng kết tuần xuống hàng: "Về menu" và "Chơi lại" chung hàng đầu, nút chính cả hàng dưới; nhãn dài xuống dòng, không có kích thước cố định.
- **Thông báo giao dịch chỉ qua toast.** Nhập hàng, mua nâng cấp, chạy marketing báo số tiền và số dư bằng toast; không chèn câu giao dịch vào thân bảng.

Thời lượng animation: `fast` 120 ms (hover, nhấn, công tắc), `base` 200 ms (đổi tab, mở menu sổ, toast vào), `slow` 320 ms (panel trượt, báo cáo hiện), `toast-visible` 4 s (chỉ toast thông tin/thành công; cảnh báo/lỗi ở lại tới khi đóng). Tôn trọng `prefers-reduced-motion`: bỏ trượt, chỉ đổi độ mờ.

## Danh sách component

| Component | Biến thể / thuộc tính | Trạng thái đã vẽ | Ghi chú tiếp cận |
|---|---|---|---|
| **Button** | primary (cà phê), accent (mint: Mở cửa), secondary, danger; cỡ thường 44 px, lớn 56 px, nhỏ | mặc định, hover, focus, nhấn, vô hiệu kèm lý do, đang tải | `aria-disabled` thay cho `disabled` để vẫn đọc được lý do |
| **HudButton** | thường, đang chọn (`aria-pressed`), CTA | mặc định, hover, focus (vàng), nhấn, đang chọn, vô hiệu (viền gạch) | 44×44 px tối thiểu |
| **Panel** | cạnh phải (≥ 641 px), tấm đáy (≤ 640 px); head (tiêu đề, tiền, Đóng), tabs, body cuộn, foot cố định | mở, các tab | Esc đóng; focus trở về nút đã mở panel |
| **Tabs** | lưới 3×2 trong panel; hàng ngang trong báo cáo; badge đếm cảnh báo | mặc định, hover, đang chọn, focus | Mẫu APG Tabs: ← → chuyển tab, Home/End, chỉ tab đang chọn nằm trong thứ tự Tab |
| **Dropdown** (menu sổ) | nút + listbox; option có ghi chú phụ | đóng, hover, focus, mở với option đang trỏ, cảnh báo (chưa có vai), vô hiệu | Mẫu APG Select-only Combobox/Listbox: ↑ ↓, Enter, Esc |
| **Stepper số lượng** | số lượng, giá (bước 1.000đ, ô rộng) | mặc định, hover, focus nút +, chạm min (− vô hiệu), đang gõ | Ô giữa gõ được; nhãn ẩn cho trình đọc; giữ phím ↑ ↓ trong ô cũng đổi giá trị |
| **Toggle** | công tắc có chữ Bật/Tắt (hoặc Bán/Không) | tắt, bật, hover, focus, vô hiệu kèm lý do | `role="switch"` + `aria-checked` |
| **StatRow** | thường, tổng (viền trên đậm); giá trị dương/âm | — | `dl/dt/dd`; số dùng `tabular-nums` |
| **Toast** | thông tin, thành công, cảnh báo, lỗi; có/không nút hành động | mặc định, hover/focus nút Đóng | `role="status"`, lỗi dùng `role="alert"`; tối đa 3; dừng đếm giờ khi rê chuột/focus |
| **StarRating** | hiển thị (★ + số), so sánh cũ → mới + delta | lên, xuống, không đổi | `role="img"` + `aria-label` đọc "3,9 trên 5 sao" |
| **Badge tồn kho** | Đủ, Sắp hết, Hết, Chưa mở | — | Luôn biểu tượng + chữ |
| CustomerTag | món + thanh kiên nhẫn + mặt + % | vừa gọi, chờ lâu, sắp bỏ, đã phục vụ, bỏ đi, rút gọn khi zoom xa | Thêm ngoài danh sách yêu cầu |
| SaveSlot, InlineConfirm, EmptyState, ErrorSummary | — | có dữ liệu/trống/hỏng/đang tải/lỗi | ErrorSummary theo mẫu GOV.UK |

## Tự soát

**WCAG 2.2 AA**

- Tương phản (SC 1.4.3, 1.4.11): khai đủ cặp trong `tokens.json → $extensions["claude-bridge"].contrastPairs`. Tự tính trước khi nộp: chữ chính/kem ≈ 15:1; chữ phụ `neutral.700`/kem ≈ 6:1; trắng/`coffee.700` ≈ 10:1; trắng/`mint.700` ≈ 6,4:1; `coffee.900`/`mint.500` ≈ 5,8:1; ok/cảnh báo/lỗi trên nền nhạt của chúng ≈ 4,8 / 6,7 / 5,5:1; viền input `neutral.500`/kem ≈ 3,7:1; sao `star.500`/kem ≈ 3,3:1; vòng focus xanh/kem ≈ 6,4:1, vàng/HUD ≈ 10:1; thanh kiên nhẫn trên nền `coffee.700` ≥ 3,3:1. Đã bỏ dùng `warning.500` làm vạch toast vì chỉ ≈ 2:1 trên kem. Hệ thống sẽ tính lại từ `contrastPairs`.
- Nền bán trong suốt (`surface.panel` 94%, `surface.hud` 92%) được kiểm bằng bản đặc tương ứng; độ lệch nhỏ vì độ phủ cao.
- Đích bấm (SC 2.5.8): mọi nút, tab, option, nút stepper, công tắc ≥ 44×44 px.
- Focus (SC 2.4.7, 2.4.11): viền 3 px cách 2 px, hai màu theo nền; panel và toast không che phần tử đang focus (toast góc trái dưới, panel phải).
- Reflow (SC 1.4.10): bố cục co về 1 cột, HUD xuống dòng, panel thành tấm đáy; không có chiều rộng cố định > 320 px ngoài `min()`.
- Không chỉ bằng màu (SC 1.4.1): xem quyết định 4.
- Nhãn trường nhập (SC 3.3.2): mọi input có `label` (hiện hoặc ẩn cho trình đọc), nhóm radio có `legend`/`aria-labelledby`.

**10 nguyên tắc Nielsen**

1. Trạng thái hệ thống: HUD luôn hiện giờ/pha/tiền/sao; "Đã lưu", "Đang tải…", toast. ✔
2. Khớp thế giới thật: từ ngữ quán cà phê (nhập hàng, pha chế, lương/ngày), tiền đồng. ✔
3. Kiểm soát và tự do: Hủy trong xác nhận tại chỗ, Esc đóng panel, Tạm dừng bất cứ lúc nào. ✔
4. Nhất quán: một bộ token, cùng mẫu thẻ món/kho/nâng cấp. ✔
5. Phòng lỗi: xác nhận trước khi xóa slot/mua nâng cấp; focus vào "Hủy" trước; cảnh báo ghi đè slot. ✔
6. Nhận ra hơn nhớ: món bị khóa vẫn hiện kèm lý do; Task Board dẫn thẳng tới tab. ✔
7. Linh hoạt: phím tắt (Space, 1/2/3, Q/E, WASD, Home, Esc), gợi ý nhập tự động, Auto-assign. ✔
8. Tối giản: panel chỉ hiện số cần quyết; chi tiết phụ ở dòng mờ. Chấp nhận: HUD ở 390 px chiếm 2–3 dòng vì mọi mục đều thiết yếu.
9. Nhận diện và sửa lỗi: thông báo lỗi nói nguyên nhân + con số + cách sửa. ✔
10. Trợ giúp: bảng phím tắt trong Cài đặt; chưa có hướng dẫn chơi lần đầu (để hạng mục sau). Chấp nhận có điều kiện.

**Nhất quán token:** màu, cỡ chữ, khoảng cách, bo góc, bóng trong mockup đều đọc từ biến CSS ở trên. Ngoại lệ là kích thước hình học nhỏ không phải token (độ dịch núm công tắc 22 px, chiều rộng ô stepper giá 88 px, nhãn khách 152 px, `letter-spacing` tiêu đề nhóm Cài đặt) và tọa độ trong SVG minh họa.

## Giả định (Lead xác nhận)

- Giờ đứng yên trong pha Chuẩn bị cho tới khi bấm "Mở cửa".
- Vốn khởi đầu theo độ khó (3.000.000đ / 2.000.000đ / 1.200.000đ), giá món, lương là số minh họa; sim quyết số thật.
- 3 slot lưu tay + 1 slot tự lưu.
- Phím: Q/E xoay, WASD/mũi tên pan; tắt "Di chuyển camera bằng WASD" thì Q/A xoay như spec gốc.
- Vai nhân viên: Pha chế, Thu ngân, Phục vụ, Dọn dẹp, Nghỉ hôm nay.

## Nguồn

Các nguồn chuẩn được dùng theo hiểu biết sẵn có, không mở lại trong phiên này: WCAG 2.2 (ngưỡng tương phản, 2.4.11, 2.5.8, 1.4.10), WAI-ARIA APG (Tabs, Listbox/Combobox, Switch), Design Tokens Format Module (cấu trúc `$value`/`$type`, màu dạng object, dimension `{value, unit}`), GOV.UK Design System (Error summary, xác nhận), NN/g 10 Usability Heuristics, Apple HIG (đích chạm 44 pt).
