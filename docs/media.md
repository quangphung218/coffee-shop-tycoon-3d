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
2. **Ván mới** độ khó Dễ, mở bảng Nhân viên ở dock và tuyển cả 3 ứng viên. Ở bảng Kho bấm Auto-restock, thêm vài gói cà phê, sữa, chanh, trà, ly, chụp rồi **Nhập hàng**.
3. Zoom camera gần hơn, bấm **Mở cửa**, chọn tốc độ 4x, chụp lúc 12:00 trong giờ cao điểm.
4. Chụp Daily Report (phần Tổng kết) khi ngày kết thúc, rồi chụp tab Đánh giá.

Ảnh chụp ẩn toast; đoạn quay vẫn giữ.

Cả ngày được quay lại; ffmpeg nén phần mở cửa → báo cáo còn khoảng 17 giây. Cuối cùng lệnh in dung lượng từng file; file nào trên 5 MB được đánh dấu `!!` và lệnh trả mã lỗi 1.

## File tạo ra

Tất cả nằm trong `docs/media/` và được ghi đè mỗi lần chạy.

| File | Nội dung |
| --- | --- |
| `demo.gif` | Một vòng ngày, dùng ở đầu README. Tự giảm khổ và fps cho tới khi dưới 5 MB. |
| `demo.mp4` | Cùng đoạn đó, 1280×720 H.264, để đăng nơi khác. |
| `main-menu.png` | Main Menu. |
| `prep-inventory.png` | Pha chuẩn bị, bảng Kho. |
| `peak.png` | Quán giờ cao điểm. |
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
| `vite preview exited (port 4173 busy?)` | Tắt server đang dùng cổng hoặc đặt `MEDIA_PORT=4180`. |
| Hết thời gian chờ báo cáo, hình giật | Chromium headless đang vẽ WebGL bằng phần mềm; chạy với `MEDIA_HEADED=1`. |
| Hết thời gian chờ một nút hay `[data-…]` | Giao diện đã đổi nhãn hoặc thuộc tính; sửa selector trong `scripts/capture-media.mjs`. Script bấm nút theo nhãn (**Ván mới**, **Bắt đầu ngày 1**, `Thêm 1 gói <nguyên liệu>`), bảng theo `.dock [data-panel]`, và nút theo `data-action`, `data-speed`, `data-tab`. |

## Icon 3D

`npm run icons` dựng từng icon thành mô hình low-poly Three.js và đóng gói thành atlas WebP. Mô hình nằm trong `src/icon-studio/models/` (theo id trong `src/ui/core/icons.ts`); camera, đèn, bảng màu, viền mực và bóng chung nằm trong `src/icon-studio/style.ts`.

### Yêu cầu

- Playwright và Chromium như trên (`npm ci`, `npx playwright install chromium`). Không cần ffmpeg.
- Cổng `4175` còn trống (đổi bằng `ICONS_PORT`).

### Chạy

```sh
npm run icons                          # dựng mọi icon có mô hình
npm run icons -- --only i-menu,i-close # dựng lại vài icon, giữ các icon khác trong atlas hiện có
```

Lệnh mở Vite dev server cho `src/icon-studio/`, Chromium headless vẽ mỗi icon ở ô 96 px (@2x) và 48 px (@1x), rồi ghi đè:

| File | Nội dung |
| --- | --- |
| `public/icons3d/atlas@1x.webp` | Atlas ô 48 px. |
| `public/icons3d/atlas@2x.webp` | Cùng atlas, ô 96 px. |
| `public/icons3d/atlas.json` | Id → ô `{x, y, w, h}` theo px @1x, cùng kích thước atlas. |
| `docs/reports/p18-icons-sample.png` | Bảng so sánh SVG cũ và icon 3D ở 16/24/48 px (chụp ở tỉ lệ điểm ảnh 2). |

Cuối cùng lệnh in số icon và dung lượng từng file.

### Xem icon

- Trang `public/icons3d/index.html` liệt kê mọi icon trong `atlas.json` ở 16/24/32/48 px trên nền sáng và tối. Mở bằng `npm run dev` rồi vào `/icons3d/`; bản build có ở `icons3d/` cạnh `index.html`.
- Khi sửa mô hình: `npm run dev` rồi vào `/src/icon-studio/` để xem mọi mô hình ở 96 px, tải lại trang sau mỗi lần sửa.

### Thêm icon

1. Viết hàm dựng mô hình trong `src/icon-studio/models/` bằng `part(geometry, màu)` của `style.ts`; mô hình đứng trên `y = 0`, mặt trước hướng `+Z`.
2. Khai hàm vào `MODELS` trong `src/icon-studio/models/index.ts` với đúng id icon.
3. Chạy `npm run icons -- --only <id>` và `npm test` (test `tests/icons/atlas.test.ts` kiểm id và kích thước atlas).
