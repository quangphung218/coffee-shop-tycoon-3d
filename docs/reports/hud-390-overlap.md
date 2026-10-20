# HUD 390 px: Tiến độ đè Điều khiển

Báo cáo này ghi chỗ cụm Tiến độ đè cụm Điều khiển trên HUD ở 390×844 và ba phương án sửa có ảnh mô phỏng, để chọn một phương án trước khi sửa code.

## 1. Hiện trạng

Từ 1023 px trở xuống, `.hud` là lưới `minmax(0, 1fr) auto` (`src/ui/styles/ui.css`): Hôm nay trên Tiến độ ở cột trái, Điều khiển ở cột phải qua hai hàng. Tiến độ là `white-space: nowrap`, nên khi nội dung rộng hơn cột trái thì tràn sang dưới Điều khiển. Lúc chuẩn bị, nút "Mở cửa" làm Điều khiển rộng 118 px thay vì 104 px lúc mở cửa.

Số đo ngày sự kiện "Tăng giá nhập", 390×844 (mép phải Tiến độ so với mép trái Điều khiển, px):

| Số liệu | Lúc chuẩn bị | Lúc mở cửa |
| --- | --- | --- |
| Ván mới: 3.000.000đ, 0 Tem, Cấp 1 | hở 5 | hở 19 |
| Cuối game: 109.582.093đ, 2 Tem, Cấp 5 | **đè 12** | hở 2 |

`npm run layout` không bắt được: phép đo ngày sự kiện ở 390 px dùng số liệu ván mới, số liệu cuối game chỉ chạy từ 1100 px.

![Hiện tại, cuối game, lúc chuẩn bị](hud-390-overlap/before-late-prep.png)

## 2. Phương án

Ảnh chụp bản build hiện tại, thêm CSS hoặc đổi chữ tạm trong trang để mô phỏng; số liệu cuối game, lúc chuẩn bị.

| | A. Rút gọn tiền | B. Nút "Mở cửa" chỉ còn icon | C. Tiến độ tự xuống dòng |
| --- | --- | --- | --- |
| Cách làm | Ở ≤ 480 px, tiền từ 100 triệu hiện "109,6tr", từ 1 tỷ "1,2 tỷ"; số đầy đủ trong `title` và `aria-label` | Ở ≤ 480 px, chữ "Mở cửa" ẩn, giữ icon và `aria-label`; khe trong Điều khiển nhỏ lại | Tiến độ `flex-wrap: wrap`, cụm cấp xuống dòng hai khi không vừa |
| Khoảng hở (chuẩn bị / mở cửa) | 31 / 45 px | 8 / 8 px | không đè; Tiến độ hai dòng |
| Chiều cao HUD | 104 px, giữ nguyên | 104 px, giữ nguyên | 119 px, cả ván mới cũng xuống dòng |
| Số 10 chữ số (từ 1 tỷ) | "1,2 tỷ", ngắn hơn số 9 chữ số | thêm khoảng 16 px, đè lại | xuống dòng, không đè |
| Đánh đổi | Mất số lẻ trên HUD điện thoại; cần sửa `hud.ts` (count-up tiền) và test định dạng | Nút chính khó hiểu hơn với người mới; chỉ gỡ được khoảng 20 px | Che thêm 15 px cảnh 3D; khung Tiến độ thành hình chữ nhật bo góc |

A, rút gọn tiền:

![A](hud-390-overlap/a-late-prep.png)

B, nút "Mở cửa" chỉ còn icon:

![B](hud-390-overlap/b-late-prep.png)

C, Tiến độ tự xuống dòng, cuối game và ván mới:

![C cuối game](hud-390-overlap/c-late-prep.png)
![C ván mới](hud-390-overlap/c-start-prep.png)

Ảnh hiện tại ở ván mới, để so với C:

![Hiện tại, ván mới](hud-390-overlap/before-start-prep.png)

## 3. Khuyên chọn

A: HUD giữ một khung hai hàng như thiết kế, còn chỗ cho tiền tăng tới hàng tỷ. Sửa kèm: thêm ca 390 px số liệu cuối game vào phép đo ngày sự kiện của `scripts/check-layout.mjs`.
