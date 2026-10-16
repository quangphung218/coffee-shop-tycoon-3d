# P21 — Tuần 7 ngày

Báo cáo P21: lịch mở khoá theo ngày, sự kiện và thời tiết theo seed, mục tiêu và màn kết tuần, kèm log mô phỏng 7 ngày và kết quả kiểm tra. Luật đầy đủ ở [spec/week-7-days.md](../spec/week-7-days.md), chỗ code ở [architecture.md](../architecture.md#tuần-7-ngày).

## Lịch mở khoá

| Ngày | Mở mới |
| --- | --- |
| 1 | Món khởi đầu, Thêm bàn ghế, Cây xanh |
| 2 | Cappuccino, Máy xay hạt |
| 3 | Nước cam, Tủ bánh |
| 4 | Mocha, Tranh treo tường, Đèn trang trí |
| 5 | Cà phê đá xay, Máy xay sinh tố, Khu ngồi ngoài trời |
| 6 | Bánh ngọt, Máy làm đá, Quầy bar cửa sổ |
| 7 | Máy rửa ly, Mở rộng diện tích (tặng cấp 1) |

Từ ngày 2 ngày nào cũng có mở mới; test `tests/sim/week-unlocks.test.ts` và `tests/integration/week.test.ts` giữ luật không quá 2 ngày liền không mở gì và mở rộng quán ngày 7.

## Mô phỏng 7 ngày cùng seed

```sh
npx vitest run tests/integration/week.test.ts --silent=false
```

Ván Vừa, seed `12345`, chiến lược cơ bản (mỗi sáng nhập hàng theo gợi ý, tự phục vụ một mình, không thuê, không nâng cấp):

| Ngày | Thời tiết | Sự kiện | Khách tới | Doanh thu | Giá vốn | Ly bán | Giá vốn/ly |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Nắng | Khai trương | 111 | 2.200.000 | 675.250 | 75 | 9.003 |
| 2 | Mưa | Tăng giá nhập | 86 | 2.630.000 | 1.044.093 | 83 | 12.579 |
| 3 | Mưa | Ngày thường | 94 | 2.905.000 | 907.625 | 91 | 9.974 |
| 4 | Mưa | Hội chợ | 116 | 3.525.000 | 1.102.925 | 107 | 10.308 |
| 5 | Nóng | Hội chợ | 135 | 3.505.000 | 1.055.975 | 112 | 9.428 |
| 6 | Mưa | Tăng giá nhập | 93 | 2.895.000 | 1.145.033 | 87 | 13.161 |
| 7 | Nóng | Tăng giá nhập | 128 | 3.305.000 | 1.200.052 | 110 | 10.910 |

- Ngày nào cũng có mưa, nóng hoặc sự kiện; không hai ngày liền nhau cùng cặp thời tiết và sự kiện. Chạy lại cùng seed ra đúng bảng này.
- Doanh thu 7 ngày 20.965.000 đ, bằng 79% mục tiêu Vừa (26.500.000 đ).

Tách riêng từng biến số: chơi lại sáng ngày 3 với thời tiết và sự kiện thay bằng tay, trung bình 3 seed (`12345`, `777`, `20261016`):

| Ngày 3 chơi lại | Khách tới | So ngày thường nắng | Giá vốn/ly | So ngày thường nắng |
| --- | --- | --- | --- | --- |
| Nắng, ngày thường | 111,7 | | 9.294 | |
| Nắng, hội chợ | 131,3 | +17,6% | 9.263 | −0,3% |
| Mưa, ngày thường | 93,3 | −16,4% | 9.589 | +3,2% |
| Nắng, tăng giá nhập | 111,7 | 0% | 11.617 | +25,0% |

## Kiểm tra

| Lệnh | Kết quả |
| --- | --- |
| `npm run check` (`tsc --noEmit`, `vitest run`, `vite build`) | Không lỗi type; 59 file test, 817 test pass; build xong. |
| `npx vitest run tests/integration/week.test.ts` | 9 test pass. |
