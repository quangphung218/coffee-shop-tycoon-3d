# Chụp ảnh, GIF demo và icon 3D

Trang này hướng dẫn tạo lại ảnh chụp màn hình, đoạn demo và các bảng ảnh trước/sau P18–P19 bằng `npm run media`, các bảng trước/sau P20 bằng `npm run media:p20` (mục [Ảnh trước/sau P20](#ảnh-trướcsau-p20)), các bảng trước/sau tuần 7 ngày bằng `npm run media:p21` (mục [Ảnh trước/sau P21](#ảnh-trướcsau-p21)), ảnh và số đo chơi tuần 7 ngày bằng `npm run review:p22` (mục [Review tuần P22](#review-tuần-p22)), các bảng trước/sau so với v0.4.0 bằng `npm run media:p22` (mục [Ảnh trước/sau P22](#ảnh-trướcsau-p22)), các bảng trước/sau HUD, Daily Report, tổng kết tuần và màn tải so với P22 bằng `npm run media:p23` (mục [Ảnh trước/sau P23](#ảnh-trướcsau-p23)), các bảng trước/sau HUD, dock, các bảng quản lý, toast nhập hàng, Daily Report và tổng kết tuần so với P23 bằng `npm run media:p24` (mục [Ảnh trước/sau P24](#ảnh-trướcsau-p24)), các bảng trước/sau Menu gọn, icon và hình 3D theo bậc nâng cấp, hiệu ứng mua, thẻ lên cấp và chấm "Mới" so với P24 bằng `npm run media:p25` cùng số đo khung hình lúc có hiệu ứng (mục [Ảnh trước/sau P25](#ảnh-trướcsau-p25)), ảnh quà ngày, Tem, nhân viên lên cấp, đơn đặc biệt, quán mở rộng và khách VIP bằng `npm run media:p27` (mục [Ảnh P27](#ảnh-p27)), ảnh cảnh quán theo giờ và thời tiết, đồng xu và thẻ Lên cấp bằng `npm run media:p29` (mục [Ảnh P29](#ảnh-p29)), các bảng trước/sau biểu cảm khách, đồng phục, mục Đồng phục, thẻ Khách quen và toast bằng `npm run media:p30` (mục [Ảnh P30](#ảnh-p30)), ảnh màn tải qua mạng chậm và lúc lỗi bằng `npm run media:loading` (mục [Ảnh màn tải](#ảnh-màn-tải)), kiểm tràn ngang và CLS bằng `npm run layout` (mục [Kiểm lề và CLS](#kiểm-lề-và-cls)), và atlas icon 3D bằng `npm run icons` (mục [Icon 3D](#icon-3d)).

## Yêu cầu

- Playwright (có sẵn trong `devDependencies`) và Chromium của nó:

  ```sh
  npm ci
  npx playwright install chromium
  ```

- [ffmpeg](https://ffmpeg.org/) trong `PATH` để xuất GIF và mp4: macOS `brew install ffmpeg`, Debian/Ubuntu `sudo apt install ffmpeg`. Thiếu ffmpeg thì lệnh vẫn chụp ảnh PNG, bỏ qua GIF/mp4 và trả mã lỗi 1.
- Cổng `4173` và `4174` còn trống (đổi bằng `MEDIA_PORT`; bản P18 chạy ở cổng kế tiếp).
- Lịch sử git có commit P18 `d643d89` (bản clone nông thì chạy `git fetch --unshallow`).

## Chạy

```sh
npm run media
```

Lệnh build bản tĩnh, xuất commit P18 `d643d89` ra thư mục tạm (`git archive`) và build nó, mở `vite preview` cho bản hiện tại ở `127.0.0.1:4173` và bản P18 ở `4174`. Sau đó Chromium headless chơi ngày 1 trên bản hiện tại:

1. Chụp Main Menu (quán chạy nền phía sau).
2. **Ván mới** độ khó Dễ, mở bảng Menu ở dock và chụp. Mở bảng Nhân viên và tuyển cả 3 ứng viên. Ở bảng Kho bấm Auto-restock, thêm vài gói cà phê, sữa, chanh, trà, ly, chụp rồi **Nhập hàng**.
3. Zoom camera gần hơn, bấm **Mở cửa**, chọn tốc độ 4x.
4. 10:00: zoom và pan tới cửa quán (giữ `A`+`S`), chụp mặt tiền, rồi `Home` về góc cũ.
5. 12:00: chụp giờ cao điểm, rồi zoom gần quầy chụp hàng chờ.
6. Về tốc độ 1x, kéo chuột ngang qua cảnh rồi thả giữa chừng: camera trôi tiếp và chậm dần, người đi vòng qua góc bàn. Khoảng 4 giây này giữ nguyên tốc độ trong đoạn quay. Rồi về 4x.
7. 15:00: chụp mặt tiền như bước 4; 19:30: chụp lại khi đèn sáng đầy (trước 20:00).
8. Chụp Daily Report (phần Tổng kết) khi ngày kết thúc, rồi chụp tab Đánh giá.

Sau ngày chơi, cùng một kịch bản Kho chạy trên bản hiện tại rồi trên bản P18, mỗi bản một ván mới. Trình duyệt này hiện thanh cuộn (Chromium headless mặc định ẩn):

1. Khổ 390×844, mở bảng Kho. Chuột ngoài bảng, bỏ focus: chụp thanh cuộn lúc đứng yên. Lăn chuột trên bảng: chụp lúc đang cuộn.
2. Cuộn ngang khung bảng hết cỡ (chỉ dịch được khi nội dung rộng hơn khung) và chụp lề ở đầu bảng, rồi cuộn xuống dòng hàng đầu và chụp lại.
3. Cuộn về đầu, chụp khung tổng lúc 0 gói; bấm + một gói ở dòng đầu, chụp lại; bấm − trả về 0.
4. Khổ 1280×720, tuyển 2 nhân viên, không nhập hàng, không bấm Gợi ý. **Mở cửa** ở 4x tới 10:00, mở bảng Kho, cuộn tới mặt hàng đầu tiên không "Đủ" của bản hiện tại (bản P18 cuộn tới cùng mặt hàng) và chụp.

Ảnh chụp ẩn toast; đoạn quay vẫn giữ.

Ảnh so sánh trước/sau:

- Mỗi ảnh được đo ngay lúc chụp: khung DOM của bảng Kho, thanh cuộn, từng dòng hàng và huy hiệu dock. Ở giờ cao điểm, lệnh dừng vòng khung hình và đọc camera Three.js (qua `window.__THREE_DEVTOOLS__`).
- Bàn ghế P18 và P19 lấy từ sim của từng bản (`getShopLayout`, `CHAIR_OFFSET`, `CHAIR_SIZE`, `TABLE_RADIUS`), chiếu qua camera của ảnh cao điểm. Ảnh cao điểm P18 là `docs/media/peak.png` ở `d643d89` (đọc bằng `git show`), cùng góc máy.
- Cuối lệnh, các cặp ảnh được ghép thành bảng `*-p18-p19.png`: mọi khung trong một bảng cắt cùng một vùng quanh chỗ khoanh (bảng Kho, dock, khu bàn) và phóng to cho vừa bề rộng 1900 px.
- P18 khoanh nét đứt cam, P19 nét liền xanh. Nhãn đặt tránh mọi vòng khoanh, có đường nối khi nằm xa, và ghi số đo của lần chụp (px cắt hay lòi ra, chiều cao khung tổng, độ rộng lối đi).
- Thanh cuộn nổi (Chromium trên macOS) được khoanh bằng dải 14 px ở mép phải khung bảng.
- Lệnh in số vòng khoanh của từng nhãn, cảnh báo `!!` khi một nhãn không có gì để khoanh hoặc khi bản hiện tại còn phần tử lòi khỏi khung bảng.

Đoạn quay và dung lượng:

- Cả ngày được quay lại; ffmpeg nén phần mở cửa → báo cáo còn khoảng 12 giây, giữ đoạn xoay camera ở 1x, tổng khoảng 21 giây.
- Cuối cùng lệnh in dung lượng từng file; file nào trên 5 MB được đánh dấu `!!` và lệnh trả mã lỗi 1.

## File tạo ra

Tất cả nằm trong `docs/media/` và được ghi đè mỗi lần chạy.

| File | Nội dung |
| --- | --- |
| `demo.gif` | Một vòng ngày, dùng ở đầu README. Tự giảm khổ và fps cho tới khi dưới 5 MB. |
| `demo.mp4` | Cùng đoạn đó, 1280×720 H.264, để đăng nơi khác. |
| `main-menu.png` | Main Menu. |
| `menu-icons.png` | Pha chuẩn bị, bảng Menu với icon 3D. |
| `prep-inventory.png` | Pha chuẩn bị, bảng Kho. |
| `facade-day.png` | Mặt tiền quán lúc 10:00. |
| `peak.png` | Quán giờ cao điểm. |
| `queue.png` | Gần quầy giờ cao điểm: hàng chờ. |
| `kho-390-p18-p19.png` | Bảng Kho ở 390 px, P18 rồi P19, mỗi bản ở đầu bảng và ở dòng hàng đầu, khung bảng cuộn ngang hết cỡ; khoanh đoạn giới thiệu, nút Auto-restock, nhãn trạng thái và thẻ dòng đầu, nhãn ghi số px bị cắt hay lòi khỏi khung. |
| `kho-foot-p18-p19.png` | Khung tổng lúc 0 gói và 1 gói, P18 rồi P19; vạch vàng ở mép trên khung lúc 0 gói, nhãn ghi chiều cao khung và dòng hướng dẫn. |
| `kho-open-p18-p19.png` | Bảng Kho lúc 10:00, không bấm Gợi ý; khoanh nhãn "Sắp hết"/"Hết" của P19 và cùng mặt hàng ở P18, dòng "đủ khoảng N ly hôm nay" và huy hiệu dock. |
| `scrollbar-p18-p19.png` | Thanh cuộn bảng Kho: P18 đang cuộn, P19 đứng yên và đang cuộn; nhãn ghi độ rộng rãnh khi thanh có rãnh. |
| `peak-p18-p19.png` | Giờ cao điểm P18 cạnh P19; khoanh ghế hai bàn sát nhau (P18), bàn theo lưới (P19) và tô dải sàn của lối đi chính từ hàng bàn tới tường trước (P19). |
| `facade-evening.png` | Mặt tiền quán từ 19:30 tới 20:00, đèn sáng đầy. |
| `facade-day-evening.png` | Mặt tiền cùng góc máy lúc khoảng 15:30 và sau 19:30, cạnh nhau; khoanh và ghi tên chỗ phát sáng ấm (cửa sổ, cửa kính, biển hiệu, đèn thả). Lệnh tìm chỗ phát sáng bằng cách so điểm ảnh hai ảnh tối với ảnh ngày, và trả mã lỗi 1 khi không thấy biển hiệu hay kính. |
| `daily-report.png` | Daily Report. |
| `reviews.png` | Tab Đánh giá trong báo cáo. |

`main-menu-p17-p18.png`, `peak-p17-p18.png`, `prep-inventory-p17-p18.png` (P17 cạnh P18, dùng trong [báo cáo P18](reports/p18-collision-shop-icons.md)) giữ nguyên, lệnh không ghi đè.

## Ảnh trước/sau P20

```sh
npm run media:p20
```

Lệnh build bản hiện tại, xuất commit P19 `96030ca` ra thư mục tạm và build nó, rồi dùng lại bộ dựng bảng của `scripts/capture-media.mjs` (preview, chơi ván mới, khoanh và nhãn) qua `scripts/capture-p20.mjs`. Mỗi bảng ghép P19 cạnh bản hiện tại, cùng seed và góc máy; P19 khoanh nét đứt cam, P20 nét liền xanh, nhãn ghi chỗ đã sửa. Yêu cầu giống `npm run media`: Playwright/Chromium và lịch sử git tới `96030ca`, cổng `4173`/`4174` trống.

Bản P20 chơi từ hai ván dựng sẵn, nạp qua **Tiếp tục**: ván ngày 1 thiếu 1 XP tới cấp 2 (hết ngày hiện băng Lên cấp) và ván cấp 6 đã mua đủ 5 dụng cụ mới. Bản P19 chơi ván mới.

Mười hai bảng, tất cả trong `docs/media/`, ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `hud-dock-p20.png` | HUD lúc Chuẩn bị, cắt lấy hàng HUD trên và dock: chip "Cấp N" + thanh XP, hai vạch chia nhóm dock. Nhãn nằm ở dải trống ngoài giao diện. |
| `dock-390-p20.png` | Dock ở 390 px: vạch chia không chiếm ô, Đánh giá nhóm riêng. |
| `tasks-missions-p20.png` | Bảng Việc: mục "Nhiệm vụ hôm nay" ba thẻ. |
| `upgrades-locks-p20.png` | Bảng Nâng cấp ở Cấp 1: chia nhóm Dụng cụ / Không gian / Trang trí và nhãn "Mở ở cấp N". |
| `report-insights-p20.png` | Daily Report: tab Tổng kết P19 có số liệu cạnh tab Chỉ số P20 với KPI ngành F&B. |
| `report-levelup-p20.png` | Daily Report: tab Tổng kết P19 cạnh tab Tổng kết P20 có băng "Lên cấp N". |
| `settings-390-p20.png`, `settings-1280-p20.png` | Cài đặt ở 390 px và 1280 px, chụp cả form: nhóm Hiển thị + Giảm chuyển động, nhóm Điều khiển, Phím tắt trong ô xổ. |
| `brew-closeup-p20.png` | Ba khung: P19, P20 lúc tay hạ (khoanh lông mày + miệng), P20 lúc hai tay đưa lên máy (khoanh tay). Camera nhìn thẳng vào mặt nhân viên đứng ở máy espresso, ngang tầm mặt, trên mặt hai quầy; mọi thứ phía trước tay bị cắt bỏ. |
| `customer-mood-p20.png` | Camera nhìn thẳng vào mặt khách giờ cao điểm: mặt vui / sốt ruột. |
| `tools-p20.png` | Quầy sau nhìn thẳng: 5 dụng cụ mới, mỗi cái khoanh kèm tên. |
| `peak-p20.png` | Giờ cao điểm: vân gỗ chỉ trên quầy, bàn, ghế, sàn; máy pha, cỏ, tường trơn màu; env map nhẹ. |

Chụp Cài đặt cả form (`captureSettingsForm()` trong `scripts/capture-media.mjs`, dùng cho `media:p20` và `media:p21`):

1. Chèn style tạm bỏ giới hạn cao của `.settings-sheet` và vùng cuộn `.settings-body`.
2. Kéo cao cửa sổ cho vừa cả form (tối đa 3 lần, vì form đổi bố cục khi cửa sổ cao lên).
3. Chụp và đo trong bố cục đó, rồi gỡ style.

Bản cũ không có `.settings-body` vẫn chụp như cũ.

Đổi commit gốc bằng `P20_BASE`, seed bằng `MEDIA_SEED`, cổng bằng `MEDIA_PORT` (xem [Tùy chọn](#tùy-chọn)). Lệnh in dung lượng từng file và cảnh báo `!!` khi:

| Cảnh báo | Nghĩa |
| --- | --- |
| `nothing to ring` | Nhãn không có gì để khoanh (phần tử không thấy trên màn hình). |
| `rings something mostly off the frame` | Dưới 60% vòng khoanh nằm trong ảnh: phần tử đã bị cuộn hoặc quay ra ngoài khung. |
| `rings a flat area` | Vòng khoanh nằm trên vùng gần như một màu (độ lệch màu < 8), tức vùng trống. |
| `label covers text` | Nhãn vẫn đè lên chữ của khung dù đã thử cả dải lề bên phải. |
| `no barista brewing`, `no customer with a mood` | Trong 60 s giờ cao điểm không có người phù hợp cho cận cảnh; bảng đó bị bỏ. |
| `the head turns away from the camera` | Ở cận cảnh, hướng đầu lệch hướng camera quá 45° (cos < 0,7). |
| `the face is hidden`, `a hand is hidden` | Ở cận cảnh, dưới 60% ô mặt (dưới 30% ô tay) là của nhân vật: vật khác che. Script vẽ lại khung không có nhân vật và đếm điểm ảnh đổi màu. |

### Đo FPS

```sh
node scripts/measure-startup.mjs --base 96030ca --runs 3 --fps-only
```

`--fps-only` chỉ đo FPS; `--fps` đo cả bảng khởi động. Mỗi lượt chơi ngày 1 Dễ ở 4x tới giờ cao điểm (chờ trong cửa sổ nhỏ), rồi lấy mẫu 10 s ở 1280×800, tỉ lệ điểm ảnh 2, mức Vừa và Cao. Mỗi ô chạy `--runs` lượt, hai bản xen kẽ nhau. `--quality medium` hoặc `--quality high` chỉ đo một mức, để mỗi lệnh ngắn hơn giới hạn thời gian.

| Cột | Nghĩa |
| --- | --- |
| Average FPS | Trung vị qua các lượt của FPS trung bình (số khung / thời gian). |
| Runs | FPS trung bình từng lượt. |
| p5 FPS | FPS của khung chậm thứ 5% trong mọi khung đã lấy. |

Dòng cuối so bản hiện tại với bản gốc; `!!` khi tụt quá 10%. Chrome headless cấp khung theo bội số nhịp màn hình, nên FPS từng khung chỉ ra vài mức (20, 15, 7,5…); dùng cột Average FPS để so.

## Ảnh màn tải

```sh
npm run media:loading
```

Build rồi mở bản build ở khổ điện thoại 390×844 qua mạng giả lập Slow 4G (150 ms RTT, 1,6 Mbps, CPU chậm 4 lần, không cache). Chunk chính bị giữ 3 s và `three-*.js` bị giữ 11 s để từng trạng thái kịp chụp; lỗi được giả bằng cách chặn file.

| File | Nội dung |
| --- | --- |
| `loading-boot.png` | Màn chờ: thanh và % theo file đã tải, một mẹo chơi. |
| `loading-menu.png` | Main Menu trong lúc tải cảnh 3D: tổng %, danh sách thành phần (mỗi mục trạng thái và %) và mẹo. |
| `loading-start.png` | Ván mới, cuộn tới cuối form: nút **Bắt đầu ngày 1** ghi "Đang chuẩn bị N%", dòng "Mạng đang chậm…", danh sách thành phần. |
| `loading-error.png` | Main Menu khi `three-*.js` tải lỗi: thông báo, mục **Mã cảnh 3D** báo lỗi kèm nút **Thử lại**. |
| `loading-retried.png` | Cùng trang sau khi bấm **Thử lại** lúc mạng đã có lại: cảnh 3D hiện. |
| `loading-boot-error.png` | Màn chờ khi chunk chính tải lỗi: thông báo và nút **Thử lại**. |

## Ảnh trước/sau P21

```sh
npm run media:p21
```

`scripts/capture-p21.mjs` dùng lại bộ dựng bảng của `scripts/capture-media.mjs` như `media:p20`, so bản v0.2.0 `77c8387` với bản hiện tại. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `77c8387`.

1. Sim của bản hiện tại chơi một tuần Vừa, seed `12345`, theo chiến lược của `tests/integration/week.test.ts` (nhập hàng theo gợi ý, tự phục vụ một mình), và in bảng 7 ngày cùng kết quả tuần.
2. Từ tuần đó dựng hai ván, nạp vào cả hai bản qua **Tiếp tục**: sáng ngày đầu tiên từ ngày 2 có hội chợ (hay sự kiện khác), đã mua Cây xanh cấp 1; và báo cáo cuối ngày 7.
3. Ở sáng ngày đó, khổ 1280×800: chụp HUD, bảng Việc, bảng Nâng cấp (cuộn tới Cây xanh), bảng Menu.
4. Bản hiện tại mở cửa ở 4x tới giờ cao điểm rồi về Main Menu, chụp Cài đặt cả form (cách chụp ở [Ảnh trước/sau P20](#ảnh-trướcsau-p20)), và ghi JSON trong Số liệu chơi ra `docs/media/playlog-p21.json`. Bản v0.2.0 chụp Cài đặt từ Main Menu.
5. Ở 1280 px và 390 px, nạp ván cuối ngày 7: chụp báo cáo ngày 7, rồi (bản hiện tại) bấm **Xem tổng kết tuần** và chụp màn kết tuần. Cửa sổ được kéo cao cho vừa cả hộp thoại.

Bảy bảng và một file JSON trong `docs/media/`, ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `hud-week-p21.png` | HUD lúc Chuẩn bị: "Ngày N/7" và chip thời tiết, sự kiện. |
| `tasks-unlocks-p21.png` | Bảng Việc: khối "Hôm nay · Ngày N/7" với dòng "Mới mở khóa hôm nay". |
| `decor-remove-p21.png` | Bảng Nâng cấp: nút "Gỡ (+tiền hoàn)" trên thẻ Cây xanh. |
| `price-policy-p21.png` | Bảng Menu: chọn Mức giá Rẻ / Chuẩn / Cao. |
| `week-end-1280-p21.png`, `week-end-390-p21.png` | Báo cáo ngày 7 của v0.2.0 cạnh màn kết tuần: điểm và cúp, doanh thu và sao so mục tiêu, bảng 7 ngày, nút Chơi lại. |
| `settings-playlog-p21.png` | Cài đặt khổ 1280: nhóm Số liệu chơi với lần dừng gần nhất, Xuất JSON, Xoá. |
| `playlog-p21.json` | File JSON giống nút Xuất JSON, của lượt chơi ở bước 4. |

Cảnh báo `!!` giống [Ảnh trước/sau P20](#ảnh-trướcsau-p20). Chỉ in bảng tuần, không build hay mở trình duyệt:

```sh
P21_WEEK_ONLY=1 node scripts/capture-p21.mjs
```

## Review tuần P22

```sh
npm run review:p22
```

Lệnh build bản hiện tại, mở `vite preview` ở một cổng trống, rồi `scripts/review-p22.mjs` chơi một tuần Vừa (seed từ `MEDIA_SEED`, mặc định `3758375936`) ở hai khổ cùng lúc: 390×844 (điện thoại, tỉ lệ điểm ảnh 3, cảm ứng) và 1440×900. Yêu cầu: Playwright/Chromium (không cần ffmpeg).

1. Sim của bản hiện tại dựng ván sáng ngày 2–7 theo chiến lược của `tests/integration/week.test.ts` (nhập hàng theo gợi ý, tự phục vụ) và in bảng 7 ngày.
2. Ngày 1: đo Main Menu lúc `cst:menu` (ô icon trống, atlas đã tải chưa), **Ván mới**, mở mọi bảng trên dock, **Mở cửa** ở 4x, chụp cao điểm 11:00 và hàng chờ 11:45, rồi các tab Daily Report.
3. Ngày 2–7: nạp ván qua **Tiếp tục**, chụp HUD và bảng Việc, nhập hàng và thuê 2 nhân viên qua UI, mở cửa ở 4x, chụp cao điểm. Ngày 7 chụp thêm báo cáo và màn kết tuần.
4. Mỗi màn được đo: tràn ngang, vùng bấm < 44 px, chữ < 12 px, phần tử che nhau, nút bấm không trúng (bị che), số toast; cao điểm đo FPS 10 s, người bước tại chỗ > 5 s và số kiểu ngoại hình.

File tạo ra trong `.review-p22/` (git bỏ qua), ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `.review-p22/390/*.jpg`, `*.png`, `.review-p22/1440/*.png` | Ảnh từng màn, tên `d<ngày>-<màn>` (`d0` là Main Menu). |
| `.review-p22/metrics.json` | Bảng tuần, số đo Main Menu, từng màn, từng cao điểm, nút bị che, các lượt chạy. |
| `.review-p22/findings.json` | Vấn đề rút từ số đo: `id`, `area`, `title`, `evidence`, `impact`, `effort`, `ratio` (= impact / effort), `high` (ratio ≥ 1,5). |

Xuất sang `docs/reports/p22-review/` cho [p22-review.md](reports/p22-review.md):

| Lệnh | Việc |
| --- | --- |
| `npm run review:p22 -- --publish` | Chơi như trên, xong không lỗi thì xuất. |
| `node scripts/review-p22.mjs --publish-only` | Chỉ xuất từ lượt chạy gần nhất trong `.review-p22/`, không build, không chơi. |

Khi xuất:

1. Chép `metrics.json`, `findings.json` sang `docs/reports/p22-review/`.
2. Chỉ lấy ảnh mà `p22-review.md` liên kết (`p22-review/<khổ>/<tên>.png|jpg`), mã hóa lại JPEG chất lượng 75 thành `<tên>.jpg`; ảnh chưa có trong `.review-p22/` thì lấy bản đã xuất.
3. Xóa mọi ảnh khác trong `docs/reports/p22-review/390/`, `1440/`.
4. Đổi tham chiếu `<khổ>/<tên>.png` thành `.jpg` trong `p22-review.md` và các file JSON ở `docs/reports/p22-review/`.

Lượt chạy đầu sau khi clone (chưa có `.review-p22/metrics.json`) gộp số đo các ngày không chơi từ `docs/reports/p22-review/metrics.json`.

| Biến | Mặc định | Tác dụng |
| --- | --- | --- |
| `REVIEW_TIMEOUT_MS` | `1200000` (20 phút) | Giới hạn cả lượt chạy; quá hạn thì dừng, vẫn ghi `metrics.json` và `findings.json` với `error`. |
| `REVIEW_STEP_MS` | `180000` (3 phút) | Giới hạn một bước; bước chờ đồng hồ game dùng 5 phút (tới cao điểm) và 8 phút (tới báo cáo). |
| `REVIEW_DAYS` | `1-7` | Chỉ chơi một số ngày (`1`, `2-4`); Main Menu đi cùng ngày 1. Ngày khác giữ số đo cũ trong `metrics.json`. |
| `REVIEW_VIEWPORTS` | `390,1440` | Chỉ chơi một khổ (`390` hoặc `1440`); khổ kia giữ số đo cũ. |
| `REVIEW_SERIAL` | (trống) | `1` để chơi hai khổ lần lượt: FPS sạch hơn, lâu gấp đôi. |
| `REVIEW_PORT` | cổng trống | Cố định cổng `vite preview`. |
| `REVIEW_QUALITY` | `medium` | Mức đồ họa của trang. |
| `REVIEW_SIM_ONLY` | (trống) | `1` để chỉ dựng ván và in bảng tuần, không mở trình duyệt. |

Chạy từng phần khi một lượt dài quá giới hạn lệnh:

```sh
REVIEW_DAYS=1 npm run review:p22
REVIEW_DAYS=2-4 npm run review:p22
REVIEW_DAYS=5-7 npm run review:p22
```

FPS đo bằng Chromium headless vẽ WebGL bằng phần mềm (SwiftShader), hai khổ vẽ cùng lúc: chỉ là mức sàn, không so được với máy có GPU. Đo FPS để so hai bản bằng `scripts/measure-startup.mjs` ([Đo FPS](#đo-fps)).

## Ảnh trước/sau P22

```sh
npm run media:p22
```

Lệnh build bản hiện tại, xuất v0.4.0 `f720b6f` ra thư mục tạm và build nó, mở `vite preview` cho bản hiện tại ở `4173` và v0.4.0 ở `4174`, rồi `scripts/capture-p22.mjs` chụp cả hai bản cùng ván, cùng khổ, cùng góc máy. v0.4.0 khoanh nét đứt cam, P22 nét liền xanh. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `f720b6f`.

1. Sim dựng ván sáng ngày 2 của tuần review (Vừa, seed của `review:p22`).
2. Main Menu ở 390×844 lúc `cst:menu`, atlas icon bị giữ lại như mạng chậm: đếm ô trống và ô chờ.
3. Main Menu ở 390×844, tải không cache trên cấu hình di động của `scripts/measure-startup.mjs` (150 ms RTT, 1,6 Mbps, CPU 4x), từng bản một: chụp lúc mọi ô icon đã vẽ, ghi mốc `cst:menu`, lúc xin và nhận atlas @1x, `three-*.js` tải xong, lúc xin atlas @2x, `cst:world`. Thứ tự ở bản hiện tại (`src/main.ts`, `src/ui/core/icons.ts`):
   1. Menu vẽ xong (`cst:menu`, `afterPaint()`): xin chunk cảnh `three-*.js`, ngay sau đó `watchIconAtlas()` xin atlas @1x (`priority: 'low'`), không chờ chunk cảnh tải xong.
   2. Chunk cảnh xong: `world.prepare()` làm sẵn nhãn 3D, nhãn gọi `loadIconAtlas()` nên atlas @2x được xin lúc này, trên mọi màn, trước `cst:world`; cảnh không chờ @2x.
   3. `cst:world`: trên màn 2x, `enableHdIcons()` dùng lại lần tải @2x đó, giải mã rồi đổi icon UI sang @2x.
4. Bảng Kho ở 390×844 trên ván ngày 2: chân bảng, nút Gợi ý, nút Nhập hàng, số dòng hàng chạm được.
5. Mở cửa ở 4x tới cao điểm, tìm khách theo phụ kiện, mặt sốt ruột và lúc đứng yên trong hàng (tối đa 150 s), chụp cận cả người.

Mỗi mục `fixed` trong `docs/reports/p22-review/fixed-ui.json` và `fixed-actors.json` có một bảng; mục không có hàm dựng bảng trong `scripts/capture-p22.mjs` thì lệnh dừng trước khi chụp. Các bảng trong `docs/media/`, ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `main-menu-icons-p22.png` | Main Menu 390 lúc menu hiện: v0.4.0 ô icon trống, P22 ô chờ. Nhãn ghi thêm mốc ms trên mạng di động (lần tải của bước 3): lúc ô trống hay ô chờ hiện, lúc icon hiện. |
| `main-menu-atlas-390-p22.png` | Main Menu 390 trên mạng di động, lúc icon hiện: nhãn ghi mốc menu hiện, `three-*.js` xong, xin atlas @1x, icon hiện; chú thích thêm `cst:world` và atlas @2x. P22 xin @1x ngay sau khi menu vẽ, sau lệnh xin chunk cảnh. Một lần đo; số trung vị ở [perf.txt](reports/p22-review/perf.txt). |
| `kho-foot-390-p22.png` | Chân bảng Kho 390 lúc vừa mở: chiều cao chân và thân ở v0.4.0; P22 khoanh chân gọn và nút Nhập hàng thấy ngay khi mở. Chân P22 không dính hoặc nút Nhập hàng ngoài tầm chạm lúc vừa mở thì in `!!`, thêm khung cuộn tới cuối thân bảng. |
| `layout-blocked-suggest-390-p22.png` | Bảng Kho 390: v0.4.0 chân bảng dính che nút Gợi ý; P22 nút chạm được, số dòng hàng chạm được khi cuộn (không dòng nào thì khoanh dải thân bảng phía trên chân). |
| `actors-persona-motion-p22.png` | Khách văn phòng và sinh viên đứng chờ: dáng chờ chung ở v0.4.0, cầm điện thoại và tay đút túi ở P22; nhãn ghi góc tay, đầu, thân. |
| `actors-persona-accessory-p22.png` | Khách quen và gia đình: không phụ kiện ở v0.4.0, mũ len và túi vải ở P22; nhãn ghi cỡ phụ kiện. |
| `actors-impatient-silhouette-p22.png` | Khách sốt ruột: tay buông ở v0.4.0, khoanh tay ở P22; nhãn ghi góc tay và nhịp chân. |

Nhãn trên ba bảng nhân vật cao 2,2% bề rộng bảng (tối thiểu 15 px), để đọc được trên điện thoại.

Cảnh báo `!!` giống [Ảnh trước/sau P20](#ảnh-trướcsau-p20), thêm `no subject within 150 s` (không tìm được khách cho cận cảnh; khung đó bị bỏ) và bảng trên 600 kB sau 4 lần thu nhỏ. Có `!!` thì lệnh kết thúc với mã 1: sửa rồi chạy lại trước khi dùng bảng.

## Ảnh trước/sau P23

```sh
npm run media:p23
```

Lệnh build bản hiện tại, xuất P22 `f9508d8` ra thư mục tạm và build nó, mở `vite preview` cho bản hiện tại ở `4173` và P22 ở `4174`, rồi `scripts/capture-p23.mjs` chụp cả hai bản ở 390×844 và 1280×720. P22 khoanh nét đứt cam, P23 nét liền xanh, nhãn ghi chỗ đã đổi. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `f9508d8`.

1. Sim của mỗi bản chơi ván Vừa của chính nó (seed `MEDIA_SEED >>> 0`, nhập hàng theo gợi ý, tự phục vụ) và in bảng ngày: P23 tới ngày 14, P22 tới ngày 7. Ván lưu ở sáng ngày 2, báo cáo ngày 3, báo cáo ngày 7 và (P23) báo cáo ngày 14, nạp qua **Tiếp tục**.
2. Sáng ngày 2: chụp HUD pha chuẩn bị ở hai khổ, **Mở cửa** ở 4x tới cao điểm, về 1x rồi chụp HUD ở hai khổ.
3. Báo cáo ngày 3 vừa mở, cuộn về đầu, cửa sổ không nới thêm: chụp và đo số px phải cuộn.
4. Báo cáo ngày 7 (và ngày 14) → **Xem tổng kết tuần**: chụp tổng kết tuần, cửa sổ nới cao cho vừa cả hộp.
5. Main Menu tải không cache qua Slow 4G (150 ms RTT, 1,6 Mbps, CPU 4x), `three-*.js` giữ 11 s như `npm run media:loading`, từng bản một: chụp lúc cảnh 3D đang tải.

Mười hai bảng JPEG chất lượng 75 trong `docs/reports/p23-review/`, ghi đè mỗi lần chạy (`<w>` là `390` hoặc `1280`):

| File | Nội dung |
| --- | --- |
| `hud-prep-<w>-p23.jpg` | HUD pha chuẩn bị: P22 khoanh từng khung pill và dòng ghi chú; P23 khoanh 3 cụm và nút Mở cửa. Nhãn ghi số khung, số cụm và số hàng. |
| `hud-peak-<w>-p23.jpg` | HUD giờ cao điểm: như trên, thêm nút Camera và Cài đặt riêng (P22) cạnh menu gộp (P23). |
| `report-day3-<w>-p23.jpg` | Báo cáo ngày 3: P22 khoanh các khung mục; P23 khoanh 4 ô số chính, dòng Δ so hôm qua, Δ so TB tuần và tiến độ tuần. Nhãn ghi số px phải cuộn hoặc "vừa một màn". |
| `week1-<w>-p23.jpg` | Tổng kết tuần 1: bảng 7 ngày và nút Chơi lại (P22); biểu đồ cột, thưởng cúp, khối tuần sau và nút **Sang tuần 2** (P23). |
| `week2-<w>-p23.jpg` | Màn kết tuần 1 của P22 (ván dừng sau ngày 7) cạnh tổng kết tuần 2 của P23: bảng so với tuần 1 và nút **Sang tuần 3**. |
| `loading-<w>-p23.jpg` | Main Menu đang tải: một thanh % (P22) cạnh danh sách thành phần, mỗi dòng % riêng (P23). |

Ba ảnh P23 không khoanh, khổ 1280, dùng trong README, ghi vào `docs/media/`:

| File | Nội dung |
| --- | --- |
| `hud-1280.jpg` | Giờ cao điểm ngày 2: HUD 3 cụm Hôm nay, Tiến độ, Điều khiển. |
| `report-1280.jpg` | Báo cáo ngày 3: 4 ô số kèm Δ so hôm qua và so trung bình tuần. |
| `week-summary-1280.jpg` | Tổng kết tuần 2: so với tuần 1, doanh thu từng ngày, nút **Sang tuần 3**. |

Bảng trước/sau dùng trong [báo cáo P23 giao diện](reports/p23-ui.md). Cảnh báo `!!` giống [Ảnh trước/sau P20](#ảnh-trướcsau-p20), thêm bảng trên 600 kB. Có `!!` thì lệnh kết thúc với mã 1. Chỉ chơi và in bảng ngày, không mở server hay trình duyệt:

```sh
P23_SAVES_ONLY=1 node scripts/capture-p23.mjs
```

## Ảnh trước/sau P24

```sh
npm run media:p24
```

Lệnh build bản hiện tại, xuất P23 `3a08fe2` ra thư mục tạm và build nó, mở `vite preview` cho bản hiện tại ở `4173` và P23 ở `4174`, rồi `scripts/capture-p24.mjs` chụp cả hai bản ở 390×844 và 1280×800. P23 khoanh nét đứt cam, P24 nét liền xanh; nhãn ghi chỗ đã đổi, số px (bóng, viền, cỡ chữ, chiều cao) đọc từ style tính được của mỗi bản. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `3a08fe2`.

1. Sim của mỗi bản chơi ván Vừa của chính nó tới ngày 7 (seed `MEDIA_SEED >>> 0`, nhập hàng theo gợi ý, tự phục vụ) và in bảng ngày. Ván lưu ở sáng ngày 3 và sáng ngày 6 (chưa bật món mới của ngày, chưa nhập hàng), báo cáo ngày 3 và báo cáo ngày 7, nạp qua **Tiếp tục**. Sau mỗi save buổi sáng, sim bật Nước cam (ngày 3) hoặc Bánh ngọt (ngày 6) để các ngày sau có bán, và in gợi ý nhập của sim để đối chiếu.
2. Sáng ngày 3: chụp HUD và dock pha chuẩn bị ở hai khổ, **Mở cửa** ở 4x tới cao điểm, về 1x rồi chụp HUD ở hai khổ; bấm pill pha rồi chụp danh sách pha ở hai khổ.
3. Sáng ngày 3, mỗi khổ: Menu → bấm công tắc **Bán Nước cam** (cuộn tới Nước cam); Nhân viên, Nâng cấp; Kho → **Gợi ý nhập tự động** (cuộn tới Cam); **Nhập hàng**, thêm 1 gói Ly, **Nhập hàng** lần nữa rồi chụp cả toast.
4. Sáng ngày 6, mỗi khổ: Menu → bấm công tắc **Bán Bánh ngọt**; Kho → **Gợi ý nhập tự động** → **Nhập hàng**; không chụp.
5. Báo cáo ngày 3 vừa mở, cuộn về đầu, cửa sổ không nới thêm. Báo cáo ngày 7 → **Xem tổng kết tuần**, cửa sổ nới cao cho vừa cả hộp.

Bước 3 và 4 in một dòng `playtest` cho mỗi bản và mỗi khổ: công tắc có bật không, số gói và nhãn "gợi ý" của Cam, Bột bánh, Bơ, các toast "Đã nhập …". Bản hiện tại phải bật được công tắc, gắn nhãn "gợi ý" cho Cam (ngày 3), Bột bánh và Bơ (ngày 6) và hiện đúng 1 toast mỗi lượt nhập; thiếu điều nào thì in `!!`.

Hai mươi bốn bảng JPEG chất lượng 75 trong `docs/reports/p24-review/`, ghi đè mỗi lần chạy (`<w>` là `390` hoặc `1280`):

| File | Nội dung |
| --- | --- |
| `hud-prep-<w>-p24.jpg`, `hud-peak-<w>-p24.jpg` | HUD pha chuẩn bị và giờ cao điểm: dải chấm pha (P23) cạnh pill tên pha và "tới HH:MM" (P24); viền, bóng và chiều cao cụm Tiến độ. |
| `phases-<w>-p24.jpg` | Giờ cao điểm: dải chấm pha (P23) cạnh danh sách 4 pha kèm giờ mở từ pill (P24). |
| `dock-<w>-p24.jpg` | Dock: chiều cao nút, cỡ chữ nhãn, bóng và viền. |
| `menu-<w>-p24.jpg` | Menu, hàng Nước cam sau khi bấm công tắc: công tắc khóa và "Khóa" (P23) cạnh công tắc bật, "Thiếu Cam" và link "Mở Kho" (P24). |
| `panel-<w>-p24.jpg` | Bảng bên (Menu): bóng và viền khung. |
| `kho-<w>-p24.jpg` | Kho sau Gợi ý, hàng Cam: số ở ô nhập và nhãn "gợi ý" của mỗi bản. |
| `toast-<w>-p24.jpg` | Sau 2 lần Nhập hàng: câu "Đã nhập …" trong bảng (P23) cạnh toast gộp (P24). |
| `staff-<w>-p24.jpg`, `upgrades-<w>-p24.jpg` | Hàng đầu của Nhân viên và Nâng cấp: khung riêng nhiều dòng (P23) cạnh hàng chung một dòng meta (P24). |
| `report-<w>-p24.jpg` | Báo cáo ngày 3: dòng phụ, dải kết quả và nút chính. |
| `week1-<w>-p24.jpg` | Tổng kết tuần 1: viền và bóng hộp, tiêu đề, nút **Sang tuần 2**. |

Bảng trước/sau dùng trong [báo cáo P24](reports/p24-ui.md). Cảnh báo `!!` như [Ảnh trước/sau P23](#ảnh-trướcsau-p23); có `!!` thì lệnh kết thúc với mã 1. Chỉ chơi, in bảng ngày và gợi ý nhập, không mở server hay trình duyệt:

```sh
P24_SAVES_ONLY=1 node scripts/capture-p24.mjs
```

## Ảnh trước/sau P25

```sh
npm run media:p25
```

Lệnh build bản hiện tại, xuất P24 `5d33195` ra thư mục tạm và build nó, mở `vite preview` cho bản hiện tại ở `MEDIA_PORT` (mặc định `$PORT`, rồi `4173`) và P24 ở cổng kế tiếp, rồi `scripts/capture-p25.mjs` chụp cả hai bản ở 390×844 và 1280×800. Script chạy Chrome cài sẵn (`CHROME_PATH` hoặc chỗ cài thường gặp) để WebGL dùng GPU và các khung 0,2 s chụp đúng giờ; không có Chrome thì dùng Chromium của Playwright. P24 khoanh nét đứt cam, P25 nét liền xanh. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `5d33195`.

1. Sim của mỗi bản chơi ván Vừa của chính nó tới ngày 7 (seed `MEDIA_SEED >>> 0`, nhập hàng theo gợi ý, tự phục vụ, bật Nước cam từ ngày 3). Ván lưu ở sáng ngày 3 (chưa bật Nước cam, chưa có Cam), báo cáo ngày 2, báo cáo của ngày lên cấp đầu tiên và báo cáo ngày 7.
2. Ba save bậc: ván mới ở cấp quán cao nhất, mua qua sim `better_machine`, `grinder`, `pastry_case`, `big_counter`, `tables`, `plants`, `paintings`, `lights` tới bậc 1, 2 hoặc 3 (bậc = `ceil(cấp / ceil(maxLevel / 3))`). Script in cấp và bậc đạt được của từng nâng cấp.
3. Mỗi khổ: Menu sáng ngày 3 → bấm công tắc **Bán Nước cam**, đo chiều cao mọi dòng và số món thấy trọn khi danh sách ở đầu. Mỗi save bậc: chụp cảnh với camera mặc định, rồi mở **Nâng cấp** (chờ atlas `tiers`). Save bậc 1: mở **Nâng cấp**, ẩn bảng, bấm **Mua** rồi xác nhận Máy espresso cao cấp, chụp ở 0, 0,2, 0,5 s và 1,5 s (lúc yên). Báo cáo lên cấp: chụp 0,45 s sau khi confetti xuất hiện, rồi 2 s sau. Báo cáo ngày 2 → **Ngày tiếp theo**: chụp dock.
4. Báo cáo ngày 7 → **Xem tổng kết tuần** ở 390 px, cửa sổ nới cao cho vừa cả hộp.

Cận cảnh 3D cắt quanh vật theo vị trí chiếu từ `getShopLayout` qua camera mặc định (góc 45°, nghiêng isometric, zoom 1, tâm sàn trong nhà); vật ra ngoài khung hẹp ở 390 px thì không khoanh.

Hai mươi mốt bảng JPEG chất lượng 75 trong `docs/reports/p25-review/`, ghi đè mỗi lần chạy (`<w>` là `390` hoặc `1280`):

| File | Nội dung |
| --- | --- |
| `menu-<w>-p25.jpg` | Menu sau khi bấm công tắc Nước cam: công tắc và nút "Thiếu Cam"; ghi chú có chiều cao dòng và số món thấy trọn. |
| `upgrades-<w>-p25.jpg` | Nâng cấp: icon Máy espresso cao cấp ở P24 cấp 3 và P25 bậc 1/2/3, dòng "Bậc n/3". |
| `tier-pair-<w>-p25.jpg` | Icon Máy espresso cao cấp đặt cạnh máy espresso trong cảnh 3D của cùng save: P24 cấp 3, P25 bậc 1/2/3. |
| `scene-espresso-<w>-p25.jpg`, `scene-grinder-<w>-p25.jpg`, `scene-tables-<w>-p25.jpg`, `scene-decor-<w>-p25.jpg` | Cận cảnh máy espresso; máy xay và tủ bánh; bàn ghế; cây và đèn: P24 ở cấp của bậc 3, P25 bậc 1/2/3. |
| `fx-<w>-p25.jpg` | Máy espresso 0,2 s sau **Mua** ở P24 và 0 / 0,2 / 0,5 s ở P25; nhãn ghi phần điểm ảnh trong khung khác khung lúc yên (kênh màu lệch > 24). |
| `levelup-<w>-p25.jpg` | Báo cáo ngày lên cấp: dải P24, thẻ P25 lúc confetti đang bay và 2 s sau. |
| `dock-<w>-p25.jpg` | Dock sáng ngày 3: chấm "Mới" trên Menu khi Nước cam vừa mở. |
| `week1-390-p25.jpg` | Tổng kết tuần 1 ở 390 px: chân hộp và nút **Sang tuần 2**. |

Bảng trước/sau dùng trong [báo cáo P25](reports/p25-progression.md). Cảnh báo `!!` như [Ảnh trước/sau P23](#ảnh-trướcsau-p23), thêm: dòng Menu ở 390 px cao quá 72 px (bán được) hay 96 px (thiếu hàng), thiếu icon hay máy để ghép bảng `tier-pair`, công tắc Nước cam không bật, không có confetti hoặc confetti còn sau 2 s, không có chấm "Mới", nút chân Tổng kết tuần bị cắt. Có `!!` thì lệnh kết thúc với mã 1. Chỉ chơi và in cấp, bậc của các save:

```sh
P25_SAVES_ONLY=1 node scripts/capture-p25.mjs
```

### Đo khung hình khi có hiệu ứng

```sh
npm run perf:frames
npm run perf:frames -- --fx
npm run perf:frames -- --scene dusk-rain
npm run perf:frames -- --scene noon-sunny
```

`npm run perf:frames` đo 5 s sau mốc `cst:world` trên Main Menu, và liệt kê chunk confetti hay atlas `tiers` đã tải trong lúc đó (cột cuối, phải là `none`). `--scene` nạp save ngày 2 do sim mỗi bản chơi ra (`sceneSaves()` của `scripts/capture-p29.mjs`): `dusk-rain` là 19:00 trời mưa, `noon-sunny` là 12:00 trời nắng. Sau `cst:world` lệnh bấm **Tiếp tục**, chờ 1,5 s rồi đo 5 s ngày đang chạy; không dùng chung với `--fx`. `--fx` dựng save bằng sim của mỗi bản (như `media:p25`), rồi đo 3 s quanh từng hiệu ứng ở hồ sơ máy bàn và di động:

| Hiệu ứng | Cửa sổ đo |
| --- | --- |
| `upgrade` | Save bậc 1, mở **Nâng cấp**; 0,5 s sau khi cửa sổ bắt đầu, bấm **Mua** và xác nhận Máy espresso cao cấp. |
| `level-up` | Save báo cáo ngày lên cấp đầu tiên; cửa sổ bắt đầu khi bấm **Tiếp tục**, báo cáo mở cùng thẻ lên cấp và confetti. |

Mỗi dòng in p50, p95, khung dài nhất, số khung > 50 ms và long task (trung vị `--runs` lượt, mặc định 3). Chrome headless cấp khung theo bội số nhịp màn hình (thường 83 ms), nên p95 headless chỉ để so khoảng; thêm `--headed` để có thời gian khung thật trong cửa sổ Chrome. `--base <ref>` đo cả bản đó, hai bản xen kẽ.

## Ảnh P27

```sh
npm run media:p27
```

Lệnh build bản hiện tại, xuất P26 `d58350b` ra thư mục tạm và build nó, mở `vite preview` cho bản hiện tại ở `MEDIA_PORT` (mặc định `$PORT`, rồi `4173`) và P26 ở cổng kế tiếp, rồi `scripts/capture-p27.mjs` chụp ở 390×844 và 1280×720 bằng Chromium headless, mỗi khổ một trình duyệt mới. Chỗ mới được khoanh đỏ, nhãn đỏ chữ trắng luôn nằm trong khung ảnh. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `d58350b`.

1. Sim của mỗi bản chơi ván Vừa của chính nó (seed `MEDIA_SEED >>> 0`, tuyển 1 pha chế và 1 phục vụ ngày 1, nhập hàng theo gợi ý, tự phục vụ). Sáng ngày 3: nhận quà với ngày hôm qua của máy, tiền nâng lên ít nhất 3.000.000đ, lưu save sáng. Lưu save lúc 09:00 ngày 3 và (P27) save lúc khách VIP đầu tiên đang xếp hàng.
2. Hai save cấp quán 10: một save chỉ mua Mở rộng diện tích cấp 1, 12 Tem; một save mua Mở rộng diện tích, bàn, Biển neon, Kệ sách, Máy hát đĩa, Góc sofa, cây, tranh, đèn, máy espresso, quầy tới cấp tối đa.
3. Mỗi khổ: Main Menu, HUD và bảng Nhân viên (bấm **Đào tạo**) trên save sáng của cả hai bản; bảng Việc lúc 09:00 (bấm **Thành tựu**), Nâng cấp cuộn tới Máy hát đĩa, cảnh quán mở rộng và khách VIP trên bản hiện tại. Ảnh VIP chờ camera dừng, phóng khoảng 2x vào khách VIP (về camera mặc định nếu ngôi sao ra ngoài khung) rồi cắt sát ngôi sao.

Mười bốn ảnh JPEG chất lượng 80 trong `docs/media/`, ghi đè mỗi lần chạy (`<w>` là `390` hoặc `1280`):

| File | Nội dung |
| --- | --- |
| `menu-gift-<w>-p27.jpg` | Main Menu P26 cạnh P27: dòng "Quà ngày 2 đang chờ" dưới **Tiếp tục**. |
| `hud-tem-<w>-p27.jpg` | HUD P26 cạnh P27: chip Tem sau tiền trong cụm Tiến độ. |
| `staff-<w>-p27.jpg` | Nhân viên P26 cạnh P27: chip đặc điểm, "Cấp n/5 · KN", thanh KN, xác nhận Đào tạo tại chỗ. |
| `tasks-<w>-p27.jpg` | Việc ở đầu bảng và cuộn xuống: thẻ Quà hằng ngày, đơn đặc biệt, thành tựu đã sổ ra. |
| `upgrades-tem-<w>-p27.jpg` | Nâng cấp: giá Máy hát đĩa và Góc sofa có Tem, chip Tem trên HUD. |
| `expand-<w>-p27.jpg` | Quán mở rộng cấp 4 với camera mặc định: phòng bên, Biển neon, Kệ sách, Máy hát đĩa, Góc sofa (ở 390 px chỉ khoanh món nằm trong khung). |
| `vip-<w>-p27.jpg` | Cận cảnh khách VIP: ngôi sao trên bong bóng. |

Ảnh dùng trong [báo cáo P27](reports/p27-retention.md). Lệnh in `!!` khi một nhãn không có gì để khoanh, vòng khoanh dưới 60% nằm trong khung, nhãn không còn chỗ trống, hoặc bảng Việc thiếu thẻ quà, đơn đặc biệt hay thành tựu; có `!!` thì lệnh kết thúc với mã 1. Chỉ chơi và in các save:

```sh
P27_SAVES_ONLY=1 node scripts/capture-p27.mjs
```

Chỉ chụp một khổ (lệnh ngắn hơn): `P27_WIDTHS=390 npm run media:p27`.

## Ảnh P29

```sh
MEDIA_PORT=4180 npm run media:p29
```

Lệnh build bản hiện tại, mở `vite preview` ở `MEDIA_PORT` (mặc định `$PORT`, rồi `4173`), rồi `scripts/capture-p29.mjs` chụp bằng Chromium headless. Hai bảng trước/sau xuất bản gốc `774be34` ra thư mục tạm, build và mở ở cổng kế tiếp. Chỗ đổi khoanh đỏ, chú thích xuống dòng trong ảnh. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `774be34`.

1. Sim của mỗi bản chơi ván Vừa (seed `MEDIA_SEED >>> 0`, tuyển 1 pha chế và 1 phục vụ ngày 1, tự phục vụ) hết ngày 1, rồi mở ngày 2 với thời tiết của ảnh và chơi tới giờ của ảnh. Save báo cáo lấy ngày lên cấp đầu tiên. Save nạp qua **Tiếp tục**, game chạy 1x nên HUD trong ảnh chạy trước giờ đặt vài phút.
2. Mỗi khổ 390×844 và 1280×800, mỗi giờ 07:00, 12:00, 19:30, trời nắng và mưa, mức Cao và Thấp: chờ 2,5 s rồi chụp. Lệnh in giờ HUD và tổng sáng của từng ảnh.
3. Bảng ba giờ: ba ảnh nắng, Cao, 1280 cạnh nhau, mỗi khung có nhãn giờ và cường độ nắng, trời, hướng nắng.
4. 12:00 nắng, Cao, 1280: chờ một đồng xu hiện, dừng đồng hồ trang rồi chạy từng 1/60 s tới tuổi xu của từng khung, camera phóng quanh xu.
5. 19:30 nắng, Cao, 1280 ở cả hai bản: khoanh (1) vũng sáng dưới đèn quán, (2) vùng tối đi nhiều nhất, (3) một cây hay cột đèn bên đường cùng bóng của nó. Chú thích ghi số vũng sáng, tổng sáng và độ sáng vùng khoanh, độ cao mặt trời và chiều dài bóng.
6. Báo cáo ngày lên cấp ở 390×844, mức Cao: khoanh thẻ Lên cấp.

Ảnh JPEG trong `docs/media/p29/`, ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `scene-<giờ>-<thời tiết>-<mức>-<khổ>-p29.jpg` | 24 ảnh cảnh, ví dụ `scene-1930-rainy-high-390-p29.jpg`. |
| `hours-sunny-high-1280-p29.jpg` | 07:00, 12:00, 19:30 nắng, Cao, 1280 cạnh nhau. |
| `coin-before-after-p29.jpg` | Một đồng xu của `774be34`, rồi một đồng xu của bản hiện tại lúc 0,25, 0,6 và 0,85 s. |
| `dusk-sunny-high-before-after-p29.jpg` | 19:30 nắng, Cao: `774be34` cạnh bản hiện tại, ba vòng khoanh đánh số. |
| `levelup-390-p29.jpg` | Thẻ Lên cấp của Daily Report. |

Ảnh dùng trong [báo cáo P29](reports/p29-juice-lighting.md). Lệnh in `!!` khi không có đồng xu, thẻ Lên cấp, vũng sáng hay bóng cây bên đường để khoanh; có `!!` thì lệnh kết thúc với mã 1.

| Lệnh | Việc |
| --- | --- |
| `P29_ONLY=coin npm run media:p29` | Chỉ chụp bảng đồng xu. |
| `P29_ONLY=dusk npm run media:p29` | Chỉ chụp bảng 19:30 trước/sau. |
| `P29_SAVES_ONLY=1 node scripts/capture-p29.mjs` | Chỉ chơi và in các save, không mở server hay trình duyệt. |

## Ảnh P30

```sh
MEDIA_HEADED=1 MEDIA_PORT=4180 npm run media:p30
```

Lệnh build bản hiện tại, xuất bản gốc `9f662fd` ra thư mục tạm và build, mở hai bản bằng `vite preview` ở `MEDIA_PORT` và cổng kế tiếp, rồi `scripts/capture-p30.mjs` chụp trước/sau. Cần `MEDIA_HEADED=1` cho toast khách quen: Chromium headless vẽ quá ít khung nên đồng hồ game gần như đứng. Yêu cầu giống `npm run media` (không cần ffmpeg), thêm lịch sử git tới `9f662fd`.

1. Sim của mỗi bản chơi save trưa ngày 2 như `media:p29` (cùng seed), rồi sửa giống nhau ở hai bản: mọi order đang mở thành sẵn sàng (tim), khách đang chờ còn 30% kiên nhẫn (giọt mồ hôi), nguyên liệu món của một khách đang xếp hàng về 0 (đám mây), cấp quán 5 với bộ latte (đội), lúc mở cửa ngày 3 (toast), sáng ngày 4 với cấp quán 3 và bộ bạc hà (hai bảng).
2. Biểu cảm (tim và mây ở tốc độ x4): khi cảnh hiện sau **Tiếp tục**, script giữ đồng hồ trang rồi đẩy từng khung 1/60 s tới khi biểu cảm hiện (tối đa 1200 khung; đám mây phải kèm mặt buồn), camera phóng quanh biểu cảm. Bản gốc chụp ở cùng khung, camera ở cùng điểm, cùng vòng khoanh; vòng của đám mây khoanh cả mặt.
3. Toast (x4): bản hiện tại chờ toast khách quen tối đa 40 s theo đồng hồ thật; bản gốc chụp cùng số giây sau **Tiếp tục**.
4. Nạp save trưa ngày 2 của bản gốc (save v3 của P29) vào bản hiện tại, chờ 4 s: đồng hồ phải chạy, không có lỗi console hay request lỗi nào mà save của chính bản hiện tại không có.

Ảnh JPEG trong `docs/reports/p30-characters/`, ghi đè mỗi lần chạy:

| File | Nội dung |
| --- | --- |
| `emotes-before-after-p30.jpg` | Tim, giọt mồ hôi, đám mây trên khách, 1280×800, mức Cao. |
| `uniform-latte-before-after-p30.jpg` | Đội mặc bộ latte (cấp quán 5), khoanh từng người. |
| `uniform-picker-390-before-after-p30.jpg` | Mục Đồng phục của bảng Nhân viên ở 390×844: đang mặc, mở, khoá. |
| `regulars-390-before-after-p30.jpg` | Thẻ Khách quen của bảng Việc và toast khách quen ghé, 390×844. |

Trước khi mở trình duyệt, script nạp lại save đám mây và chạy nó trong Node ở x4 theo khung 60 fps; dòng tóm tắt save ghi giờ khách bỏ đi (`sim: walk-out at 12:05`).

Ảnh dùng trong [báo cáo P30](reports/p30-characters.md). Lệnh in `!!` khi biểu cảm, đội, mục Đồng phục, thẻ hay toast không hiện, khi sim không cho ai bỏ đi ở save đám mây, khi ảnh đám mây không có mặt buồn, hoặc save cũ nạp lỗi. Có `!!` thì lệnh kết thúc với mã 1 và dòng cuối ghi các phần bị `!!`; chạy lại tới khi sạch rồi mới dùng ảnh. Biểu cảm không hiện thì dòng `!!` ghi số khung đã đẩy và đồng hồ HUD đầu, cuối lượt chờ.

| Lệnh | Việc |
| --- | --- |
| `P30_SAVES_ONLY=1 node scripts/capture-p30.mjs` | Chỉ chơi và in tóm tắt save của bản hiện tại (gồm kiểm save đám mây), không mở server hay trình duyệt; có `!!` thì mã 1. |

## Tùy chọn

| Biến | Mặc định | Tác dụng |
| --- | --- | --- |
| `MEDIA_SEED` | `1760400000000` | Giá trị `Date.now()` cố định trong trang, quyết định seed của ván mới. |
| `MEDIA_PORT` | `4173` | Cổng của `vite preview` cho bản hiện tại; bản P18 dùng cổng kế tiếp. |
| `MEDIA_HEADED` | (trống) | `1` để mở cửa sổ Chromium thật, dùng GPU nên hình mượt hơn. |
| `P20_BASE` | `96030ca` | Commit "trước" mà `npm run media:p20` so với bản hiện tại. |
| `P21_BASE` | `77c8387` | Commit "trước" mà `npm run media:p21` so với bản hiện tại. |
| `P21_SEED` | `12345` | Seed của tuần mà `npm run media:p21` chơi để dựng ván. |
| `P21_WEEK_ONLY` | (trống) | `1` để `scripts/capture-p21.mjs` chỉ in bảng tuần rồi dừng. |
| `P22_BASE` | `f720b6f` | Commit "trước" mà `npm run media:p22` so với bản hiện tại. |
| `P22_SEED` | seed của `review:p22` | Seed của tuần mà `npm run media:p22` dựng ván ngày 2. |
| `P23_BASE` | `f9508d8` | Commit "trước" mà `npm run media:p23` so với bản hiện tại. |
| `P23_SEED` | `MEDIA_SEED >>> 0` | Seed của ván mà `npm run media:p23` chơi trên sim mỗi bản. |
| `P23_SAVES_ONLY` | (trống) | `1` để `scripts/capture-p23.mjs` chỉ chơi ván, in bảng ngày rồi dừng. |
| `P24_BASE` | `3a08fe2` | Commit "trước" mà `npm run media:p24` so với bản hiện tại. |
| `P24_SEED` | `MEDIA_SEED >>> 0` | Seed của ván mà `npm run media:p24` chơi trên sim mỗi bản. |
| `P24_SAVES_ONLY` | (trống) | `1` để `scripts/capture-p24.mjs` chỉ chơi ván, in bảng ngày và gợi ý nhập rồi dừng. |
| `P25_BASE` | `5d33195` | Commit "trước" mà `npm run media:p25` so với bản hiện tại. |
| `P25_SEED` | `MEDIA_SEED >>> 0` | Seed của ván mà `npm run media:p25` chơi trên sim mỗi bản. |
| `P25_SAVES_ONLY` | (trống) | `1` để `scripts/capture-p25.mjs` chỉ chơi ván, in cấp và bậc của các save rồi dừng. |
| `P27_BASE` | `d58350b` | Commit "trước" mà `npm run media:p27` so với bản hiện tại. |
| `P27_SEED` | `MEDIA_SEED >>> 0` | Seed của ván mà `npm run media:p27` chơi trên sim mỗi bản. |
| `P27_SAVES_ONLY` | (trống) | `1` để `scripts/capture-p27.mjs` chỉ chơi ván, in các save rồi dừng. |
| `P27_WIDTHS` | `390,1280` | Khổ mà `npm run media:p27` chụp. |
| `P29_BASE` | `774be34` | Commit "trước" của bảng đồng xu và bảng 19:30 trong `npm run media:p29`. |
| `P29_SEED` | `MEDIA_SEED >>> 0` | Seed của ván mà `npm run media:p29` chơi trên sim mỗi bản. |
| `P29_ONLY` | (trống) | `coin` hoặc `dusk` để `npm run media:p29` chỉ chụp một bảng trước/sau. |
| `P29_SAVES_ONLY` | (trống) | `1` để `scripts/capture-p29.mjs` chỉ chơi ván, in các save rồi dừng. |
| `P30_BASE` | `9f662fd` | Commit "trước" mà `npm run media:p30` so với bản hiện tại. |
| `P30_SEED` | `MEDIA_SEED >>> 0` | Seed của ván mà `npm run media:p30` chơi trên sim mỗi bản. |
| `P30_SAVES_ONLY` | (trống) | `1` để `scripts/capture-p30.mjs` chỉ chơi ván, in tóm tắt save rồi dừng. |
| `MEDIA_CHROMIUM` | (trống) | `1` để `scripts/capture-p25.mjs` dùng Chromium của Playwright thay cho Chrome cài sẵn. |

Ví dụ: `MEDIA_HEADED=1 npm run media`.

Seed cố định nhưng sim chạy theo khung hình thật, nên đám đông và số liệu có thể lệch nhẹ giữa các lần chạy.

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| `Cannot find package 'playwright'` | Chạy `npm ci`. |
| `Executable doesn't exist` | Chạy `npx playwright install chromium`. |
| `git archive d643d89 failed` hoặc `git show d643d89:docs/media/… failed` | Bản clone nông thiếu commit P18; chạy `git fetch --unshallow`. |
| `vite build of d643d89 failed` | `node_modules` hiện tại không build được bản P18; chạy `npm ci` rồi thử lại. |
| `!! kho-390-p18-p19.png: P19 still has content past the panel edge` | Bảng Kho lại tràn ngang; chạy `npm run layout` để biết phần tử nào. |
| `no three.js camera seen on #scene` | Three.js không còn gọi `__THREE_DEVTOOLS__`; sửa `observeThree()` trong `scripts/capture-media.mjs`. |
| `vite preview exited (port 4173 busy?)` | Tắt server đang dùng cổng (cả cổng kế tiếp) hoặc đặt `MEDIA_PORT=4180`. |
| Hết thời gian chờ báo cáo, hình giật | Chromium headless đang vẽ WebGL bằng phần mềm; chạy với `MEDIA_HEADED=1`. |
| Hết thời gian chờ một nút hay `[data-…]` | Giao diện đã đổi nhãn hoặc thuộc tính; sửa selector trong `scripts/capture-media.mjs`. Script bấm nút theo nhãn (**Ván mới**, **Bắt đầu ngày 1**, `Thêm 1 gói <nguyên liệu>`), bảng theo `.dock [data-panel]`, và nút theo `data-action`, `data-speed`, `data-tab`. |
| `npm run media:p20` cảnh báo `!!` hoặc thiếu khung | Giao diện P20 đã đổi; sửa selector đo trong `scripts/capture-p20.mjs` (`.hud-level`, `.dock-sep`, `.mission`, `.item.is-locked`, `[data-block="money"]`, `[data-block="level-up"]`, `.rpt-tab[data-tab="insights"]`, `.rpt-kpis`, `[data-setting="reducedMotion"]`, `details.keys-details`, các `.section-title` theo chữ). Cận cảnh 3D dựa vào nhóm `machine-steam` và thứ tự khối của nhân vật trong `src/render/actors/rig.ts` (xem `aimAt()`). |
| `npm run media:p21` cảnh báo `!!` hoặc hết thời gian chờ | Giao diện tuần đã đổi; sửa selector trong `scripts/capture-p21.mjs` (`.hud-week`, `.week-today`, `[data-week="unlocks"]`, `[data-remove]`, `[data-policy="price"]`, `[data-action="week-end"]`, `[data-screen="weekEnd"] [data-block]`, `section.playlog`) hoặc nhãn nút **Về Main Menu**. |
| `review-p22: over REVIEW_TIMEOUT_MS (…), stopping` | Lượt chạy quá 20 phút; chạy từng phần bằng `REVIEW_DAYS`, hoặc tăng `REVIEW_TIMEOUT_MS`. Số đo đã có vẫn được ghi. |
| `review:p22` hết thời gian một bước chờ cao điểm hay báo cáo | WebGL phần mềm vẽ chậm làm ngày game chậm theo; chạy `REVIEW_VIEWPORTS=390` rồi `REVIEW_VIEWPORTS=1440`, hoặc `MEDIA_HEADED=1`. |
| `no P22 board for <id>: add a builder in scripts/capture-p22.mjs` | `fixed-ui.json` hoặc `fixed-actors.json` có mục mới; thêm hàm dựng bảng cho id đó trong `fixedBoards()`. |
| `git archive f720b6f failed` hoặc `vite build of f720b6f failed` | Như dòng `d643d89` ở trên: `git fetch --unshallow`, hoặc `npm ci` rồi thử lại. |
| `npm run media:p23` cảnh báo `!!` hoặc hết thời gian chờ | Giao diện đã đổi; sửa selector trong `scripts/capture-p23.mjs` (`HUD_SELS`, `REPORT_SELS`, `WEEK_SELS`, `LOADING_SELS`, `[data-action="week-end"]`, `[data-speed]`). `git archive f9508d8 failed`: `git fetch --unshallow`. |
| `npm run media:p24` cảnh báo `!!` hoặc hết thời gian chờ | Giao diện đã đổi; sửa selector trong `scripts/capture-p24.mjs` (`HUD_SELS`, `HUD_STYLES`, `MENU_SELS`, `KHO_SELS`, `STAFF_SELS`, `UPGRADE_SELS`, `REPORT_SELS`, `WEEK_SELS`, `PHASE_SELS`, `[data-action="suggest"]`, `[data-action="buy"]`, `[data-action="phases"]`, `li[data-item] .toggle`). `cannot switch on orange_juice`: lịch mở khoá tuần 1 đã đổi, sửa `ENABLE`. `!! P24 day N at W: …`: playtest qua giao diện không đạt (công tắc không bật, Gợi ý thiếu nguyên liệu hoặc số toast khác 1); đọc dòng `playtest` ngay trên. `git archive 3a08fe2 failed`: `git fetch --unshallow`. |
| `npm run media:p25` cảnh báo `!!` hoặc hết thời gian chờ | Giao diện đã đổi; sửa selector trong `scripts/capture-p25.mjs` (`MENU_SELS`, `UPGRADE_SELS`, `LEVELUP_SELS`, `DOCK_SELS`, `WEEK_SELS`, `[data-atlas="tiers"]`, `canvas.fx-confetti`, `[data-action="confirm"]`). Vòng cận cảnh lệch vật: camera mặc định hoặc vị trí trong `getShopLayout` đã đổi, sửa `CAM` và `CLOSEUPS`. `no level-up in week 1`: ván không lên cấp trong tuần 1, đổi `P25_SEED`. `git archive 5d33195 failed`: `git fetch --unshallow`. |
| `!! <bảng>-p22.png: no subject within 150 s` | Cao điểm không có khách hợp cận cảnh (cá tính, mặt sốt ruột, đứng yên); chạy lại, hoặc đổi `P22_SEED`. |

## Kiểm lề và CLS

```sh
npm run layout
```

Lệnh build, mở `vite preview` ở cổng `4173` (đổi bằng `LAYOUT_PORT`), rồi `scripts/check-layout.mjs` chơi ván mới ở 390×844, 768×1024, 1440×900: mở 6 bảng trên dock, một ngày ở 4x, Daily Report và tab Đánh giá. Mỗi màn đạt khi không khung cuộn nào có `scrollWidth > clientWidth` và không phần tử nào lệch khỏi mép bảng. Ở bảng Kho, lệnh đổi số gói 4 lần và đòi CLS = 0, khung tổng và danh sách hàng không xê dịch. HUD được đo lúc Chuẩn bị, lúc mở menu camera và lúc mở cửa (thêm khổ 1280×800 chỉ đo HUD): đủ 3 cụm, nằm trong màn, không chồng nhau, nội dung không lòi khỏi khung, 1 hàng từ 1280 px trở lên (3 cụm cùng mép trên và chiều cao), tối đa 2 hàng ở khổ hẹp hơn, cụm Điều khiển luôn bắt đầu ở hàng đầu. Phép đo HUD chạy lại trên ngày có sự kiện "Tăng giá nhập" với số liệu ván mới ở 390×844, và với số liệu cuối game (109.582.093đ, 2 Tem, Cấp 5) ở 390×844, 1100×800, 1280×800, 1440×900. Ở 390×844, 768×1024, 1280×720 và 1440×900, lệnh còn nạp save của `scripts/capture-p25.mjs`: Menu sáng ngày 3 sau khi bấm công tắc Nước cam (thiếu Cam) và Daily Report của ngày lên cấp đầu tiên; cả hai không được tràn, mọi nút ≥ 44 px (tính cả vùng chạm `::before`); ở 390 px dòng Menu bán được ≤ 72 px, dòng thiếu hàng ≤ 96 px; ở 1280×720 báo cáo có thẻ lên cấp vừa một màn. Ở cùng bốn khổ, lệnh nạp save của `scripts/capture-p27.mjs`: bảng Việc lúc 09:00 ngày 3 với thành tựu đã sổ ra, bảng Nhân viên với xác nhận Đào tạo đang mở, bảng Nâng cấp ở cấp quán 10; mỗi bảng không được tràn, phải hiện thẻ quà, đơn đặc biệt, thành tựu (Việc), chip đặc điểm, thanh KN, xác nhận (Nhân viên), ít nhất 2 dòng giá có Tem (Nâng cấp), và mọi nút ≥ 44 px. Lệnh in bảng PASS/FAIL và trả mã lỗi 1 khi có FAIL; `LAYOUT_HEADED=1` mở cửa sổ Chromium thật. Kết quả gần nhất: [reports/p27-retention.md](reports/p27-retention.md#2-kết-quả-kiểm).

Chạy từng phần khi cả lượt dài quá giới hạn lệnh (`npm run build` một lần trước):

```sh
LAYOUT_ONLY=day LAYOUT_DAY_WIDTHS=390,768 node scripts/check-layout.mjs
LAYOUT_ONLY=day LAYOUT_DAY_WIDTHS=1440 node scripts/check-layout.mjs
LAYOUT_ONLY=hud,event node scripts/check-layout.mjs
LAYOUT_ONLY=p25 node scripts/check-layout.mjs
LAYOUT_ONLY=p27 node scripts/check-layout.mjs
```

## Icon 3D

`npm run icons` dựng từng icon thành mô hình low-poly Three.js và đóng gói thành atlas WebP.

| Phần | Nơi khai |
| --- | --- |
| Id trong atlas | Mọi id trong `src/ui/core/icons.ts`, cộng một ô avatar cho mỗi mục `AVATAR_LOOKS` (`src/ui/core/iconMap.ts`); `i-avatar-0` là `AVATAR_LOOKS[0]`. |
| Mô hình | `src/icon-studio/models/`. |
| Camera, đèn, bảng màu, viền mực, bóng | `src/icon-studio/style.ts`; cách vẽ ô 48 px và ô 24 px trong `LOOKS` của file đó. |
| Ngân sách dung lượng | `BUDGET` trong `src/icon-studio/atlas.ts` (test kiểm), tính cả ô 24 px: `atlas@1x.webp` ≤ 120 kB, `atlas@2x.webp` ≤ 300 kB. |
| Cách nén | `ENCODINGS` trong `src/icon-studio/main.ts`. |

Cách chọn nén:

1. Thử chất lượng WebP 0,85.
2. Giảm dần số mức alpha và chất lượng, tới 8 mức alpha và 0,6.
3. Lấy cách đầu tiên vừa ngân sách và in ra cách đã chọn; không cách nào vừa thì báo lỗi kèm dung lượng từng lần thử.

### Yêu cầu

- Playwright và Chromium như trên (`npm ci`, `npx playwright install chromium`). Không cần ffmpeg.
- Cổng `4175` còn trống (đổi bằng `ICONS_PORT`).

### Chạy

```sh
npm run icons                          # dựng mọi icon có mô hình
npm run icons -- --only i-menu,i-close # dựng lại vài icon, giữ các icon khác trong atlas hiện có
npm run icons -- --sheet               # như trên, và chụp lại bảng so sánh vào docs/reports/
```

Lệnh mở Vite dev server cho `src/icon-studio/`, Chromium headless vẽ mỗi icon hai lần: ô 48 px (96 px @2x) và ô 24 px (48 px @2x), rồi ghi đè:

| File | Nội dung |
| --- | --- |
| `public/icons3d/atlas@1x.webp` | Atlas: lưới ô 48 px, dưới nó lưới ô 24 px. |
| `public/icons3d/atlas@2x.webp` | Cùng atlas, gấp đôi. |
| `public/icons3d/atlas.json` | Id → ô `{x, y, w, h}` theo px @1x: `icons` (48 px), `smallIcons` (24 px), cùng số đo hai lưới (`small`) và kích thước atlas; `smallQuality`: số đo độ rõ của từng ô 24 px (tỉ lệ mực ở mép, tương phản với nền kem). |
| `public/icons3d/svg.json` | Id → SVG phẳng cũ, cho trang xem icon. |
| `docs/reports/p18-icons-sample.png` | Chỉ khi có `--sheet`. Bảng so sánh SVG cũ và icon 3D ở 16/24/48 px (16, 24 lấy ô 24 px; 48 lấy ô 48 px; chụp ở tỉ lệ điểm ảnh 2) cho các nút chỉ có icon (`ICON_ONLY_IDS`) và một hai icon mỗi nhóm (`SHEET_IDS` trong `src/icon-studio/atlas.ts`). |

Cuối cùng lệnh in số icon, ô 24 px yếu nhất theo từng số đo độ rõ và dung lượng từng file.

### Xem icon

- Trang `public/icons3d/index.html` liệt kê mọi icon trong `atlas.json` ở 16/24/32/48 px trên nền sáng và tối: cột trái là SVG cũ (từ `svg.json`), cột phải là icon 3D (16, 24 px lấy ô 24 px như trong game). Mở bằng `npm run dev` rồi vào `/icons3d/`; bản build có ở `icons3d/` cạnh `index.html`.
- Khi sửa mô hình: `npm run dev` rồi vào `/src/icon-studio/` để xem mọi mô hình ở 96 px, cạnh ô 24 px phóng lên 48 px; tải lại trang sau mỗi lần sửa.

### Thêm icon

1. Thêm id vào `ICON_IDS` trong `src/ui/core/icons.ts` (thứ tự trong mảng là thứ tự ô trong atlas).
2. Viết hàm dựng mô hình trong file theo nhóm ở `src/icon-studio/models/` (`hud.ts`, `glyphs.ts`, `items.ts`, `shop.ts`, `people.ts`) bằng `part(geometry, màu)` của `style.ts` và các khối chung trong `shapes.ts` (`stroke`, `lathe`, `steam`, `iceCube`, `saucer`, `badgeBase`…); mô hình đứng trên `y = 0`, mặt trước hướng `+Z`.
3. Chọn tư thế camera bằng `posed(tư thế, mô hình)`: `object` (mặc định, đồ vật), `glyph` (ký hiệu, nhìn thẳng, dựng trong mặt phẳng XY), `top` (vật dẹt nằm trên bàn, nhìn từ trên).
4. Khai hàm vào `ICON_MODELS` trong `src/icon-studio/models/index.ts`; thiếu id nào thì `tsc` báo lỗi.
5. Chạy `npm run icons -- --only <id>` rồi `npm test`:
   - `tests/icons/atlas.test.ts` kiểm đủ id, màu trong bảng màu, kích thước và dung lượng atlas, viền mực và tương phản của ô 24 px theo `SMALL_QUALITY`;
   - `tests/ui/icons.test.ts` kiểm mọi id có ô 48 px và ô 24 px.
6. Xem ô 24 px trên trang xem icon. Chi tiết nào mất ở 24 px mà cần giữ thì làm nó to hơn trong mô hình, hoặc dựng mô hình riêng trong `models/small.ts` và khai vào `SMALL_MODELS`.
7. Dùng icon trong UI bằng `icon('<id>')`, hoặc nối id của sim trong `src/ui/core/iconMap.ts`.
