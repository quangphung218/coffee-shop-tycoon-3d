# Chụp ảnh, GIF demo và icon 3D

Trang này hướng dẫn tạo lại ảnh chụp màn hình, đoạn demo và các bảng ảnh trước/sau P18–P19 bằng `npm run media`, các bảng trước/sau P20 bằng `npm run media:p20` (mục [Ảnh trước/sau P20](#ảnh-trướcsau-p20)), kiểm tràn ngang và CLS bằng `npm run layout` (mục [Kiểm lề và CLS](#kiểm-lề-và-cls)), và atlas icon 3D bằng `npm run icons` (mục [Icon 3D](#icon-3d)).

## Yêu cầu

- Playwright (có sẵn trong `devDependencies`) và Chromium của nó:

  ```sh
  npm ci
  npx playwright install chromium
  ```

- [ffmpeg](https://ffmpeg.org/) trong `PATH` để xuất GIF và mp4: macOS `brew install ffmpeg`, Debian/Ubuntu `sudo apt install ffmpeg`. Thiếu ffmpeg thì lệnh vẫn chụp ảnh PNG, bỏ qua GIF/mp4 và trả mã lỗi 1.
- Cổng `4173` và `4174` còn trống (đổi bằng `MEDIA_PORT`; bản P18 chạy ở cổng kế tiếp).
- Lịch sử git có commit P18 `d643d89` (bản clone nông thì chạy `git fetch --unshallow`).

## Chạy

```sh
npm run media
```

Lệnh build bản tĩnh, xuất commit P18 `d643d89` ra thư mục tạm (`git archive`) và build nó, mở `vite preview` cho bản hiện tại ở `127.0.0.1:4173` và bản P18 ở `4174`. Sau đó Chromium headless chơi ngày 1 trên bản hiện tại:

1. Chụp Main Menu (quán chạy nền phía sau).
2. **Ván mới** độ khó Dễ, mở bảng Menu ở dock và chụp. Mở bảng Nhân viên và tuyển cả 3 ứng viên. Ở bảng Kho bấm Auto-restock, thêm vài gói cà phê, sữa, chanh, trà, ly, chụp rồi **Nhập hàng**.
3. Zoom camera gần hơn, bấm **Mở cửa**, chọn tốc độ 4x.
4. 10:00: zoom và pan tới cửa quán (giữ `A`+`S`), chụp mặt tiền, rồi `Home` về góc cũ.
5. 12:00: chụp giờ cao điểm, rồi zoom gần quầy chụp hàng chờ.
6. Về tốc độ 1x, kéo chuột ngang qua cảnh rồi thả giữa chừng: camera trôi tiếp và chậm dần, người đi vòng qua góc bàn. Khoảng 4 giây này giữ nguyên tốc độ trong đoạn quay. Rồi về 4x.
7. 15:00: chụp mặt tiền như bước 4; 19:30: chụp lại khi đèn sáng đầy (trước 20:00).
8. Chụp Daily Report (phần Tổng kết) khi ngày kết thúc, rồi chụp tab Đánh giá.

Sau ngày chơi, cùng một kịch bản Kho chạy trên bản hiện tại rồi trên bản P18, mỗi bản một ván mới. Trình duyệt này hiện thanh cuộn (Chromium headless mặc định ẩn):

1. Khổ 390×844, mở bảng Kho. Chuột ngoài bảng, bỏ focus: chụp thanh cuộn lúc đứng yên. Lăn chuột trên bảng: chụp lúc đang cuộn.
2. Cuộn ngang khung bảng hết cỡ (chỉ dịch được khi nội dung rộng hơn khung) và chụp lề ở đầu bảng, rồi cuộn xuống dòng hàng đầu và chụp lại.
3. Cuộn về đầu, chụp khung tổng lúc 0 gói; bấm + một gói ở dòng đầu, chụp lại; bấm − trả về 0.
4. Khổ 1280×720, tuyển 2 nhân viên, không nhập hàng, không bấm Gợi ý. **Mở cửa** ở 4x tới 10:00, mở bảng Kho, cuộn tới mặt hàng đầu tiên không "Đủ" của bản hiện tại (bản P18 cuộn tới cùng mặt hàng) và chụp.

Ảnh chụp ẩn toast; đoạn quay vẫn giữ.

Ảnh so sánh trước/sau:

- Mỗi ảnh được đo ngay lúc chụp: khung DOM của bảng Kho, thanh cuộn, từng dòng hàng và huy hiệu dock. Ở giờ cao điểm, lệnh dừng vòng khung hình và đọc camera Three.js (qua `window.__THREE_DEVTOOLS__`).
- Bàn ghế P18 và P19 lấy từ sim của từng bản (`getShopLayout`, `CHAIR_OFFSET`, `CHAIR_SIZE`, `TABLE_RADIUS`), chiếu qua camera của ảnh cao điểm. Ảnh cao điểm P18 là `docs/media/peak.png` ở `d643d89` (đọc bằng `git show`), cùng góc máy.
- Cuối lệnh, các cặp ảnh được ghép thành bảng `*-p18-p19.png`: mọi khung trong một bảng cắt cùng một vùng quanh chỗ khoanh (bảng Kho, dock, khu bàn) và phóng to cho vừa bề rộng 1900 px.
- P18 khoanh nét đứt cam, P19 nét liền xanh. Nhãn đặt tránh mọi vòng khoanh, có đường nối khi nằm xa, và ghi số đo của lần chụp (px cắt hay lòi ra, chiều cao khung tổng, độ rộng lối đi).
- Thanh cuộn nổi (Chromium trên macOS) được khoanh bằng dải 14 px ở mép phải khung bảng.
- Lệnh in số vòng khoanh của từng nhãn, cảnh báo `!!` khi một nhãn không có gì để khoanh hoặc khi bản hiện tại còn phần tử lòi khỏi khung bảng.

Đoạn quay và dung lượng:

- Cả ngày được quay lại; ffmpeg nén phần mở cửa → báo cáo còn khoảng 12 giây, giữ đoạn xoay camera ở 1x, tổng khoảng 21 giây.
- Cuối cùng lệnh in dung lượng từng file; file nào trên 5 MB được đánh dấu `!!` và lệnh trả mã lỗi 1.

## File tạo ra

Tất cả nằm trong `docs/media/` và được ghi đè mỗi lần chạy.

| File | Nội dung |
| --- | --- |
| `demo.gif` | Một vòng ngày, dùng ở đầu README. Tự giảm khổ và fps cho tới khi dưới 5 MB. |
| `demo.mp4` | Cùng đoạn đó, 1280×720 H.264, để đăng nơi khác. |
| `main-menu.png` | Main Menu. |
| `menu-icons.png` | Pha chuẩn bị, bảng Menu với icon 3D. |
| `prep-inventory.png` | Pha chuẩn bị, bảng Kho. |
| `facade-day.png` | Mặt tiền quán lúc 10:00. |
| `peak.png` | Quán giờ cao điểm. |
| `queue.png` | Gần quầy giờ cao điểm: hàng chờ. |
| `kho-390-p18-p19.png` | Bảng Kho ở 390 px, P18 rồi P19, mỗi bản ở đầu bảng và ở dòng hàng đầu, khung bảng cuộn ngang hết cỡ; khoanh đoạn giới thiệu, nút Auto-restock, nhãn trạng thái và thẻ dòng đầu, nhãn ghi số px bị cắt hay lòi khỏi khung. |
| `kho-foot-p18-p19.png` | Khung tổng lúc 0 gói và 1 gói, P18 rồi P19; vạch vàng ở mép trên khung lúc 0 gói, nhãn ghi chiều cao khung và dòng hướng dẫn. |
| `kho-open-p18-p19.png` | Bảng Kho lúc 10:00, không bấm Gợi ý; khoanh nhãn "Sắp hết"/"Hết" của P19 và cùng mặt hàng ở P18, dòng "đủ khoảng N ly hôm nay" và huy hiệu dock. |
| `scrollbar-p18-p19.png` | Thanh cuộn bảng Kho: P18 đang cuộn, P19 đứng yên và đang cuộn; nhãn ghi độ rộng rãnh khi thanh có rãnh. |
| `peak-p18-p19.png` | Giờ cao điểm P18 cạnh P19; khoanh ghế hai bàn sát nhau (P18), bàn theo lưới (P19) và tô dải sàn của lối đi chính từ hàng bàn tới tường trước (P19). |
| `facade-evening.png` | Mặt tiền quán từ 19:30 tới 20:00, đèn sáng đầy. |
| `facade-day-evening.png` | Mặt tiền cùng góc máy lúc khoảng 15:30 và sau 19:30, cạnh nhau; khoanh và ghi tên chỗ phát sáng ấm (cửa sổ, cửa kính, biển hiệu, đèn thả). Lệnh tìm chỗ phát sáng bằng cách so điểm ảnh hai ảnh tối với ảnh ngày, và trả mã lỗi 1 khi không thấy biển hiệu hay kính. |
| `daily-report.png` | Daily Report. |
| `reviews.png` | Tab Đánh giá trong báo cáo. |

`main-menu-p17-p18.png`, `peak-p17-p18.png`, `prep-inventory-p17-p18.png` (P17 cạnh P18, dùng trong [báo cáo P18](reports/p18-collision-shop-icons.md)) giữ nguyên, lệnh không ghi đè.

## Ảnh trước/sau P20

```sh
npm run media:p20
```

Lệnh build bản hiện tại, xuất commit P19 `96030ca` ra thư mục tạm và build nó, rồi dùng lại bộ dựng bảng của `scripts/capture-media.mjs` (preview, chơi ván mới, khoanh và nhãn) qua `scripts/capture-p20.mjs`. Mỗi bảng ghép P19 cạnh bản hiện tại, cùng seed và góc máy; P19 khoanh nét đứt cam, P20 nét liền xanh, nhãn ghi chỗ đã sửa. Yêu cầu giống `npm run media`: Playwright/Chromium và lịch sử git tới `96030ca`, cổng `4173`/`4174` trống.

Bản P20 chơi từ hai ván dựng sẵn, nạp qua **Tiếp tục**: ván ngày 1 thiếu 1 XP tới cấp 2 (hết ngày hiện băng Lên cấp) và ván cấp 6 đã mua đủ 5 dụng cụ mới. Bản P19 chơi ván mới.

Mười hai bảng, tất cả trong `docs/media/`, ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `hud-dock-p20.png` | HUD lúc Chuẩn bị: chip "Cấp N" + thanh XP và vạch chia nhóm dock. |
| `dock-390-p20.png` | Dock ở 390 px: vạch chia không chiếm ô, Đánh giá nhóm riêng. |
| `tasks-missions-p20.png` | Bảng Việc: mục "Nhiệm vụ hôm nay" ba thẻ. |
| `upgrades-locks-p20.png` | Bảng Nâng cấp ở Cấp 1: chia nhóm Dụng cụ / Không gian / Trang trí và nhãn "Mở ở cấp N". |
| `report-insights-p20.png` | Daily Report: tab Tổng kết P19 có số liệu cạnh tab Chỉ số P20 với KPI ngành F&B. |
| `report-levelup-p20.png` | Daily Report: tab Tổng kết P19 cạnh tab Tổng kết P20 có băng "Lên cấp N". |
| `settings-390-p20.png`, `settings-1280-p20.png` | Cài đặt ở 390 px và 1280 px, chụp cả form: nhóm Hiển thị + Giảm chuyển động, nhóm Điều khiển, Phím tắt trong ô xổ. |
| `brew-closeup-p20.png` | Camera trước mặt nhân viên đứng ở máy espresso lúc đang pha: mặt biểu cảm và tư thế pha. |
| `customer-mood-p20.png` | Camera trước mặt khách giờ cao điểm: mặt vui / sốt ruột. |
| `tools-p20.png` | Quầy sau nhìn thẳng: 5 dụng cụ mới, mỗi cái khoanh kèm tên. |
| `peak-p20.png` | Giờ cao điểm: vật liệu chuẩn, env map nhẹ, quầy chi tiết hơn. |

Đổi commit gốc bằng `P20_BASE`, seed bằng `MEDIA_SEED`, cổng bằng `MEDIA_PORT` (xem [Tùy chọn](#tùy-chọn)). Lệnh in dung lượng từng file và cảnh báo `!!` khi:

| Cảnh báo | Nghĩa |
| --- | --- |
| `nothing to ring` | Nhãn không có gì để khoanh (phần tử không thấy trên màn hình). |
| `rings something mostly off the frame` | Dưới 60% vòng khoanh nằm trong ảnh: phần tử đã bị cuộn hoặc quay ra ngoài khung. |
| `rings a flat area` | Vòng khoanh nằm trên vùng gần như một màu (độ lệch màu < 8), tức vùng trống. |
| `label covers text` | Nhãn vẫn đè lên chữ của khung dù đã thử cả dải lề bên phải. |
| `no barista brewing`, `no customer with a mood` | Trong 60 s giờ cao điểm không có người phù hợp cho cận cảnh; bảng đó bị bỏ. |

### Đo FPS

```sh
node scripts/measure-startup.mjs --base 96030ca --runs 3 --fps-only
```

`--fps-only` chỉ đo FPS; `--fps` đo cả bảng khởi động. Mỗi lượt chơi ngày 1 Dễ ở 4x tới giờ cao điểm (chờ trong cửa sổ nhỏ), rồi lấy mẫu 10 s ở 1280×800, tỉ lệ điểm ảnh 2, mức Vừa và Cao. Mỗi ô chạy `--runs` lượt, hai bản xen kẽ nhau.

| Cột | Nghĩa |
| --- | --- |
| Average FPS | Trung vị qua các lượt của FPS trung bình (số khung / thời gian). |
| Runs | FPS trung bình từng lượt. |
| p5 FPS | FPS của khung chậm thứ 5% trong mọi khung đã lấy. |

Dòng cuối so bản hiện tại với bản gốc; `!!` khi tụt quá 10%. Chrome headless cấp khung theo bội số nhịp màn hình, nên FPS từng khung chỉ ra vài mức (20, 15, 7,5…); dùng cột Average FPS để so.

## Tùy chọn

| Biến | Mặc định | Tác dụng |
| --- | --- | --- |
| `MEDIA_SEED` | `1760400000000` | Giá trị `Date.now()` cố định trong trang, quyết định seed của ván mới. |
| `MEDIA_PORT` | `4173` | Cổng của `vite preview` cho bản hiện tại; bản P18 dùng cổng kế tiếp. |
| `MEDIA_HEADED` | (trống) | `1` để mở cửa sổ Chromium thật, dùng GPU nên hình mượt hơn. |
| `P20_BASE` | `96030ca` | Commit "trước" mà `npm run media:p20` so với bản hiện tại. |

Ví dụ: `MEDIA_HEADED=1 npm run media`.

Seed cố định nhưng sim chạy theo khung hình thật, nên đám đông và số liệu có thể lệch nhẹ giữa các lần chạy.

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| `Cannot find package 'playwright'` | Chạy `npm ci`. |
| `Executable doesn't exist` | Chạy `npx playwright install chromium`. |
| `git archive d643d89 failed` hoặc `git show d643d89:docs/media/… failed` | Bản clone nông thiếu commit P18; chạy `git fetch --unshallow`. |
| `vite build of d643d89 failed` | `node_modules` hiện tại không build được bản P18; chạy `npm ci` rồi thử lại. |
| `!! kho-390-p18-p19.png: P19 still has content past the panel edge` | Bảng Kho lại tràn ngang; chạy `npm run layout` để biết phần tử nào. |
| `no three.js camera seen on #scene` | Three.js không còn gọi `__THREE_DEVTOOLS__`; sửa `observeThree()` trong `scripts/capture-media.mjs`. |
| `vite preview exited (port 4173 busy?)` | Tắt server đang dùng cổng (cả cổng kế tiếp) hoặc đặt `MEDIA_PORT=4180`. |
| Hết thời gian chờ báo cáo, hình giật | Chromium headless đang vẽ WebGL bằng phần mềm; chạy với `MEDIA_HEADED=1`. |
| Hết thời gian chờ một nút hay `[data-…]` | Giao diện đã đổi nhãn hoặc thuộc tính; sửa selector trong `scripts/capture-media.mjs`. Script bấm nút theo nhãn (**Ván mới**, **Bắt đầu ngày 1**, `Thêm 1 gói <nguyên liệu>`), bảng theo `.dock [data-panel]`, và nút theo `data-action`, `data-speed`, `data-tab`. |
| `npm run media:p20` cảnh báo `!!` hoặc thiếu khung | Giao diện P20 đã đổi; sửa selector đo trong `scripts/capture-p20.mjs` (`.hud-level`, `.dock-sep`, `.mission`, `.item.is-locked`, `[data-block="money"]`, `[data-block="level-up"]`, `.rpt-tab[data-tab="insights"]`, `.rpt-kpis`, `[data-setting="reducedMotion"]`, `details.keys-details`, các `.section-title` theo chữ). Cận cảnh 3D dựa vào nhóm `machine-steam` và thứ tự khối của nhân vật trong `src/render/actors/rig.ts` (xem `aimAt()`). |

## Kiểm lề và CLS

```sh
npm run layout
```

Lệnh build, mở `vite preview` ở cổng `4173` (đổi bằng `LAYOUT_PORT`), rồi `scripts/check-layout.mjs` chơi ván mới ở 390×844, 768×1024, 1440×900: mở 6 bảng trên dock, một ngày ở 4x, Daily Report và tab Đánh giá. Mỗi màn đạt khi không khung cuộn nào có `scrollWidth > clientWidth` và không phần tử nào lệch khỏi mép bảng. Ở bảng Kho, lệnh đổi số gói 4 lần và đòi CLS = 0, khung tổng và danh sách hàng không xê dịch. Lệnh in bảng PASS/FAIL và trả mã lỗi 1 khi có FAIL; `LAYOUT_HEADED=1` mở cửa sổ Chromium thật. Kết quả gần nhất: [reports/p19-layout-check.md](reports/p19-layout-check.md).

## Icon 3D

`npm run icons` dựng từng icon thành mô hình low-poly Three.js và đóng gói thành atlas WebP.

| Phần | Nơi khai |
| --- | --- |
| Id trong atlas | Mọi id trong `src/ui/core/icons.ts`, cộng một ô avatar cho mỗi mục `AVATAR_LOOKS` (`src/ui/core/iconMap.ts`); `i-avatar-0` là `AVATAR_LOOKS[0]`. |
| Mô hình | `src/icon-studio/models/`. |
| Camera, đèn, bảng màu, viền mực, bóng | `src/icon-studio/style.ts`; cách vẽ ô 48 px và ô 24 px trong `LOOKS` của file đó. |
| Ngân sách dung lượng | `BUDGET` trong `src/icon-studio/atlas.ts` (test kiểm), tính cả ô 24 px: `atlas@1x.webp` ≤ 120 kB, `atlas@2x.webp` ≤ 300 kB. |
| Cách nén | `ENCODINGS` trong `src/icon-studio/main.ts`. |

Cách chọn nén:

1. Thử chất lượng WebP 0,85.
2. Giảm dần số mức alpha và chất lượng, tới 8 mức alpha và 0,6.
3. Lấy cách đầu tiên vừa ngân sách và in ra cách đã chọn; không cách nào vừa thì báo lỗi kèm dung lượng từng lần thử.

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
5. Chạy `npm run icons -- --only <id>` rồi `npm test`:
   - `tests/icons/atlas.test.ts` kiểm đủ id, màu trong bảng màu, kích thước và dung lượng atlas, viền mực và tương phản của ô 24 px theo `SMALL_QUALITY`;
   - `tests/ui/icons.test.ts` kiểm mọi id có ô 48 px và ô 24 px.
6. Xem ô 24 px trên trang xem icon. Chi tiết nào mất ở 24 px mà cần giữ thì làm nó to hơn trong mô hình, hoặc dựng mô hình riêng trong `models/small.ts` và khai vào `SMALL_MODELS`.
7. Dùng icon trong UI bằng `icon('<id>')`, hoặc nối id của sim trong `src/ui/core/iconMap.ts`.
