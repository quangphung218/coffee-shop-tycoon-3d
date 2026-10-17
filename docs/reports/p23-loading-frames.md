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

Hai cấu hình như `measure-startup.mjs`: máy bàn không giới hạn, và di động (150 ms RTT, 1,6 Mbps, CPU chậm 4 lần). Mỗi ô là trung vị của `--runs` lần, hai bản đo xen kẽ.

## Thay đổi và nguồn giật

| Nguồn giật | Trước | Thay đổi |
| --- | --- | --- |
| Nhãn trên đầu khách | `LabelAssets` tạo `CanvasTexture` (vẽ bong bóng, chép icon) khi khách đầu tiên gọi món đó; texture nạp lên GPU ở khung vẽ đầu tiên có nó | `LabelAssets.prebuild()` tạo nhãn cho mọi món, mặt giận, ba mặt cảm xúc và xu, chờ atlas vẽ xong; `prepare()` gọi `renderer.initTexture` cho từng texture, báo tiến độ mục "Nhãn và texture" |
| Vật thể chưa có trong cảnh menu | Nhân vật (theo kiểu khách, tâm trạng, phụ kiện) và popup xu dựng lúc khách vào; geometry, texture chữ xu nạp lên GPU lúc vẽ lần đầu | `actors.prebuild()` dựng sẵn `WARM_BODIES` nhân vật và `WARM_COINS` xu vào pool trước `compileAsync`; `actors.drawWarm()` cho chúng hiện đủ kiểu, tâm trạng, nhãn, hơi, xu trong một khung vẽ trên canvas còn ẩn rồi trả về pool |
| Shader bóng đổ, geometry, texture còn lại | `compileAsync` chỉ biên dịch shader của vật liệu, không nạp geometry, texture, không biên dịch shader bóng đổ; khung đầu sau `cst:world` làm hết | Khung warm-up trong `prepare()` làm phần đó trước khi canvas hiện |
| Đổi icon sang atlas @2x | `enableHdIcons()` đổi `--ic-atlas` khi `ImageBitmap` cho canvas đã giải mã; CSS dùng ảnh khác nên lần vẽ đầu sau khi đổi vẫn giải mã cả atlas | `<img>.decode()` cùng object URL, chờ xong rồi mới đổi |
| Font đổi giữa chừng | Đã xử lý: mục "Font" chờ `document.fonts.load` trước khi mở nút vào quán | Không đổi |
| Canvas hiện ra | Đã xử lý: `#scene.is-ready` chỉ đổi `opacity`, không đổi bố cục | Không đổi |

Theo tài liệu `WebGLRenderer` của three.js (<https://threejs.org/docs/pages/WebGLRenderer.html>): `compileAsync` dùng `KHR_parallel_shader_compile`; `initTexture` nạp texture lên GPU trước, tránh khựng lúc giải mã và tải lên. Mã `compile()` trong `three@0.180` duyệt cả vật thể ẩn khi gom vật liệu, nên nhân vật trong pool được biên dịch dù đang ẩn.
