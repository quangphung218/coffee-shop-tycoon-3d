# Kế hoạch đưa Main Menu trên di động xuống dưới 1 s

Trang này ghi số đo Main Menu trên di động ở bản `57d7559`, chỉ ra thời gian đi vào đâu và nêu các bước để Main Menu hiện dưới 1 s. Cách khởi động hiện tại: [architecture.md → Khởi động](../architecture.md#khởi-động).

## Số đo hiện tại

Chrome headless, ANGLE Metal (Apple M2), không cache, build production qua `vite preview` (có gzip), trung vị 5 lần. "Mạng" là 150 ms RTT, 1,6 Mbps, giống cấu hình di động của `scripts/measure-startup.mjs`. Main Menu tính như `measure-startup.mjs`: khung hình thứ hai sau khi `.ui-screen.is-menu` xuất hiện.

| Khung nhìn | Giới hạn | Nội dung đầu tiên hiện | Main Menu |
| --- | --- | --- | --- |
| 390×844, DPR 3, mobile | Mạng + CPU 4x | 408 ms | 1223 ms |
| 390×844, DPR 3, mobile | Chỉ mạng | 392 ms | 1212 ms |
| 390×844, DPR 3, mobile | Chỉ CPU 4x | 116 ms | 116 ms |
| 1280×800 (như `measure-startup.mjs`) | Mạng + CPU 4x | 468 ms | 1294 ms |

Thời gian gần như toàn bộ là tải file: chỉ CPU 4x thì menu hiện sau 116 ms, chỉ mạng thì 1212 ms. Không có long task trước menu ở cấu hình di động.

Dòng thời gian một lượt 390×844, mạng + CPU 4x (ms tính từ lúc điều hướng):

| Đoạn | Từ | Tới | Dài |
| --- | --- | --- | --- |
| HTML (`index.html`, 3,9 kB gzip) | 0 | 311 | 311 |
| CSS `index-*.css`, 13,7 kB gzip | 318 | 758 | 440 |
| JS chính `index-*.js`, 75,9 kB gzip | 317 | 1175 | 858 |
| Font Nunito vietnamese 400 và 700, 6 kB mỗi file | 794 | 1078 | 284 |
| Chạy JS chính tới `cst:menu` | 1175 | 1208 | 33 |
| Vẽ menu | 1208 | 1223 | 15 |

JS chính, CSS và hai font chia nhau đường 1,6 Mbps. Font bị gọi khi CSS tới vì chữ trên `#boot` dùng `'Nunito'`. Mỗi kB gzip trên đường găng tốn khoảng 7–8 ms ở cấu hình này.

## Chunk chính chứa gì

Cỡ trước khi minify (`renderedLength` của Rollup), gzip ước theo từng module nên tổng lớn hơn cỡ gzip thật 75,7 kB:

| Nhóm | Module | Raw | Gzip ước | Main Menu cần? |
| --- | --- | --- | --- | --- |
| `src/sim` | 32 | 137,5 kB | 46,9 kB | Không: chỉ cảnh nền sau menu và lúc chơi |
| `src/ui/panels` | 9 | 54,0 kB | 19,8 kB | Không |
| `src/ui/screens` | 7 | 52,1 kB | 18,3 kB | Một phần: `shell.ts`, `mainMenu.ts` |
| `src/ui/core` | 11 | 31,6 kB | 12,6 kB | Phần lớn |
| `src/ui/report` | 4 | 32,5 kB | 11,0 kB | Không |
| `src/ui/hud` | 3 | 28,4 kB | 9,0 kB | Không |
| `src/save` | 4 | 13,6 kB | 4,8 kB | Chỉ `storage`, `settings` và danh sách slot |
| `src/audio` | 1 | 7,1 kB | 2,3 kB | Không |
| `src/main.ts` | 1 | 6,2 kB | 2,2 kB | Có |

Vì sao những phần không cần vẫn nằm trong chunk chính:

- `createShell` (`src/ui/screens/shell.ts`) import tĩnh và dựng ngay HUD, Daily Report, Ván mới, Tạm dừng, Cài đặt, Tổng kết tuần, cùng `sim` và `save/save.ts`.
- `mainMenu.ts` gọi `listSlots`, hàm này chạy `readSlot` đầy đủ (kiểm, nâng save) nên kéo theo `sim/index.ts` qua `settleActors`.
- `main.ts` import `sim`, `registerPrepPanels`, `registerReviewsPanel` và `createAudio` tĩnh, dựng cảnh nền menu bằng `createNewGame` trước khi menu hiện.
- `ui.css` là một file chung cho mọi màn.

## Kế hoạch

Ước lượng theo 7–8 ms mỗi kB gzip bỏ khỏi đường găng ở cấu hình mạng + CPU 4x, 390×844.

| # | Việc | Bỏ khỏi đường găng | Main Menu ước | Công sức |
| --- | --- | --- | --- | --- |
| 1 | Bỏ `'Nunito'` khỏi `font-family` của `#boot` trong `index.html`, để font chỉ tải khi menu đã vẽ | 12 kB font | ~1130 ms | Nhỏ |
| 2 | Tách chunk "game": `sim`, `hud`, `report`, `panels`, `weekEnd`, `pause`, `newGame`, `loadGame`, `save/save.ts`, `audio` vào `import()` gọi sau `afterPaint()`, song song với `src/render` | ~50–55 kB gzip JS | ~700–770 ms | Lớn |
| 3 | Tách CSS theo màn: CSS của HUD, panel, report, tổng kết tuần đi cùng chunk "game" | ~6–8 kB gzip CSS | ~650–720 ms | Vừa |
| 4 | Tắt polyfill modulepreload (`build.modulePreload.polyfill: false`) | 0,5 kB | không đáng kể | Nhỏ |

Bước 1 và 2 đủ để xuống dưới 1 s; bước 3 thêm khoảng trống cho các tính năng sau.

### Bước 2 cụ thể

1. Thêm hàm đọc tóm tắt slot nhẹ trong `src/save/` (`JSON.parse` rồi lấy `shopName`, `day`, `money`, `savedAt`, không nâng save) cho `mainMenu.ts`. Định dạng save không đổi. Slot không đọc được vẫn báo lỗi như `listSlots`; khi người chơi bấm Tải slot thì `readSlot` đầy đủ chạy như cũ.
2. `createShell` chỉ dựng Main Menu và Cài đặt lúc đầu. HUD, Daily Report, Ván mới, Tải game, Tạm dừng, Tổng kết tuần dựng khi chunk "game" tới.
3. `main.ts` dời `createMenuScene`, `registerPrepPanels`, `registerReviewsPanel`, `createAudio` vào sau `import()` chunk "game". Cảnh nền chỉ cần khi `src/render` xong, nên không chậm thêm.
4. Thêm chunk "game" vào danh sách `scene` của plugin `cst-loading-screen` và vào mục `code` của `LOAD_COMPONENTS`, để nút vào quán vẫn khoá tới khi mọi thứ đã tải và % vẫn theo dung lượng thật.
5. Thêm luật vào [architecture.md → Khởi động](../architecture.md#khởi-động): không import tĩnh `src/sim`, `src/ui/hud`, `src/ui/report`, `src/ui/panels` từ `main.ts` và các màn của menu.

Tổng số byte không giảm, nên "Cảnh 3D hiện" có thể đổi ít; đo cả hai số.

## Cách kiểm sau mỗi bước

- `node scripts/measure-startup.mjs --base 57d7559 --runs 5`: Main Menu ở dòng "Mobile" dưới 1000 ms, cảnh 3D không chậm hơn base quá 10%.
- Thêm vào `measure-startup.mjs` một cấu hình 390×844, DPR 3, mobile để đo đúng khung điện thoại.
- `npm run layout`, `npm run media:loading`: màn chờ, dòng tiến độ, khoá nút và Thử lại vẫn đúng.
- `npm run check`.
