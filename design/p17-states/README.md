# Trạng thái và focus cho nút, nhóm, dock

Quy tắc trạng thái (hover, focus, đang chọn, nhấn, vô hiệu) cho mọi nút trong giao diện hoạt hình, cách chúng chồng lên nhau, khoảng cách, phân cấp và cách đạt WCAG 2.2. FE dựng theo trang này; hiệu ứng và cách render do Lead/FE quyết.

| File | Nội dung |
|---|---|
| `design/p17-states/index.html` | So sánh trước/sau từng thành phần (nút đơn, nút HUD, nhóm tốc độ, dock, tab, stepper) trên nền kem và trên cảnh; bảng đủ trạng thái; sơ đồ chồng lớp; vòng focus trên từng nền kèm tỉ lệ tương phản |
| `design/tokens.json` | `color.cinnamon.700`, `color.focus.500`, `size.focus-width`, `size.focus-clearance`, `size.group-gap`, `size.group-padding`; cặp tương phản của vòng focus trong `contrastPairs` |
| `src/ui/styles/ui.css` | Quy tắc focus chung và trạng thái của từng thành phần |

## Quy tắc: mỗi trạng thái giữ một kênh

Một nút có bốn kênh hiển thị. Mỗi trạng thái chỉ đổi đúng kênh của nó; hai trạng thái cùng lúc thì cộng lại, không giẫm lên nhau.

| Kênh | Thuộc tính CSS | Trạng thái sở hữu | Không được dùng cho |
|---|---|---|---|
| Nâng | `transform`, `box-shadow` (bóng sticker) | Hover (nhấc 2 px, bóng 4 → 6 px), nhấn (lún 2 px, bóng 2 px; nút ma co 96%) | Focus, đang chọn |
| Nền | `background` | Đang chọn (honey), vô hiệu (cream 200); hover của nút ma (kem đậm) | Hover của nút có màu, focus |
| Viền | `border-color`, `outline` vẽ vào trong | Focus (chỉ focus) | Hover, đang chọn* |
| Nội dung | màu chữ, icon, `border-style` | Vô hiệu (chữ mờ, icon khóa, viền gạch) | — |

\* Đang chọn ở nút ma (dock, tốc độ, tab) là “thành sticker”: nền honey + viền mực + bóng sm cùng xuất hiện, như một tín hiệu ghép duy nhất và không chỉ bằng màu (SC 1.4.1). Khi nút đang chọn có focus, viền mực đổi sang quế; nền và bóng giữ nguyên nên vẫn đọc ra “đang chọn”.

Hệ quả:

- Hover của nút có màu không đổi nền (token `accent.*-hover` không dùng cho trạng thái).
- Hover của nút ma không hiện viền mực, vì viền mực + nền = “đang chọn”.
- Dock là nút ma: hover chỉ đổi nền, không nhấc.

## Focus

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
- **Viền đổi màu + vòng 3 px sát mép trong viền.** Không có pixel nào ngoài viền mực, nên vòng không đè lên khung nhóm hay nút bên cạnh.
- **`outline` âm, không `box-shadow: inset`.** `box-shadow` là kênh nâng; `outline` không thành phần nào khác dùng, vẫn hiện trong `forced-colors` và theo `border-radius`.
- **Màu quế `color.cinnamon.700` #7a3000** (`--focus-ring`). Trên nền mực dùng `--focus-ring-inverse` #ffd166, cùng quy tắc vẽ vào trong.
- **Khoảng trống cho vòng.** Nội dung cách mép trong viền ≥ 4 px (`size.focus-clearance`).

Một màu đạt trên mọi nền nút (thấp nhất 3,2:1 trên berry 500), nên không có biến thể theo trạng thái.

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
| `seg button` (tốc độ) | 2 | trong suốt | nền cream 100 | focus | sticker honey | co | — (Dừng là nút riêng) |
| `dock-btn` | 3 | trong suốt | nền cream 100 | focus | sticker honey (`aria-pressed`, bảng đang mở) | co | dùng quy tắc của `btn` |
| `tab` (Daily Report) | 3 | trong suốt | nền cream 50 | focus | sticker honey (`aria-selected`) | co | — |
| `step-btn` (− +) | 3 | cream 50, `shadow.sm` | nền cream 100 | focus | — | lún, bỏ bóng | như `btn` (− ở 0, + khi hết tiền) |
| `step-input` / ô chữ | 3 | cream 50 | — | focus + con trỏ quế | — | — | cream 200, viền gạch |
| toggle (Cài đặt: Âm thanh, Tự nhập hàng) | 3 rãnh | rãnh cream 200, núm cream 50 viền mực | núm nhấc 1 px | focus trên rãnh | Bật: rãnh mint + icon tích trong núm | núm co | như `btn` |
| choice (thẻ chọn: độ khó, slot lưu) | 3 | cream 50 | nhấc | focus | sticker honey + icon tích | lún | như `btn` |
| range (âm lượng) | 3 ở núm | rãnh cream 200 viền mực 2 px, phần đã chọn honey, núm 28 px cream 50 | núm nhấc | focus vẽ trên núm (`::-webkit-slider-thumb` / `::-moz-range-thumb`) | — | núm lún | rãnh gạch, núm cream 200 |

- Hover chỉ áp dụng trong `@media (hover: hover)`, để trạng thái không “kẹt” sau khi chạm trên cảm ứng.
- Vô hiệu dùng `aria-disabled="true"`, không dùng `disabled`, để vẫn focus được và đọc lý do qua `aria-describedby`. Vô hiệu + focus: viền gạch đổi màu quế, thêm vòng trong.
- `prefers-reduced-motion: reduce`: bỏ nhấc/lún/co; hover và nhấn vẫn đổi bóng (lg/sm).

## Quy tắc chồng lớp

Thứ tự từ dưới lên: **nền → viền → vòng focus → nội dung → bóng** (bóng là kênh riêng, nằm dưới đáy nút).

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
| Bảng bên phải | cách đáy HUD và đỉnh dock 8 px | `space.2` |

Vòng focus nằm trong nút, nên khe và đệm chỉ cần đủ để hai viền không dính nhau.

## Phân cấp

### Thành phần

| Cấp | Thành phần | Dấu hiệu |
|---|---|---|
| 1 · Hành động chính của màn | `btn` chính (honey) hoặc mint cho hành động pha (Mở cửa); tối đa một nút mỗi vùng | nền màu + bóng md + chữ 700 |
| 2 · Hành động phụ | `btn` phụ (kem), `hud-btn` | nền kem + bóng md |
| 3 · Chọn / điều hướng | `seg`, `dock`, `tab`: nút ma trong một khung | chỉ khung có bóng; nút bên trong phẳng tới khi đang chọn |
| 4 · Tiện ích | `icon-btn`, `link-btn`, `step-btn` | viền 2 px hoặc không viền, không bóng (stepper bóng sm) |
| Nguy hiểm | `btn` berry, luôn có chữ + icon, không bao giờ là nút mặc định của Enter | |

### Chữ

Game tải Nunito hai weight, 400 và 700 (subset latin + vietnamese, `font-display: swap`). Token `font.weight.semibold` (600) và `font.weight.heavy` (800) hiển thị bằng mặt 700, nên weight chỉ tách hai bậc; các bậc còn lại tách bằng cỡ chữ và màu.

| Bậc | Weight | Cỡ | Dùng cho |
|---|---|---|---|
| Tiêu đề màn / bảng | 700 | `font.size.xl`–`4xl` | Tiêu đề Main Menu, đầu bảng, Daily Report |
| Giá trị, nhãn nút | 700 | `font.size.md`–`lg` | Số trên HUD, chữ trong nút, tên mục |
| Nội dung | 400 | `font.size.md` | Mô tả, dòng trong bảng |
| Nhãn phụ | 700 | `font.size.xs`, `text.muted` | Nhãn trên HUD (Ngày, Giờ, Tiền) |
| Chú thích | 400 | `font.size.sm`, `text.muted` | Ghi chú dưới mục, lý do vô hiệu |

Không đặt hai cấp cạnh nhau mà chỉ khác 600/700/800: trên màn chúng trông như nhau.

### Vùng

HUD (trên, trạng thái và điều khiển thời gian) → dock (dưới giữa, mở bảng) → bảng (phải, làm việc) → lớp phủ (Daily Report, Tạm dừng). Thứ tự focus đi theo đúng thứ tự đọc đó.

## WCAG 2.2

| Tiêu chí | Cách đạt |
|---|---|
| 2.4.7 Focus Visible (AA) | Mọi phần tử tương tác có `:focus-visible` theo quy tắc chung; không có `outline: none` mà không thay thế. |
| 2.4.11 Focus Not Obscured (Minimum) (AA) | Bảng bên phải nằm giữa HUD và dock: `top` = `--hud-h` + `space.2`, `bottom` = `--dock-h` + `space.2`. `hud.ts` đo đáy HUD và đỉnh dock vào hai biến này (đo lại khi HUD xuống dòng hay dock đổi cỡ), nên bảng không bao giờ nằm dưới HUD hay dock; đầu bảng và nút Đóng đứng yên, chỉ `.panel-body` cuộn. Toast nằm góc dưới trái, ngay trên dock (`bottom` = `--dock-h` + `space.2`), không nhận focus tự động; ở ≤ 640 px khi bảng mở thì toast lên dưới HUD. Vòng nằm trong nút, nên nút ở mép dock/nhóm không bị khung nhóm cắt. |
| 1.4.11 Non-text Contrast (AA) | Vòng quế so với nền bên trong nút: cream 50 9,0:1; cream 100 7,7:1; cream 200 6,5:1; honey 400 5,8:1; sky 400 5,7:1; mint 400 5,1:1; honey 500 4,6:1; berry 400 4,1:1; mint 500 3,9:1; berry 500 3,2:1. Viền quế so với nền bên ngoài: kem 7,7–9,0:1, trời 7,0:1, trời chiều 5,1:1, cỏ 6,2:1. Khai trong `contrastPairs`. |
| 1.4.1 Use of Color | Đang chọn = nền + viền + bóng + `aria-pressed`/`aria-selected`; focus = viền dày thêm 3 px (đổi hình, không chỉ đổi màu); vô hiệu = viền gạch + icon khóa. |
| 2.5.8 Target Size (Minimum) | ≥ 44 px; dock 76 × 68. |
| 2.4.13 Focus Appearance (AAA, tham chiếu) | Dải đổi màu 3 px quanh toàn chu vi bên trong viền (yêu cầu ≥ 2 px), tương phản giữa có và không focus ≥ 3:1 trên mọi nền nút (thấp nhất 3,2:1). |

Thao tác bàn phím (WAI-ARIA APG): nhóm tốc độ và dock là các nút bật/tắt (`aria-pressed`), mỗi nút một điểm dừng Tab, Space/Enter để bấm; tab Daily Report theo mẫu Tabs (một điểm dừng Tab, mũi tên trái/phải đổi tab, `tabindex="-1"` cho tab không chọn).
