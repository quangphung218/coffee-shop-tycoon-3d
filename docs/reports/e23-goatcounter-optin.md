# E-23: Số liệu ẩn danh qua GoatCounter (opt-in)

Báo cáo tổng hợp từ code và báo cáo các task. Mục nào chưa chạy được thì ghi rõ **chưa kiểm chứng**.

## Đồng ý của người chơi

- Đồng ý lưu **theo từng slot save**: `'unasked'` | `'yes'` | `'no'` (save version 7). Save cũ = `'unasked'`.
- Hỏi ở chân báo cáo ngày 1: "Gửi số liệu ẩn danh để cải thiện game?" với nút **Đồng ý** / **Không**.
- Settings có dòng **Số liệu ẩn danh**: **Gửi** / **Không gửi**.
- Chưa đồng ý (`unasked` hoặc `no`) => **không tải script, không có request nào**.

## Gửi gì

- Khi `yes`, tải động `//gc.zgo.at/count.js` với `data-goatcounter=https://coffeeshop-qp.goatcounter.com/count` và settings `{"no_onload":true}` (không tự đếm lượt xem trang).
- Sau đó gọi `goatcounter.count({path, title, event:true})`.
- Chỉ gửi path và title của sự kiện. Không cookie, không id người chơi.
- Mỗi path chỉ gửi **một lần mỗi phiên**.
- Sự kiện phát sinh trước khi script tải xong được xếp hàng; thu hồi đồng ý (`Không gửi`) xoá hàng đợi.

## Danh sách sự kiện (path chính xác)

| Path | Khi nào |
| --- | --- |
| `/session-start` | Phiên chơi có đồng ý `yes` (một lần mỗi lần tải trang) |
| `/day-end-1` … `/day-end-7` | Kết thúc ngày 1–7 (tuần đầu) |
| `/week-end-N` | Tuần N được chấm điểm |
| `/week-N-cups-K` | Tuần N được chấm với K cúp (K = 0..3) |
| `/level-up-N` | Quán lên cấp N |
| `/first-staff-hire` | Lần thuê nhân viên đầu tiên của lượt chơi |
| `/regular-milestone-K` | Khách quen đạt mốc K (1..3) |
| `/quit-mid-day` | Tab bị ẩn khi ngày đang mở (opening/peak/closing) |

`/quit-mid-day` chỉ gửi nếu `count.js` đã tải sẵn (qua sendBeacon của nó); nếu chưa thì bỏ qua.

## Chủ game xem ở đâu

1. Vào `coffeeshop-qp.goatcounter.com`.
2. Mở danh sách Events/paths, lọc theo path (ví dụ `day-end`, `quit-mid-day`).
3. Đọc phễu: so số lượt `day-end-1` … `day-end-7` để thấy người chơi rơi ở ngày nào; `quit-mid-day` cho biết bao nhiêu người thoát giữa ngày.

## Tắt

- Người chơi: Settings > **Số liệu ẩn danh** > **Không gửi**.
- Chủ game: gỡ phần nối sự kiện (`src/ui/analyticsEvents.ts`) hoặc không deploy bản này.

## Kiểm chứng

- Test: 2342 pass; `tsc` và build chạy được.
- `p22`/`p23` và `src/sim` không đổi so với `main`.
- Layout offline: 137 kiểm tra pass, nhưng **không tương đương layout thật**.
- `npm run layout`, `perf`, `media` thật: **chưa kiểm chứng trong sandbox** (thiếu vite, EPERM cổng 4173). `npm run check` gặp EPERM ở `.vite-temp` nên các bước chạy riêng với `--configLoader runner`.
- Layout và hiệu năng thật **chưa kiểm chứng**; cần chạy lại ngoài sandbox.

## Lưu ý đã biết

- Đồng ý theo slot, không theo máy.
- Nếu đóng tab trước khi save, lựa chọn ở menu bị mất.
- Chân báo cáo ngày 1 bị bỏ qua thì không hiện lại; Settings vẫn dùng được.
- Test css-order từng flaky (lần chạy này pass).
