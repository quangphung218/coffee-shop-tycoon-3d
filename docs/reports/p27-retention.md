# P27 — Nhân viên lên cấp, quà ngày, đơn đặc biệt, mở rộng quán

Báo cáo kiểm chứng P27 so với P26 `d58350b`: kết quả `npm run check`, thời gian tới Main Menu và cảnh 3D, kích thước chunk gzip, khung hình và long task, save cũ, layout, ảnh có khoanh. Luật và con số của các tính năng: [spec/p27-retention.md](../spec/p27-retention.md).

`npm run check`, bản build, test save, khởi động và khung hình đo trên HEAD sau merge `main` (`d8d5a45`, kéo theo `eeccb88` `fix(hud): keep the top clusters on one row`). Layout phần ván mới, HUD, ngày sự kiện cũng đo trên HEAD; layout phần P25, P27 và ảnh là lượt trước merge `main`.

| Phần | Lệnh |
| --- | --- |
| Kiểm tra code | `npm run check` |
| Khởi động, bảng chunk | `PORT=<cổng> node scripts/measure-startup.mjs --base d58350b --runs 9` |
| Khung hình 5 s đầu, long task | `MEDIA_PORT=<cổng> npm run perf:frames -- --base d58350b --runs 5`, thêm `--headed` để lấy p95 thật |
| Save cũ | `npx vitest run tests/integration/p27-save-compat.test.ts tests/save` |
| Lề, tràn ngang, vùng chạm | `LAYOUT_PORT=<cổng> npm run layout` (chạy từng phần: [media.md](../media.md#kiểm-lề-và-cls)) |
| Ảnh P27 | `MEDIA_PORT=<cổng> npm run media:p27` ([media.md](../media.md#ảnh-p27)) |

## 1. Tóm tắt

- `npm run check` xanh trên HEAD: 108 file, 1633 test.
- CSS chính FAIL: `index-G0d7UaCo.css` 9,64 kB gzip, quá ngưỡng 9,6 kB. CSS giống hệt `main` (cùng 9,64 kB); phần tăng là 57 dòng `src/ui/styles/ui.css` của `eeccb88` ([mục 2](#2-kết-quả-kiểm)).
- JS chính `index-*.js`: 15,0 → 15,46 kB gzip (Vite).
- Khởi động trên HEAD, hai lượt `--runs 9` liền nhau, cả hai lượt nhiễu (cảnh 3D base máy bàn 417 và 652 ms, các lượt ổn định 242–243 ms) ([mục 3](#3-khởi-động)):
  - Main Menu trên Phone 390×844 (150 ms RTT, 1,6 Mbps, CPU 4x): 806 và 690 ms (base 837 và 699 ms), dưới 1 s, PASS.
  - Main Menu trên Mobile: 867 / 576 ms (+291 ms) và 722 / 643 ms (+79 ms), FAIL cả hai lượt.
  - Cảnh 3D Mobile: +17,7% (FAIL) và +8,9% (PASS). Cảnh 3D máy bàn: +0,2% (PASS) và +22,4% (FAIL). Cảnh 3D Phone PASS cả hai lượt (+0,3% và −11,4%).
- Long task trên HEAD, chấm theo từng lần: máy bàn headless chấm trên 4/5 lần (lần 1 mất dữ liệu) P27 0/4, base 1/4; di động headless P27 1/5, base 1/5; máy bàn headed P27 1/5, base 1/5; di động headed P27 2/5, base 4/5 ([mục 4](#4-khung-hình)).
- Cảnh 3D máy bàn trong `perf:frames` headless FAIL: 560 / 447 ms (+25,3%); headed 414 / 722 ms PASS.
- Khung hình máy bàn headed trên HEAD: p95 18 ms, bằng base (18 ms), chưa đạt 16,7 ms (nợ cũ, chỉ ghi).
- Save v0–v3 nạp được, chơi tiếp 3 ngày có quà, Đào tạo, nội thất Tem; `SAVE_VERSION` vẫn là 3.
- Layout trên HEAD (ván mới, HUD, ngày sự kiện): 54/54 PASS; HUD 2 hàng ở 390 và 768 px, 1 hàng ở 1280 và 1440 px. Phần P25 (20 mục) và P27 (24 mục: bảng Việc, Nhân viên, Nâng cấp) PASS ở lượt trước merge `main`.
- 14 ảnh P27 có khoanh đỏ, 0 cảnh báo `!!`.

## Kết luận release

P27 làm chậm thật Main Menu Mobile: chậm hơn base ở cả hai lượt `--runs 9` (+291 và +79 ms), cùng chiều với lượt `--runs 5` trên HEAD (+95 ms). Main Menu vẫn dưới 1 s ở Mobile (867 và 722 ms) và Phone (806 và 690 ms), Phone không chậm hơn base. Cảnh 3D không chậm ổn định: FAIL chỉ có ở một trong hai lượt, và cả hai lượt đều nhiễu.

| FAIL | Nguyên nhân | Chặn release | Ai xử lý |
| --- | --- | --- | --- |
| Main Menu Mobile không chậm hơn base | Do P27: đường tới Main Menu thêm `pendingGiftDay` và hai trường quà trong `listSlotSummaries`, JS chính 15,0 → 15,46 kB. CSS HUD của `main` (`eeccb88`) cũng tải trước Main Menu; base `d58350b` không tách được hai phần | Có, theo ngưỡng "không chậm hơn base"; ngưỡng < 1 s của P26 vẫn đạt | Dev P27 profile đường tới Main Menu trên Mobile; anh quyết nếu chấp nhận mức chậm dưới 1 s |
| Cảnh 3D Mobile ≤ base + 10% | Nhiễu đo: lượt 1 +17,7%, lượt 2 +8,9%; 3 lượt trước merge `main` PASS | Không | Người kiểm đo lại khi base máy bàn về 242–243 ms |
| Cảnh 3D máy bàn ≤ base + 10% | Nhiễu đo: FAIL chỉ ở lượt 2 (base 652 ms); `perf:frames` headless +25,3% nhưng headed −42,7% | Không | Không cần |
| CSS chính ≤ 9,6 kB | Có sẵn trên `main` từ `eeccb88`, nhánh không đổi CSS | Chờ anh quyết | Chờ anh quyết nâng ngưỡng hay gọn CSS |
| Long task máy bàn, 0 mỗi lần | Base cũng có (headless 1/4, headed 1/5 lần); P27 headless 0/4, headed 1/5 | Chờ anh quyết | Chờ anh quyết |
| Long task di động, 0 mỗi lần | Không do P27: base FAIL bằng hoặc nhiều hơn (headless 1/5 và 1/5, headed base 4/5, P27 2/5) | Không | Chờ anh quyết ngưỡng cùng long task máy bàn |

## 2. Kết quả kiểm

| Kiểm | Ngưỡng | Kết quả |
| --- | --- | --- |
| `npm run check` (HEAD) | tsc, test, build xanh | PASS: 108 file, 1633 test |
| Test P27 (12 file, HEAD) | Xanh | PASS: 12 file, 190 test |
| JS chính gzip (HEAD) | ≤ 17,0 kB (tăng ≤ 2 kB) | PASS: `index-BGuo_h3r.js` 15,46 kB |
| CSS chính gzip (HEAD) | ≤ 9,6 kB | FAIL: `index-G0d7UaCo.css` 9,64 kB. `main` cũng 9,64 kB: `git diff main HEAD -- src/ui/styles` rỗng; so với base chỉ khác 57 dòng `src/ui/styles/ui.css` của `eeccb88` (HUD một hàng). Trước merge `main`: 9,55 kB |
| Save cũ (HEAD) | v0–v3 nạp được, giữ dữ liệu P27 qua lưu/nạp | PASS: 10 file, 188 test save và tương thích |
| Main Menu, Phone 390×844 (HEAD, 2 lượt) | < 1000 ms | PASS: 806 ms (base 837 ms) và 690 ms (base 699 ms) |
| Main Menu, Mobile (HEAD, 2 lượt) | Không chậm hơn base | **FAIL cả hai lượt**: 867 / 576 ms (+291 ms) và 722 / 643 ms (+79 ms) |
| Cảnh 3D, Phone (HEAD, 2 lượt) | ≤ base + 10% | PASS: 3863 / 3852 ms (+0,3%) và 3264 / 3684 ms (−11,4%) |
| Cảnh 3D, Mobile (HEAD, 2 lượt) | ≤ base + 10% | Lượt 1 **FAIL**: 3662 / 3111 ms (+17,7%); lượt 2 PASS: 3514 / 3226 ms (+8,9%) |
| Cảnh 3D, máy bàn (HEAD, 2 lượt) | ≤ base + 10% | Lượt 1 PASS: 418 / 417 ms (+0,2%); lượt 2 **FAIL**: 798 / 652 ms (+22,4%) |
| Khởi động, trước merge `main` | Như trên | Phone Main Menu 660 / 657 / 850 ms (PASS); Mobile Main Menu +91 (FAIL) / −1 (PASS) / +42 ms (FAIL); cảnh 3D Phone và Mobile PASS cả 3 lượt; cảnh 3D máy bàn lượt 1 PASS (+6,6%), lượt 2 PASS (+5,4%), **lượt 3 FAIL** (293 / 243 ms, +20,6%) |
| Cảnh 3D máy bàn, `perf:frames` headless (HEAD) | ≤ base + 10% | **FAIL**: 560 / 447 ms (+25,3%) |
| Cảnh 3D máy bàn, `perf:frames --headed` (HEAD) | ≤ base + 10% | PASS: 414 / 722 ms (−42,7%) |
| `perf:frames`, máy bàn headless (HEAD) | 0 long task mỗi lần | Chấm trên 4/5 lần, lần 1 của cả hai bản mất dữ liệu (bị cắt khỏi output), không tính: P27 0/4; base FAIL 1/4 (lần 4: 98 ms) |
| `perf:frames`, di động headless (HEAD) | 0 long task mỗi lần | FAIL: P27 1/5 lần (lần 1: 58 ms); base 1/5 (lần 1: 1 ms) |
| Long task máy bàn (`--headed`, HEAD) | 0 long task mỗi lần | FAIL: P27 1/5 lần (lần 5: 61 ms); base 1/5 (lần 1: 1 ms) |
| Long task di động (`--headed`, HEAD) | 0 long task mỗi lần | FAIL: P27 2/5 lần (lần 2: 1 ms, lần 4: 61 ms); base 4/5 (107 / 3 / 1 / 0 / 400 ms) |
| p95 máy bàn (`--headed`, HEAD) | ≤ 16,7 ms (nợ cũ, chỉ ghi) | 18 ms, base 18 ms |
| Long task, trước merge `main` | 0 long task mỗi lần | Máy bàn headless P27 FAIL 3/10 lần, base 1/10; di động headless P27 FAIL 1/10, base 0/10; máy bàn headed 0/5 cả hai bản; di động headed P27 FAIL 2/5, base 1/5 |
| `npm run layout` phần ván mới, HUD, ngày sự kiện (HEAD) | PASS mọi mục | PASS: 54/54. Tràn ngang 0, CLS Kho 0, HUD 2 hàng ở 390 / 768 / 1100 px, 1 hàng ở 1280 / 1440 px, mọi nút ≥ 44 px |
| Layout P25, trước merge `main` | PASS mọi mục | PASS: 20/20 |
| Layout P27 (mục mới), trước merge `main` | Không tràn, đủ phần mới, nút ≥ 44 px | PASS: 24/24. Việc (thẻ quà, đơn đặc biệt, thành tựu; 9 nút), Nhân viên (chip đặc điểm, thanh KN, xác nhận Đào tạo; 12 nút), Nâng cấp (2 dòng giá Tem; 20 nút) |
| `npm run media:p27` | Nhãn và vòng khoanh trong khung, không `!!` | PASS: 14 ảnh, 0 cảnh báo |

Đường khởi động tới Main Menu chỉ thêm `pendingGiftDay` trong `src/ui/screens/mainMenu.ts` và hai trường quà trong `listSlotSummaries` (`src/save/slots.ts`): so ngày và đọc hai trường của save, không tải thêm chunk.

Output build trên HEAD (`npm run check`, phần `vite build`):

```
 Test Files  108 passed (108)
      Tests  1633 passed (1633)
dist/assets/game-DqiI1TBm.css                             31.52 kB │ gzip:   5.33 kB
dist/assets/index-G0d7UaCo.css                            54.28 kB │ gzip:   9.64 kB
dist/assets/confetti-CoKwk5Sz.js                           2.31 kB │ gzip:   1.22 kB
dist/assets/index-BGuo_h3r.js                             39.38 kB │ gzip:  15.46 kB
dist/assets/iconMap-DFV1JIJr.js                           77.14 kB │ gzip:  27.92 kB
dist/assets/index-DPuBJNkT.js                            104.16 kB │ gzip:  38.08 kB
dist/assets/game-pEsl-ZWw.js                             130.30 kB │ gzip:  43.99 kB
dist/assets/three-CMIswvRL.js                            504.48 kB │ gzip: 126.49 kB
```

12 file test P27 trên HEAD (`npx vitest run tests/integration/p27-{balance,determinism,save-compat}.test.ts tests/render/p27-render.test.ts tests/save/p27-compat.test.ts tests/sim/{p27-layout,retention,special-orders,staff-growth}.test.ts tests/ui/p27-{hud-menu,staff,tasks}.test.ts`):

```
 Test Files  12 passed (12)
      Tests  190 passed (190)
```

`npx vitest run tests/integration/p27-save-compat.test.ts tests/save` trên HEAD:

```
 Test Files  10 passed (10)
      Tests  188 passed (188)
```

## 3. Khởi động

`measure-startup.mjs --base d58350b`: Chrome headless, ANGLE Metal (Apple M2). Mobile và Phone dùng mạng 150 ms RTT, 1,6 Mbps, CPU 4x; khác nhau ở khổ và DPR.

### HEAD

Hai lượt `node scripts/measure-startup.mjs --base d58350b --runs 9` chạy liền nhau, trung vị 9 lần; base đo trong cùng lượt.

| Lượt | Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu | Cảnh 3D | Cảnh 3D so base |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Máy bàn | `d58350b` | 92 ms | 72 ms | 417 ms | |
| 1 | Máy bàn | P27 | 128 ms | 88 ms | 418 ms | +0,2%, PASS |
| 1 | Mobile, CPU 4x | `d58350b` | 272 ms | 576 ms | 3111 ms | |
| 1 | Mobile, CPU 4x | P27 | 472 ms | 867 ms | 3662 ms | **+17,7%, FAIL** |
| 1 | Phone 390×844 @3x, CPU 4x | `d58350b` | 424 ms | 837 ms | 3852 ms | |
| 1 | Phone 390×844 @3x, CPU 4x | P27 | 408 ms | 806 ms | 3863 ms | +0,3%, PASS |
| 2 | Máy bàn | `d58350b` | 156 ms | 120 ms | 652 ms | |
| 2 | Máy bàn | P27 | 204 ms | 144 ms | 798 ms | **+22,4%, FAIL** |
| 2 | Mobile, CPU 4x | `d58350b` | 308 ms | 643 ms | 3226 ms | |
| 2 | Mobile, CPU 4x | P27 | 364 ms | 722 ms | 3514 ms | +8,9%, PASS |
| 2 | Phone 390×844 @3x, CPU 4x | `d58350b` | 392 ms | 699 ms | 3684 ms | |
| 2 | Phone 390×844 @3x, CPU 4x | P27 | 332 ms | 690 ms | 3264 ms | −11,4%, PASS |

Cả hai lượt là lượt nhiễu: cảnh 3D base máy bàn 417 ms (lượt 1) và 652 ms (lượt 2), trên 400 ms, so với 242–243 ms ở các lượt ổn định trước merge `main`. Không có lượt sạch, nên một ngưỡng chỉ chấm FAIL thật khi FAIL ở cả hai lượt:

| Ngưỡng | Lượt 1 | Lượt 2 | Chấm |
| --- | --- | --- | --- |
| Main Menu Phone < 1000 ms | 806 ms | 690 ms | PASS |
| Main Menu Mobile không chậm hơn base | +291 ms | +79 ms | **FAIL** (cả hai lượt) |
| Cảnh 3D Mobile ≤ base + 10% | +17,7% | +8,9% | FAIL một lượt, nhiễu đo |
| Cảnh 3D Phone ≤ base + 10% | +0,3% | −11,4% | PASS |
| Cảnh 3D máy bàn ≤ base + 10% | +0,2% | +22,4% | FAIL một lượt, nhiễu đo |

Lượt `--runs 5` trước đó trên HEAD cũng nhiễu (cảnh 3D base máy bàn 647 ms): Main Menu Mobile 774 / 679 ms (+95 ms), cảnh 3D Mobile 4168 / 3612 ms (+15,4%), Phone Main Menu 822 ms.

Lượt 1:

```
| Build | Profile | First paint | Main Menu | 3D scene |
| --- | --- | --- | --- | --- |
| base (d58350b) | Desktop, no throttling | 92 ms | 72 ms | 417 ms |
| working tree | Desktop, no throttling | 128 ms | 88 ms | 418 ms |
| base (d58350b) | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 272 ms | 576 ms | 3111 ms |
| working tree | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 472 ms | 867 ms | 3662 ms |
| base (d58350b) | Phone 390×844 @3x: 150 ms RTT, 1.6 Mbps, CPU 4x | 424 ms | 837 ms | 3852 ms |
| working tree | Phone 390×844 @3x: 150 ms RTT, 1.6 Mbps, CPU 4x | 408 ms | 806 ms | 3863 ms |
```

Lượt 2:

```
| Build | Profile | First paint | Main Menu | 3D scene |
| --- | --- | --- | --- | --- |
| base (d58350b) | Desktop, no throttling | 156 ms | 120 ms | 652 ms |
| working tree | Desktop, no throttling | 204 ms | 144 ms | 798 ms |
| base (d58350b) | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 308 ms | 643 ms | 3226 ms |
| working tree | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 364 ms | 722 ms | 3514 ms |
| base (d58350b) | Phone 390×844 @3x: 150 ms RTT, 1.6 Mbps, CPU 4x | 392 ms | 699 ms | 3684 ms |
| working tree | Phone 390×844 @3x: 150 ms RTT, 1.6 Mbps, CPU 4x | 332 ms | 690 ms | 3264 ms |
```

### Trước merge `main`

Lượt 1 trung vị 5 lần, lượt 2 và 3 trung vị 9 lần, chạy liền nhau.

| Lượt | Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu | Cảnh 3D |
| --- | --- | --- | --- | --- | --- |
| 1 | Máy bàn | `d58350b` | 48 ms | 83 ms | 242 ms |
| 1 | Máy bàn | P27 | 48 ms | 68 ms | 258 ms |
| 1 | Mobile, CPU 4x | `d58350b` | 284 ms | 610 ms | 2984 ms |
| 1 | Mobile, CPU 4x | P27 | 344 ms | 701 ms | 3129 ms |
| 1 | Phone 390×844 @3x, CPU 4x | `d58350b` | 344 ms | 671 ms | 3064 ms |
| 1 | Phone 390×844 @3x, CPU 4x | P27 | 316 ms | 660 ms | 3070 ms |
| 2 | Máy bàn | `d58350b` | 52 ms | 43 ms | 242 ms |
| 2 | Máy bàn | P27 | 40 ms | 41 ms | 255 ms |
| 2 | Mobile, CPU 4x | `d58350b` | 348 ms | 652 ms | 3086 ms |
| 2 | Mobile, CPU 4x | P27 | 340 ms | 651 ms | 3109 ms |
| 2 | Phone 390×844 @3x, CPU 4x | `d58350b` | 320 ms | 641 ms | 3022 ms |
| 2 | Phone 390×844 @3x, CPU 4x | P27 | 308 ms | 657 ms | 3143 ms |
| 3 | Máy bàn | `d58350b` | 56 ms | 57 ms | 243 ms |
| 3 | Máy bàn | P27 | 88 ms | 100 ms | 293 ms |
| 3 | Mobile, CPU 4x | `d58350b` | 352 ms | 781 ms | 3312 ms |
| 3 | Mobile, CPU 4x | P27 | 412 ms | 823 ms | 3340 ms |
| 3 | Phone 390×844 @3x, CPU 4x | `d58350b` | 360 ms | 741 ms | 3227 ms |
| 3 | Phone 390×844 @3x, CPU 4x | P27 | 420 ms | 850 ms | 3369 ms |

Cảnh 3D máy bàn lượt 3 FAIL: 293 / 243 ms, +20,6%, quá base + 10%. Ở lượt này P27 chậm hơn base ở cả ba cấu hình, kể cả máy bàn không giới hạn mạng và CPU (Main Menu 100 / 57 ms). Lượt 2 với 9 lần đo cho Mobile bằng base (651 / 652 ms).

### Chunk

| Chunk | `d58350b` gzip | P27 gzip (HEAD) | Tải lúc |
| --- | --- | --- | --- |
| JS chính `index-*.js` | 15,0 kB | 15,4 kB | Trước Main Menu |
| CSS `index-*.css` | 9,5 kB | 9,64 kB (Vite) | Trước Main Menu |
| `game-*.js` | 40,7 kB | 43,9 kB | Sau khung hình đầu của menu |
| `game-*.css` | 5,2 kB | 5,3 kB | Cùng `game-*.js` |
| `iconMap-*.js` | 23,9 kB | 27,9 kB | Cùng `game-*.js` |
| `src/render` `index-*.js` | 36,4 kB | 38,0 kB | Sau khung hình đầu của menu |
| `three-*.js` | 126,1 kB | 126,1 kB | Cùng `src/render` |
| `confetti-*.js` | 1,2 kB | 1,2 kB | Khi báo cáo có lên cấp |

Bảng chunk lấy từ `measure-startup.mjs` (gzip mức 9) trên HEAD, giống nhau ở cả hai lượt; riêng ô CSS P27 ghi số của Vite. `npm run build` (gzip của Vite) trên HEAD ghi JS chính 15,46 kB, CSS chính 9,64 kB ([mục 2](#2-kết-quả-kiểm)); trước merge `main` là 15,39 kB và 9,55 kB.

## 4. Khung hình

`perf:frames --base d58350b --runs 5`: Chrome 155, 1280×800, 5 s sau `cst:world`, trung vị 5 lần. Headless cấp khung theo bội số nhịp màn hình, nên p95 headless chỉ dùng để so; dòng headed là thời gian khung thật. Confetti và atlas `tiers` không tải ở mọi dòng.

Long task chấm theo từng lần như P26: lần nào có long task > 0 ms là FAIL ở lần đó; cột Long task ghi số lần có long task trên số lần đo. Thời gian long task chỉ tính phần nằm trong cửa sổ 5 s đo, nên có thể nhỏ hơn 50 ms.

### HEAD

Một lượt headless, một lượt headed (`--headed`), chạy liền nhau.

| Chế độ | Hồ sơ | Bản | Cảnh 3D | p50 / p95 / dài nhất | Khung > 50 ms | Long task |
| --- | --- | --- | --- | --- | --- | --- |
| Headless | Máy bàn | `d58350b` | 447 ms | 33 / 67 / 83 ms | 19 | FAIL: 1/4 lần chấm được (lần 4: 98 ms) |
| Headless | Máy bàn | P27 | 560 ms (**+25,3%, FAIL**) | 33 / 67 / 67 ms | 26 | 0/4 lần chấm được |
| Headless | Di động | `d58350b` | 3463 ms | 33 / 67 / 83 ms | 29 | FAIL: 1/5 lần (lần 1: 1 ms) |
| Headless | Di động | P27 | 3433 ms (−0,9%) | 50 / 67 / 67 ms | 36 | FAIL: 1/5 lần (lần 1: 58 ms) |
| Headed | Máy bàn | `d58350b` | 722 ms | 17 / 18 / 27 ms | 0 | FAIL: 1/5 lần (lần 1: 1 ms) |
| Headed | Máy bàn | P27 | 414 ms (−42,7%) | 17 / 18 / 21 ms | 0 | FAIL: 1/5 lần (lần 5: 61 ms) |
| Headed | Di động | `d58350b` | 3728 ms | 17 / 20 / 51 ms | 1 | FAIL: 4/5 lần (107 / 3 / 1 / 0 / 400 ms) |
| Headed | Di động | P27 | 3701 ms (−0,7%) | 17 / 19 / 34 ms | 0 | FAIL: 2/5 lần (0 / 1 / 0 / 61 / 0 ms) |

- Headless máy bàn: lần 1 của cả hai bản mất dữ liệu (dòng bị cắt khỏi output), không tính; Long task chấm trên 4/5 lần (lần 2–5). Base 0 / 0 / 98 / 0 ms, P27 0 / 0 / 0 / 0 ms. Trung vị long task của cả hai bản là 0.
- Headless di động: base 1 / 0 / 0 / 0 / 0 ms, P27 58 / 0 / 0 / 0 / 0 ms.
- Headed máy bàn: base 1 / 0 / 0 / 0 / 0 ms, P27 0 / 0 / 0 / 0 / 61 ms. p95 18 ms, bằng base, chưa đạt 16,7 ms (nợ cũ, chỉ ghi).
- Cảnh 3D máy bàn headless FAIL: 560 / 447 ms. Ở lượt headed ngay sau đó, P27 nhanh hơn base (414 / 722 ms).

```
| base (d58350b) | Desktop, no throttling | 447 ms | 145 | 33 ms | 67 ms | 83 ms | 19 (19/10/33/18/38) | 0 | 0 ms | none |
| working tree | Desktop, no throttling | 560 ms | 122 | 33 ms | 67 ms | 67 ms | 26 (30/16/23/26/36) | 0 | 0 ms | none |
| base (d58350b) | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 3463 ms | 132 | 33 ms | 67 ms | 83 ms | 29 (22/45/29/40/24) | 0 | 0 ms | none |
| working tree | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 3433 ms | 119 | 50 ms | 67 ms | 67 ms | 36 (50/36/23/46/19) | 1 | 0 ms | none |
Chrome 155.0.8059.85 (headed), WebGL: ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version), 1280×800, 5 s after cst:world, 5 runs per cell (median)
| base (d58350b) | Desktop, no throttling | 722 ms | 301 | 17 ms | 18 ms | 27 ms | 0 (1/0/0/0/0) | 0 | 0 ms | none |
| working tree | Desktop, no throttling | 414 ms | 301 | 17 ms | 18 ms | 21 ms | 0 (0/0/0/0/1) | 0 | 0 ms | none |
| base (d58350b) | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 3728 ms | 289 | 17 ms | 20 ms | 51 ms | 1 (1/0/2/0/9) | 1 | 3 ms | none |
| working tree | Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x | 3701 ms | 297 | 17 ms | 19 ms | 34 ms | 0 (0/1/0/0/0) | 0 | 0 ms | none |
```

### Trước merge `main`

Headless chạy hai lượt liền nhau, headed một lượt.

| Chế độ | Hồ sơ | Bản | Cảnh 3D | p50 / p95 / dài nhất | Khung > 50 ms | Long task |
| --- | --- | --- | --- | --- | --- | --- |
| Headless, lượt 1 | Máy bàn | `d58350b` | 227 ms | 50 / 67 / 67 ms | 31 | 0/5 lần |
| Headless, lượt 1 | Máy bàn | P27 | 273 ms | 33 / 67 / 67 ms | 36 | FAIL: 1/5 lần |
| Headless, lượt 1 | Di động | `d58350b` | 3048 ms | 33 / 67 / 67 ms | 24 | 0/5 lần |
| Headless, lượt 1 | Di động | P27 | 3077 ms | 33 / 67 / 67 ms | 26 | FAIL: 1/5 lần |
| Headless, lượt 2 | Máy bàn | `d58350b` | 230 ms | 50 / 67 / 67 ms | 35 | FAIL: 1/5 lần |
| Headless, lượt 2 | Máy bàn | P27 | 234 ms | 50 / 67 / 83 ms | 32 | FAIL: 2/5 lần |
| Headless, lượt 2 | Di động | `d58350b` | 3248 ms | 33 / 100 / 133 ms | 40 | 0/5 lần |
| Headless, lượt 2 | Di động | P27 | 3293 ms | 50 / 133 / 133 ms | 38 | 0/5 lần |
| Headed | Máy bàn | `d58350b` | 247 ms | 17 / 18 / 36 ms | 0 | 0/5 lần |
| Headed | Máy bàn | P27 | 235 ms | 17 / 18 / 27 ms | 0 | 0/5 lần |
| Headed | Di động | `d58350b` | 3056 ms | 17 / 17 / 34 ms | 0 | FAIL: 1/5 lần |
| Headed | Di động | P27 | 3075 ms | 17 / 18 / 33 ms | 0 | FAIL: 2/5 lần |

- Thời gian long task từng lần, headless máy bàn: base 0 / 0 / 0 / 0 / 0 và 0 / 488 / 0 / 0 / 0 ms; P27 0 / 0 / 435 / 0 / 0 và 311 / 428 / 0 / 0 / 0 ms.
- Headless di động: base 0 ở cả 10 lần; P27 0 / 0 / 0 / 1 / 0 và 0 / 0 / 0 / 0 / 0 ms.
- Headed: máy bàn 0 ở cả 5 lần của hai bản; di động base lần 4 có 311 ms, P27 lần 2 có 2 ms và lần 4 có 402 ms.
- Long task máy bàn headless rơi vào lần đo khác nhau giữa hai lượt và base cũng có (488 ms). Muốn chặn hẳn thì cần một lượt đo có trace (`chrome://tracing`) ở lần có long task để biết việc nào chạy trên main thread.

## 5. Save cũ

| Kiểm | Kết quả |
| --- | --- |
| Save v0, v1, v2, v3 không có trường P27 | Nạp được, `ensureRetention` điền mặc định, chơi tiếp 3 ngày có nhận quà, Đào tạo, mua nội thất giá Tem |
| Trường P27 (Tem, chuỗi quà, cấp/KN/đặc điểm nhân viên, đơn đặc biệt) | Giữ nguyên qua `saveGame` rồi `loadGame` |
| Danh sách slot ở Main Menu | `listSlotSummaries` khớp `listSlots` cho v0–v3, JSON hỏng, version 99 và −1, storage lỗi; không ghi vào storage |
| `SAVE_VERSION` | Vẫn là 3 |

## 6. Layout

`npm run layout` chạy làm hai phần: `LAYOUT_ONLY=day,hud,event` rồi `LAYOUT_ONLY=p25,p27`.

### HEAD: ván mới, HUD, ngày sự kiện

`npm run build && LAYOUT_ONLY=day,hud,event node scripts/check-layout.mjs`, 54 mục:

| Phần | Khổ | Mục | Kết quả |
| --- | --- | --- | --- |
| Ván mới, 6 bảng, một ngày 4x, báo cáo, HUD lúc chuẩn bị, menu camera, mở cửa | 390, 768, 1440 | 33 | PASS |
| HUD lúc chuẩn bị, menu camera, mở cửa | 1280×800 | 3 | PASS |
| HUD ngày sự kiện, số ván mới | 390 | 3 | PASS |
| HUD ngày sự kiện, số cuối game | 390, 1100×800, 1280×800, 1440 | 12 | PASS |
| CLS bảng Kho | 390, 768, 1440 | 3 | PASS, CLS 0 |

Số hàng HUD trên HEAD, giống nhau ở mọi màn của cùng khổ (chuẩn bị, menu camera, mở cửa, ngày sự kiện, số cuối game):

| Khổ | Hàng | Cao |
| --- | --- | --- |
| 390×844 | 2 | 104 px |
| 768×1024 | 2 | 104 px |
| 1100×800 (số cuối game) | 2 | 104 px |
| 1280×800 | 1 | 56 px |
| 1440×900 | 1 | 56 px |

```
| 390×844 | HUD: chuẩn bị | PASS | 2 hàng, cao 104 px; today 218, progress 243, controls 118; 4 nút ≥ 44 px; sự kiện Khai trương |
| 768×1024 | HUD: chuẩn bị | PASS | 2 hàng, cao 104 px; today 357, progress 445, controls 144; 4 nút ≥ 44 px; sự kiện Khai trương |
| 1440×900 | HUD: chuẩn bị | PASS | 1 hàng, cao 56 px; today 438, progress 492, controls 318; 4 nút ≥ 44 px; sự kiện Khai trương |
| 1280×800 | HUD: chuẩn bị | PASS | 1 hàng, cao 56 px; today 357, progress 445, controls 269; 4 nút ≥ 44 px; sự kiện Khai trương |
| 390×844 | HUD: mở cửa (ngày sự kiện, cuối game) | PASS | 2 hàng, cao 104 px; today 209, progress 217, controls 104; 4 nút ≥ 44 px; sự kiện Tăng giá nhập |
| 1100×800 | HUD: mở cửa (ngày sự kiện, cuối game) | PASS | 2 hàng, cao 104 px; today 404, progress 464, controls 219; 6 nút ≥ 44 px; sự kiện Tăng giá nhập |
| 1280×800 | HUD: mở cửa (ngày sự kiện, cuối game) | PASS | 1 hàng, cao 56 px; today 404, progress 464, controls 355; 6 nút ≥ 44 px; sự kiện Tăng giá nhập |
| 1440×900 | HUD: mở cửa (ngày sự kiện, cuối game) | PASS | 1 hàng, cao 56 px; today 404, progress 464, controls 355; 6 nút ≥ 44 px; sự kiện Tăng giá nhập |
| 390×844 | Kho: đổi số gói | PASS | CLS 0.000000; foot cao 142.5 px; foot/danh sách lệch tối đa 0.0 px; shift ngay sau thao tác 0.0000 |
PASS / 54 checks
```

### Trước merge `main`: P25, P27

| Phần | Khổ | Mục | Kết quả |
| --- | --- | --- | --- |
| P25: Menu gọn, thẻ lên cấp | 390, 768, 1280×720, 1440 | 20 | PASS |
| P27: Việc, Nhân viên, Nâng cấp | 390, 768, 1280×720, 1440 | 24 | PASS |

## 7. Ảnh

`npm run media:p27`, Chromium headless. Chỗ mới khoanh đỏ, nhãn đỏ chữ trắng. Save của từng bản do sim của chính bản đó chơi ra: ván Vừa, cùng seed, tuyển 2 nhân viên ngày 1, nhận quà sáng ngày 3 với ngày hôm qua của máy.

### Trước/sau

Mỗi ảnh ghép P26 `d58350b` (trái) cạnh P27 (phải), cùng save và cùng khổ. Mọi ảnh ở mục này chụp trước merge `main` (`ec75819`), tức trước `eeccb88` (HUD một hàng) và `9923d10` (tiền rút gọn ở khổ ≤ 480 px): hai ảnh HUD chưa có CSS HUD hiện tại.

| Cảnh | Khổ | Chỗ cần nhìn | Ảnh |
| --- | --- | --- | --- |
| Main Menu | 390 | Dòng "Quà ngày 2 đang chờ" dưới **Tiếp tục**; P26 không có dòng này | ![Main Menu 390](../media/menu-gift-390-p27.jpg) |
| Main Menu | 1280 | Như trên | ![Main Menu 1280](../media/menu-gift-1280-p27.jpg) |
| HUD | 390 | Chip Tem (7) ngay sau tiền trong cụm Tiến độ | ![HUD 390](../media/hud-tem-390-p27.jpg) |
| HUD | 1280 | Như trên, HUD một hàng | ![HUD 1280](../media/hud-tem-1280-p27.jpg) |
| Nhân viên | 390 | Chip "Gọn gàng", dòng "Cấp 1/5 · KN 338/240", thanh KN đầy, xác nhận "Đào tạo Quân lên cấp 2?" tại chỗ | ![Nhân viên 390](../media/staff-390-p27.jpg) |
| Nhân viên | 1280 | Như trên | ![Nhân viên 1280](../media/staff-1280-p27.jpg) |

### Chỉ P27

| Cảnh | Khổ | Chỗ cần nhìn | Ảnh |
| --- | --- | --- | --- |
| Việc | 390 | Khung trái: thẻ Quà hằng ngày với chuỗi 7 ô và nút "Nhận quà ngày 2". Khung phải: đơn "3 Espresso trước 19:00 · 2/3" kèm thưởng, danh sách Thành tựu đã sổ | ![Việc 390](../media/tasks-390-p27.jpg) |
| Việc | 1280 | Như trên | ![Việc 1280](../media/tasks-1280-p27.jpg) |
| Nâng cấp | 390 | "Giá 1.500.000đ + 3 Tem" ở Máy hát đĩa, "Giá 2.500.000đ + 5 Tem" ở Góc sofa, chip Tem trên HUD | ![Nâng cấp 390](../media/upgrades-tem-390-p27.jpg) |
| Nâng cấp | 1280 | Như trên | ![Nâng cấp 1280](../media/upgrades-tem-1280-p27.jpg) |
| Quán mở rộng cấp 4 | 1280 | Phòng bên cấp 4 kín bàn, Biển neon hai bên cửa, Kệ sách, Máy hát đĩa trên quầy sau, Góc sofa | ![Quán mở rộng 1280](../media/expand-1280-p27.jpg) |
| Quán mở rộng cấp 4 | 390 | Khung điện thoại thấy một phần quán: Biển neon và Kệ sách | ![Quán mở rộng 390](../media/expand-390-p27.jpg) |
| Khách VIP | 1280 | Ngôi sao vàng trên đầu khách VIP (ngày 5), camera phóng khoảng 2x | ![Khách VIP 1280](../media/vip-1280-p27.jpg) |
| Khách VIP | 390 | Ngôi sao trên đầu khách VIP, camera mặc định | ![Khách VIP 390](../media/vip-390-p27.jpg) |
