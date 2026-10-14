# Kiến trúc

Trang này mô tả cách game chia lớp, các hợp đồng giữa các lớp và định dạng dữ liệu, để thêm tính năng mà không phá vòng ngày đang chạy.

- [Ba lớp](#ba-lớp)
- [Vòng khung hình](#vòng-khung-hình)
- [Hợp đồng Command và GameEvent](#hợp-đồng-command-và-gameevent)
- [Vòng ngày](#vòng-ngày)
- [FSM khách](#fsm-khách)
- [Điều hướng và va chạm](#điều-hướng-và-va-chạm)
- [Save schema](#save-schema)
- [Mẹo hiệu năng](#mẹo-hiệu-năng)

## Ba lớp

```mermaid
flowchart LR
  UI["src/ui<br/>HTML/CSS overlay"] -- Command --> SIM["src/sim<br/>GameState"]
  PICK["src/render/scene/picking<br/>bấm vào cảnh"] -- Command --> SIM
  SIM -- "đọc state" --> RENDER["src/render<br/>Three.js"]
  SIM -- "đọc state" --> UI
  SIM -- "GameEvent" --> AUDIO["src/audio<br/>Web Audio"]
  SIM -- "GameEvent" --> UI
  UI -- "dayEnded → autosave" --> SAVE["src/save<br/>localStorage"]
```

| Lớp | Được làm | Không được làm |
| --- | --- | --- |
| `src/sim` | Giữ toàn bộ luật chơi trong `GameState`; `step(state, dtMinutes)` chạy thời gian, `dispatch(state, cmd)` áp lệnh; đẩy sự kiện vào `state.events`. | Import DOM, `three` hay `Math.random`. |
| `src/render` | Đọc `GameState`, vẽ quán, nhân vật, phố; đổi cú bấm trong cảnh thành `Command`. | Sửa state. |
| `src/ui` | Đọc state để vẽ HUD, bảng, màn hình; gửi `Command` qua `shell.dispatch`; hiện toast và tự lưu khi có sự kiện. | Đổi state trực tiếp (trừ `speed`/`paused` khi bắt đầu ván hay đổi cài đặt). |
| `src/audio` | Phát âm thanh theo `GameEvent`. | Đọc hay sửa state. |
| `src/save` | Ghi/đọc `GameState` và cài đặt vào `localStorage`, nâng phiên bản save cũ. | Biết gì về DOM ngoài `StorageLike`. |

`GameState` là JSON thuần (không class, Map hay hàm) nên lưu, so sánh và nhân bản trực tiếp được. Bộ sinh số ngẫu nhiên mulberry32 giữ trạng thái trong `state.rngState`: cùng state cộng cùng chuỗi lệnh cho ra cùng một ngày. Tiền là số nguyên đồng (`25000` = 25.000đ); thời gian là phút game tính từ nửa đêm (`420` = 07:00).

### Icon và font

UI và cảnh 3D không hiển thị emoji; mọi biểu tượng là icon 3D low-poly lấy từ atlas `public/icons3d/atlas@1x.webp`, `atlas@2x.webp` (vị trí từng ô trong `atlas.json`), do `npm run icons` dựng (xem [media.md](media.md#icon-3d)).

| Module | Nội dung |
| --- | --- |
| `src/ui/core/icons.ts` | Danh sách id (`ICON_IDS`, theo thứ tự ô trong atlas). `iconCell(id)` tính vị trí ô từ số đo lưới trong `atlas.json`; test so từng ô với bảng `icons` của file đó. `icon(id, { size })` trả `<span class="ic" data-icon="…" aria-hidden="true" focusable="false">` rỗng; ảnh là nền của ô. `loadIconAtlas()` tải ảnh @2x một lần, `drawIcon()` chép một ô lên canvas. `mountIconSprite()` không còn làm gì. |
| `src/ui/core/iconMap.ts` | Ánh xạ id của sim (món, nguyên liệu, marketing, nâng cấp, pha, vai, lý do review) sang icon. `avatarIcon(staffId)` trả ô `i-avatar-<n>` theo `AVATAR_LOOKS`. Trường `icon` emoji trong `src/sim/data` giữ nguyên nhưng không còn được hiển thị. |
| `src/ui/styles/ui.css` (`.ic`) | Kích thước ô theo class: `.ic` 24 px, `.ic-sm` 16, `.ic-lg` 32, `.ic-xl` 48. Nền `image-set(@1x 1x, @2x 2x)`; `icon()` đặt `--ic-size`, `--ic-pos` theo %, nên ô to nhỏ bao nhiêu cũng vừa. Icon trong nút nảy, nghiêng khi hover và co lại khi nhấn; tắt khi `prefers-reduced-motion`. |
| `src/render/actors/labels.ts` | Nhãn món và mặt cảm xúc trên đầu khách trong cảnh 3D: vẽ bong bóng, rồi `drawIcon()` từ atlas @2x khi ảnh tải xong. |
| `src/ui/core/iconSvg.ts` | Bộ icon SVG phẳng gốc từ `design/t237-cartoon/icons/index.html`; chỉ icon studio dùng để so cũ và mới, game không import. |

Ô có sẵn kích thước trước khi atlas tải xong, nên layout không nhảy; không preload atlas, Main Menu không chờ ảnh. URL ảnh tương đối (`icons3d/…` trong JS, `/icons3d/…` trong CSS do Vite đổi theo `base: './'`).

Thêm icon:

1. Thêm id vào `ICON_IDS` trong `src/ui/core/icons.ts`.
2. Dựng mô hình trong `src/icon-studio/models/` và khai vào `ICON_MODELS` (các bước ở [media.md](media.md#thêm-icon)).
3. Chạy `npm run icons -- --only <id>` để vẽ ô mới vào atlas.
4. Dùng `icon('<id>')` trong UI, hoặc nối id của sim trong `iconMap.ts`.

Font chữ là Nunito từ `@fontsource/nunito`, import trong `src/main.ts`: chỉ subset `latin` và `vietnamese`, weight 400 và 700 (600 và 800 hiển thị bằng 700). `@font-face` dùng `font-display: swap` và không preload, nên Main Menu vẽ bằng font hệ thống rồi đổi sang Nunito khi tải xong. Token `--font-family-base` nằm ở `src/ui/styles/tokens.css`.

## Vòng khung hình

`src/main.ts` chạy mỗi `requestAnimationFrame`:

1. `step(game, dt × 2 × game.speed)`: 1 giây thật ở 1x là 2 phút game (một ngày khoảng 7 phút). `dt` bị chặn ở 0,1 s để tab nền không tua nhanh.
2. Sim chạy tick cố định 1 phút game; tối đa `MAX_TICKS_PER_STEP` = 240 tick mỗi lần gọi. Phần lẻ còn lại nằm trong `state.tickAccumulator`.
3. `world.update(game, game.tickAccumulator)`: render nội suy vị trí giữa hai tick bằng `alpha`.
4. `shell.update()`: HUD, bảng đang mở và Daily Report cập nhật DOM qua `Watcher` (chỉ chạm DOM khi giá trị đổi).
5. `audio.handleEvents(events)` rồi `shell.handleEvents(events)`; sau đó xóa `game.events`.

Thứ tự trong một tick: đồng hồ và pha → khách mới đến (trừ pha đóng cửa) → việc của người chơi → nhân viên → khách → ghi trải nghiệm và review → nếu đang đóng cửa và quán trống thì kết thúc ngày.

## Hợp đồng Command và GameEvent

Kiểu đầy đủ ở `src/sim/types.ts`. `dispatch` trả `false` khi lệnh không áp dụng được lúc đó (sai pha, sai id, thiếu tiền…); UI dùng giá trị này thay vì tự kiểm luật.

| Command | Khi nào |
| --- | --- |
| `start_day` | Chuẩn bị → mở cửa. |
| `next_day` | Từ báo cáo sang ngày mới (pha `preparation`). |
| `set_menu_item` | Bật/tắt món. Giá món cố định theo dữ liệu menu. |
| `buy_ingredient`, `apply_restock` | Nhập hàng theo gói, hoặc theo gợi ý nhập tự động. |
| `hire_staff`, `fire_staff`, `assign_role`, `set_auto_assign` | Nhân viên. |
| `buy_upgrade`, `start_campaign` | Nâng cấp, marketing. |
| `set_speed`, `set_paused` | Nhịp game. |
| `take_order`, `brew`, `deliver`, `collect_cash`, `clean_table` | Người chơi tự phục vụ (từ cảnh 3D). |

| GameEvent | Ai dùng |
| --- | --- |
| `doorbell`, `brew`, `cash`, `angry`, `served`, `cleaned` | Âm thanh, hiệu ứng trong cảnh; `served`/`angry` còn sinh review. |
| `notify`, `low_stock`, `review` | Toast. |
| `phase` | Đổi pha trong ngày. |
| `dayEnded` | Báo cáo đã nằm trong `state.lastReport`; shell tự lưu vào slot `auto` và chuyển kết quả cho Daily Report. |

Thêm tính năng mới: thêm biến thể vào `Command`, xử lý trong `dispatch` (`src/sim/index.ts`), viết test ở `tests/sim/`, rồi mới nối UI. UI cần biết chuyện gì vừa xảy ra thì thêm biến thể `GameEvent` thay vì so sánh state giữa hai khung hình.

## Vòng ngày

```mermaid
stateDiagram-v2
  [*] --> preparation: New Game / next_day
  preparation --> opening: start_day (07:00)
  opening --> peak: 11:00, 17:00
  peak --> opening: 13:00, 19:00
  opening --> closing: 20:00
  closing --> report: khách cuối rời quán
  report --> preparation: next_day
```

| Pha | Đồng hồ | Việc chính |
| --- | --- | --- |
| `preparation` | Dừng ở 07:00 | Bảng chuẩn bị ở dock giữa đáy; nút **Mở cửa** trên HUD. |
| `opening` | Chạy | Khách đến theo tốc độ cơ bản. |
| `peak` | Chạy | Khách đến nhiều hơn. |
| `closing` | Chạy | Không nhận khách mới. |
| `report` | Dừng | `closeDay` đã trả lương, cập nhật rating, dựng `DailyReport`; UI hiện Daily Report (`src/ui/report`). |

Khi quán trống trong pha `closing`, sim gom tiền trên bàn, dọn bàn, gọi `closeDay` (`src/sim/report.ts`) rồi phát `dayEnded`. `next_day` đẩy `state.today` vào `state.history`, tăng ngày, chọn thời tiết mới, chạy tiếp chiến dịch marketing và phân vai nhân viên cho ngày mới.

## FSM khách

```mermaid
stateDiagram-v2
  [*] --> entering: đến cửa
  entering --> queueing: vào tới hàng
  queueing --> ordering: take_order
  ordering --> queueing: việc nhận order bị hủy
  ordering --> waiting: đã gọi món
  ordering --> angry_leave: món hết nguyên liệu
  queueing --> angry_leave: hết kiên nhẫn
  waiting --> angry_leave: hết kiên nhẫn
  waiting --> drinking: được mang đồ, có bàn sạch
  waiting --> leaving: được mang đồ, không có bàn (trả tiền và mang đi)
  drinking --> paying: uống xong
  paying --> leaving: để tiền và ly bẩn trên bàn
  leaving --> [*]
  angry_leave --> [*]
```

Kiên nhẫn (`patience`) chỉ giảm khi xếp hàng và chờ đồ. `served` và `angry` sinh trải nghiệm: khách để lại review (1–5 sao, lý do `ReviewReason`) với xác suất 30% khi được phục vụ, 60% khi bỏ đi. Game giữ tối đa 30 review (`MAX_REVIEWS`).

Chuyển trạng thái đi theo đồng hồ, không chờ khách tới nơi. Đích đi (`target`) theo trạng thái:

| Trạng thái | Đích |
| --- | --- |
| `entering`, `queueing`, `ordering` | Chỗ thứ i của hàng chờ (`queueSlot`). |
| `waiting` có bàn, `drinking`, `paying` | Ghế của bàn (tâm bàn ± `CHAIR_OFFSET`, phía còn trống). |
| `waiting` chưa có bàn | Một ô lấy đồ mang đi riêng cạnh quầy. |
| `leaving`, `angry_leave` | Cửa (`DOOR_POS`). |

## Điều hướng và va chạm

Sim giữ mọi người trên sàn trống: không xuyên tường, quầy, máy, bàn, ghế, chậu cây, và không hai người đứng chồng một chỗ. Code ở `src/sim/nav/` (lưới, A*, kiểm bố cục) và `src/sim/customers.ts`, `src/sim/staff.ts` (chỗ đứng).

| Phần | Cách làm |
| --- | --- |
| Footprint | `layoutFootprints(layout)` (`nav/footprints.ts`) trả hình chiếu sàn của tường, khung cửa, hai chậu cây hai bên cửa (`doorPlanters`), quầy, quầy sau, máy, bàn, ghế, cột dù, chậu cây. Bậc thềm và thảm thấp, đi qua được, không có footprint. Render vẽ bằng cùng hằng số kích thước. |
| Lưới | `buildNavGrid(layout)`: ô `NAV_CELL` = 0,25; ô bị chặn khi tâm ô nằm ngoài sàn hoặc cách footprint dưới `AGENT_RADIUS` = 0,2. Lưới cache theo `navLayoutKey`, chỉ dựng lại khi bố cục đổi (mua nâng cấp). |
| Tìm đường | `findPath(grid, from, to)`: A* 8 hướng, không cắt góc ô chặn, hòa thì chọn chỉ số ô nhỏ hơn; đường được rút gọn theo tầm nhìn và cache LRU 128 đường. Đầu mút bị chặn được dời tới ô trống gần nhất (`nearestFree`). |
| Đi bộ của khách | Mỗi tick khách đi 4 đơn vị dọc `findPath(pos, target)`. Đường không lưu vào state. Khách ngồi dừng ở ô trống cạnh ghế; render vẽ họ trên ghế. |
| Hàng chờ và ô mang đi | `floorSpots(layout)` tính một lần cho mỗi bố cục: 6 chỗ hàng chờ (`MAX_QUEUE`) cách nhau 0,8 dọc lối đi từ trước quầy về phía cửa, rồi 12 ô mang đi (`PICKUP_SPOTS`) quanh `layout.pickup`. Khách mang đi giữ ô của mình; khách mới lấy ô trống đầu tiên. |
| Giữ chỗ đứng | `claimSpot(grid, wants, taken)` chọn ô đầu tiên trong `wants` còn mở, nếu không thì ô mở gần nhất. Ô mở là ô trống, tới được từ cửa, và không có ô đã giữ trong ô 3×3 quanh nó, nên hai người đứng yên cách nhau ít nhất 0,5. |
| Chỗ đứng của nhân viên | `staffSpots(state)` giữ trước ô đích của khách, rồi xét nhân viên theo id: trạm của vai (nhiều người cùng vai tỏa ra ô kế bên), sau quầy khi nhận order, sau quầy trước máy khi pha, ô mở cạnh khách khi mang đồ, phía trước hoặc sau bàn (phía còn trống) khi dọn và thu tiền. Mỗi tick nhân viên được đặt lại sau khi khách nhận chỗ, nên không đứng lên ô mang đi vừa cấp. |
| Đi bộ trên màn hình | `src/render/actors/sync.ts`: khách đi tới `target` của sim, nhân viên tới `staff.pos`, người chơi tới `playerSpot()` (giữ chỗ bằng `claimSpot` sau khách và nhân viên). `setGoal` gọi `findPath` chỉ khi đích đổi, rồi bước nốt lên ghế với khách ngồi. Người đang đi gần nhau dưới 0,3 được `separate()` đẩy lệch phần vẽ (tối đa 0,3, không vào ô chặn); đứng yên thì về đúng chỗ. |
| Người đi bộ ngoài phố | `src/render/street/layout.ts`: `walkerSlots(n)` chia người đều trên 4 làn, cùng làn cùng tốc độ nên khoảng cách không đổi (`minWalkerGap`). Làn cách hàng cây/đèn ít nhất `PROP_CLEARANCE`; khách rời quán biến mất ở `exitPoint` trước làn gần nhất. |
| Kiểm bố cục | `validateLayout(layout)` báo footprint chồng nhau, cửa bị chặn, chỗ trước/sau quầy hay chỗ lấy đồ không tới được, bàn không tới được ghế. |

Mọi bước tất định: cùng state cho cùng đường và cùng chỗ đứng. Đổi kích thước đồ vật thì sửa hằng số trong `nav/footprints.ts`; thêm đồ đặt trên sàn thì thêm footprint vào `layoutFootprints`.

## Save schema

| Khóa `localStorage` | Nội dung |
| --- | --- |
| `cst3d:save:auto` | Slot tự động, ghi khi có `dayEnded`. |
| `cst3d:save:1` … `cst3d:save:3` | Slot lưu tay từ menu Tạm dừng. |
| `cst3d:settings` | Cài đặt: âm lượng, chất lượng, tốc độ, kiểu phím camera. |

Mỗi slot là JSON:

```json
{ "version": 1, "savedAt": 1760364000000, "state": { "...": "GameState, events = []" } }
```

- `SAVE_VERSION` trong `src/save/save.ts` là phiên bản hiện tại (1). Phiên bản 0 là `GameState` trần không có vỏ bọc.
- `migrate()` nâng lần lượt từng phiên bản qua bảng `MIGRATIONS`, rồi kiểm các trường bắt buộc. Save mới hơn bản game báo `version_unsupported`; JSON hỏng báo `corrupt`; thiếu trường báo `invalid`. Đọc slot không bao giờ sửa hay xóa dữ liệu đã lưu.
- Sau khi nâng, `settleActors()` (`src/sim/index.ts`) dời khách và nhân viên đang đứng trong vật cản (save cũ có hàng chờ chạy qua ghế) ra ô trống gần nhất. Người đứng trên sàn trống giữ nguyên vị trí.
- Thêm trường bắt buộc vào `GameState`: tăng `SAVE_VERSION`, thêm hàm vào `MIGRATIONS` điền giá trị mặc định, và thêm ca kiểm trong `tests/save/`. Trường tùy chọn (`?`) không cần tăng phiên bản.

## Mẹo hiệu năng

### Khởi động

1. `index.html` vẽ màn hình chờ `#boot` (CSS và SVG inline: linh vật ly, thanh tiến độ chạy bằng animation; không chờ font) ngay khi trang tải, trước khi có JS.
2. Chunk chính (UI, sim, save, audio) chạy `createShell`, hiện Main Menu rồi làm mờ `#boot`; đánh dấu `performance.mark('cst:menu')`.
3. `main.ts` gọi `import('./render/scene')` ngay đầu `start()`. Sau khi menu đã vẽ, `createWorld` dựng cảnh, `world.prepare()` biên dịch shader bằng `compileAsync`, rồi canvas `#scene` hiện dần (`is-ready`) và đánh dấu `cst:world`. Trước lúc đó vòng khung hình vẫn chạy sim, chỉ bỏ qua phần vẽ.

Không import `src/render` hay `three` tĩnh từ `main.ts`, `src/ui`, `src/sim`, `src/save`: làm vậy kéo three.js trở lại chunk chính.

| Chunk (`npm run build`) | Raw | Gzip | Tải khi |
| --- | --- | --- | --- |
| `index-*.js` (chunk chính; từ `atlas.json` chỉ lấy số đo lưới) | 128,5 kB | 44,8 kB | Ngay khi mở trang, cần cho Main Menu |
| `index-*.css` | 54,8 kB | 8,7 kB | Ngay khi mở trang |
| `index-*.js` (`src/render`) | 72,5 kB | 27,1 kB | Sau khi chunk chính chạy |
| `three-*.js` | 496,5 kB | 124,2 kB | Sau khi chunk chính chạy; tách riêng để giữ cache giữa các lần deploy |
| `nunito-*.woff2` (4 file: latin, vietnamese × 400, 700) | 44,6 kB | (đã nén) | Khi trang dùng tới chữ; không chặn Main Menu |
| `icons3d/atlas@1x.webp` hoặc `atlas@2x.webp` (một trong hai, theo mật độ điểm ảnh) | 102,3 kB / 224,1 kB | (đã nén) | Khi icon đầu tiên hiện; không chặn Main Menu |

Trước khi tách, mọi thứ nằm trong một file `index-*.js` 653,1 kB (180,3 kB gzip), và menu chỉ hiện sau khi dựng cảnh và vẽ xong khung hình 3D đầu tiên. JS cần trước khi thấy menu giảm từ 180,3 kB xuống 45,3 kB gzip.

Thời gian tính từ lúc mở trang, bản build qua `vite preview`, Chrome headless không cache trên Apple M2 (ANGLE Metal), trung vị 3 lần:

| Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu hiện | Cảnh 3D hiện |
| --- | --- | --- | --- | --- |
| Máy bàn, không giới hạn | Một chunk, không màn chờ | 140 ms (menu) | 127 ms | 127 ms |
| Máy bàn, không giới hạn | Tách chunk + màn chờ | 64 ms (màn chờ) | 81 ms | 179 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | Một chunk, không màn chờ | 1580 ms (menu) | 1582 ms | 1582 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | Tách chunk + màn chờ | 584 ms (màn chờ) | 743 ms | 1840 ms |
| Máy bàn, không giới hạn | Tách chunk + giao diện hoạt hình (icon SVG, Nunito) | 52 ms (màn chờ) | 146 ms | 249 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | Tách chunk + giao diện hoạt hình (icon SVG, Nunito) | 624 ms (màn chờ) | 812 ms | 2153 ms |

Trong cùng lượt đo, bản tách chunk trước giao diện hoạt hình (`56ce5ca`) cho Main Menu 101 ms trên máy bàn và 757 ms trên di động.

Số đo thay đổi giữa các lượt đo; chỉ so các bản trong cùng một lượt. Lượt đo bản có mặt tiền, đèn ấm, lưới điều hướng và icon 3D, so với `07439cf`:

| Cấu hình | Bản | Nội dung đầu tiên hiện | Main Menu hiện | Cảnh 3D hiện |
| --- | --- | --- | --- | --- |
| Máy bàn, không giới hạn | `07439cf` | 124 ms | 446 ms | 794 ms |
| Máy bàn, không giới hạn | Mặt tiền, đèn ấm, điều hướng, icon 3D | 112 ms | 361 ms | 599 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | `07439cf` | 780 ms | 1165 ms | 3181 ms |
| Di động: 150 ms RTT, 1,6 Mbps, CPU chậm 4 lần | Mặt tiền, đèn ấm, điều hướng, icon 3D | 476 ms | 669 ms | 2515 ms |

Đo thời gian tới khi Main Menu hiện, so với một commit cũ (cần Chrome; đặt `CHROME_PATH` nếu Chrome không ở chỗ mặc định):

```sh
node scripts/measure-startup.mjs --base <git-ref> --runs 3
```

Script build cả hai bản, chạy `vite preview`, mở bằng Chrome headless không cache, in bảng kích thước chunk và trung vị thời gian tới first paint, Main Menu và cảnh 3D, ở hai cấu hình: máy bàn không giới hạn và di động (150 ms RTT, 1,6 Mbps, CPU chậm 4 lần).

### Khi chơi

- UI dựng DOM một lần bằng `h()` và cập nhật qua `Watcher` (`src/ui/core/dom.ts`); khung hình không đổi gì thì không chạm DOM. Daily Report chỉ dựng lại khi `state.lastReport` đổi.
- Bàn, ghế, đồ trang trí trong quán và nhà, cây, đèn ngoài phố dùng `InstancedMesh` với vật liệu dùng chung.
- Nhân vật dựng từ khối low-poly có khớp, animation viết bằng code, lấy từ pool (`src/render/actors/pool.ts`) thay vì tạo mới.
- Chất lượng đồ họa:

| Mức | `pixelRatio` tối đa | Bóng đổ | Mật độ phố | Chi tiết quán | Chuyển động nhẹ | Đèn điểm trong quán |
| --- | --- | --- | --- | --- | --- | --- |
| Thấp | 1 | Tắt | Thấp | Bỏ lọ hạt, đèn thả, diềm mái hiên, song cửa sổ | Tắt | 0 |
| Vừa | 1,5 | Tắt | Vừa | Đủ, trừ hộp hoa dưới cửa sổ | Bật | 0 |
| Cao | 2 | Bật | Cao | Đủ | Bật | 2 |

- Mặt tiền và chi tiết quán (`src/render/scene/facade.ts`): `facadePlan(layout, quality)` đặt cửa sổ, cửa kính, mái hiên, biển tên quán (`state.shopName` vẽ lên canvas), chậu cây, bậc thềm, kệ lọ hạt, bảng menu, đèn thả, thảm cửa, quạt trần; `FacadeView` gộp thành vài mesh, chỉ dựng lại khi `layoutKey` hoặc mức đồ họa đổi. Đồ gắn tường co và ẩn theo tường khi tường hạ; khung cửa, mái hiên và biển đứng riêng nên vẫn thấy khi tường trước hạ.
- Đèn ấm và chuyển động (`src/render/scene/ambient.ts`): `warmGlow(minute, weather)` lấy hệ số `lamps` của `lightingAt` (0 ban ngày, tăng từ 16:00, đủ 1 sau 19:30; trời mưa giữ tối thiểu 0,4). Hệ số này làm kính cửa sổ và cửa phát sáng (`GLASS_MATERIAL` emissive), bóng đèn sáng hơn và biển hiệu ấm lên; mức Cao thêm 2 `PointLight` ấm không đổ bóng, tạo theo mức đồ họa chứ không theo giờ. Chuyển động (quạt trần quay, chậu cây và cây cửa rung lệch pha, diềm mái hiên phấp phới, hơi nước trên máy pha khi có đơn `brewing`) chỉ xoay mesh có sẵn, dừng khi game tạm dừng, tắt ở Thấp và khi trình duyệt bật `prefers-reduced-motion`.

- Âm thanh cùng loại lặp lại trong khoảng ngắn bị bỏ qua, nên tốc độ 4x không chồng hàng chục tiếng chuông.
