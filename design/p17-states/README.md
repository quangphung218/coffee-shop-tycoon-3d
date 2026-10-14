# P17 · Hệ trạng thái và focus cho nút, nhóm, dock

Tài liệu giải thích (Diátaxis: explanation): vì sao focus của bản hoạt hình T237 nhìn “đè nhau”, quy tắc trạng thái mới thay nó, và cách quy tắc đó đạt WCAG 2.2. Đây là bản tham khảo cho FE; hiệu ứng và cách render do Lead/FE quyết.

| File | Nội dung |
|---|---|
| `design/p17-states/index.html` | So sánh Trước (T237) / Sau (P17) cạnh nhau, chú thích đánh số 1–15: nút đơn, nút HUD, nhóm tốc độ, dock, tab, stepper, trên nền kem và trên cảnh trời/cỏ; bảng đủ trạng thái; sơ đồ chồng lớp; vòng focus trên từng nền kèm tỉ lệ tương phản |
| `design/tokens.json` | Thêm `color.cinnamon.700`; `color.focus.500` trỏ sang nó; thêm `size.focus-clearance`, `size.group-gap`, `size.group-padding`; `size.focus-offset` thành 0 (bỏ dùng); `font.family.base` đưa Nunito lên đầu; cặp tương phản của vòng focus trên mọi nền nút |
| `design/t237-cartoon/tokens.css`, `index.html`, `README.md` | Cập nhật theo quy tắc này |

## Vấn đề

Ảnh anh gửi cho thấy ba lỗi, cùng một gốc:

1. **Hai viền chồng nhau.** T237 vẽ focus bằng `outline` 3 px màu sky-700, cách 3 px, bên NGOÀI viền mực 3 px và bóng sticker 4 px. Một nút có focus thành ba lớp lồng nhau: mực, khe, xanh.
2. **Màu lạc bảng.** Xanh #1a5fd0 là màu lạnh duy nhất trên giao diện ấm (kem, honey, mint, berry).
3. **Tràn khỏi nhóm.** Vòng chiếm 6 px ra ngoài, trong khi nhóm tốc độ và dock chỉ có đệm 4 px và khe 4 px, nên vòng đè lên viền nhóm và nút bên cạnh (nặng nhất khi nút bên cạnh đang chọn).

Gốc: mỗi trạng thái (hover, focus, đang chọn, nhấn) được thêm vào như một lớp trang trí mới, không ai “sở hữu” chỗ vẽ nào, nên hai trạng thái cùng lúc thì cộng dồn lớp.

## Quy tắc: mỗi trạng thái giữ một kênh

Một nút có bốn kênh hiển thị. Mỗi trạng thái chỉ được đổi đúng kênh của nó; hai trạng thái cùng lúc chỉ cộng lại, không giẫm lên nhau.

| Kênh | Thuộc tính CSS | Trạng thái sở hữu | Không được dùng cho |
|---|---|---|---|
| Nâng | `transform`, `box-shadow` (bóng sticker) | Hover (nhấc 2 px, bóng 4 → 6 px), nhấn (lún 2 px, bóng 2 px; nút ma co 96%) | Focus, đang chọn |
| Nền | `background` | Đang chọn (honey), vô hiệu (cream 200); hover của nút ma (kem đậm) | Hover của nút có màu, focus |
| Viền | `border-color`, `outline` vẽ VÀO TRONG | Focus (chỉ focus) | Hover, đang chọn* |
| Nội dung | màu chữ, icon, `border-style` | Vô hiệu (chữ mờ, icon khóa, viền gạch) | — |

\* Đang chọn ở nút ma (dock, tốc độ, tab) là “thành sticker”: nền honey + viền mực + bóng sm cùng xuất hiện. Đó là một tín hiệu ghép duy nhất (nút biến thành nút có màu), và cũng là dấu hiệu không chỉ bằng màu (SC 1.4.1). Khi nút đang chọn có focus, viền mực đổi sang quế; nền và bóng giữ nguyên nên vẫn đọc ra “đang chọn”.

Hệ quả cụ thể so với T237:

- Hover của nút có màu không còn đổi nền (bỏ dùng `accent.*-hover` cho trạng thái; token giữ lại, chưa xóa).
- Hover của nút ma không còn hiện viền mực, vì viền mực + nền = “đang chọn”.
- Hover của dock không còn nhấc 3 px; dock là nút ma.

## Focus mới

```css
:where(.btn, .hud-btn, .dock-btn, .tab, .step-btn, .step-input) { --bw: var(--size-outline); }
:where(.seg button, .icon-btn) { --bw: var(--size-outline-sm); }

:where(.btn, .hud-btn, .seg button, .dock-btn, .tab, .icon-btn, .step-btn, .step-input):focus-visible {
  border-color: var(--focus-ring);
  outline: var(--size-focus-width) solid var(--focus-ring);
  outline-offset: calc(-1 * (var(--bw) + var(--size-focus-width)));
}
```

- **Chỉ `:focus-visible`**, không `:focus`: bấm chuột không hiện vòng, Tab/phím mũi tên thì hiện.
- **Viền đổi màu + vòng 3 px nằm sát mép trong viền.** Nhìn như viền dày lên vào trong và chuyển màu quế. Không có pixel nào ngoài viền mực, nên không thể đè nhóm hay nút bên cạnh.
- **Vì sao `outline` âm thay vì `box-shadow: inset`.** `box-shadow` đã là kênh nâng (bóng sticker); viết focus vào đó phải lặp lại bóng cho từng biến thể và dễ xóa nhầm. `outline` là thuộc tính riêng, không ai khác dùng, nên cộng với mọi trạng thái khác mà không cần biết chúng. `outline` còn hiện trong chế độ tương phản cao của Windows (`forced-colors`), còn `box-shadow` thì bị tắt. Trình duyệt hiện tại vẽ `outline` theo `border-radius`.
- **Màu quế `color.cinnamon.700` #7a3000** (`--focus-ring`). Ấm, đậm, bão hòa, khác hẳn mực #3a2216 về sắc độ. Nền mực vẫn dùng `--focus-ring-inverse` #ffd166 cùng quy tắc vẽ vào trong.
- **Khoảng trống cho vòng.** Nội dung cách mép trong viền ≥ 4 px (`size.focus-clearance`). Dock cao 64 → 68 px vì đệm dọc cũ chỉ ~2 px; nút 44 px có đệm ngang 12–16 px nên không đổi.

Một màu đạt trên mọi nền nút (thấp nhất 3,2:1 trên berry 500), nên không cần biến thể theo trạng thái.

## Bảng trạng thái × thành phần

Ký hiệu: “nhấc” = translateY −2 px + `shadow.lg`; “lún” = translateY +2 px + `shadow.sm`; “co” = translateY 1 px + scale 0.96; “focus” = quy tắc ở trên với `--bw` ghi trong cột viền.

| Thành phần | Viền (`--bw`) | Mặc định | Hover | Focus | Đang chọn | Nhấn | Vô hiệu (`aria-disabled`) |
|---|---|---|---|---|---|---|---|
| `btn` chính | 3 | honey, viền mực, `shadow.md` | nhấc | focus | — | lún | cream 200, viền gạch `border.disabled`, chữ mờ, icon khóa, không bóng, không nhấc |
| `btn` mint (hành động pha) | 3 | mint | nhấc | focus | — | lún | như trên |
| `btn` phụ | 3 | cream 50 | nhấc | focus | — | lún | như trên |
| `btn` nguy hiểm | 3 | berry 400 | nhấc | focus | — | lún | như trên |
| `link-btn` (ghost chữ gạch chân) | 0 → dùng 3 px vòng trong vùng đích 44 px | chữ mực gạch chân 2 px | gạch chân dày 3 px | vòng 3 px quế trong vùng đích, bo `radius.sm` | — | — | chữ mờ, bỏ gạch chân, icon khóa |
| `hud-btn` | 3 | cream 50 pill, `shadow.md` | nhấc | focus | honey (`aria-pressed`) | lún | như `btn` |
| `icon-btn` (Đóng toast/panel) | 2 | cream 50, không bóng | nền cream 100 | focus | — | co | như `btn` |
| `seg button` (tốc độ) | 2 | trong suốt | nền cream 100 | focus | sticker honey | co | — (không vô hiệu; Dừng là nút riêng) |
| `dock-btn` | 3 | trong suốt | nền cream 100 | focus | sticker honey (`aria-pressed`, bảng đang mở) | co | chưa có trường hợp; nếu có, dùng quy tắc của `btn` |
| `tab` (Daily Report) | 3 | trong suốt | nền cream 50 | focus | sticker honey (`aria-selected`) | co | — |
| `step-btn` (− +) | 3 | cream 50, `shadow.sm` | nền cream 100 | focus | — | lún, bỏ bóng | như `btn` (− ở 0, + khi hết tiền) |
| `step-input` / ô chữ | 3 | cream 50 | — | focus + con trỏ quế | — | — | cream 200, viền gạch |
| toggle (Cài đặt: Âm thanh, Tự nhập hàng) | 3 rãnh | rãnh cream 200, núm cream 50 viền mực | núm nhấc 1 px | focus trên rãnh | Bật: rãnh mint + icon tích trong núm (không chỉ màu) | núm co | như `btn` |
| choice (thẻ chọn: độ khó, slot lưu) | 3 | cream 50 | nhấc | focus | sticker honey + icon tích | lún | như `btn` |
| range (âm lượng) | 3 ở núm | rãnh cream 200 viền mực 2 px, phần đã chọn honey, núm 28 px cream 50 | núm nhấc | focus vẽ trên núm (`::-webkit-slider-thumb` / `::-moz-range-thumb`) | — | núm lún | rãnh gạch, núm cream 200 |

Ghi chú:

- Hover chỉ áp dụng khi `@media (hover: hover)`; trên cảm ứng bỏ qua để không “kẹt” trạng thái sau khi chạm.
- Vô hiệu dùng `aria-disabled="true"`, không dùng `disabled`, để vẫn focus được và đọc lý do qua `aria-describedby` (giữ như T237). Vô hiệu + focus: viền gạch đổi màu quế, thêm vòng trong.
- `prefers-reduced-motion: reduce`: bỏ nhấc/lún/co; hover và nhấn vẫn còn tín hiệu bóng (shadow lg/sm) nên không mất phản hồi.

## Quy tắc chồng lớp

Thứ tự từ dưới lên: **nền → viền → vòng focus → nội dung → bóng** (bóng nằm dưới đáy nút về không gian, nhưng là kênh riêng).

| Được cộng | Không được cộng |
|---|---|
| Đang chọn + focus (honey + viền quế) | Focus + bất kỳ thứ gì ngoài viền mực (outline ngoài, `outline-offset` dương, bóng màu, glow) |
| Hover + focus (nhấc + viền quế) | Hover + đổi nền ở nút có màu (nền là của đang chọn) |
| Nhấn + focus (lún + viền quế) | Hover + viền mực ở nút ma (trông như đang chọn) |
| Vô hiệu + focus (viền gạch quế) | Vô hiệu + nhấc/lún/co |
| Badge (z-index trên vòng) + bất kỳ | Viết focus vào `box-shadow` (giẫm kênh nâng) |

## Khoảng cách

| Chỗ | Giá trị | Token |
|---|---|---|
| Vòng focus | 3 px, sát mép trong viền | `size.focus-width` |
| Nội dung cách mép trong viền | ≥ 4 px | `size.focus-clearance` |
| Khe giữa nút trong nhóm (tốc độ, dock, stepper) | ≥ 4 px | `size.group-gap` = `space.1` |
| Đệm nhóm (viền nhóm → nút) | ≥ 4 px; dock 8 px | `size.group-padding` = `space.1`; dock `space.2` |
| Khe giữa tab | 8 px | `space.2` |
| Khe giữa nút HUD / nút đơn đứng cạnh nhau | 8 px | `space.2` |
| Dock | 76 × 68 px (64 × 68 ở ≤ 1023 px) | — (hình học) |

Vì focus không còn ra ngoài nút, khe và đệm chỉ cần đủ để hai viền không dính nhau; không phải chừa chỗ cho vòng.

## Phân cấp

| Cấp | Thành phần | Dấu hiệu |
|---|---|---|
| 1 · Hành động chính của màn | `btn` chính (honey) hoặc mint cho hành động pha (Mở cửa); tối đa một nút mỗi vùng | nền màu + bóng md + chữ 800 |
| 2 · Hành động phụ | `btn` phụ (kem), `hud-btn` | nền kem + bóng md |
| 3 · Chọn / điều hướng | `seg`, `dock`, `tab`: nút ma trong một khung | chỉ khung có bóng; nút bên trong phẳng tới khi đang chọn |
| 4 · Tiện ích | `icon-btn`, `link-btn`, `step-btn` | viền 2 px hoặc không viền, không bóng (stepper bóng sm) |
| Nguy hiểm | `btn` berry, luôn có chữ + icon, không bao giờ là nút mặc định của Enter | |

Theo vùng: HUD (trên, trạng thái và điều khiển thời gian) → dock (dưới giữa, mở bảng) → panel (phải, làm việc) → lớp phủ (Daily Report, Tạm dừng). Focus đi theo đúng thứ tự đọc đó.

## WCAG 2.2

| Tiêu chí | Cách đạt |
|---|---|
| 2.4.7 Focus Visible (AA) | Mọi phần tử tương tác có `:focus-visible` theo quy tắc chung; không có `outline: none` mà không thay thế. |
| 2.4.11 Focus Not Obscured (Minimum) (AA) | Panel và trang cuộn đặt `scroll-padding-bottom` = chiều cao dock + `space.4`, `scroll-padding-top` = chiều cao HUD + `space.2`, để phần tử được focus không nằm dưới dock/HUD. Toast nằm góc dưới trái, trên dock, không nhận focus tự động và không phủ lên panel (panel ở phải); ở ≤ 640 px khi panel mở toàn chiều ngang thì toast lên trên đầu panel. Vì vòng nằm trong nút, nút ở mép dock/nhóm không bị chính khung nhóm cắt. |
| 1.4.11 Non-text Contrast (AA) | Vòng quế so với nền bên trong nút (điểm ảnh bị đổi khi focus): cream 50 9,0:1; cream 100 7,7:1; cream 200 6,5:1; honey 400 5,8:1; sky 400 5,7:1; mint 400 5,1:1; honey 500 4,6:1; berry 400 4,1:1; mint 500 3,9:1; berry 500 3,2:1. Viền quế so với nền bên ngoài: kem 7,7–9,0:1, trời 7,0:1, trời chiều 5,1:1, cỏ 6,2:1. Khai trong `contrastPairs`. |
| 1.4.1 Use of Color | Đang chọn = nền + viền + bóng + `aria-pressed`/`aria-selected`; focus = viền dày thêm 3 px (đổi hình, không chỉ đổi màu); vô hiệu = viền gạch + icon khóa. |
| 2.5.8 Target Size (Minimum) | Không đổi: ≥ 44 px, dock 76 × 68. |
| 2.4.13 Focus Appearance (AAA, tham chiếu) | Vùng đổi màu là dải 3 px quanh toàn chu vi bên trong viền (≥ 2 px theo yêu cầu), tương phản giữa trạng thái có và không focus ≥ 3:1 trên mọi nền nút (thấp nhất 3,2:1). Tính thêm phần viền mực → quế (1,6:1) thì không đạt, nhưng không cần vì dải trong đã đủ. Tức là bản này đạt cả mức AAA cho chỉ báo focus. |

Thao tác bàn phím (APG): nhóm tốc độ và dock là các nút bật/tắt (`aria-pressed`), mỗi nút một điểm dừng Tab, Space/Enter để bấm; tab Daily Report theo mẫu Tabs (một điểm dừng Tab, mũi tên trái/phải đổi tab, `tabindex="-1"` cho tab không chọn).

## Tự soát

- Tương phản: số ở trên, tự tính theo công thức độ chói tương đối của WCAG; hệ thống tính lại từ `contrastPairs`.
- Đích bấm, reflow 320 px: trang so sánh dùng lưới tự xuống dòng, dock chuyển 4 cột khi khung hẹp (container query), khối code xuống dòng; không có chiều rộng cố định lớn hơn 320 px.
- Nhãn trường nhập: ô số trong stepper có `<label for>`, nút − + có `aria-label` kèm tên nguyên liệu.
- Nielsen: (1) trạng thái hệ thống: focus luôn thấy và không bị che ✔; (4) nhất quán: một quy tắc cho mọi thành phần, hover không còn giả dạng đang chọn ✔; (5) phòng lỗi: vô hiệu vẫn focus được để đọc lý do ✔; (8) tối giản: bớt từ 3 tín hiệu/hover xuống 1 ✔. Các nguyên tắc khác không bị ảnh hưởng.
- Nhất quán token: mọi màu, cỡ, khoảng cách trong mockup là biến CSS từ `tokens.json`. Ngoại lệ hình học: dock 76/64 × 68 px, ô số 56 px, chấm chú thích lệch −14 px, ngưỡng container 700 px, ô mẫu tương phản cao 56 px.

## Giả định

- Màu quế #7a3000 là màu mới (không có sẵn trong bảng); chọn vì là màu ấm duy nhất đủ tối để đạt ≥ 3:1 trên cả berry 500. Nếu anh muốn ấm/sáng hơn (cam), phải chấp nhận biến thể vòng mực trên nút berry/mint khi rê chuột.
- Toggle, choice, range chưa có mockup riêng trong T237; dòng của chúng trong bảng là quy tắc, FE dựng theo.
- Dock không có nút vô hiệu trong game hiện tại.

## Nguồn đã đọc

- `design/t237-cartoon/index.html` (dòng 258–437: rule nút, nhóm, dock, tab, stepper), `design/t237-cartoon/tokens.css`, `design/t237-cartoon/README.md`, `design/tokens.json`.
- Khảo sát của Lead trong kế hoạch P17 (HUD, 7 bảng, rule `[hidden]`).
- Chuẩn dùng theo hiểu biết sẵn có, không mở lại trong phiên này: WCAG 2.2 (1.4.1, 1.4.11, 2.4.7, 2.4.11, 2.4.13, 2.5.8), WAI-ARIA APG (Button `aria-pressed`, Tabs), Design Tokens Format Module, NN/g 10 heuristics.
