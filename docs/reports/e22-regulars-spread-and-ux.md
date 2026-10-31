# E-22: Mốc khách quen trải đều và sửa UX

Báo cáo tổng hợp từ báo cáo của các task (T-75, T-76, T-78) và code. Mục nào chưa chạy được thì ghi rõ **chưa kiểm chứng**.

## Mốc mới

- Khách quen có 8 người × 4 mốc, 32 ngưỡng khác nhau (so với 3 mốc cùng ngưỡng 10/40/100 ở E-18).
- Mốc thứ 4 nằm ở 235–270 lượt ghé, mỗi mốc có truyện 2 câu bằng tiếng Việt.
- Tem theo mốc: 1/2/3/3. Tổng Tem từ mốc tăng từ 48 lên 72.
- Save cũ: `keptMilestones` giữ mốc đã nhận, không hoàn lại Tem (save version 6).

## Số mốc mỗi tuần, trước và sau

Chiến lược `b_steady2`, 40 tuần.

| | Trước (E-18) | Sau (E-22) |
| --- | --- | --- |
| Tổng mốc | 24 | 32 |
| Phân bố | dồn ở ngày 11, 41, 101–103; sổ nằm im sau tuần 15 | trải đều theo tuần |
| Tuần 5–40 có mốc | không áp dụng | 27/36 tuần (75%) |
| Mốc nhiều nhất trong 1 tuần | không áp dụng | 2 |

- Kiểm trên cả 8 lượt chạy: easy/normal × seed 1, 7, 42, 2026.
- Có test cùng seed cho cùng thứ tự mốc.

## p22 / p23 không đổi

- Bảng p22/p23 giống hệt `main` từng byte: 29/29 test, 555 dòng.
- `npm run sim:long`: 12 passed, các assert lời hứa E-21 đạt.

## Dòng tóm tắt longsim đổi

- 15 dòng tóm tắt longsim đổi vì Tem từ mốc (chiến lược `c_spend`, `d_manage`). `b_steady` và `b_steady2` giữ nguyên.
- Đổi lớn nhất:
  - Easy s42 `c_spend`, 2+ ly: 0% → 15%.
  - Easy s7 `d_manage`, 3 ly: 70% → 85%.
  - Easy s2026 `c_spend`, 2+ ly: 10% → 5%.
  - Normal s2026 `c_spend`: 80% → 85%.
  - Normal s42: 75% → 80%.
- Các dòng còn lại đổi điểm trung bình ≤ 0,2.
- Các dòng tóm tắt này không có assert.

## Đổi chiến lược test

Bot `e05-payback` nay bỏ Tem từ mốc khỏi phép tính. Ngưỡng 2,25 giữ nguyên; nếu tính Tem mốc thì đèn chùm L2 ra 2,28. Đây là đổi chiến lược test, không phải đổi cân bằng.

## Mục UX

| Mã | Nội dung |
| --- | --- |
| UX-207 | Danh sách gộp: 8 hàng × 4 chấm mốc, icon Tem `i-sparkle`, nhãn "Món ruột ngoài quán". |
| UX-210 | Nhãn "Ngày tốt nhất". |
| UX-211 | Phong cách: lưới 4 tab. |
| UX-212 | `TEM_SOURCES_TEXT`; lý do hiện cả tiền và Tem. |
| UX-213 | Sửa chữ "có thêm"; dock ghi "Phong cách". |
| UX-214 | Nút Tiếp tục ghi "Quán · Ngày 3 · 12:30 · đang mở cửa" ở pha mở cửa, cao điểm, đóng cửa. |
| UX-215 | Toast "Kết thúc ngày N" bị chặn khi đang ở pha báo cáo. |
| UX-102 | Mục UX-102 đi cùng đợt T-76. |

Mỗi mục có test trong `tests/ui`.

### T-78

`.regular-head` có chiều cao tối thiểu 44 px (`panels.css`). T-75 đã làm hàng này còn 20 px nên nút lỗi ở kiểm tra layout "Việc P27: nút".

## Kết quả test

- `tests/ui`: 843 test sau T-78 (829 trước T-78).
- vitest đầy đủ: 2311 passed tại T-76.
- `tsc`: sạch.
- Test `css-order` không flake trong các lần chạy.
- `npm run check` **không chạy thành một lệnh**; các bước chạy riêng: tsc, vitest, vite build.

## Layout

- `LAYOUT_OFFLINE=1 node scripts/check-layout.mjs`: 135/135 sau T-78; trước T-78 là 131/135, 4 lỗi "Việc P27: nút".
- Chạy bằng WebGL phần mềm, không tương đương máy thật.
- `npm run layout` thật: **chưa kiểm chứng**.
- Perf: **chưa kiểm chứng**.
- Media: **chưa kiểm chứng**.
