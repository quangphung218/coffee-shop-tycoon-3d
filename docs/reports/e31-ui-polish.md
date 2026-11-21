# E-31: Chăm chút UI sau v0.41.0

Phạm vi: chỉ UI. `src/sim` và `src/save` không đổi.

## Bảng UX -> file -> test

| Mã UX | File | Test |
|---|---|---|
| UX-403 / UX-404 (T-114) | `src/ui/panels/styles.ts` | `tests/ui/e31-styles-tem-wording.test.ts` |
| UX-406 (T-115) | `src/ui/styles/ui.css`, `src/ui/core/screens.ts`, `src/ui/screens/game.ts`, `scripts/lib/probes.mjs`, `scripts/lib/probes.d.mts`, `scripts/check-layout.mjs` | `tests/ui/ux-406-dock-modal.test.ts` |
| UX-407 (T-115) | `src/ui/report/report.ts`, `src/ui/report/report.css`, `src/ui/report/index.ts`, `src/ui/screens/settings.ts` | `tests/analytics/ux-407-consent-status.test.ts` |
| UX-408 / 414 / 409 / 411 / 412 / 413 (T-116) | `src/ui/panels/tasks.ts`, `src/ui/panels/widgets.ts` (`dotJoin`), `src/ui/panels/panels.css`, `src/ui/screens/game.ts`, `src/ui/screens/settings.ts`, `src/ui/styles/ui.css` | `tests/ui/t116-regulars-ux.test.ts` (một test cho mỗi mã) |
| Theo dõi E-30 (T-117) | `src/ui/highExpiry.ts`, `src/ui/screens/game.ts`, `docs/reports/e30-state-hints.md` (cập nhật mục Caveat) | `tests/ui/t117-high-expiry-flag.test.ts` |

### Chi tiết

- **UX-403/404 (T-114)**, trong `src/ui/panels/styles.ts`:
  - Kiểu trả bằng Tem (price > 0 hoặc tickets > 0) hiện "Đã có", không còn "Kiểu gốc". "Kiểu gốc" chỉ dành cho kiểu miễn phí.
  - `stylePriceText` chỉ ghi "N Tem" khi price (tiền) bằng 0.
  - `styleConfirmText` ghi "Còn lại N Tem". Khi price > 0, thêm số tiền còn lại, nối bằng " và ".
- **UX-406**: dock không nổi lên trên hộp Cài đặt.
  - Cơ chế CSS trong `src/ui/styles/ui.css`: `.dock { isolation: isolate }` và `#ui:has(> .ui-screen[aria-modal='true']:not([hidden])) .dock { visibility: hidden }`.
  - Cơ chế JS: `syncDock()` trong `src/ui/screens/game.ts` đặt `inert` cho dock khi `screens.current !== null` hoặc `report.visible`. Nó dùng `ScreenManager.onChange` mới trong `src/ui/core/screens.ts`.
  - Kiểm trong `check-layout`: chạy ở chế độ `LAYOUT_OFFLINE=1` (WebGL phần mềm). Probe thấy 0 phần tử dock hiển thị vì dock đã bị ẩn, nên phép hit-test "dock nằm trên modal" chỉ được thực thi bởi test jsdom `tests/ui/ux-406-dock-modal.test.ts`. Phần probe chỉ xác nhận trạng thái ẩn/inert.
- **UX-407**: không thêm modal mới.
  - Dưới câu hỏi, `CONSENT_DETAIL` nói: "Chỉ gửi tên các mốc chơi (như hết ngày 1, lên cấp). Không cookie, không tên quán hay tên người chơi."
  - Sau khi trả lời, một dòng `role=status` (`CONSENT_DONE`) trong `.rpt-foot` nói đã chọn gì, kèm "Đổi trong Cài đặt > Số liệu ẩn danh."
  - Hàng "Số liệu ẩn danh" có sẵn trong Cài đặt được thêm `CONSENT_HINT` và dòng status `CONSENT_SAVED` ("Đã bật/Đã tắt gửi số liệu ẩn danh").
- **UX-408**: khách quen mùa 2 vừa dọn tới lên đầu danh sách Khách quen, kèm nhãn "Mới" trong `NEW_REGULAR_DAYS = 7` ngày (`isNewRegular`).
- **UX-414**: "Xem chuyện" gọi `revealRegular(id, milestone)` và mở ô mốc `milestone - 1`, tức ô mốc vừa đạt.
- **UX-409**: `dotJoin` trong `src/ui/panels/widgets.ts` bọc từ cuối của mỗi phần cùng dấu " ·" của nó trong `span.dot-keep` (nowrap). Nhờ vậy dòng xuống hàng không bắt đầu bằng, hoặc chỉ chứa, một dấu "·" lẻ.
- **UX-411**: `.book-cell > span { white-space: nowrap }` để ô "53 lần" không xuống dòng. Thêm chỉnh grid/padding ở màn <= 480px (ô khoảng 76px).
- **UX-412**: nhóm "Điều khiển" (`.set-group-keys`) trong Cài đặt bị ẩn trên thiết bị cảm ứng, qua media `(hover: none)` / `(pointer: coarse)`.
- **UX-413**: icon tổng kết tuần `.wk-next p > .ic` dùng `align-items: flex-start` và `margin-top: calc((1lh - 16px) / 2)` để nằm thẳng dòng đầu.
- **Theo dõi E-30 (T-117)**: toast hết hạn giá/lương Cao không còn so khớp theo chữ.
  - `createHighExpiryWatch` đọc `highPriceEndedDay` / `highWageEndedDay` và cờ `highPriceJustEnded` / `highWageJustEnded`. Có chốt "đã thấy ngày này" nên mỗi lần hết hạn chỉ hiện một toast, không hiện lại sau khi tải save.
  - Thông báo thường bị thay được nhận ra theo vị trí trong batch: notify mức info đứng trước sự kiện pha 'preparation'. Nếu thứ tự sim đổi, vòng cuối `handleEvents` trong `game.ts` vẫn hiện toast còn sót, nên nút "Đặt lại" không biến mất.
  - Test viết lại chữ mọi notify rồi kiểm tra cả hai nút "Đặt lại giá/lương Cao" vẫn hiện và đặt lại High khi bấm.
  - Mục Caveat trong `docs/reports/e30-state-hints.md` đã được T-117 cập nhật theo cách mới.

## Lựa chọn thiết kế
- Chọn phương án nhỏ nhất cho mỗi mục, để giảm rủi ro hồi quy.
- Không thêm modal mới: dùng lại phần báo cáo và hàng có sẵn trong Cài đặt.
- Không tăng phiên bản save: không đổi dữ liệu lưu.
- Không dùng emoji, giữ đúng phong cách UI hiện tại.
- Theo dõi cờ thay vì so chữ, để đổi câu chữ thông báo không làm hỏng nút.
- UX-406: ẩn và `inert` dock thay vì chỉ chỉnh z-index, vì ẩn loại hẳn khả năng dock nằm trên modal và chặn cả focus bàn phím.

## Bằng chứng test
- Từng task chạy vitest với `--configLoader runner`: T-114 5 test, T-115 11 test, T-116 6 test, T-117 2 test, đều pass. `npx tsc --noEmit` thoát 0.
- T-117: `npx vitest run --configLoader runner` toàn bộ 211 file, 2489 test pass. `npx vite build --configLoader runner` build được (chỉ có cảnh báo kích thước chunk).
- `git diff main...HEAD --stat -- src/sim src/save` rỗng ở T-115, T-116, T-117. `src/sim` không đổi, nên p22/p23/sim:long không cần chạy lại và không có số mới.
- `LAYOUT_OFFLINE=1 node scripts/check-layout.mjs`: PASS 157 kiểm. Đây là chế độ offline, KHÔNG tương đương layout thật.

## Chưa kiểm chứng
- `npm run layout` thật, perf và media thật không chạy được trong sandbox: cổng 4173 bị EPERM, Chromium không khởi chạy thật được.
- `LAYOUT_OFFLINE=1` dùng WebGL phần mềm, nên 157 kiểm pass không chứng minh layout thật.
- UX-409/411/412/413 chỉ được kiểm tra luật CSS và cấu trúc trong jsdom (jsdom không dàn trang), cần xem trên trình duyệt thật:
  - UX-409/411: việc xuống dòng thật ở 390px.
  - UX-412: ẩn nhóm "Điều khiển" trên thiết bị cảm ứng thật.
  - UX-413: hỗ trợ đơn vị `1lh` và vị trí icon.
- UX-406: phép hit-test dock trên modal chỉ chạy trong jsdom (xem trên).
- Draw call: không đổi phần 3D, không đo.

## Test flaky và ghi chú
- `css-order` và `deploy-pages` có thể flaky trong sandbox, nhưng ở lần chạy của T-117 không xuất hiện: không có test nào fail hay flaky.
