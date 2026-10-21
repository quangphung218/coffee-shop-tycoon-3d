# Hạ tầng verify: Chrome trên GPU, khoá đo hiệu năng, chụp theo kịch bản

Đo ngày 21/10/2026 trên Apple M2 (8 lõi), Chrome 155, Playwright 1.64, trên commit `ff8e7cc` (nhánh tích hợp P30) và nhánh này. Máy đang chạy việc khác lúc đo (load trung bình 5–15), nên thời gian thực chỉ để so tương đối; CPU của tiến trình và renderer WebGL là số đáng tin.

## 1. Tóm tắt

- 9/11 script chụp và kiểm (`npm run layout`, `media:p20`…`media:p30`, `review:p22`, `build-icons`, `capture-loading`) mở **chromium-headless-shell** của Playwright. Headless shell vẽ WebGL bằng **SwiftShader trên CPU**: `npm run layout` ăn trung bình 375% CPU (đỉnh 560%) trong 7,3 phút; `media:p30` ăn 433% (đỉnh 619%) trong 5,8 phút rồi thoát mã 1 vì trang vẽ quá ít khung, đồng hồ game không chạy nên không có biểu cảm nào để chụp.
- Chrome cài sẵn ở chế độ headless mới vẽ WebGL bằng **ANGLE Metal (GPU)**. `scripts/lib/browser.mjs` giờ là chỗ duy nhất mở trình duyệt: Chrome thật (`CHROME_PATH`, chỗ cài quen thuộc, kênh `chrome`), in renderer mỗi lượt, chỉ rơi về headless shell khi không có Chrome và in `!! WebGL chạy bằng CPU`. Kết quả: `media:p30` còn 58 s, CPU user 52 s (trước 1486 s), cả ba biểu cảm chụp được ở headless, lệnh thoát mã 0; `npm run layout` còn 354 s, CPU user 147 s (trước 1463 s).
- `perf:frames` và `measure-startup` giữ lockfile theo repo (`scripts/lib/perf-lock.mjs`): lượt đo thứ hai chờ lượt đầu, không còn hai lượt giành GPU.
- Phần chung của các script chụp (preview, build bản gốc, nạp save, chờ `cst:world`, chụp, khoanh, vẽ bảng) nằm trong `scripts/lib/`; `scripts/capture.mjs` chạy **kịch bản** `scripts/scenarios/<id>.mjs`. P29 và P30 đã chuyển: `capture-p29.mjs` (1058 dòng) + `capture-p30.mjs` (937 dòng) thành `scenarios/p29.mjs` (250 dòng) + `scenarios/p30.mjs` (371 dòng), ra cùng số ảnh, cùng kích thước (mục 5).

## 2. Nguyên nhân

Playwright từ 1.49 mở `chromium.launch({ headless: true })` bằng `chromium-headless-shell`, một bản Chromium rút gọn không có GPU process; WebGL rơi về SwiftShader (Vulkan phần mềm) và mỗi khung 1280×800 tốn hàng chục ms CPU trên 4–6 luồng. Game đẩy đồng hồ tối đa 0,1 s thật mỗi khung (`MAX_FRAME_S`), nên khi trang chỉ vẽ vài khung mỗi giây ở x4 thì đồng hồ game gần như đứng: `media:p30` chờ 40 s cho mỗi biểu cảm mà không thấy gì. Các script `measure-frames`, `measure-startup`, `capture-p25` đã biết chuyện này và có `findChrome()` riêng; các script còn lại thì không. Probe shader nặng 1280×720 trong 5 s: headless shell 20,8 fps (`ANGLE … SwiftShader`), Chrome headless mới 60,8 fps (`ANGLE Metal Renderer: Apple M2`).

## 3. Việc đã làm

| Việc | Ở đâu |
| --- | --- |
| Một hàm `launchBrowser()` dùng chung: Chrome thật, headless mới, in `browser: … WebGL: …`, cảnh báo `!!` khi SwiftShader, `MEDIA_GPU=require` để dừng, `MEDIA_CHROMIUM=1` để ép headless shell; 14 chỗ `chromium.launch` trong 14 script đổi sang hàm này, giữ `MEDIA_HEADED`/`LAYOUT_HEADED`; 3 bản `findChrome` bỏ | `scripts/lib/browser.mjs`, mọi `scripts/*.mjs` |
| Khoá đo hiệu năng: lockfile `cst3d-perf-<hash>.lock` trong `os.tmpdir()`, lượt 2 chờ tới `PERF_LOCK_WAIT_S` (mặc định 1800 s; `0` từ chối ngay), lock của tiến trình chết được lấy lại; hai script đo từ chối WebGL phần mềm trừ khi `MEDIA_GPU=any` | `scripts/lib/perf-lock.mjs`, `measure-frames.mjs`, `measure-startup.mjs` |
| Phần chung của chụp: `capture.mjs` (root, cổng, `FIXED_NOW`, settings tắt tiếng, preview, `buildRef`, context, Main Menu, đồng hồ HUD, `progress`/`warn`), `saves.mjs` (chơi ván trên sim của từng bản, save text), `probes.mjs` (hook camera/đồng hồ trang, quét biểu cảm/đội/ánh sáng/bóng/vũng sáng, đọc DOM), `board.mjs` (vẽ bảng có khoanh, crop), `shots.mjs` (session + 9 kiểu shot) | `scripts/lib/` |
| Runner kịch bản: `node scripts/capture.mjs <id> [--only] [--saves-only] [--out] [--base] [--headed]`; `npm run media -- --scenario <id>`; `media:p29`, `media:p30` trỏ sang runner | `scripts/capture.mjs`, `package.json`, `scripts/capture-media.mjs` |
| Kịch bản P29 và P30 thay hai script cũ; test nạp kịch bản và kiểm kiểu shot | `scripts/scenarios/p29.mjs`, `p30.mjs`, `tests/scripts/capture.test.ts` |
| Shot `emote` giữ đồng hồ trang ở khung biểu cảm hiện (`clockHooks`: `performance.now` đứng, rAF xếp hàng, `tick()` chạy từng khung 1/60 s), nở vài khung, phóng camera, vẽ một khung rồi chụp; biểu cảm nào mất trong lúc đó được chờ lại. Trước đây giữa lúc scan thấy mây và lúc chụp mất khoảng 0,4 s thật, mây (2,2 s, khách bỏ đi ngay) thường đã tắt: ở lượt đo "sau" chưa có hold, mây được chụp nhưng vòng khoanh rỗng; với hold, cả ba biểu cảm chụp được ở lần thử đầu, 0 lần hụt | `scripts/lib/probes.mjs` `clockHooks`, `scripts/lib/shots.mjs` `emoteAfter` |
| `startPreview` nêu rõ cổng bị `fetch` của Node từ chối (4190, 4045, 5060, 6000…) thay vì "did not start" | `scripts/lib/capture.mjs` |
| Luật cho hạng mục verify: viết kịch bản, không chép script; đo tuần tự; luôn kiểm renderer là GPU | `CLAUDE.md`, `docs/media.md` mục Kịch bản chụp, Yêu cầu, Tùy chọn, Lỗi hay gặp |

`npm run check` xanh (tsc, 1835 test trong 128 file, vite build); không đổi `src/`.

## 4. Số đo trước/sau

Cùng commit `ff8e7cc` cho cột "trước" (worktree riêng, script nguyên bản, headless shell) và nhánh này cho cột "sau"; `/usr/bin/time -l` cho thời gian thực và CPU user của cả cây tiến trình, `ps` mỗi 5 s cho %CPU của các tiến trình Chrome (trung bình / đỉnh). `MEDIA_PORT=4200`, headless, không `MEDIA_HEADED`.

| Lệnh | Trước (headless shell, SwiftShader) | Sau (Chrome, ANGLE Metal) |
| --- | --- | --- |
| `npm run layout` | 436 s thực, 1463 s CPU user, Chrome 375% TB / 560% đỉnh, PASS 98/98 | 354 s thực, 147 s CPU user, Chrome 47% TB / 203% đỉnh, PASS 98/98 |
| `npm run media:p30` | 348 s thực, 1486 s CPU user, Chrome 433% TB / 619% đỉnh, mã 1: 3 `!!` (không thấy tim, mồ hôi, mây) | 58 s thực, 52 s CPU user, Chrome 88% TB / 224% đỉnh, mã 0: đủ tim, mồ hôi, mây (mây lúc HUD 12:06, 0 lần hụt) |
| `node scripts/capture-p30.mjs` cũ trên Chrome GPU (bước trung gian) | — | 55 s thực, 46,5 s CPU user, Chrome 64% TB / 238% đỉnh, mã 1: 1 `!!` (mây) |

Renderer: trước `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)`; sau `ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)`.

## 5. Ảnh kịch bản so với script cũ

Cùng commit, cùng Chrome GPU, chạy nối tiếp: script cũ (`capture-p30.mjs`, `capture-p29.mjs` ở `0d9f5e6`, đã dùng `launchBrowser`) rồi kịch bản mới (`--out` thư mục riêng). So pixel bằng canvas: tỉ lệ pixel có kênh lệch trên 32/255 và lệch tuyệt đối trung bình.

P30 (4/4 file, cùng kích thước):

| Ảnh | Kích thước cũ | Kích thước mới | Pixel khác (>32) | Lệch TB |
| --- | --- | --- | --- | --- |
| emotes-before-after-p30.jpg | 1500×1577 | 1500×1577 | 9.7% | 15.1 |
| regulars-390-before-after-p30.jpg | 1100×2538 | 1100×2538 | 0.2% | 0.3 |
| uniform-latte-before-after-p30.jpg | 1700×1003 | 1700×1003 | 6.5% | 8.6 |
| uniform-picker-390-before-after-p30.jpg | 1100×1312 | 1100×1312 | 0.1% | 0.2 |

Hai bảng DOM (mục Đồng phục, thẻ Khách quen + toast) gần như trùng khít. Hai bảng cảnh 3D (biểu cảm, đội) khác 6–10% pixel vì cảnh đang chạy: khách đi lại, đồng hồ HUD 12:05 thay vì 12:06, tim được chọn là tim gần giữa khung ở thời điểm quét (hai tim trên màn); bố cục, chú thích, số khoanh và kích thước giống hệt. Cả hai lần cùng `!!` ở đám mây (mục 6).

P29 (28/28 file):

| Ảnh | Kích thước cũ | Kích thước mới | Pixel khác (>32) | Lệch TB |
| --- | --- | --- | --- | --- |
| coin-before-after-p29.jpg | 1728×646 | 1728×646 | 0.5% | 0.7 |
| dusk-sunny-high-before-after-p29.jpg | 1900×818 | 1900×818 | 0.2% | 0.4 |
| hours-sunny-high-1280-p29.jpg | 1899×576 | 1899×576 | 0.3% | 0.5 |
| levelup-390-p29.jpg | 390×844 | 390×844 | 0.1% | 0.1 |
| 24 ảnh `scene-*` | 390×844 / 1280×800 | như cũ | 0.0–0.9% | 0.1–2.0 |

Mọi ảnh P29 lệch dưới 1% pixel: cùng save, cùng giờ HUD, khác nhau chỉ ở khách đang bước và mưa đang rơi lúc chụp. Bốn file khác trong `docs/media/p29/` (`dusk-rainy-*`, `levelup-shake-*`, `noon-medium-*`) là ảnh của các lần sửa P29 trước, không script nào trong hai bản tạo ra. Script cũ 103 s, kịch bản 105 s, cả hai thoát mã 0.

## 6. Còn lại

- Bảng biểu cảm có đủ mây trong `docs/reports/p30-characters/` chưa được thay (ảnh của lượt này để ngoài repo): đổi ảnh và câu "Chưa có ảnh đám mây" trong `docs/reports/p30-characters.md` là việc của đợt fix P30; chạy `npm run media:p30` trên nhánh tích hợp P30 là có.
- `media:p20`–`media:p27`, `review:p22`, `capture-loading`, `check-layout` vẫn là script riêng (đã dùng `launchBrowser`, chưa chuyển sang kịch bản): mỗi script 600–1600 dòng với luồng chơi qua giao diện (bấm nút, tuyển người, nhập hàng) khó tách thành dữ liệu; chuyển khi cần chạy lại.
- Thời gian thực đo lúc máy bận (load 5–15); cần số sạch thì đo lại lúc máy rảnh, nhưng tỉ lệ CPU user và renderer không đổi.
