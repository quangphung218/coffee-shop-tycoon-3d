# Build và deploy lên GitHub Pages

Trang này hướng dẫn build game và đưa bản build lên GitHub Pages bằng `scripts/deploy-pages.sh`.

## Yêu cầu

- Node.js và npm.
- Remote `origin` trỏ tới repo GitHub, có quyền push.
- [GitHub CLI](https://cli.github.com/) (`gh`) đã đăng nhập (`gh auth login`), để script tự bật Pages. Không có `gh` thì bật Pages bằng tay (xem bên dưới).

## Build thử ở máy

```sh
npm ci
npm run build      # kiểm tra kiểu rồi build ra dist/
npm run preview    # mở bản build ở http://localhost:4173
```

`vite.config.ts` đặt `base: './'` nên `dist/` chạy được ở mọi đường dẫn con, kể cả `https://<owner>.github.io/<repo>/`.

## Deploy

```sh
sh scripts/deploy-pages.sh
```

Script làm lần lượt:

1. Chạy `npm ci` nếu chưa có `node_modules/`.
2. Chạy `npm run build`.
3. Chép `dist/` vào thư mục tạm, thêm `.nojekyll`, tạo một commit `deploy: build from <sha>` và force-push lên nhánh `gh-pages` của `origin`. Nhánh `gh-pages` luôn chỉ có commit của lần deploy mới nhất.
4. Gọi `gh api repos/<owner>/<repo>/pages`; nếu Pages chưa bật thì bật với nguồn `gh-pages`, thư mục `/`.
5. In địa chỉ trang, dạng `Site: https://<owner>.github.io/<repo>/`.

Chạy lại script bao nhiêu lần cũng được; mỗi lần thay toàn bộ nội dung `gh-pages`.

## Bật Pages bằng tay

Khi máy không có `gh`: vào repo trên GitHub → **Settings** → **Pages** → **Build and deployment** → Source **Deploy from a branch**, Branch `gh-pages`, thư mục `/ (root)` → **Save**.

## Lỗi hay gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| `npm run build` báo lỗi kiểu | Sửa lỗi TypeScript; chạy `npm run check` để xem cả test. |
| Push bị từ chối | Kiểm tra quyền push và `git remote get-url origin`. |
| `gh api` trả 404 hoặc 403 khi bật Pages | Chạy `gh auth status`; tài khoản cần quyền admin trên repo. Repo private cần gói GitHub hỗ trợ Pages. |
| Trang trắng sau deploy | Đợi 1–2 phút cho Pages build xong, rồi tải lại không dùng cache. |
