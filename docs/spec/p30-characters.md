# Khách quen, đồng phục và biểu cảm

Trang này ghi luật và con số của ba mảng nhân vật: khách quen có tên, đồng phục của đội mở theo cấp quán, và biểu cảm 3D trên đầu khách. Số liệu lấy từ `src/sim/data/regulars.ts`, `src/sim/data/uniforms.ts`, `src/render/actors/sync.ts` và `src/render/actors/emotes.ts`; cách code chạy ở [architecture.md](../architecture.md#fsm-khách).

- [Tổng quan](#tổng-quan)
- [Khách quen](#khách-quen)
- [Đồng phục](#đồng-phục)
- [Biểu cảm](#biểu-cảm)
- [Save cũ](#save-cũ)

## Tổng quan

| Mảng | Người chơi thấy gì | Ở đâu |
| --- | --- | --- |
| Khách quen | 8 khách có tên, đếm số lần ghé | Toast lúc ghé, thẻ **Khách quen** của bảng Việc, tên tác giả review |
| Đồng phục | 4 bộ áo và mũ cho cả đội, mở ở cấp quán 1/3/5/7 | Mục **Đồng phục** của bảng Nhân viên, nhân vật trong cảnh 3D |
| Biểu cảm | Tim, giọt mồ hôi, đám mây trên đầu khách; mặt buồn | Cảnh 3D |

Cả ba chỉ để nhìn: tiền, kiên nhẫn, món gọi, sao và review không đổi. Khách quen chọn bằng hash của seed và id khách, không rút từ `rngState`, nên cùng seed vẫn cho cùng kết quả mô phỏng.

## Khách quen

Nguồn: `REGULARS`, `REGULARS_FROM_DAY` trong `src/sim/data/regulars.ts`; luật gán `admitRegular` trong `src/sim/customers.ts`.

| Id | Tên | Món hay gọi |
| --- | --- | --- |
| `co_lan` | Cô Lan | Latte |
| `anh_minh` | Anh Minh | Americano |
| `chu_tuan` | Chú Tuấn | Espresso |
| `chi_hoa` | Chị Hoa | Cappuccino |
| `em_vy` | Em Vy | Trà sữa |
| `bac_hung` | Bác Hùng | Mocha |
| `chi_thao` | Chị Thảo | Trà chanh |
| `anh_khoa` | Anh Khoa | Cà phê đá xay |

Món hay gọi chỉ hiện trên thẻ, không đổi món khách gọi.

| Luật | Giá trị |
| --- | --- |
| Ai là khách quen | Khách có cá tính Khách quen (`persona: 'regular'`) vào cửa |
| Có từ ngày | 2 (`REGULARS_FROM_DAY`); ngày 1 mọi khách đều vô danh |
| Gán tên | `pickRegular(seed, id)`: hash của seed và id khách, chia lấy dư cho 8 |
| Mỗi ngày | Một khách quen ghé tối đa 1 lần; lần trùng trong ngày vẫn là khách vô danh |
| Đếm lượt | `state.regulars[id]`: `visits` +1 mỗi lần ghé, `firstDay`, `lastDay` |
| Sự kiện | `regular_arrived` ngay sau `doorbell`, kèm `visits` tính cả lần này |

Toast (`src/ui/hud/events.ts`):

| Lượt | Tiêu đề |
| --- | --- |
| Lần đầu | "Khách quen mới: Cô Lan" |
| Từ lần 2 | "Cô Lan ghé quán (lần 3)" |

- Cách nhau ít nhất 20 giây thật (`REGULAR_TOAST_GAP_MS`); khách quen tới trong khoảng đó không có toast nhưng vẫn được đếm.
- Icon mặt cười `i-face-happy`.

Thẻ **Khách quen** ở bảng Việc liệt kê khách quen đã gặp, mới ghé nhất trước, mỗi dòng "Ghé N lần · Hay gọi <món>". Chưa gặp ai thì thẻ ghi "Chưa có khách quen nào ghé".

Review của khách quen ghi tên khách quen làm tác giả. Game vẫn rút tên người lạ từ RNG rồi bỏ đi, nên chuỗi RNG giống hệt khách vô danh.

## Đồng phục

Nguồn: `UNIFORMS`, `DEFAULT_UNIFORM` trong `src/sim/data/uniforms.ts`; vẽ ở `setLook` trong `src/render/actors/rig.ts`.

| Id | Tên | Mở ở cấp quán | Áo | Mũ | Màu mũ |
| --- | --- | --- | --- | --- | --- |
| `classic` | Áo kem cổ điển | 1 | `0xfff9f0` | Không | — |
| `mint` | Áo bạc hà, mũ lưỡi trai | 3 | `0xd9f6ea` | Mũ lưỡi trai (`cap`) | `0x3dbd8f` |
| `latte` | Áo latte, mũ nồi | 5 | `0xd9a877` | Mũ nồi (`beret`) | `0x6b3f24` |
| `coral` | Áo san hô, khăn bandana | 7 | `0xffe3de` | Khăn bandana (`bandana`) | `0xf76b5a` |

- Một bộ cho cả đội: mọi nhân viên và người chơi đổi áo, tay áo và mũ; mũ thay tóc. Khách không mặc đồng phục.
- Tạp dề giữ màu theo vai (`APRON_COLORS`): người chơi `0x5c3a26`, pha chế `0x0f6b57`, phục vụ `0x3d6fd8`, dọn dẹp `0xf2a516`, tiếp thị `0xd8457a`, chưa giao việc `0x8c7f75`.
- Với `classic`, người chơi giữ mũ lưỡi trai đỏ `0xe05a4f` (`CAP_COLOR`), nhân viên không đội mũ.
- Đổi bằng lệnh `set_uniform` ở mọi pha. Bộ chưa mở trả `false` kèm `notify` "<tên> mở ở cấp quán N"; id lạ: "Không có bộ đồng phục này". Chọn lại bộ đang mặc không phát sự kiện.
- Bảng Nhân viên có một nút cho mỗi bộ; bộ đang mặc có `aria-pressed="true"`, bộ chưa mở bị khoá và ghi "Cấp N" thay cho tên.

## Biểu cảm

Nguồn: `customerMood`, `emoteForEvent`, `emoteFor`, `EMOTE_SECONDS` trong `src/render/actors/sync.ts`; hình và chuyển động trong `src/render/actors/emotes.ts`. Chỉ phần vẽ, sim không đọc.

| Biểu cảm | Hình | Màu | Khi nào hiện | Thời lượng |
| --- | --- | --- | --- | --- |
| Tim (`heart`) | Khối kim cương hai thùy, trên đầu | `0xe0475e` | Sự kiện `served` | 1,2 giây |
| Giọt mồ hôi (`sweat`) | Giọt nhỏ ở thái dương | `0x5bc0de` | Khách đang sốt ruột (mặt `impatient`) | Lặp mỗi 1,4 giây cho tới khi hết sốt ruột |
| Đám mây (`cloud`) | Ba cụm mây trên đầu | `0x9aa3ab` | Sự kiện `angry` khi khách còn kiên nhẫn, tức bỏ đi vì món hết hàng | 2,2 giây |

- Mỗi khách hiện tối đa một biểu cảm. Tim hay mây đang chạy được ưu tiên hơn giọt mồ hôi.
- Mặt khách:

  | Mặt | Khi nào |
  | --- | --- |
  | `happy` | Đang uống (`drinking`) hay rời quán vui (`leaving`) |
  | `impatient` | Còn dưới 40% kiên nhẫn (`IMPATIENT_FRAC`) khi đang vào, xếp hàng hay chờ đồ |
  | `sad` | Trong lúc đám mây hiện |
  | `angry` | Bỏ đi (`angry_leave`), sau khi đám mây tắt |
  | `neutral` | Các lúc khác |

- Thời lượng tính theo đồng hồ của cảnh, dừng khi tạm dừng game.
- Chuyển động: tim nảy ra, bay lên 0,18 và lắc nhẹ; mây nảy ra, lơ lửng và lắc; cả hai thu nhỏ trong 0,2 giây cuối. Giọt mồ hôi trượt xuống 0,07 mỗi vòng.
- Chất lượng Thấp hoặc Giảm chuyển động (cài đặt hay hệ điều hành): biểu cảm đứng yên, đủ cỡ, không nảy, không bay, không lắc; vẫn hiện và tắt đúng thời lượng.
- Mỗi loại là một geometry gộp dùng chung cho mọi khách, không đổ bóng; không thêm ảnh vào atlas.

## Save cũ

- Save vẫn là phiên bản 3; ba trường mới đều tùy chọn, không có migration:

  | Trường | Thiếu thì |
  | --- | --- |
  | `GameState.regulars` | Chưa gặp khách quen nào; lượt đếm bắt đầu từ lần ghé tiếp theo. |
  | `GameState.uniform` | Mặc `classic`. Id mà bản game không biết cũng mặc `classic`. |
  | `Customer.regularId` | Khách vô danh. |

- Save v0–v3 tải và chơi tiếp được; khách quen bắt đầu đếm từ ngày chơi tiếp đầu tiên (từ ngày 2 của ván).
