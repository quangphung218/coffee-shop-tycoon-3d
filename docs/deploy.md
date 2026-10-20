# Build, version và deploy lên GitHub Pages

Trang này hướng dẫn build game, tăng version và đưa bản build lên GitHub Pages bằng `scripts/deploy-pages.sh`.

- [Yêu cầu](#yêu-cầu)
- [Build thử ở máy](#build-thử-ở-máy)
- [Version và phát hành](#version-và-phát-hành)
- [Deploy](#deploy)
- [Bật Pages bằng tay](#bật-pages-bằng-tay)
- [Lỗi hay gặp](#lỗi-hay-gặp)

## Yêu cầu

- Node.js và npm.
- Remote `origin` trỏ tới repo GitHub, có quyền push.
- [GitHub CLI](https://cli.github.com/) (`gh`) đã đăng nhập (`gh auth login`), để script tự bật Pages; không có `gh` thì [bật Pages bằng tay](#bật-pages-bằng-tay).
- Lịch sử git có tag `v*` (vd `v0.1.0`) để tính version; xem [Tạo tag gốc](#tạo-tag-gốc-lần-đầu).

## Build thử ở máy

1. Cài thư viện: `npm ci`.
2. Build: `npm run build` (kiểm tra kiểu rồi build ra `dist/`).
3. Xem bản build: `npm run preview`, mở `http://localhost:4173`.

- `vite.config.ts` đặt `base: './'`, nên `dist/` chạy được ở mọi đường dẫn con, kể cả `https://<owner>.github.io/<repo>/`.
- Đo tốc độ mở trang: xem [Kiến trúc → Khởi động](architecture.md#khởi-động).

## Version và phát hành

### Version hiện ở đâu

| Nơi | Nội dung |
| --- | --- |
| `package.json` → `"version"` | Nguồn duy nhất của version. |
| `src/version.ts` | `APP_VERSION`, `VERSION_LABEL` (`v0.1.0`); Vite thay `__APP_VERSION__` bằng version trong `package.json` lúc build (`define` trong `vite.config.ts`). |
| Chân Main Menu, cuối màn Cài đặt | Dòng `v0.1.0` / `Phiên bản v0.1.0`. |
| [CHANGELOG.md](../CHANGELOG.md) | Thay đổi của từng version, mới nhất ở trên. |
| Tag git `vX.Y.Z` | Commit của mỗi bản phát hành. |

### Quy tắc tăng

`scripts/release.mjs` đọc các commit từ tag `v*` gần nhất tới `HEAD`, theo [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

| Commit | Mức tăng | Ví dụ từ `1.2.3` | Ví dụ từ `0.1.0` |
| --- | --- | --- | --- |
| `BREAKING CHANGE:` trong thân, hoặc `!` trước `:` | major (minor khi còn `0.x`) | `2.0.0` | `0.2.0` |
| `feat` | minor | `1.3.0` | `0.2.0` |
| `fix`, `perf` | patch | `1.2.4` | `0.1.1` |
| `docs`, `test`, `chore`, `refactor`, `build`, `ci`, merge commit | không tăng | `1.2.3` | `0.1.0` |

- Nhiều commit thì lấy mức cao nhất.
- CHANGELOG nhóm commit: `feat` → **Added**, `fix` → **Fixed**, `perf` và breaking loại khác → **Changed**.

### Script làm gì

`node scripts/release.mjs` (deploy gọi sẵn):

1. Tìm tag `v*` gần nhất; không có tag thì in hướng dẫn tạo tag gốc, không đổi gì.
2. Tính version mới; bằng version cũ thì in `release: none (...)` và dừng.
3. Dừng với lỗi nếu `package.json`, `package-lock.json` hay `CHANGELOG.md` còn thay đổi chưa commit, hoặc tag mới đã có.
4. Ghi version mới bằng `npm version <x.y.z> --no-git-tag-version` (sửa `package.json` và `package-lock.json`).
5. Thêm mục `## [x.y.z] - YYYY-MM-DD` lên đầu `CHANGELOG.md`.
6. Commit đúng 3 file đó với message `chore(release): vX.Y.Z` và tạo tag có chú thích `vX.Y.Z`.

Xem trước version kế tiếp, không sửa gì:

```sh
node scripts/release.mjs --dry-run
```

### Tạo tag gốc lần đầu

Script cần một tag `v*` làm mốc; repo chưa có thì tạo một lần:

1. Chọn commit của bản `0.1.0` đang chạy trên Pages (vd commit `main` lúc deploy gần nhất): `git log --oneline`.
2. Tạo tag: `git tag -a v0.1.0 <commit> -m v0.1.0`.
3. Đẩy tag: `git push origin v0.1.0`.
4. Kiểm tra: `node scripts/release.mjs --dry-run` in version kế tiếp hoặc `release: none`.

## Deploy

```sh
sh scripts/deploy-pages.sh
```

Script làm lần lượt:

1. Chạy `git fetch origin` rồi dừng, chưa build hay tạo commit, nếu một trong các điều sau sai (thông báo in cách xử lý, xem [Lỗi hay gặp](#lỗi-hay-gặp)):
   - đang ở nhánh `main`;
   - không có file đã track nào chưa commit (file chưa track không tính);
   - `HEAD` trùng `origin/main`.
2. Chạy `npm ci` khi gặp một trong các trường hợp sau, và in `Running npm ci: <lý do>.`:
   - chưa có `node_modules/`;
   - thiếu `node_modules/.bin/tsc` hoặc `node_modules/.bin/vite`;
   - `node_modules/.package-lock.json` không có hoặc khác `package-lock.json` (so bằng `cmp`).
3. Chạy `npm run check` (kiểu, toàn bộ `vitest`, build). Lỗi thì dừng với `npm run check failed`, chưa tạo commit hay tag phát hành.
4. Chạy `node scripts/release.mjs`: có `feat`/`fix`/`perf`/breaking kể từ tag trước thì tăng version, commit và tag (xem [Script làm gì](#script-làm-gì)). Sau đó chạy `npm run build`; bản build mang version mới.
5. Chép `dist/` vào thư mục tạm, thêm `.nojekyll`, tạo commit `deploy: build from <sha>` và force-push lên nhánh `gh-pages` của `origin`.
6. Gọi `gh api repos/<owner>/<repo>/pages`; Pages chưa bật thì bật với nguồn `gh-pages`, thư mục `/`.
7. In địa chỉ trang: `Site: https://<owner>.github.io/<repo>/`.
8. Nếu vừa phát hành, chạy `git push origin main vX.Y.Z` (push thường, không force). Push lỗi thì in cảnh báo đỏ `WARNING: pushing the release commit and tag vX.Y.Z failed.` kèm lệnh chạy lại, và thoát mã 1.

Sau khi deploy:

- Push ở bước 8 lỗi thì chạy lại lệnh `git push` trong cảnh báo trước khi merge PR mới.
- Chạy lại script bao nhiêu lần cũng được: mỗi lần thay toàn bộ `gh-pages`, và không tăng version khi không có commit mới.
- Test các nhánh dừng và bước push (repo git tạm, `npm`/`gh` giả): `npx vitest run tests/scripts/deploy-pages.test.ts`.

## Bật Pages bằng tay

Khi máy không có `gh`:

1. Vào repo trên GitHub → **Settings** → **Pages**.
2. **Build and deployment** → Source: **Deploy from a branch**.
3. Branch `gh-pages`, thư mục `/ (root)` → **Save**.

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| `deploy only runs on main (current: <nhánh>)` | `git switch main && git pull --ff-only`, rồi chạy lại. |
| `the working tree has uncommitted changes` | Commit qua PR hoặc bỏ thay đổi trong các file được liệt kê, rồi chạy lại. |
| `local main is N commit(s) behind origin/main` | `git pull --ff-only`, rồi chạy lại. |
| `local main has N commit(s) that origin/main does not, ending at release vX.Y.Z` | Bản phát hành trước chưa được push: `git push origin main vX.Y.Z`. |
| `local main has N commit(s) that origin/main does not` | Push các commit đó (`git push origin main`) hoặc chuyển sang nhánh riêng và mở PR. |
| `local main and origin/main have split` | Xem `git log --oneline --left-right main...origin/main`; giữ commit cần bằng nhánh backup, rồi `git reset --hard origin/main`. |
| `WARNING: pushing the release commit and tag vX.Y.Z failed.` | Trang đã deploy nhưng `origin/main` chưa có commit phát hành; sửa quyền hoặc mạng rồi chạy `git push origin main vX.Y.Z` trước khi merge PR. |
| `release: none (no v* tag yet)` | Chưa có tag mốc; làm theo [Tạo tag gốc lần đầu](#tạo-tag-gốc-lần-đầu). Deploy vẫn chạy với version cũ. |
| `release: commit or discard changes first` | Commit hoặc bỏ thay đổi trong `package.json`, `package-lock.json`, `CHANGELOG.md`, rồi chạy lại. |
| `release: tag vX.Y.Z already exists` | Tag trùng với version mới; kiểm tra `git tag --list 'v*'` và `"version"` trong `package.json`. |
| `sh: tsc: command not found` (exit 127) khi `npm run build` | `node_modules/` cài dở; chạy `npm ci` rồi build lại. |
| `npm run build` báo lỗi kiểu | Sửa lỗi TypeScript; chạy `npm run check` để xem cả test. |
| `npm run check failed (types, tests or build)` | Có test, lỗi kiểu hoặc build hỏng trên `main`; chưa có commit hay tag phát hành nào. Sửa qua PR rồi deploy lại. |
| Push bị từ chối | Kiểm tra quyền push và `git remote get-url origin`. |
| `gh api` trả 404 hoặc 403 khi bật Pages | Chạy `gh auth status`; tài khoản cần quyền admin trên repo. |
| Trang trắng sau deploy | Đợi 1–2 phút cho Pages build xong, rồi tải lại không dùng cache. |
