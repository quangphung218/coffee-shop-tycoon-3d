# Rút ngắn `npm run layout`: nạp save thay vì chơi hết ngày

`scripts/check-layout.mjs` từng chơi một ngày game thật ở 4x cho mỗi khổ màn hình (390×844, 768×1024, 1440×900), chỉ để có Daily Report cần soát: 104 s mỗi khổ, gần hết thời gian của lệnh. Từ commit này, sau "HUD: mở cửa" lệnh đóng trang và nạp save ngày 1 do sim của chính cây build chơi (`playFirstDay` trong `scripts/lib/saves.mjs`), dừng ở **tick cuối trước báo cáo**; trình duyệt tự chạy tick kết ngày (dayEnded, autosave, vẽ Daily Report) rồi lệnh soát Daily Report và tab Đánh giá như cũ. 98 kiểm tra giữ nguyên tên, thứ tự và ngưỡng.

Máy đo: Apple M2, Chrome 155 headless, WebGL ANGLE Metal (dòng `browser:` đầu lượt). Số đo là của riêng `node scripts/check-layout.mjs` trên cùng build `5d6402e` (sau PR #38), không tính `npm run build`; `/usr/bin/time -l`.

## 1. Thời gian

| Bản | Thực (wall) | CPU user | CPU sys | Kết quả | Mỗi khổ day |
| --- | --- | --- | --- | --- | --- |
| Cũ (`origin/main` 5d6402e) | 349,1 s | 141,2 s | 27,4 s | PASS 98/98 | 104 s × 3 |
| Mới (commit này) | 61,0 s | 50,3 s | 12,5 s | PASS 98/98 | 8 s × 3 |
| Cũ, worktree CSS hỏng | 349,2 s | 131,9 s | 26,0 s | FAIL 7/98 | 104 s × 3 |
| Mới, worktree CSS hỏng | 64,8 s | 50,5 s | 12,3 s | FAIL 7/98 | 8 s × 3 |

Gần 5,7 lần nhanh hơn, CPU user bằng 36%. Phần còn lại của 61 s: dựng save (sim, vite ssr) vài giây, 3 khổ day 8 s mỗi khổ, rồi HUD 1280, 5 khổ ngày sự kiện, P25 (8 phiên) và P27 (12 phiên), mỗi phiên nạp trang 2–3 s.

## 2. Tương đương

- **Cùng danh sách kiểm tra.** Bảng kết quả của hai bản trên cùng build giống hệt nhau, đủ 98 dòng và cả cột chi tiết (số scroll box, phần tử, hàng HUD, CLS…): `diff` hai bảng không ra dòng nào.
- **Cùng nội dung Daily Report.** Save ngày 1 dùng đúng tên quán của form Ván mới, Easy, seed = đồng hồ cố định của trang, mua gợi ý Kho rồi tuyển 2 người theo đúng vai bảng Nhân viên chọn, nhân viên tự phục vụ cả ngày (không có thao tác người chơi, như lúc lệnh chờ ngày chạy). Tick kết ngày do trình duyệt chạy nên có cả dòng "Đã tự lưu ngày 1" và toast như trước: số phần tử soát trong Daily Report và Đánh giá bằng bản cũ (134–135 và 479–480 phần tử ở cả ba khổ).
- **Cùng bắt lỗi.** Trên một worktree tạm cùng commit, `.rpt-figs` trong `src/ui/report/report.css` bị thêm `min-width: 1600px`: cả hai bản cùng FAIL 7/98, đúng 7 dòng giống nhau (Daily Report ở 3 khổ, Báo cáo ngày 3 có thẻ lên cấp ở 4 khổ), 91 dòng còn lại PASS; `diff` toàn bộ bảng (cả chi tiết: số phần tử lệch khung, chữ của phần tử tràn) không ra dòng nào. Chữ của phần tử tràn trong Daily Report là "Lãi +1.419.900đ · Doanh thu 2.440.000" ở cả hai bản: ngày 1 sim chơi ra đúng số của ngày trình duyệt từng chơi (cùng seed, cùng lệnh, không có thao tác người chơi).

## 3. Việc đã đổi

| File | Đổi |
| --- | --- |
| `scripts/lib/saves.mjs` | `playFirstDay(mods, { shopName, difficulty, seed, hires })`: ngày 1 như check-layout từng chơi, trả trạng thái trước tick kết ngày. `loadSim(root, extra)` nhận thêm module theo tên (`retention`, `staff`). |
| `scripts/check-layout.mjs` | Sau "HUD: mở cửa": đóng trang, `resumeSave` save ngày 1, chờ báo cáo có số và dòng autosave, soát Daily Report + Đánh giá. Save sự kiện (`eventDaySave`) và save ngày 1 dùng chung một lượt `loadSim`. Bỏ `DAY_TIMEOUT_MS`. |
| `tests/scripts/layout-first-day.test.ts` | `playFirstDay` dừng còn mở cửa, tick kế tiếp ra báo cáo có khách, doanh thu, đánh giá; tất định; save nạp lại và kết ngày giống nhau. Test tương đương luồng UI: dựng trạng thái đúng như hai bảng làm (`buy_ingredient` từng dòng `restockPlan` theo thứ tự `INGREDIENTS`, `packs = ceil(qty/packSize)`; `hire_staff` theo `rolePlan`), `step(s, 1)` tới tick trước báo cáo rồi `toEqual` với `playFirstDay`: đỏ khi bỏ `apply_restock` hay đổi `candidates[0]`. |
| `scripts/lib/perf-lock.mjs` | `lockPath(root, dir)`, `acquirePerfLock(root, { dir })`, `lockDir()` = `$PERF_LOCK_DIR` hoặc temp dir của máy. `tests/scripts/perf-lock.test.ts` trỏ vào `mktemp`, không đụng lock thật nên không đỏ khi máy đang đo. |
| `scripts/check-layout.mjs` (lock) | Giữ perf lock của máy từ trước khi mở preview và Chrome tới khi đóng: chờ `perf:frames`/`measure-startup` đang chạy (`PERF_LOCK_WAIT_S`), và chặn lượt đo khởi động chồng lên mình. |
| `docs/media.md`, `CLAUDE.md` | Mục Kiểm lề và CLS: cách chạy mới, thời gian mới, lock; CLAUDE.md ghi `layout` cùng giữ lock. |

Cách chạy không đổi: `npm run layout`; `LAYOUT_ONLY`, `LAYOUT_DAY_WIDTHS`, `LAYOUT_HEADED` như cũ.
