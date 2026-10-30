# E-20: Ngày 1 chơi được và UX (T-63 – T-66)

Báo cáo này chỉ dùng số liệu từ báo cáo của builder/reviewer và `docs/reports/.e20-sim-diff.md`. Số "trước" của T-63 do builder đo; reviewer chỉ xác minh phía "sau".

## 1. Tác vụ và kết quả

| Task | Nội dung | Kết quả |
|---|---|---|
| T-63 | Giảm khách ngày 1 khi chơi một mình (`FIRST_DAY_SOLO_ARRIVALS = 0.65` trong `arrivalRate`, `src/sim/customers.ts`; chỉ ngày 1 và chưa có nhân viên) | Khách mất ngày 1 Normal từ 31–34% xuống 2,6% |
| T-64 | `serveHints.ts`: bước "Chạm để thu tiền" (có tiền) và "Chạm để dọn" (bàn bẩn, không có tiền); bỏ `!fromSave`; ngày 1 báo khách bỏ đi bằng toast một lần rồi chuyển sang pill "Khách bỏ đi: N" | Reviewer: tsc, vitest đầy đủ 179 file / 2255 test, vite build đều ổn |
| T-65 | `styles.ts`: thanh xem thử nổi ở ≤480px (tên, giá, "Bỏ xem thử", "Mua/Dùng kiểu này"); chạm thanh để mở lại danh sách | Thanh cao 124px ở 390x844, nút ≥44px; không đổi 3D nên không tăng draw call |
| T-66 | Thanh thử thách (UX-202), thử thách trong tổng kết tuần/báo cáo ngày/toast (UX-205/206), gộp toast mốc (UX-208), nút "Chuyển 2x" trong toast (UX-209) | Thanh thử thách 325px ở 390 (trước khi sửa là 4px) |

### T-63 chi tiết
- Không đổi: công thức điểm, tiền thuê, phá sản, `WEEK_REWARDS`, đường cong mục tiêu.
- Tệp: `src/sim/customers.ts`, `docs/architecture.md` (thêm một dòng).

### T-64 chi tiết
- Tệp: `serveHints.ts`, `render/scene/index.ts` (`screenPoint`), `ui/screens/game.ts`, `ui.css`.
- Test: `e20-serve-hints.test.ts` (6 mới); 3 test của `e15-serve-hints` được sửa vì hành vi đổi hợp lệ.

### T-65 chi tiết
- Tệp: `styles.ts`, `panels.css`, `hud/panels.ts`, `hud/hud.ts`, các hàng mới trong `check-layout.mjs`.
- Test: `e20-style-preview-bar.test.ts` (7).
- **Hạn chế:** camera chỉ đặt lại về góc nhìn cả quán mặc định (scene chưa có API lấy nét vào một bộ phận), không nhắm vào bộ phận đang xem thử.

### T-66 chi tiết
- Bố cục mới: phần `challenge`.
- UX-205/206: "Thử thách tuần" và "Đã hụt" trong tổng kết tuần; thử thách trong báo cáo ngày và toast tuần mới; toast hoàn thành có "· Mở kiểu X"; nhãn khoá "Mở bằng thử thách (từ tuần 5)".
- UX-208: gộp toast mốc, thêm dòng "Sổ khách quen" trong báo cáo.
- UX-209: nút "Chuyển 2x" trong toast.
- Test: `e20-challenge-milestones.test.ts` (18); sửa một assertion trong `t51-styles-panel`.
- Sửa thêm `report.css` (≥1024w, ≤760h, thẻ cao 1016px) cho lỗi cuộn 35px ở bản tổng kết lên cấp 1280x720. Builder cho rằng nguyên nhân là số liệu ngày 3 lớn hơn sau T-63. **Đây là số đo của builder; reviewer không xác nhận độc lập được.**

## 2. Khách mất ngày 1 (Normal, autoPlay hoàn hảo có nhập hàng)

Định dạng: đến / phục vụ / mất.

| Seed | Trước | Mất % trước | Sau | Mất % sau |
|---|---|---|---|---|
| 1 | 111 / 75 / 36 | 32,4% | 76 / 74 / 2 | 2,6% |
| 42 | 113 / 75 / 38 | 33,6% | 77 / 75 / 2 | 2,6% |
| 777 | 109 / 75 / 34 | 31,2% | 76 / 74 / 2 | 2,6% |

Số "trước" đo bằng cách đặt hằng số = 1 (cùng phép tính với code cũ).

## 3. p22/p23: so sánh tuần 1 trước/sau

Quyết định của chủ sở hữu Q-10, phương án A: **tuần 2+ được phép trôi nhẹ** cho `a_basic` và `b_steady` (thay cho yêu cầu ban đầu "tuần 2+ giống hệt"). Vì vậy tuần 2+ **không** giống hệt; phần dưới chỉ ghi những gì đã đo.

Điểm/số ly tuần 1 (p23), chỉ các hàng thay đổi:

| Độ khó | Chiến lược | Seed | Trước | Sau |
|---|---|---|---|---|
| easy | a_basic | 1 | 90/3 | 91/3 |
| easy | a_basic | 42 | 89/2 | 87/2 |
| normal | a_basic | 1 | 95/3 | 92/3 |
| normal | a_basic | 777 | 95/3 | 89/2 |
| hard | a_basic | 1 | 89/2 | 85/2 |
| hard | a_basic | 777 | 82/2 | 84/2 |
| hard | b_steady | 1 | 100/3 | 99/3 |
| hard | b_steady | 777 | 96/3 | 97/3 |

Các hàng tuần 1 còn lại (kể cả mọi hàng `c_spend` và p22 b–f) không đổi. Số hàng p22+p23 của `a_basic`/`b_steady` có thay đổi: 134 / 111. Diff đầy đủ nằm trong `docs/reports/.e20-sim-diff.md`.

Trôi ở tuần 2+ (ví dụ): Easy b_steady seed 777 tuần 8: 69/1 → 72/2; các hàng khác của `a_basic`/`b_steady` đổi vài điểm mỗi tuần.

Giữ nguyên (so trước/sau):

| Kiểm tra | Trước | Sau |
|---|---|---|
| p23 `c_spend` (114 hàng) | — | 0 hàng khác |
| p22 b_hire, c_tools, d_high_price, e_marketing, f_bad | — | 0 hàng khác |
| Phá sản (f) Easy / Normal / Hard | 0/6, 6/6, 6/6 | 0/6, 6/6, 6/6 |
| Ván a–e đạt 3 ly Easy / Normal / Hard | 21/30, 12/30, 0/30 | 21/30, 12/30, 0/30 |
| d thắng c Easy / Normal / Hard | 1/6, 2/6, 4/6 | 1/6, 2/6, 4/6 |
| b_steady ≥2 ly tuần 2–8 Easy / Normal / Hard | 20/21, 21/21, 21/21 | 21/21, 21/21, 21/21 |
| c_spend 3 ly tuần 5–8 | 12/12 | 12/12 |
| b_steady 3 ly tuần 5–8 | 0/12 | 0/12 |
| Test p22/p23 | 29 đạt | 29 đạt |
| `npm run sim:long` | 6 đạt | 6 đạt (dòng c_spend giống hệt) |

Các ràng buộc khác đều giữ: a_basic ≥1 ly, c_spend ≥ a_basic, drop ≤10.

Trôi khác:
- p22 `a_basic` Hard: tiền thấp nhất 818k → 947k (trung bình); seed 777: 712k → 947k.
- `sim:long` đổi ở các dòng `b_steady` (normal s1, normal s42, easy s1, easy s42), ví dụ normal s1: ch21-40 85% → 100%, styles@w15 → @w13.

## 4. Test đã cập nhật

- `tests/sim/regulars.test.ts`: chốt lại số ngày 2 (ngày 2 kế thừa RNG và rating của ngày 1). 2024: 2.945k/104/3/107 → 3.115k/107/5/112; 777: 2.785k/102/6/108 → 3.135k/107/9/116 (doanh thu/phục vụ/mất/đến). Test parity "wiped traces" không đổi, vẫn đạt.
- `tests/sim/staff.test.ts` ("a barista cuts the wait"): cả hai quán chơi đến ngày 2, để quán solo không có lượt khách ngày 1 nhẹ hơn (seed 22 trượt 0,0001 phút/khách nếu giữ cũ).
- `tests/integration/p27-save-compat.test.ts`: save v0 không có ứng viên ở ngày 1 nên chơi ngày 1 một mình trước; nếu không, ngày 2 chỉ có 202 phút bận, dưới 240 cần cho level 2.
- Mới: `tests/integration/e20-day1-balance.test.ts`, `e20-serve-hints.test.ts` (6), `e20-style-preview-bar.test.ts` (7), `e20-challenge-milestones.test.ts` (18).
- Sửa: 3 test `e15-serve-hints`, một assertion `t51-styles-panel`.
- Không assertion p22/p23 nào bị đổi.

## 5. Kiểm tra và layout

- `tsc` sạch; vitest đầy đủ 181 file / 2278 test đạt; `vite build` ổn (lần chạy T-64/T-65).
- `npm run check` **chưa chạy như một lệnh duy nhất** ở cuối; các bước được chạy riêng.
- `npm run layout` thật: **CHƯA XÁC MINH** (thiếu vite, EPERM cổng 4173).
- `LAYOUT_OFFLINE=1 node scripts/check-layout.mjs` đạt 135/135, nhưng **không tương đương** `npm run layout` thật.
- Draw call/hiệu năng và media: chưa đo trong sandbox.
- vitest thường cần `--configLoader runner`.

## 6. Test không ổn định

- Test css-order: timeout 20s, đã đạt ở các lần chạy gần đây.
