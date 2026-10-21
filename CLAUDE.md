# CLAUDE.md

Game web 3D low-poly quản lý quán cà phê, viết bằng TypeScript + Three.js, build bằng Vite, chạy trên GitHub Pages.
Lõi mô phỏng (`src/sim`) tất định và tách khỏi phần vẽ; chữ trong game và docs đều là tiếng Việt.

## Lệnh

| Lệnh | Khi nào |
| --- | --- |
| `npm run check` | **Cổng kiểm bắt buộc trước khi commit**: `tsc --noEmit` → `vitest run` → `vite build`. |
| `npm test` | Chỉ chạy test (`vitest run`, gom `tests/**/*.test.ts`). |
| `npx vitest run tests/sim/day.test.ts` | Chạy một file test. |
| `npm run layout` | Build rồi kiểm tràn ngang, HUD, các bảng ở 390–1440 px (khoảng 1 phút). Chạy khi sửa `src/ui`. Giữ chung lockfile đo hiệu năng với `perf:frames`, `measure-startup`: chờ lượt đo đang chạy xong. |
| `npm run perf:frames` | Build rồi đo frame time; `-- --base <commit>` để so bản cũ, `-- --scene dusk-rain` hoặc `noon-sunny` để đo cảnh P29. Giữ lockfile chung cả máy: hai lượt đo (kể cả ở hai worktree) không chạy song song. |
| `npm run media -- --scenario <id>` | Build rồi chụp theo kịch bản `scripts/scenarios/<id>.mjs` (`p29`, `p30`…); `media:p29`, `media:p30` là tên tắt. Xem `docs/media.md` mục Kịch bản chụp. |
| `npm run dev` | Dev server; `/?preview=actors` xem nhân vật riêng. |
| `node scripts/release.mjs --dry-run` | Xem version kế tiếp, không sửa gì. |

- `layout`, `perf:frames`, `media*` mở **Google Chrome cài sẵn** (hoặc `CHROME_PATH`) qua `scripts/lib/browser.mjs` để WebGL chạy trên GPU; mỗi lượt in dòng `browser: … WebGL: …`. Thiếu Chrome thì rơi về Chromium của Playwright (`npx playwright install chromium`) vẽ bằng CPU và in `!! WebGL chạy bằng CPU`: ảnh và số đo lúc đó không dùng được.
- Các `media:pNN` (p20–p27) và `review:p22` là script chụp ảnh theo từng đợt cũ. Chỉ chạy khi task nhắc đúng tên. Ảnh hiện hành dùng `npm run media`; P29, P30 là kịch bản của `scripts/capture.mjs`.

## Hạng mục verify (chụp ảnh, đo hiệu năng)

- **Chụp ảnh đợt mới: viết kịch bản, không chép script.** Thêm `scripts/scenarios/<id>.mjs` (save nào, chụp gì, bảng nào; mẫu: `p30.mjs`, `p29.mjs`) rồi chạy `npm run media -- --scenario <id>`. Phần dựng preview, nạp save, chờ `cst:world`, chụp, so với bản gốc, vẽ bảng đã có trong `scripts/lib/`; thiếu kiểu shot thì thêm vào `scripts/lib/shots.mjs`, không tạo `capture-pNN.mjs` mới.
- **Đo hiệu năng tuần tự.** `perf:frames`, `measure-startup` và `layout` giữ một lockfile chung cả máy (`scripts/lib/perf-lock.mjs`, mọi worktree dùng chung vì chung GPU; test trỏ lock sang thư mục tạm qua `PERF_LOCK_DIR`); không chạy hai lượt đo (hay một lượt đo cạnh một lượt chụp) cùng lúc, số đo sẽ nhiễu vì giành GPU. Trước khi chạy `media*` (chưa lấy lock) thì xem `$TMPDIR/cst3d-perf.lock` còn ai giữ không.
- **Luôn kiểm renderer là GPU.** Dòng `WebGL:` phải là GPU (vd `ANGLE Metal Renderer: Apple M2`), không phải `SwiftShader`; thấy `!! WebGL chạy bằng CPU` thì sửa môi trường (cài Chrome, `CHROME_PATH`) rồi chạy lại, không ghi số đo đó vào báo cáo.

## Cấu trúc

| Thư mục | Nội dung | Luật |
| --- | --- | --- |
| `src/sim/` | Luật chơi trong `GameState`: `step(state, dt)`, `dispatch(state, cmd)`, sự kiện vào `state.events`. `data/` là bảng số. | Không import DOM, `three`, `Math.random` (dùng RNG trong `state.rngState`). |
| `src/render/` | Three.js: `scene/`, `actors/`, `street/`. | Chỉ đọc state; cú bấm đổi thành `Command`. |
| `src/ui/` | HUD, bảng, màn hình HTML/CSS. | Gửi `Command` qua `dispatch`, không sửa state trực tiếp. |
| `src/audio/`, `src/save/` | Web Audio theo `GameEvent`; save `localStorage` + nâng save cũ. | Đổi schema save thì thêm migration và test trong `tests/save/`. |
| `tests/` | Cùng cấu trúc `src/`, cộng `integration/` (chạy cả ngày chơi) và `scripts/`. | |
| `scripts/` | Deploy, release, chụp media, dựng icon, đo hiệu năng. | |
| `docs/` | `architecture.md`, `deploy.md`, `media.md`, `spec/`, `reports/`. | |

Quy ước dữ liệu: `GameState` là JSON thuần; tiền là số nguyên đồng (`25000`); thời gian là phút từ nửa đêm (`420` = 07:00).

### Đọc mục nào khi sửa gì

`docs/architecture.md` dài khoảng 680 dòng. Chỉ đọc mục cần:

| Sửa | Đọc |
| --- | --- |
| Lệnh, sự kiện giữa các lớp | `## Hợp đồng Command và GameEvent` |
| Vòng ngày, tuần, cấp, nâng cấp, nhân viên, kho | `## Vòng ngày` và mục con tương ứng; luật tuần ở `docs/spec/week-7-days.md`, P27 ở `docs/spec/p27-retention.md` |
| Khách, đường đi | `## FSM khách`, `## Điều hướng và va chạm` |
| Khách quen, đồng phục, biểu cảm | `## FSM khách`; luật và số ở `docs/spec/p30-characters.md` |
| Save | `## Save schema` |
| Tốc độ mở trang, giật khung | `## Mẹo hiệu năng` |
| Ảnh demo, icon | `docs/media.md` |

## Branch, commit, báo cáo

- Branch: `<type>/tNNN-mo-ta-ngan` theo mã task (vd `fix/t471-deploy-script-origin-guard`), hoặc `<type>/pNN-…` cho cả đợt.
- Commit theo **Conventional Commits**, có scope: `fix(hud): …`, `docs(reports): …`, `test(layout): …`. Loại commit quyết định version lúc release (`feat` → minor, `fix`/`perf` → patch, còn lại giữ nguyên), nên chọn đúng loại.
- Báo cáo ghi vào `docs/reports/pNN-<chu-de>.md` (theo đợt) hoặc `docs/reports/<chu-de>.md`, và thêm một dòng vào `docs/README.md` mục Báo cáo.
- Mở PR vào `main`, không tự merge.

## Điều cấm

- **Không chạy `scripts/deploy-pages.sh`** (`sh`/`bash` đều cấm). Script build, force-push `gh-pages` rồi push `main` + tag: đó là production.
- Không chạy `node scripts/release.mjs` khi không có `--dry-run`. Script này sửa `package.json`, `package-lock.json`, `CHANGELOG.md`, tạo commit và tag.
- Không sửa tay `version` trong `package.json`, không sửa `CHANGELOG.md`, không tạo hay push tag `v*`.
- Không push `main` hay `gh-pages`, không force-push. Chỉ push branch của task.
- Không commit `dist/`, `node_modules/`, `.review-p22/` (đã có trong `.gitignore`).
