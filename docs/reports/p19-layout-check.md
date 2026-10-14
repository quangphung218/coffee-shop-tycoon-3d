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
| CLS bảng Kho | `PerformanceObserver('layout-shift')` qua 4 bước: + 1 gói, − 1 gói, Gợi ý nhập tự động, gõ 99 gói (vượt tiền) rồi bấm ra ngoài. Toast được ẩn trong lúc đo. | CLS (shift không có `hadRecentInput`, như web-vitals) = 0; `.panel-foot` và từng dòng trong đó không đổi vị trí hay kích thước; mép trên danh sách hàng không xê dịch trong nội dung cuộn; bước vượt tiền hiện dòng báo thiếu tiền. |

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
| 390×844 | 202 px | 0 px | 0,0015 | 0 |
| 768×1024 | 202 px | 0 px | 0,0060 | 0 |
| 1440×900 | 202 px | 0 px | 0,0002 | 0 |

3/3 PASS.

- Khung tổng giữ 202 px ở mọi bước và mọi khổ; dòng hướng dẫn, tổng tiền và nút Nhập hàng không xê dịch.
- Dòng giới thiệu và kết quả Gợi ý / Nhập hàng dùng chung ô `.kho-note` cao 3 dòng, nên bấm Gợi ý không đẩy danh sách hàng.
- Nhãn "gợi ý" (`.sug`) giữ chỗ khi tắt (class `is-off`, `visibility: hidden`), nên dòng hàng không đổi chiều cao khi bấm Gợi ý.
- Shift ngay sau thao tác đến từ số tiền căn phải đổi độ dài (`.foot-sum b`, `.item-cost`) và chữ căn giữa trong ô số gói (46×22 px, trong shadow DOM của `<input>`) khi giá trị đổi từ 1 sang 2 chữ số.
- Script gõ số gói từng phím như người chơi. `fill()` của Playwright chèn chữ không phát phím, nên shift trong ô số gói bị tính vào CLS.

## Thời gian tới Main Menu

Chrome trên Apple M2, cache trống, trung vị của 9 lần.

| Hồ sơ | Bản | First paint | Main Menu | Cảnh 3D |
| --- | --- | --- | --- | --- |
| Desktop, không giới hạn | `origin/main` | 176 ms | 321 ms | 509 ms |
| Desktop, không giới hạn | P19 | 108 ms | 265 ms | 536 ms |
| Mobile: RTT 150 ms, 1,6 Mbps, CPU 4× | `origin/main` | 744 ms | 1081 ms | 4026 ms |
| Mobile: RTT 150 ms, 1,6 Mbps, CPU 4× | P19 | 688 ms | 1032 ms | 3659 ms |

Lượt 5 lần trước đó cho P19 chậm hơn 12 ms (desktop) và 83 ms (mobile); lượt 9 lần cho P19 nhanh hơn 56 ms và 49 ms. Chênh lệch nằm trong dao động giữa các lượt đo: Main Menu không chậm đi.

| Chunk | `origin/main` (gzip) | P19 (gzip) |
| --- | --- | --- |
| `three` | 124,2 kB | 124,2 kB |
| `index` (lớn) | 45,6 kB | 46,8 kB |
| `index` (nhỏ) | 27,2 kB | 29,0 kB |
| CSS | 8,7 kB | 9,2 kB |

Tổng gzip tăng 3,5 kB, khoảng 18 ms tải ở 1,6 Mbps.

## Chạy lại

```sh
npx playwright install chromium   # một lần
npm run layout                    # in bảng PASS/FAIL, thoát mã 1 nếu có FAIL
node scripts/measure-startup.mjs --base origin/main --runs 9
```

`measure-startup` dùng Chrome cài trên máy (`CHROME_PATH` nếu ở chỗ khác).
