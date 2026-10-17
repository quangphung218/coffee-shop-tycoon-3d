# Vài giây đầu sau khi tải: frame time và long task

Báo cáo này cho biết cách đo độ mượt 5 s đầu sau khi cảnh 3D hiện, và mỗi thay đổi trong `world.prepare()` nhắm vào nguồn giật nào. Luồng khởi động: [architecture.md → Khởi động](../architecture.md#khởi-động).

## Cách đo

```sh
npm run build
node scripts/measure-frames.mjs --base f9508d8 --runs 5   # frame time, long task
node scripts/measure-startup.mjs --base f9508d8 --runs 5  # mốc Main Menu, cảnh 3D
```

`npm run perf:frames` chạy build rồi `measure-frames.mjs` (thêm `-- --base <commit> --runs <n>`).

`scripts/measure-frames.mjs` mở bản build trong Chrome cài trên máy (`$CHROME_PATH`, hoặc chỗ cài thường gặp), chạy headless, không cache, cửa sổ 1280×800, `Date.now()` cố định nên quán sau menu giống nhau mỗi lần. Từ mốc `cst:world`, script ghi:

| Số | Cách lấy |
| --- | --- |
| Frame time p50, p95, max | Khoảng cách giữa các `requestAnimationFrame` trong 5 s, khung đầu tính từ mốc |
| Frame > 50 ms | Số khung dài hơn 50 ms trong 5 s |
| Long task | `PerformanceObserver` loại `longtask`: số task và tổng thời gian nằm trong 5 s |

Dòng đầu của kết quả in tên GPU WebGL. Nếu là SwiftShader (Chromium của Playwright vẽ WebGL bằng CPU), mỗi khung mất khoảng 200 ms, long task phủ kín 5 s ở cả hai bản, và số đo không cho biết gì về giật; script in cảnh báo `!!`.

Chrome headless phát khung theo bội số vsync: khoảng 83 ms một khung dù luồng chính rảnh, nên ở headless chỉ số long task mới phản ánh giật. Đo frame time thật bằng cửa sổ có vsync: thêm `--headed`.

Hai cấu hình như `measure-startup.mjs`: máy bàn không giới hạn, và di động (150 ms RTT, 1,6 Mbps, CPU chậm 4 lần). Mỗi ô là trung vị của `--runs` lần, hai bản đo xen kẽ.

## Kết quả

### Headless, GPU thật

`measure-frames.mjs --base f9508d8 --runs 5`, Chrome 155 headless, ANGLE Metal (Apple M2), trung vị 5 lần. Bản sau là `b00cff5`, lúc `prebuild()` còn chờ atlas @2x.

| Cấu hình | Bản | Cảnh 3D | Frame p50 | p95 | Max | Frame > 50 ms | Long task (số / tổng) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Máy bàn | `f9508d8` | 248 ms | 83 ms | 133 ms | 150 ms | 42 | 1 / 73 ms |
| Máy bàn | `b00cff5` | 266 ms | 83 ms | 133 ms | 150 ms | 39 | 0 / 0 ms |
| Di động, CPU 4x | `f9508d8` | 4782 ms | 83 ms | 133 ms | 150 ms | 40 | 3 / 275 ms |
| Di động, CPU 4x | `b00cff5` | 5833 ms | 83 ms | 150 ms | 167 ms | 40 | 3 / 135 ms |

- Long task trong 5 s đầu giảm: máy bàn 73 → 0 ms, di động 275 → 135 ms.
- Frame time giống nhau ở hai bản vì headless khoá nhịp khung (xem [Cách đo](#cách-đo)).
- Cảnh 3D di động chậm thêm 1051 ms: `prebuild()` chờ atlas @2x (289 kB) qua mạng 1,6 Mbps. `0205afe` bỏ bước chờ đó.

Đo lại sau `0205afe`, cùng lệnh và cùng máy:

| Cấu hình | Bản | Cảnh 3D | Frame p50 | p95 | Max | Frame > 50 ms | Long task (số / tổng) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Máy bàn | `f9508d8` | 184 ms | 83 ms | 133 ms | 133 ms | 43 | 0 / 0 ms |
| Máy bàn | `0205afe` | 298 ms | 83 ms | 133 ms | 150 ms | 44 | 0 / 0 ms |
| Di động, CPU 4x | `f9508d8` | 3043 ms | 67 ms | 133 ms | 133 ms | 40 | 0 / 0 ms |
| Di động, CPU 4x | `0205afe` | 3173 ms | 67 ms | 117 ms | 133 ms | 45 | 0 / 0 ms |

- Cảnh 3D di động chậm hơn bản cũ 130 ms (4%), trong ngưỡng 10%. Máy bàn chậm hơn 114 ms: khung warm-up và `initTexture` chạy trước `cst:world`.
- Lần đo này không có long task ở cả hai bản. Hai lần đo cộng lại cho thấy long task chỉ thỉnh thoảng xuất hiện trên M2 ở headless, nên chưa đủ để kết luận phần warm-up làm giảm chúng.
- Số khung > 50 ms dao động 34–54 mỗi lần ở cả hai bản, do headless khoá nhịp khung.

### Cửa sổ thật, vsync thật

`measure-frames.mjs --base f9508d8 --runs 5 --headed`, Chrome 155 có cửa sổ, ANGLE Metal (Apple M2), bản `0205afe`, trung vị 5 lần.

| Cấu hình | Bản | Cảnh 3D | Khung | Frame p50 | p95 | Max | Max từng lần | Frame > 50 ms | Long task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Máy bàn | `f9508d8` | 174 ms | 375 | 13 ms | 15 ms | 15 ms | 38 / 15 / 15 / 15 / 27 | 0 | 0 ms |
| Máy bàn | `0205afe` | 205 ms | 375 | 13 ms | 15 ms | 20 ms | 27 / 20 / 15 / 29 / 16 | 0 | 0 ms |
| Di động, CPU 4x | `f9508d8` | 3019 ms | 374 | 13 ms | 15 ms | 27 ms | 28 / 27 / 29 / 27 / 27 | 0 | 0 ms |
| Di động, CPU 4x | `0205afe` | 3043 ms | 376 | 13 ms | 15 ms | 15 ms | 15 / 27 / 15 / 26 / 15 | 0 | 0 ms |

- Trên M2 cả hai bản đều không có khung > 50 ms hay long task trong 5 s đầu, nên ở máy này không đo được mức giảm của chỉ số đó.
- Di động (CPU chậm 4 lần): bản cũ khựng khoảng 27 ms ở cả 5 lần; bản mới chỉ khựng ở 2/5 lần, khung dài nhất (trung vị) giảm 27 → 15 ms.
- Máy bàn: khung dài nhất 15 → 20 ms (trung vị), các lần đo dao động 15–38 ms ở cả hai bản.
- Cảnh 3D: di động 3019 → 3043 ms (+0,8%), máy bàn 174 → 205 ms.

## Thay đổi và nguồn giật

| Nguồn giật | Trước | Thay đổi |
| --- | --- | --- |
| Nhãn trên đầu khách | `LabelAssets` tạo `CanvasTexture` (vẽ bong bóng, chép icon) khi khách đầu tiên gọi món đó; texture nạp lên GPU ở khung vẽ đầu tiên có nó | `LabelAssets.prebuild()` tạo nhãn cho mọi món, mặt giận, ba mặt cảm xúc và xu, không chờ atlas @2x (icon tự vẽ vào và nạp lại khi atlas về); `prepare()` gọi `renderer.initTexture` cho từng texture, báo tiến độ mục "Nhãn và texture" |
| Vật thể chưa có trong cảnh menu | Nhân vật (theo kiểu khách, tâm trạng, phụ kiện) và popup xu dựng lúc khách vào; geometry, texture chữ xu nạp lên GPU lúc vẽ lần đầu | `actors.prebuild()` dựng sẵn `WARM_BODIES` nhân vật và `WARM_COINS` xu vào pool trước `compileAsync`; `actors.drawWarm()` cho chúng hiện đủ kiểu, tâm trạng, nhãn, hơi, xu trong một khung vẽ trên canvas còn ẩn rồi trả về pool |
| Shader bóng đổ, geometry, texture còn lại | `compileAsync` chỉ biên dịch shader của vật liệu, không nạp geometry, texture, không biên dịch shader bóng đổ; khung đầu sau `cst:world` làm hết | Khung warm-up trong `prepare()` làm phần đó trước khi canvas hiện |
| Đổi icon sang atlas @2x | `enableHdIcons()` đổi `--ic-atlas` khi `ImageBitmap` cho canvas đã giải mã; CSS dùng ảnh khác nên lần vẽ đầu sau khi đổi vẫn giải mã cả atlas | `<img>.decode()` cùng object URL, chờ xong rồi mới đổi |
| Font đổi giữa chừng | Đã xử lý: mục "Font" chờ `document.fonts.load` trước khi mở nút vào quán | Không đổi |
| Canvas hiện ra | Đã xử lý: `#scene.is-ready` chỉ đổi `opacity`, không đổi bố cục | Không đổi |

Theo tài liệu `WebGLRenderer` của three.js (<https://threejs.org/docs/pages/WebGLRenderer.html>): `compileAsync` dùng `KHR_parallel_shader_compile`; `initTexture` nạp texture lên GPU trước, tránh khựng lúc giải mã và tải lên. Mã `compile()` trong `three@0.180` duyệt cả vật thể ẩn khi gom vật liệu, nên nhân vật trong pool được biên dịch dù đang ẩn.
