# Chụp ảnh, GIF demo và icon 3D

Trang này hướng dẫn tạo lại ảnh chụp màn hình và đoạn demo dùng trong README bằng `npm run media`, và atlas icon 3D bằng `npm run icons` (mục [Icon 3D](#icon-3d)).

## Yêu cầu

- Playwright (có sẵn trong `devDependencies`) và Chromium của nó:

  ```sh
  npm ci
  npx playwright install chromium
  ```

- [ffmpeg](https://ffmpeg.org/) trong `PATH` để xuất GIF và mp4: macOS `brew install ffmpeg`, Debian/Ubuntu `sudo apt install ffmpeg`. Thiếu ffmpeg thì lệnh vẫn chụp ảnh PNG, bỏ qua GIF/mp4 và trả mã lỗi 1.
- Cổng `4173` còn trống (đổi bằng `MEDIA_PORT`).

## Chạy

```sh
npm run media
```

Lệnh build bản tĩnh, mở `vite preview` ở `127.0.0.1:4173`, rồi Chromium headless chơi ngày 1:

1. Chụp Main Menu (quán chạy nền phía sau).
2. **Ván mới** độ khó Dễ, mở bảng Menu ở dock và chụp. Mở bảng Nhân viên và tuyển cả 3 ứng viên. Ở bảng Kho bấm Auto-restock, thêm vài gói cà phê, sữa, chanh, trà, ly, chụp rồi **Nhập hàng**.
3. Zoom camera gần hơn, bấm **Mở cửa**, chọn tốc độ 4x.
4. 10:00: zoom và pan tới cửa quán (giữ `A`+`S`), chụp mặt tiền, rồi `Home` về góc cũ.
5. 12:00: chụp giờ cao điểm, rồi zoom gần quầy chụp hàng chờ.
6. 19:00: chụp lại mặt tiền như bước 4 (ảnh rơi vào khoảng 19:25, đèn gần sáng hết).
7. Chụp Daily Report (phần Tổng kết) khi ngày kết thúc, rồi chụp tab Đánh giá.

Ảnh chụp ẩn toast; đoạn quay vẫn giữ.

Lúc chụp Main Menu và giờ cao điểm, lệnh dừng vòng khung hình của trang, đọc camera Three.js (qua `window.__THREE_DEVTOOLS__`), chỗ đứng của từng người và khung DOM của dock, HUD, bảng, rồi chạy tiếp. Cuối lệnh, mỗi ảnh Main Menu, Kho, cao điểm được ghép cạnh ảnh cùng tên ở commit P17 `07439cf` (đọc bằng `git show`, cần lịch sử git đầy đủ) và khoanh chỗ đã đổi: chỗ đứng sim P17 và P18 chiếu qua camera, chi tiết mặt tiền theo `facadePlan()`, icon theo khung DOM. Lệnh in số vòng khoanh của từng nhãn, và cảnh báo `!!` khi một nhãn không có gì để khoanh.

Cả ngày được quay lại; ffmpeg nén phần mở cửa → báo cáo còn khoảng 17 giây. Cuối cùng lệnh in dung lượng từng file; file nào trên 5 MB được đánh dấu `!!` và lệnh trả mã lỗi 1.

## File tạo ra

Tất cả nằm trong `docs/media/` và được ghi đè mỗi lần chạy.

| File | Nội dung |
| --- | --- |
| `demo.gif` | Một vòng ngày, dùng ở đầu README. Tự giảm khổ và fps cho tới khi dưới 5 MB. |
| `demo.mp4` | Cùng đoạn đó, 1280×720 H.264, để đăng nơi khác. |
| `main-menu.png` | Main Menu. |
| `main-menu-p17-p18.png` | Main Menu P17 cạnh P18; khoanh mặt tiền, chậu cây, khung cửa sổ, quạt trần, kệ lọ hạt, đèn thả và icon nút menu. |
| `menu-icons.png` | Pha chuẩn bị, bảng Menu với icon 3D. |
| `prep-inventory.png` | Pha chuẩn bị, bảng Kho. |
| `prep-inventory-p17-p18.png` | Bảng Kho P17 cạnh P18; khoanh icon trên dock, HUD và trong bảng. |
| `facade-day.png` | Mặt tiền quán lúc 10:00. |
| `peak.png` | Quán giờ cao điểm. |
| `peak-p17-p18.png` | Giờ cao điểm P17 cạnh P18; khoanh hàng chờ, khách mang đi, nhân viên, mặt tiền và dock. |
| `queue.png` | Gần quầy giờ cao điểm: hàng chờ. |
| `facade-evening.png` | Mặt tiền quán từ 19:30 tới 20:00, đèn sáng đầy. |
| `facade-day-evening.png` | Mặt tiền cùng góc máy lúc khoảng 15:30 và sau 19:30, cạnh nhau; khoanh và ghi tên chỗ phát sáng ấm (cửa sổ, cửa kính, biển hiệu, đèn thả). Lệnh tìm chỗ phát sáng bằng cách so điểm ảnh hai ảnh tối với ảnh ngày, và trả mã lỗi 1 khi không thấy biển hiệu hay kính. |
| `daily-report.png` | Daily Report. |
| `reviews.png` | Tab Đánh giá trong báo cáo. |

## Tùy chọn

| Biến | Mặc định | Tác dụng |
| --- | --- | --- |
| `MEDIA_SEED` | `1760400000000` | Giá trị `Date.now()` cố định trong trang, quyết định seed của ván mới. |
| `MEDIA_PORT` | `4173` | Cổng của `vite preview`. |
| `MEDIA_HEADED` | (trống) | `1` để mở cửa sổ Chromium thật, dùng GPU nên hình mượt hơn. |

Ví dụ: `MEDIA_HEADED=1 npm run media`.

Seed cố định nhưng sim chạy theo khung hình thật, nên đám đông và số liệu có thể lệch nhẹ giữa các lần chạy.

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| `Cannot find package 'playwright'` | Chạy `npm ci`. |
| `Executable doesn't exist` | Chạy `npx playwright install chromium`. |
| `git show 07439cf:docs/media/… failed` | Bản clone nông thiếu commit P17; chạy `git fetch --unshallow`. |
| `no three.js camera seen on #scene` | Three.js không còn gọi `__THREE_DEVTOOLS__`; sửa `observeThree()` trong `scripts/capture-media.mjs`. |
| `vite preview exited (port 4173 busy?)` | Tắt server đang dùng cổng hoặc đặt `MEDIA_PORT=4180`. |
| Hết thời gian chờ báo cáo, hình giật | Chromium headless đang vẽ WebGL bằng phần mềm; chạy với `MEDIA_HEADED=1`. |
| Hết thời gian chờ một nút hay `[data-…]` | Giao diện đã đổi nhãn hoặc thuộc tính; sửa selector trong `scripts/capture-media.mjs`. Script bấm nút theo nhãn (**Ván mới**, **Bắt đầu ngày 1**, `Thêm 1 gói <nguyên liệu>`), bảng theo `.dock [data-panel]`, và nút theo `data-action`, `data-speed`, `data-tab`. |

## Icon 3D

`npm run icons` dựng từng icon thành mô hình low-poly Three.js và đóng gói thành atlas WebP. Atlas có mọi id trong `src/ui/core/icons.ts` cộng một ô avatar cho mỗi mục `AVATAR_LOOKS` (`src/ui/core/iconMap.ts`): `i-avatar-0` là `AVATAR_LOOKS[0]`. Mô hình nằm trong `src/icon-studio/models/`; camera, đèn, bảng màu, viền mực và bóng chung nằm trong `src/icon-studio/style.ts`, cách vẽ ô 48 px và ô 24 px trong `LOOKS` của file đó.

Ngân sách dung lượng (`BUDGET` trong `src/icon-studio/atlas.ts`, test kiểm), tính cả ô 24 px: `atlas@1x.webp` ≤ 120 kB, `atlas@2x.webp` ≤ 300 kB. Lệnh thử lần lượt các cách nén trong `ENCODINGS` (`src/icon-studio/main.ts`): chất lượng WebP 0,85, rồi giảm số mức alpha và chất lượng dần tới 8 mức alpha và 0,6, lấy cách đầu tiên vừa ngân sách và in ra cách đã chọn. Không cách nào vừa thì lệnh báo lỗi kèm dung lượng từng lần thử.

### Yêu cầu

- Playwright và Chromium như trên (`npm ci`, `npx playwright install chromium`). Không cần ffmpeg.
- Cổng `4175` còn trống (đổi bằng `ICONS_PORT`).

### Chạy

```sh
npm run icons                          # dựng mọi icon có mô hình
npm run icons -- --only i-menu,i-close # dựng lại vài icon, giữ các icon khác trong atlas hiện có
npm run icons -- --sheet               # như trên, và chụp lại bảng so sánh vào docs/reports/
```

Lệnh mở Vite dev server cho `src/icon-studio/`, Chromium headless vẽ mỗi icon hai lần: ô 48 px (96 px @2x) và ô 24 px (48 px @2x), rồi ghi đè:

| File | Nội dung |
| --- | --- |
| `public/icons3d/atlas@1x.webp` | Atlas: lưới ô 48 px, dưới nó lưới ô 24 px. |
| `public/icons3d/atlas@2x.webp` | Cùng atlas, gấp đôi. |
| `public/icons3d/atlas.json` | Id → ô `{x, y, w, h}` theo px @1x: `icons` (48 px), `smallIcons` (24 px), cùng số đo hai lưới (`small`) và kích thước atlas; `smallQuality`: số đo độ rõ của từng ô 24 px (tỉ lệ mực ở mép, tương phản với nền kem). |
| `public/icons3d/svg.json` | Id → SVG phẳng cũ, cho trang xem icon. |
| `docs/reports/p18-icons-sample.png` | Chỉ khi có `--sheet`. Bảng so sánh SVG cũ và icon 3D ở 16/24/48 px (16, 24 lấy ô 24 px; 48 lấy ô 48 px; chụp ở tỉ lệ điểm ảnh 2) cho các nút chỉ có icon (`ICON_ONLY_IDS`) và một hai icon mỗi nhóm (`SHEET_IDS` trong `src/icon-studio/atlas.ts`). |

Cuối cùng lệnh in số icon, ô 24 px yếu nhất theo từng số đo độ rõ và dung lượng từng file.

### Xem icon

- Trang `public/icons3d/index.html` liệt kê mọi icon trong `atlas.json` ở 16/24/32/48 px trên nền sáng và tối: cột trái là SVG cũ (từ `svg.json`), cột phải là icon 3D (16, 24 px lấy ô 24 px như trong game). Mở bằng `npm run dev` rồi vào `/icons3d/`; bản build có ở `icons3d/` cạnh `index.html`.
- Khi sửa mô hình: `npm run dev` rồi vào `/src/icon-studio/` để xem mọi mô hình ở 96 px, cạnh ô 24 px phóng lên 48 px; tải lại trang sau mỗi lần sửa.

### Thêm icon

1. Thêm id vào `ICON_IDS` trong `src/ui/core/icons.ts` (thứ tự trong mảng là thứ tự ô trong atlas).
2. Viết hàm dựng mô hình trong file theo nhóm ở `src/icon-studio/models/` (`hud.ts`, `glyphs.ts`, `items.ts`, `shop.ts`, `people.ts`) bằng `part(geometry, màu)` của `style.ts` và các khối chung trong `shapes.ts` (`stroke`, `lathe`, `steam`, `iceCube`, `saucer`, `badgeBase`…); mô hình đứng trên `y = 0`, mặt trước hướng `+Z`.
3. Chọn tư thế camera bằng `posed(tư thế, mô hình)`: `object` (mặc định, đồ vật), `glyph` (ký hiệu, nhìn thẳng, dựng trong mặt phẳng XY), `top` (vật dẹt nằm trên bàn, nhìn từ trên).
4. Khai hàm vào `ICON_MODELS` trong `src/icon-studio/models/index.ts`; thiếu id nào thì `tsc` báo lỗi.
5. Chạy `npm run icons -- --only <id>` và `npm test` (test `tests/icons/atlas.test.ts` kiểm đủ id, màu trong bảng màu, kích thước và dung lượng atlas, viền mực và tương phản của ô 24 px theo `SMALL_QUALITY`; `tests/ui/icons.test.ts` kiểm mọi id có ô 48 px và ô 24 px). Xem ô 24 px trên trang xem icon; chi tiết nào mất ở 24 px mà cần giữ thì làm nó to hơn trong mô hình, hoặc dựng mô hình riêng cho ô 24 px trong `models/small.ts` và khai vào `SMALL_MODELS`.
6. Dùng icon trong UI bằng `icon('<id>')`, hoặc nối id của sim trong `src/ui/core/iconMap.ts`.
