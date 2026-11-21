# E-31: Chăm chút UI sau v0.41.0

Phạm vi: chỉ UI. `src/sim` không đổi.

## Bảng UX -> file -> test

| Mã UX | File | Test |
|---|---|---|
| UX-403 / UX-404 (T-113) | `src/ui/panels/styles.ts` | `tests/ui/e31-styles-tem-wording.test.ts` |
| UX-406 (T-115) | `src/ui/styles/ui.css`, `screens.ts`, `game.ts`, `scripts/lib/probes.mjs`, `scripts/check-layout.mjs` | `tests/ui/ux-406-dock-modal.test.ts` |
| UX-407 (T-115) | `report.ts`, `report.css`, `settings.ts` | `tests/analytics/ux-407-consent-status.test.ts` |
| UX-408 / 414 / 409 / 411 / 412 / 413 (T-116) | `src/ui/panels/tasks.ts`, `widgets.ts` (`dotJoin`), `panels.css`, `screens/game.ts`, `settings.ts`, `ui.css` | `tests/ui/t116-regulars-ux.test.ts` |
| Theo dõi E-30 (T-117) | `src/ui/highExpiry.ts`, `screens/game.ts` | `tests/ui/t117-high-expiry-flag.test.ts` |

### Chi tiết

- **UX-403/404**: câu xác nhận ghi "Còn lại N Tem". Kiểu trả phí đã dùng hiện "Đã có". Nhãn "Kiểu gốc" chỉ dành cho kiểu miễn phí.
- **UX-406**: khi modal mở, dock bị ẩn và `inert`. Trong Chrome thật, probe layout đo được 0 phần tử dock, nên thực chất probe chỉ kiểm tra trạng thái ẩn/inert, không đo vị trí dock.
- **UX-407**: trạng thái đồng ý chia sẻ dữ liệu hiển thị trong báo cáo và Cài đặt.
- **UX-408/414/409/411/412/413**: huy hiệu "mới", ô mốc, dấu chấm lạc, xuống dòng cho màn Khách quen. `dotJoin` trong `widgets.ts` nối các phần bằng dấu chấm.
- **Theo dõi E-30 (T-117)**: toast hết hạn giá/lương Cao không còn so khớp theo chữ. UI tự theo dõi `highPriceEndedDay` / `highWageEndedDay`. Thông báo của sim được thay theo vị trí trong batch đầu ngày. Nếu không có thì toast dự phòng hiện sau batch. `src/sim` không đổi nên p22/p23/sim:long không bị ảnh hưởng.

## Lựa chọn thiết kế
- Chọn phương án nhỏ nhất cho mỗi mục, để giảm rủi ro hồi quy.
- Không thêm modal mới: dùng lại modal và Cài đặt hiện có.
- Không tăng phiên bản save: không đổi dữ liệu lưu.
- Không dùng emoji, giữ đúng phong cách UI hiện tại.
- Theo dõi cờ thay vì so chữ, để đổi câu chữ thông báo không làm hỏng nút.

## Bằng chứng test
- `npm run check` chạy thành ba bước riêng: `tsc`, `vitest` (211 file, 2489 test), `vite build`. Cả ba đều pass.
- `src/sim` không đổi, nên không cần chạy lại p22/p23/sim:long.

## Chưa kiểm chứng
- `npm run layout`, perf và media thật không chạy được trong sandbox: worktree thiếu vite, cổng 4173 bị EPERM.
- `LAYOUT_OFFLINE=1` với `check-layout` pass 157/157, nhưng dùng WebGL phần mềm, KHÔNG tương đương layout thật.
- UX-409/411/412/413 chỉ được kiểm tra CSS/cấu trúc trong jsdom, cần xem trên trình duyệt thật:
  - UX-411: độ rộng ô mốc ước tính khoảng 76px.
  - UX-413: dùng đơn vị `1lh`.
- Báo cáo của designer không đọc được trong sandbox, nên các vị trí lỗi của UX-409 chưa được xác nhận.
- Draw call: không đổi phần 3D, không đo.

## Test flaky và ghi chú
- `css-order` và `deploy-pages` có thể flaky trong sandbox, nhưng lần này không xuất hiện.
