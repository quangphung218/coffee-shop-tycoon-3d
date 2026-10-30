# E-16: Thử thách tuần (từ tuần 5)

Từ tuần 5, mỗi tuần có thêm một thử thách phụ cạnh Mục tiêu tuần. Hoàn thành thì nhận Tem một lần. Báo cáo này ghi lại mẫu thử thách, cách bốc, thiết kế phần thưởng, migration, số đo từ sim, sửa layout và các mục chưa kiểm chứng.

## Mẫu thử thách

Định nghĩa ở `src/sim/data/challenges.ts` (`WEEK_CHALLENGES`). Tuần đầu có thử thách là `CHALLENGE_FIRST_WEEK = 5`.

| Mẫu | Mục tiêu (sau chỉnh) | Tem |
| --- | --- | --- |
| `regular_visits` | 55 lượt khách quen trong tuần (trước: 15) | 6 |
| `stars_week` | cuối cả 7 ngày giữ từ 4.9 sao (trước: 4.6) | 8 |
| `sell_item` | bán 300 ly món được bốc (trước: 80) | 6 |
| `calm_day` | một ngày phục vụ từ 300 khách, không ai bỏ đi (trước: 40) | 5 |
| `served_week` | phục vụ 1700 khách trong tuần (trước: 700) | 6 |
| `perfect_days` | hoàn thành cả 3 nhiệm vụ ngày trong 4 ngày (trước: 3) | 6 |

## Cách bốc

`rollWeekChallenge(seed, index)` trong `src/sim/challenges.ts` trả `null` trước tuần 5.

- Mẫu được bốc bằng hash 32-bit của `(seed, tuần)`, có muối riêng `CHALLENGE_SALT`. Không đụng `state.rngState`, nên chuỗi RNG của game không đổi. Cùng seed cho cùng chuỗi thử thách.
- Tuần 5 hash ra một trong 6 mẫu. Mỗi tuần sau hash ra một trong 5 mẫu còn lại, nên không có mẫu nào xuất hiện hai tuần liên tiếp.
- `sell_item` bốc thêm một món bằng hash chỉ số âm (`-index`), lấy từ các món mà lịch tuần 1 đã mở, nên đến tuần 5 món nào cũng đã mở.

## Thiết kế phần thưởng

`ChallengeReward` là `{ tickets, unlock?: { kind: 'decor', id } }`.

- Hiện mọi phần thưởng chỉ có `tickets`. Tem được cộng qua `addTickets`.
- `unlock` được để sẵn cho epic tùy biến quán: sau này một thử thách có thể mở một món decor mà không phải đổi kiểu dữ liệu hay save. Hiện chưa có code nào đọc `unlock`.

## Migration save

- Không tăng version của save.
- `ensureWeekChallenge(state)` cấp thử thách cho save cũ (trước E-16) khi tải vào sáng ngày đầu của một tuần, ở pha `preparation`, trước khi bán gì. Tuần đang chạy dở thì không có thử thách; tuần kế tiếp tự bốc (`startNextWeek`).
- Test: `tests/save/e16-challenge-compat.test.ts`.

## UI (T-46)

- Một khối thử thách nằm dưới Mục tiêu tuần, có thanh tiến độ.
- Khi hoàn thành có toast.

## Số đo từ sim

Tuần 5 đến 20, độ khó Normal, seed 1 và 42 gộp lại (32 tuần mỗi chiến lược). Số liệu là số tuần hoàn thành thử thách.

| Chiến lược | Hoàn thành | regular_visits | stars_week | sell_item | calm_day | served_week | perfect_days |
| --- | --- | --- | --- | --- | --- | --- | --- |
| a_basic | 2/32 (6%) | 2/4 | 0 | 0 | 0 | 0 | 0 |
| c_spend | 28/32 (88%) | 4/4 | 4/4 | 3/7 | 4/4 | 7/7 | 6/6 |
| b_steady | 20/32 (63%) | 4/4 | 4/4 | 6/7 | 0/4 | 2/7 | 4/6 |

Ghi chú:

- `regular_visits = 55` dễ vỡ: các chiến lược chạm 52 đến 56, chỉ cần lệch nhẹ là đổi kết quả.
- Cột `tickets` của p23 giờ không tính Tem từ thử thách (các chiến lược để riêng phần này). `endMoney`, `score`, `cups`, `level` giống từng byte. Các số p22 và p23 còn lại không đổi.

## Sửa layout (T-47)

- Hàng menu: cao 104 xuống 93.5px, nhờ lưới trải qua cả hai hàng.
- Thẻ lên cấp ở 1280x720: dải tuần xuống hai dòng, sửa trong `panels.css` và `report.css`.

### Nguyên nhân 6 lỗi timeout của HUD

Không phải do chậm. Bước xác nhận của E-14 T-37, nút "Vẫn mở cửa", xuất hiện với save chưa có nhân viên và chặn luồng mở cửa của test. Đã sửa bằng helper `openShop()` xử lý bước này.

## Chưa kiểm chứng

- `npm run layout` thường (vite preview) không chạy được trong sandbox: EPERM ở cổng 4173. Kết quả 98/98 chỉ thấy khi chạy tùy chọn `LAYOUT_OFFLINE=1` (một tiến trình, WebGL phần mềm). Chưa chạy được bản thường.
- Lưu ý chạy test: trong sandbox cần `vitest --configLoader runner`.

## Test chập chờn

- `tests/ui/css-order.test.ts` quá thời gian (5000ms) khi máy tải nặng. Chạy riêng thì qua, 4/4.
- Trong một lần chạy đầy đủ lúc review T-47 có thêm một lỗi đơn lẻ chưa ghi lại được tên test, nên chưa rõ nguyên nhân.
