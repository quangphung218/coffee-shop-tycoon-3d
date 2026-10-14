# Chụp ảnh và GIF demo

Trang này hướng dẫn tạo lại ảnh chụp màn hình và đoạn demo dùng trong README bằng `npm run media`.

## Yêu cầu

- Playwright và Chromium của nó:

  ```sh
  npm install -D playwright
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
2. **Ván mới** độ khó Dễ, tuyển cả 3 ứng viên. Ở bảng 📦 Kho bấm Auto-restock, thêm vài gói cà phê, sữa, chanh, trà, ly, chụp rồi **Nhập hàng**.
3. Zoom camera gần hơn, bấm **🔔 Mở cửa**, chọn tốc độ 4x, chụp lúc 12:00 trong giờ cao điểm.
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
| `Cannot find package 'playwright'` | Chạy `npm install -D playwright`. |
| `Executable doesn't exist` | Chạy `npx playwright install chromium`. |
| `vite preview exited (port 4173 busy?)` | Tắt server đang dùng cổng hoặc đặt `MEDIA_PORT=4180`. |
| Hết thời gian chờ báo cáo, hình giật | Chromium headless đang vẽ WebGL bằng phần mềm; chạy với `MEDIA_HEADED=1`. |
