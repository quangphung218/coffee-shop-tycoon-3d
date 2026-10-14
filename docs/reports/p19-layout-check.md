# Báo cáo P19: tràn ngang, CLS bảng Kho, thời gian tới Main Menu

Kết quả `npm run layout` (`scripts/check-layout.mjs`) và `scripts/measure-startup.mjs` trên bản build production, so với `origin/main`.

## Mục lục

- [Cách đo](#cách-đo)
- [Tràn ngang](#tràn-ngang)
- [CLS bảng Kho](#cls-bảng-kho)
- [Thời gian tới Main Menu](#thời-gian-tới-main-menu)
- [Chạy lại](#chạy-lại)

## Cách đo

| Phần | Kịch bản | Điều kiện PASS |
| --- | --- | --- |
| Tràn ngang | Mỗi khổ 390×844, 768×1024, 1440×900: ván mới (Easy), mở lần lượt 6 panel trên dock, tuyển 2 nhân viên, nhập theo gợi ý, chạy một ngày ở 4×, mở Daily Report rồi tab Đánh giá | `html`, khung panel hay report và mọi phần tử con có `overflow` khác `visible` đều có `scrollWidth <= clientWidth`; không phần tử nào lệch ra ngoài mép trái hay phải của `.panel-body` hoặc `.rpt-dialog` (sai số 0,5 px). Bỏ qua phần tử rộng hoặc cao ≤ 1 px (`.sr-only`). |
| CLS bảng Kho | `PerformanceObserver('layout-shift')` qua 4 bước: + 1 gói, − 1 gói, Gợi ý nhập tự động, nhập 99 gói (vượt tiền) rồi bấm ra ngoài. Toast được ẩn trong lúc đo. | CLS (shift không có `hadRecentInput`, như web-vitals) = 0; `.panel-foot` và từng dòng trong đó không đổi vị trí hay kích thước; mép trên danh sách hàng không xê dịch trong nội dung cuộn; bước vượt tiền hiện dòng báo thiếu tiền. |

## Tràn ngang

24/24 màn PASS: 0 tràn scroll, 0 phần tử lệch khung.

| Màn | Phần tử đã kiểm | 390×844 | 768×1024 | 1440×900 |
| --- | --- | --- | --- | --- |
| Việc | 42 | PASS | PASS | PASS |
| Menu | 225 | PASS | PASS | PASS |
| Kho | 202 | PASS | PASS | PASS |
| Nhân viên | 69 | PASS | PASS | PASS |
| Marketing | 43 | PASS | PASS | PASS |
| Nâng cấp | 127 | PASS | PASS | PASS |
| Daily Report | 177 | PASS | PASS | PASS |
| Đánh giá | 476 | PASS | PASS | PASS |

## CLS bảng Kho

| Khổ | Chiều cao foot | Foot và danh sách lệch | Shift ngay sau thao tác | CLS |
| --- | --- | --- | --- | --- |
| 390×844 | 202 px | 0 px | 0,0015 | 0,000017 |
| 768×1024 | 202 px | 0 px | 0,0119 | 0,000006 |
| 1440×900 | 202 px | 0 px | 0,0002 | 0,000003 |

- Khung tổng giữ 202 px ở mọi bước và mọi khổ; dòng hướng dẫn, tổng tiền và nút Nhập hàng không xê dịch.
- Dòng giới thiệu và kết quả Gợi ý / Nhập hàng dùng chung ô `.kho-note` cao 3 dòng, nên bấm Gợi ý không đẩy danh sách hàng.
- Shift ngay sau thao tác đến từ số tiền căn phải đổi độ dài (`.foot-sum b`, `.item-cost`) và dòng hàng cao thêm khi hiện nhãn "gợi ý" hoặc giá dài.
- CLS khác 0 chỉ ở bước vượt tiền, từ một node đã bị gỡ khỏi trang khi entry được đọc. Bảng trên đo khi toast còn hiện; script hiện ẩn `.toasts` trong lúc đo để chỉ chấm bảng Kho.

## Thời gian tới Main Menu

Chrome trên Apple M2, trung vị của 5 lần, cache trống.

| Hồ sơ | Bản | First paint | Main Menu | Cảnh 3D |
| --- | --- | --- | --- | --- |
| Desktop, không giới hạn | `origin/main` | 164 ms | 233 ms | 411 ms |
| Desktop, không giới hạn | P19 | 104 ms | 245 ms | 432 ms |
| Mobile: RTT 150 ms, 1,6 Mbps, CPU 4× | `origin/main` | 576 ms | 845 ms | 3212 ms |
| Mobile: RTT 150 ms, 1,6 Mbps, CPU 4× | P19 | 688 ms | 928 ms | 3272 ms |

| Chunk | `origin/main` (gzip) | P19 (gzip) |
| --- | --- | --- |
| `three` | 124,2 kB | 124,2 kB |
| `index` (lớn) | 45,6 kB | 46,8 kB |
| `index` (nhỏ) | 27,2 kB | 29,0 kB |
| CSS | 8,7 kB | 9,2 kB |

Main Menu chậm hơn 12 ms trên desktop và 83 ms trên mobile; tổng gzip tăng 3,5 kB (khoảng 18 ms tải ở 1,6 Mbps).

## Chạy lại

```sh
npx playwright install chromium   # một lần
npm run layout                    # in bảng PASS/FAIL, thoát mã 1 nếu có FAIL
node scripts/measure-startup.mjs --base origin/main --runs 5
```

`measure-startup` dùng Chrome cài trên máy (`CHROME_PATH` nếu ở chỗ khác).
