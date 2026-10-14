# T237 · Phong cách hoạt hình ấm và bộ icon tự vẽ

Tài liệu giải thích (Diátaxis: explanation): vì sao giao diện đổi sang phong cách hoạt hình, các quyết định chính, và cách bộ icon SVG thay toàn bộ emoji. Đây là bản tham khảo; hiệu ứng, cách render và độ mượt do Lead/FE quyết.

| File | Nội dung |
|---|---|
| `design/t237-cartoon/index.html` | Nền tảng (màu, chữ, viền, bóng), thành phần đủ trạng thái, Main Menu (có / chưa có bản lưu), HUD lúc Cao điểm + biến thể Đóng cửa, bảng Kho (pha Chuẩn bị) + thiếu tiền / đã nhập / kho đủ, Daily Report (lãi) + lỗ / không khách / đang tổng kết / lỗi tự lưu, ghi chú chuyển động và hướng cảnh 3D |
| `design/t237-cartoon/icons/index.html` | 101 icon cạnh nhau ở 48 px, theo nhóm, ở 3 cỡ 48/24/16, quy tắc vẽ, màu tô, nền thật |
| `design/tokens.json` | Token mới (thay bộ P14), kèm `contrastPairs` |

## Mục tiêu

Anh muốn game “sinh động, hoạt họa hơn, đẹp hơn, icon đồng nhất, không dùng emoji”. Hiện UI là lớp HTML phẳng (thanh HUD nâu tối, nút bo 10 px, viền 1 px) và icon là emoji, nên mỗi hệ điều hành vẽ một kiểu, nét và màu không khớp nhau, không đổi màu được, và nhãn khách 3D vẽ emoji lên canvas.

## Người dùng và bối cảnh

- Người chơi trên trình duyệt máy tính, chuột + bàn phím; màn hẹp 390 px vẫn dùng được.
- Chữ tiếng Việt có dấu chồng, tiền `25.000đ`, số thập phân `4,2`.
- Ràng buộc: thao tác nhỏ sửa tại chỗ hoặc menu sổ, không modal; chỉ font hệ thống; song song có task tối ưu tải trang (nên không thêm webfont, không thêm ảnh bitmap).

## Luồng (không đổi so với P14)

Main Menu → Chuẩn bị (dock: Việc, Menu, Kho, Nhân viên, Marketing, Nâng cấp, Đánh giá; giờ đứng ở 07:00) → “Mở cửa” → Mở cửa → Cao điểm → Đóng cửa (toast, bong bóng khách) → Daily Report (Tổng kết | Đánh giá) → “Ngày tiếp theo”. Đường lỗi đã vẽ: thiếu tiền nhập hàng, món hết nguyên liệu, khách bỏ đi, tự lưu thất bại, ngày không có khách, chưa có bản lưu.

## Quyết định chính và lý do

1. **Ngôn ngữ “sticker”**: mọi khối có viền mực 3 px (`size.outline`, màu `color.neutral.900` #3a2216) và bóng cứng không nhòe (`shadow.md` 0 4 px). Nút nhấc 2 px khi rê, lún khi bấm. Đây là thứ tạo cảm giác hoạt hình rõ nhất mà không cần font hay ảnh mới.
2. **Màu vui trên nền kem, chữ luôn là mực**: honey (nút chính, đang chọn), mint (hành động của pha: Mở cửa), berry (nguy hiểm), sky (thông tin, focus). Nền nút sáng nên chữ trên nút đổi từ trắng sang mực (`text.on-accent`), tương phản 6–9:1 thay vì phải dùng màu tối kém vui.
3. **HUD thành các viên kẹo nổi trên cảnh**, bỏ thanh nâu tối: trái là Ngày / Giờ / pha, phải là Tiền / sao / tốc độ / Dừng / camera / Cài đặt. Trời và quán lộ ra nhiều hơn, quán nhìn “sáng” hơn.
4. **Bảng quản lý chuyển xuống dock dưới giữa** (icon 32 + chữ, đích 76 × 64 px). Lý do: hàng HUD cũ quá dài ở 1440 px khi thêm icon to; dock là mẫu quen thuộc của game quản lý (Jakob), đích to gần vùng chuột (Fitts), và giữa màn vẫn là quán. Panel vẫn trượt từ phải; ở ≤ 640 px panel thành tấm full chiều ngang, dock thành lưới 4 cột.
5. **Một bộ icon, một ngữ pháp** (xem trang icons): lưới 24, vùng an toàn 2–22, nét 2 px tròn, viền mực, tô phẳng tối đa 2 màu trong 10 màu `color.icon.fill-*`, bo góc mọi hình chữ nhật. Màu được đổi qua biến CSS nên cả bộ đổi được theo theme mà không sửa symbol. Avatar nhân viên là một hình, đổi da/tóc bằng `--av-skin` / `--av-hair`.
6. **Không truyền đạt chỉ bằng màu**: kiên nhẫn = độ dài thanh + mặt khác hình (miệng, lông mày, giọt mồ hôi) + %; tồn kho = icon + chữ (Đủ / Sắp hết / Hết); lãi/lỗ = tam giác lên/xuống + chữ + dấu; tốc độ = 1/2/3 tam giác; tab và nút dock đang chọn có thêm viền + bóng, không chỉ đổi nền.
7. **Dấu tiếng Việt**: `line-height.tight` nâng 1.2 → 1.25; không chữ hoa toàn bộ, không giãn chữ, không viền chữ (text-stroke) vì làm dính dấu; chữ nhỏ nhất 12 px luôn đậm.
8. **Không modal cho thao tác nhỏ**: nhập hàng dùng stepper tại chỗ, gợi ý điền thẳng vào dòng, lỗi thiếu tiền hiện ngay dưới nút. Chỉ Daily Report (và Tạm dừng) là lớp phủ, như P14.

## Token và ánh xạ sang code

Tên biến ngữ nghĩa giữ nguyên `src/ui/styles/tokens.css` (`--text-*`, `--surface-*`, `--border-*`, `--accent-*`, `--data-*`, `--patience-*`, `--rating-*`, `--focus-ring*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--size-*`), nên đa số chỉ cần thay giá trị. Thay đổi FE cần biết:

- Bảng màu gốc mới: `ink` dùng `neutral.900`; thêm `honey`, `berry`, `sky`, `leaf`, `tangerine`, `skin`, `hair`. Bỏ `mint.700/800`, `neutral.500`, `text.danger-inverse` (không còn nền tối cho chữ đỏ). `ok/warning/danger.100` giờ trỏ vào mint/honey/berry.100.
- Mới: `border.outline`, `border.disabled`, `surface.ink`, `surface.info`, `accent.danger*`, `accent.info`, `color.icon.*` (`--icon-ink`, `--icon-fill-*`), `font.weight.heavy`, `font.size.4xl`, `size.outline(-sm)`, `size.icon-*`, `size.hud-pill`, `shadow.soft`, `shadow.card`, `duration.instant/pop/float/count/idle-bob`, `easing.bounce/out`, `color.scene.sky-dawn/dusk`.
- `surface.hud*` giờ là kem; chữ trên HUD đổi sang `text.primary`. `size.panel` 360 → 380, `size.dialog` 720 → 760, `size.focus-offset` 2 → 3, `radius` 6/10/16 → 8/12/20 (+ `xl` 28).
- Icon: đưa sprite trong `icons/index.html` vào một module (vd `src/ui/core/icons.ts` trả `<svg><use>`); đổi trường `icon` trong `src/sim/data/*` từ emoji sang id icon (`'i-latte'`). Nhãn khách trong `src/render/actors/labels.ts` vẽ SVG đó lên canvas thay emoji (cùng sprite nên UI và cảnh 3D giống nhau).

## Bảng thay emoji

| Emoji cũ | Icon | Chỗ dùng |
|---|---|---|
| 📋 | `i-tasks` | Panel Việc; ghi chú báo cáo trên HUD |
| 🍽️ | `i-menu` / `i-role-server` | Panel Menu / vai Phục vụ |
| 📦 | `i-inventory` | Panel Kho, nút Nhập hàng, gợi ý nhập |
| 👥 | `i-people` | Nhân viên, “Khách” trong báo cáo, gợi ý tuyển |
| 📣 | `i-marketing` | Marketing, vai Marketing |
| 🛠️ | `i-upgrades` | Nâng cấp, gợi ý nâng cấp |
| 💬 | `i-reviews` | Đánh giá (panel, tab, trống) |
| 🔔 | `i-open` / `i-info` / `i-sound` | Mở cửa / toast thông tin / âm lượng hiệu ứng |
| ☀️ | `i-next-day` | Sang ngày mới, Ngày tiếp theo |
| 🎥 | `i-camera` | Đặt lại camera |
| ⚙️ | `i-settings` / `i-machine` | Cài đặt / Máy pha tốt hơn |
| ⏸ | `i-pause` | Dừng, Đang tạm dừng |
| ▶️ ▶ ▶▶ ▶▶▶ ⏩ | `i-speed-1` / `-2` / `-4` | Tiếp tục, tốc độ 1x/2x/4x, cài đặt tốc độ |
| 🧺 🚪 🔥 🌙 | `i-phase-prep` / `i-phase-open` / `i-flame` / `i-phase-close` | 4 pha; 🔥 còn dùng cho Nóng, độ khó Khó; 🌙 cho tiêu đề Hết ngày |
| 🕖 | `i-clock` | Ghi chú giờ đứng |
| 🚫 ⛔ | `i-error` | Không nhận khách, Hết, Hỏng, lỗi, món hết nguyên liệu |
| ✅ ✓ 🟢 | `i-ok` / `i-check` / `i-free` | Đủ, thành công / đã xong, đang chọn / Rảnh |
| ⚠️ | `i-warning` | Sắp hết, cảnh báo, chưa có vai |
| 🔒 | `i-lock` | Mọi dòng lý do vô hiệu |
| ✨ | `i-sparkle` | Ván mới, gợi ý nhập tự động |
| 💡 | `i-tip` / `i-lights` | Gợi ý / Đèn trang trí |
| ⏳ | `i-busy` | Bận, đang tải |
| 💤 | `i-rest` | Nghỉ hôm nay |
| 🤖 | `i-auto` | Tự phân vai, Tự động |
| ▲ ▼ = | `i-trend-up` / `i-trend-down` / `i-equal` | Lãi, Lỗ, Hòa vốn, sao tăng/giảm |
| 💰 💵 | `i-coin` | Tiền HUD, Thu chi, slot lưu |
| ★ ⭐ 🌟 | `i-star` / `i-star-empty` (+ `i-kol` cho Mời KOL) | Sao |
| 📊 🏆 | `i-chart` / `i-trophy` | Tổng kết / Món bán chạy |
| 👍 👎 | `i-thumb-up` / `i-thumb-down` | Lý do đánh giá |
| 😠 💢 | `i-face-angry` | Khách bỏ đi (toast, nhãn 3D); thêm `i-face-happy/ok/worried` cho kiên nhẫn |
| 📂 🗑️ 💾 🏠 🔄 ↺ | `i-load` / `i-delete` / `i-save` / `i-home` / `i-retry` / `i-reset` | Tải game, Xóa, Lưu, Về Main Menu, Thử lưu lại, Về mặc định |
| 🎵 🖥️ | `i-music` / `i-quality` | Cài đặt |
| 🌱 ☕ | `i-easy` / `i-cup-hot` | Độ khó Dễ / Vừa; ☕ còn là vai Pha chế, slot lưu, logo (thay bằng linh vật ly) |
| 🧊 (Lạnh) | `i-cold` | Nhiệt độ món |
| 🧹 🧑‍🍳 | `i-role-cleaner` / `i-chef` | Dọn dẹp / chưa có nhân viên |
| 👩 👨 🧑 👱 👩‍🦱 👨‍🦱 🧔 👵 | `i-avatar` × 8 tổ hợp da/tóc | Avatar nhân viên |
| ← → (nút) ✕ | `i-back` / `i-forward` / `i-close` | Quay lại, “Mở Kho →”, Đóng |
| Món: ☕ 🥛 🍫 🧋 🍋 🍊 🥐 🍰 | `i-espresso`, `i-americano`, `i-latte`, `i-cappuccino`, `i-mocha`, `i-bubble-tea`, `i-lemon-tea`, `i-orange-juice`, `i-croissant`, `i-cake` | `src/sim/data/menu.ts` (mỗi món một icon riêng, cũ 3 món chung ☕) |
| Nguyên liệu: 🫘 🥛 🧂 🍫 🍵 ⚫ 🍋 🍊 🌾 🧈 🧊 🥤 | `i-beans`, `i-milk`, `i-sugar`, `i-cacao`, `i-tea`, `i-pearls`, `i-lemon`, `i-orange`, `i-flour`, `i-butter`, `i-ice`, `i-cup` | `src/sim/data/ingredients.ts`, toast sắp hết |
| Marketing: 📄 ⏰ 📱 🌟 | `i-flyer`, `i-happy-hour`, `i-social`, `i-kol` | `src/sim/data/marketing.ts` |
| Nâng cấp: 🪑 ⚙️ ⚡ 🧾 ⛱️ 🏗️ 🪴 🖼️ 💡 🪟 | `i-tables`, `i-machine`, `i-fast-machine`, `i-counter`, `i-outdoor`, `i-expand`, `i-plants`, `i-paintings`, `i-lights`, `i-window-bar` | `src/sim/data/upgrades.ts`, nhóm trong `panels/upgrades.ts` |

Mũi tên ↑ ↓ trong gợi ý phím giữ là chữ trong phím (`kbd`), không phải icon. Dấu “−/+” của stepper là chữ.

## Chuyển động (tóm tắt, chi tiết trong mockup)

Nhún nảy khi đứng (1,2 s), đi kiểu nhảy bước có squash–stretch giữ thể tích, bong bóng order bật ra 360 ms rồi đổi mặt theo kiên nhẫn, hơi nước 2–3 sợi chỉ cho món nóng, xu + “+40.000đ” bay cong về viên Tiền và số đếm lên, nút lún/nảy, panel trượt có nảy 4 px, report rơi xuống và dải kết quả đóng dấu. Mọi hiệu ứng có phương án `prefers-reduced-motion`. Cảnh 3D: toon shading 2–3 bậc, viền mực, bóng tròn dưới chân, nhân vật dáng hạt đậu, trời đổi màu theo pha (`scene.sky-dawn` / `sky` / `sky-dusk`). Tất cả là gợi ý, FE tự cắt bớt nếu tốn khung hình.

## Trạng thái đã vẽ

Nút 4 loại × mặc định / hover / focus / nhấn / vô hiệu; nút HUD, nhóm tốc độ, dock (mặc định, hover, focus, nhấn, đang mở, có badge); badge; stepper (min, focus, đang gõ); toast 4 loại; bong bóng khách 6 trạng thái; Main Menu có và chưa có bản lưu; HUD Cao điểm, Chuẩn bị, Đóng cửa; Kho gợi ý / thiếu tiền / thành công / trống; Report lãi / lỗ / không khách / đang tổng kết / lỗi tự lưu.

## Tự soát

**WCAG 2.2 AA**

- Tương phản (1.4.3, 1.4.11): khai 62 cặp trong `tokens.json`. Tự tính trước: mực trên kem ≈ 12–14:1; mực trên honey ≈ 9:1, mint ≈ 8:1, berry ≈ 6,4:1, sky ≈ 9:1, honey-500 ≈ 7,2:1, berry-500 ≈ 5,1:1; chữ phụ #6e4f3c trên kem ≈ 6–7:1, trên cream-200 ≈ 5,1:1; ok #17663a trên mint-100 ≈ 6,1:1 (đã thay #1e7a46 cũ vì chỉ ≈ 4,4:1 trên kem mới); warning trên honey-100 ≈ 6,6:1; danger trên berry-100 ≈ 5,4:1; viền mực trên trời/cỏ/sàn ≥ 9:1; vòng focus #1a5fd0 trên kem ≈ 4,8–5,6:1, trên trời ≈ 4,4:1, cỏ ≈ 3,9:1, trời chiều ≈ 3,2:1; thanh kiên nhẫn trên rãnh mực ≥ 6,4:1. Nền nút sáng so với nền app thấp (≈ 1,3:1) nên ranh giới do viền mực 3 px gánh; thanh dữ liệu honey trên rãnh cream-200 cũng vậy (mép mực 2 px). `coffee.700` không dùng dưới nét mực.
- Đích bấm (2.5.8): nút, tab, stepper, nút tốc độ ≥ 44 px; nút HUD 48 px; dock 76 × 64 px (64 px ở ≤ 1023).
- Focus (2.4.7, 2.4.11): viền 3 px cách 3 px màu sky-700 trên mọi nền sáng; HUD, dock và toast không đè lên phần tử đang focus (toast ở trên dock, panel ở phải).
- Reflow 320 px (1.4.10): HUD xuống dòng, chú thích “Ngày/Giờ/Tiền” và nhãn pha chưa tới ẩn còn icon (vẫn đọc được qua chữ ẩn và `aria-label`), dock lưới 4 cột, panel và report 1 cột; không có chiều rộng cố định lớn hơn 320 px ngoài `min()`/`max-width`.
- Không chỉ bằng màu (1.4.1): xem quyết định 6.
- Nhãn trường nhập (3.3.2): mọi ô số có `<label for>`; nút − + có `aria-label` kèm tên nguyên liệu.

**10 nguyên tắc Nielsen**

1. Trạng thái hệ thống: HUD luôn có giờ, pha, tiền, sao; tiền bay về HUD cho thấy nguồn tiền; toast; “Đang tổng kết…”. ✔
2. Khớp thế giới thật: icon vẽ đúng đồ trong quán (ly latte có lớp sữa, bao bột, hộp sữa), từ ngữ quán cà phê. ✔
3. Kiểm soát: Đóng (Esc) trên panel, stepper sửa từng dòng sau khi gợi ý, Tạm dừng mọi lúc. ✔
4. Nhất quán: một ngữ pháp icon, một kiểu viền/bóng cho mọi khối, cùng tên token với code. ✔
5. Phòng lỗi: nút nhập hàng khóa kèm số tiền thiếu trước khi bấm. ✔
6. Nhận ra hơn nhớ: mỗi món có icon riêng (cũ 3 món chung ☕), dock luôn có chữ. ✔
7. Linh hoạt: phím tắt giữ nguyên, Auto-restock, Auto-assign. ✔
8. Tối giản: chấp nhận — HUD có thêm icon nên chiếm 2 dòng ở 768 px và 3–4 dòng ở 390 px vì mọi mục đều thiết yếu.
9. Lỗi: thông báo nói nguyên nhân + con số + cách sửa (giữ chữ P14). ✔
10. Trợ giúp: chưa có hướng dẫn chơi lần đầu; ngoài phạm vi T237. Chấp nhận có điều kiện.

**Nhất quán token**: mọi màu, cỡ chữ, khoảng cách, bo góc, bóng trong hai mockup là biến CSS từ `tokens.json`. Ngoại lệ là số hình học không phải token: chiều rộng dock 76/64 px, ô stepper 56 px, thanh kiên nhẫn 88 × 14 px, phase item 36 px, độ dịch đuôi bong bóng, `opacity` trên má hồng/bóng chân, và tọa độ trong SVG minh họa (cỡ chữ 22 trong cảnh là đơn vị SVG).

## Giả định

- Giữ font hệ thống (bo tròn trên Safari/macOS qua `ui-rounded`, nơi khác là system-ui đậm 800); cảm giác hoạt hình đến từ viền, bóng, màu, icon.
- Tên quán “Gió Chiều”, số tiền, review là dữ liệu minh họa; giá nhập/gói lấy đúng `ingredients.ts` (vd sữa 40.000đ/gói 1000 ml).
- Ngưỡng mặt khách ≥ 60% / 30–59% / dưới 30% là đề xuất; sim quyết số thật.

## Nguồn đã đọc

- Code: `src/ui/**` (hud, panels, report, screens, core/toast), `src/sim/data/*`, `src/render/actors/labels.ts`, `src/ui/styles/tokens.css`, `design/NOTES.md`, `design/tokens.json` (bản P14).
- Chuẩn dùng theo hiểu biết sẵn có, không mở lại trong phiên này (mạng tới các tên miền chuẩn bị chặn trong sandbox): WCAG 2.2 (1.4.1, 1.4.3, 1.4.10, 1.4.11, 2.4.7, 2.4.11, 2.5.8, 3.3.2), WAI-ARIA APG (Tabs, Button `aria-pressed`), Design Tokens Format Module (`$value`, `$type`, tham chiếu, màu dạng object, shadow nhiều lớp), Apple HIG (44 pt), NN/g 10 heuristics, Laws of UX (Fitts, Jakob).
