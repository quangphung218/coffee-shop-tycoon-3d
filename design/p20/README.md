# P20 — Ghi chú quyết định thiết kế (explanation)

Loại tài liệu: *explanation* (Diátaxis). Bản dựng xem được: [`index.html`](./index.html) — các màn 1–7 ở khung 390px và 1280px.

## 1. Bối cảnh

| Mục | Nội dung |
| --- | --- |
| Sản phẩm | Coffee Shop Tycoon 3D — game web 3D low-poly (Three.js), UI là lớp overlay HTML/CSS "kem chữ mực", font Nunito, icon 3D từ atlas, **không emoji**. |
| Người dùng | Người chơi casual trên điện thoại (dọc) và desktop; quản lý quán cà phê ảo theo ngày. |
| Nền tảng | Trình duyệt (GitHub Pages). Khung thiết kế: 390px (điện thoại), 1280px (desktop). |
| Hạng mục này lo | UI cho 5 mảng P20: HUD (cấp + XP, dock 2 nhóm), bảng Việc (nhiệm vụ ngày), bảng Nâng cấp (nhóm + khóa), tab Chỉ số trong báo cáo, màn Cài đặt sắp xếp lại. Và: chấm hiện trạng 3D + quy tắc nút/nhãn + token. |
| Ràng buộc | Mọi màu/cỡ chữ/khoảng cách lấy từ token trong `design/tokens.json` + `design/t237-cartoon/tokens.css`. P20 **không thêm màu mới**. |
| Không làm ở đây | Code sản phẩm, dựng 3D, test, đo khởi động (ở các hạng mục implement sau). Icon trong mockup là ô vuông ghi id, không phải SVG thật. |

## 2. Danh sách màn và luồng

| # | Màn | Mục đích | Đường chính | Đường lỗi / rỗng |
| --- | --- | --- | --- | --- |
| HUD | Thanh trên + dock dưới | Xem trạng thái quán, mở panel | Bấm dock → mở panel tương ứng | — |
| Việc | Panel sổ từ đáy | Theo dõi việc vận hành + nhiệm vụ ngày | Làm việc → tick xong → nhận XP cuối ngày | Rỗng (không việc gấp); Lỗi (không tải được nhiệm vụ) |
| Nâng cấp | Panel | Mua dụng cụ/không gian/trang trí | Chọn nhóm → bấm "Mua" | Thiếu tiền (nút vô hiệu); Khóa (nhãn "Mở ở cấp N"); Đã tối đa |
| Báo cáo | Modal cuối ngày, 3 tab | Tổng kết + Chỉ số + Đánh giá | Tổng kết → Chỉ số → Sang ngày | Chỉ số rỗng (ngày đầu, chưa đủ dữ liệu) |
| Cài đặt | Panel/modal | Chỉnh âm thanh, hiển thị, điều khiển, trò chơi | Đổi → lưu ngay (không nút Lưu) | "Về mặc định" → xác nhận tại chỗ |

## 3. Chấm hiện trạng 3D và hoạt họa

Nguồn đọc: `src/render/actors/rig.ts`, `src/render/actors/animations.ts`, `src/render/scene/renderer.ts`, ảnh `docs/media/peak.png`, `queue.png`, `facade-day.png`, `main-menu.png`.

| Hạng mục | Điểm | Hiện trạng (từ code/ảnh) | Đề xuất P20 |
| --- | --- | --- | --- |
| Hình khối nhân vật | 2/5 | Rig toàn hộp lồng nhóm (`rig.ts`); tay là hộp `hand` 0.1×0.08×0.1; không có cổ (đầu gắn thẳng vào torso). | Bo nhẹ cạnh mọi hộp (bevel ~0.02) để bắt sáng; thêm khối **cổ** ngắn giữa đầu và thân; đổi bàn tay sang khối tròn (cầu dẹt hoặc cylinder bo). |
| Khuôn mặt / biểu cảm | 1/5 | Chỉ 2 hộp mắt `eye` 0.04×0.05; không miệng, không lông mày; giận chỉ đổi màu da đầu sang đỏ (`setAngry`). | Thêm **miệng** + **lông mày** đổi theo tâm trạng (vui/thường/sốt ruột/giận) vẽ bằng mesh phẳng hoặc texture mặt; mắt to hơn, có điểm sáng. |
| Dáng đi | 3/5 | `walk` đã đổi chân/tay theo sải, hông nhún, hơi chúi (`animations.ts`); nhịp theo quãng đường (`strideCycles`). | Giữ nhịp theo quãng đường; thêm **nghiêng người nhẹ khi rẽ** và lắc vai ngược pha tay. |
| Idle | 2/5 | `idle` nhún hông + quay đầu nhẹ; `bounceFor` có thở; nhưng mọi nhân vật cùng pha → đồng loạt. | Thêm **chớp mắt** ngẫu nhiên; **đổi chân trụ** thỉnh thoảng; **nhìn quanh lệch pha** giữa các nhân vật (offset theo id) để đám đông tự nhiên. |
| Thao tác pha chế | 2/5 | `work` gộp tamp/kéo cần/đếm tiền vào một vòng chung; `serve` chỉ nghiêng + đưa tay. | Tách **chuỗi xay → nén (tamp) → chiết (pull) → rót** theo thời gian pha; `serve` **đưa ly bằng hai tay** đặt xuống bàn. |
| Đồ đạc / máy | 3/5 | Bàn/ghế/quầy/máy khối đơn giản (ảnh), đã có mặt tiền + bảng menu. | Bo cạnh; thêm chi tiết quầy (vòi, tay cầm), giá đỡ ly; **hơi nước bốc lên** từ máy pha và ly nóng (đã có `steamAnchor`). |
| Vật liệu | 2/5 | `MeshLambertMaterial` flatShading, màu phẳng, không texture. | **Texture vẽ bằng canvas lúc chạy** (vân gỗ cho mặt bàn/sàn, gạch cho tường) — đơn giản hóa, hợp style, **0 byte tải thêm**. |
| Ánh sáng | 3/5 | Hemi (1.6) + Directional sun (1.8) + NeutralToneMapping; bóng chỉ ở quality cao (`renderer.ts`). | Thêm **RoomEnvironment** của three cho phản xạ/ánh sáng mềm (0 byte); giữ hemi/sun **ấm** (dawn/dusk theo phase). |

**Poly Haven chỉ để tham khảo màu/ánh sáng** — đồ của họ phần lớn kiểu ảnh thật, không hợp low-poly; **không đưa file HDRI (.hdr 1–2 MB) vào bundle** để giữ Main Menu < 1s. Nguồn tham khảo:

| Nguồn | URL | License | Dùng để |
| --- | --- | --- | --- |
| Poly Haven FAQ (xác nhận license) | https://docs.polyhaven.com/en/faq | CC0 | Tham khảo hướng dẫn/bảng màu; không nhúng asset |
| Poly Haven — HDRIs | https://polyhaven.com/hdris | CC0 | Tham khảo tông ánh sáng ấm (dawn/dusk); thay bằng RoomEnvironment trong code |
| Poly Haven — Textures | https://polyhaven.com/textures | CC0 | Tham khảo màu gỗ/gạch; vẽ lại đơn giản bằng canvas |

> Nếu sau này nhúng bất kỳ asset Poly Haven nào, ghi nguồn + CC0 từng file. Hiện P20 **không nhúng asset nào**.

## 4. Quy tắc Nút vs Nhãn

| | Nút (bấm được) | Nhãn / badge (chỉ đọc) |
| --- | --- | --- |
| Nền | đặc (accent) hoặc panel + viền | tint phẳng |
| Viền | ink 3px (`--size-outline`) | ink 2px (`--size-outline-sm`) |
| Bóng | **có** bóng đáy (chiều sâu) | **không** bóng |
| Bo góc | `--radius-lg` (20px) | `--radius-pill` |
| Con trỏ | tay (pointer) | mặc định |
| Cỡ chữ | md/heavy | xs/heavy, nhỏ hơn |

Mỗi trạng thái nút chỉ đổi **một tín hiệu** (gu của anh):

| Trạng thái | Tín hiệu đổi | Token |
| --- | --- | --- |
| Mặc định | bóng đáy 4px | `--btn-shadow-rest` → `--shadow-md` |
| Hover | bóng sâu hơn 6px (nâng) | `--btn-shadow-hover` → `--shadow-lg` |
| Nhấn | lún xuống + bóng 2px | `--btn-shadow-press` → `--shadow-sm` |
| Focus | vòng focus vẽ **trong** viền ink | `--focus-ring` (theo P17) |
| Vô hiệu | mờ + viền đứt | `--surface-disabled`, `--border-disabled` |

### Token đề xuất cho FE (thêm vào `src/ui/styles/tokens.css`)

Đều là **alias trỏ về token sẵn có** — không thêm màu mới, nên tương phản đã được bảo chứng bởi token gốc.

| Biến CSS mới | Giá trị (alias) | Dùng cho |
| --- | --- | --- |
| `--btn-radius` | `var(--radius-lg)` | bo góc nút |
| `--btn-shadow-rest` | `var(--shadow-md)` | nút nghỉ |
| `--btn-shadow-hover` | `var(--shadow-lg)` | nút hover |
| `--btn-shadow-press` | `var(--shadow-sm)` | nút nhấn |
| `--label-radius` | `var(--radius-pill)` | bo góc nhãn |
| `--label-shadow` | `none` | nhãn phẳng |
| `--xp-fill` | `var(--data-bar)` | nền thanh XP |
| `--xp-track` | `var(--data-track)` | rãnh thanh XP |
| `--level-chip-bg` | `var(--surface-selected)` | nền chip "Cấp N" |
| `--level-chip-text` | `var(--text-primary)` | chữ chip "Cấp N" |

## 5. HUD, Việc, Nâng cấp — quyết định chính

| Quyết định | Lý do |
| --- | --- |
| Chip "Cấp N" + thanh XP đặt **cạnh "Ngày"** (góc trái) | Gom thông tin tiến trình dài hạn về một chỗ, tách khỏi cụm tiền/tốc độ bên phải (Jakob: nhóm theo chức năng). |
| Dock chia 2 nhóm **Vận hành** (Việc, Menu, Kho, Nhân viên) \| **Phát triển** (Marketing, Nâng cấp), ngăn bằng vạch | Giảm tải nhận thức (Hick); việc hằng ngày tách khỏi việc đầu tư. Đánh giá chuyển vào báo cáo cuối ngày. |
| Nhiệm vụ ngày = 3 thẻ, trạng thái **Chưa / Đang / Xong / Hụt** | Mỗi thẻ: tên + thanh tiến độ + thưởng (XP/tiền); tự chấm cuối ngày, không cần bấm nhận. |
| Nâng cấp nhóm **Dụng cụ / Không gian / Trang trí** (khớp `category` trong `upgrades.ts`) | Phần chức năng tương đồng gần nhau. |
| Thẻ khóa hiện **nhãn** "Mở ở cấp N", không phải nút | Không gợi ý sai rằng bấm được (phân biệt nút/nhãn). Món đã mua trước khi khóa vẫn giữ (quyền cũ). |
| Dòng tác dụng **định lượng** ("+2 chỗ ngồi", "Pha nhanh +20%") | Lấy từ `effectPerLevel`; người chơi so sánh được. |

## 6. Insight — tab "Chỉ số" (giữa Tổng kết và Đánh giá)

Ngưỡng theo thông lệ ngành F&B (tham khảo nghiệp vụ quán cà phê). Nhãn trạng thái **không chỉ dùng màu** — kèm icon + chữ "Tốt / Cần chú ý / Tham khảo".

| KPI | Ngưỡng "Tốt" | Ghi chú |
| --- | --- | --- |
| Food cost % | ≤ 32% | giá vốn nguyên liệu / doanh thu |
| Chi phí lương % | ≤ 35% | lương nhân viên / doanh thu |
| Prime cost % | ≤ 65% | food + lương; chỉ số sức khỏe tổng |
| Đơn trung bình (AOV) | — (tham khảo) | so với hôm qua |
| Lấp ghế % | ≥ 70% | ghế có khách / tổng ghế |
| Chờ trung bình | ≤ 3 phút | thời gian khách chờ phục vụ |
| Hao hụt % | ≤ 5% | nguyên liệu bỏ / nhập |
| Biên món % | ≥ 60% | lãi gộp trên giá bán |

- Biểu đồ cột **khách theo giờ 07–20**, cột giờ cao điểm (11–13) tô đậm + viền dày + nhãn "Cao điểm" (không chỉ bằng màu).
- Danh sách **gợi ý hành động** có nút mở thẳng bảng liên quan (Nhân viên / Nâng cấp / Menu).
- Băng **"Lên cấp N!"** nằm tại chỗ trong tab Tổng kết (không modal), liệt kê mở khóa.

## 7. Cài đặt — cấu trúc thông tin mới

| Nhóm | Mục | Thay đổi so với hiện tại (`settings.ts`) |
| --- | --- | --- |
| Âm thanh | Nhạc nền, Hiệu ứng | giữ nguyên |
| Hiển thị | Chất lượng, **Giảm chuyển động** (Theo máy / Luôn giảm) | tách khỏi "Trò chơi"; đề xuất thêm `reduceMotion` (mặc định Theo máy = theo `prefers-reduced-motion`) |
| Điều khiển | Kiểu phím camera (chọn 2, ghi phím), Tốc độ xoay, **Phím tắt** trong `<details>` sổ ra | gộp phím + xoay; đổi toggle WASD sang **2 lựa chọn phân đoạn** rõ nghĩa; phím tắt thu lại cho gọn |
| Trò chơi | Tốc độ mặc định khi mở cửa | chỉ còn 1 mục |
| Chân form | Phiên bản, **Về mặc định** (xác nhận tại chỗ), Xong | "Về mặc định" xác nhận inline, không modal |

## 8. Token, lưới, trạng thái

- Màu/cỡ chữ/khoảng cách/bo góc/bóng: lấy từ `design/tokens.json` + `design/t237-cartoon/tokens.css` (xem `:root` trong `index.html`).
- Khoảng cách theo lưới 4px: 4, 8, 12, 16, 24, 32.
- Trạng thái đã vẽ: nút (default/hover/press/focus/disabled); Việc (default/rỗng/lỗi); Nâng cấp (mua được/thiếu tiền/khóa/tối đa); Chỉ số (có dữ liệu/rỗng); Cài đặt (default/xác nhận reset).

## 9. Kết quả tự soát

### WCAG 2.2 AA

- **Tương phản (SC 1.4.3, 1.4.11):** không thêm màu mới; mọi cặp chữ/nền/viền/focus dùng token semantic đã khai trong `$extensions.claude-bridge.contrastPairs` của `design/tokens.json` (text.primary/muted trên các surface, text.ok/warning/danger trên surface tương ứng, border.outline & focus-ring trên các nền, data.bar/track). → đã kiểm qua pairs sẵn có.
- **Đích bấm (SC 2.5.8):** nút min-height 44px (`--size-target`), dock item ≥ 44px — trên mức 24px và đạt Apple HIG 44pt.
- **Focus (SC 2.4.7, 2.4.11):** vòng focus 3px vẽ trong viền ink, không bị cắt (theo hệ P17).
- **Không chỉ bằng màu (SC 1.4.1):** trạng thái nhiệm vụ, KPI, cột cao điểm đều kèm icon + chữ.
- **Nhãn trường nhập (SC 3.3.2):** mỗi control Cài đặt có `<label>`/text đi kèm; slider/seg thật sẽ gắn `aria-label`/`aria-labelledby` (ghi chú cho FE).
- **320px không cuộn ngang (SC 1.4.10):** layout sản phẩm là panel 1 cột ≤ 390; khung 1280 trong file chỉ là bản spec desktop, không phải responsive thật.

### Nielsen (10 heuristics) — điểm liên quan

| Heuristic | Áp dụng |
| --- | --- |
| Hiển thị trạng thái | HUD có cấp/XP/tiền/phase; KPI có nhãn Tốt/Cần chú ý |
| Khớp thực tế | Thuật ngữ nghiệp vụ cà phê tiếng Việt; tiền định dạng "đ" |
| Kiểm soát & tự do | "Về mặc định" xác nhận tại chỗ, hủy được; panel đóng bằng X/Esc |
| Nhất quán | Nút/nhãn theo một quy tắc; token dùng xuyên suốt |
| Ngăn lỗi | Nút thiếu tiền → vô hiệu; thẻ khóa là nhãn, không bấm nhầm |
| Nhận ra hơn nhớ | Phím tắt liệt kê trong `<details>`; gợi ý mở thẳng bảng |
| Linh hoạt | Tốc độ đổi ở HUD lẫn Cài đặt |
| Tối giản | Dock chia nhóm; phím tắt thu gọn |

### Nhất quán token
- Mọi màu/cỡ chữ/khoảng cách trong mockup đến từ biến CSS `:root` ánh xạ token. Token P20 mới đều là alias về token cũ.

## 10. Chưa kiểm / cần anh quyết

- Chưa đo khởi động/FPS (hạng mục implement + đo riêng).
- Nội dung "Việc vận hành" (checklist) đang giả định (nhập nguyên liệu, xếp ca) — cần khớp logic sim thật.
- Số cấp quán (giả định 6) và ngưỡng XP mỗi cấp do lõi sim chốt; mockup minh họa Cấp 3/4.
- `reduceMotion` là **setting đề xuất mới**; cần lõi sim/save thêm trường (ngoài vùng design).

## 11. Nguồn đã đọc
- Code: `rig.ts`, `animations.ts`, `renderer.ts`, `upgrades.ts`, `settings.ts` (save + screen).
- Ảnh: `docs/media/peak.png`, `queue.png`, `facade-day.png`, `main-menu.png`.
- Token: `design/tokens.json`, `design/t237-cartoon/tokens.css`.
- Chuẩn: WCAG 2.2 (w3.org), NN/g 10 Heuristics, Apple HIG (đích bấm 44pt), Design Tokens Format Module.
- Tham khảo đồ họa: Poly Haven (CC0) — chỉ tham khảo màu/ánh sáng, không nhúng asset.
