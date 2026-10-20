# P27: trạng thái merge vào main

Đối chiếu mọi nhánh P27 với `origin/main` = `761a33d` (v0.9.4, 2026-10-20) bằng `git merge-base --is-ancestor` và so patch-id (`git log --cherry-mark --right-only --no-merges origin/main...<nhánh>`, cùng phép so của `git cherry`). Kết luận: toàn bộ nội dung P27 đã nằm trong main; 16 commit `+` còn lại thuộc 6 nhánh là các lượt làm cũ đã có bản thay thế được merge.

## Đường vào main

| PR | Nhánh | Đầu nhánh | Merge commit | Kiểu merge |
| --- | --- | --- | --- | --- |
| #23 | `test/t449-p27-rerun-verify` | `9c2b8ce` | `916bbd0` | merge commit (2 cha: `c2fa9a3`, `9c2b8ce`) |
| #24 | `test/t450-p27-pre-merge-check` | `9c2b8ce` | `916bbd0` | cùng merge commit với #23 |

`feat/p27-retention-characters-expansion` (nhánh tích hợp) không có PR riêng; đầu nhánh của nó cũng là `9c2b8ce`, nên đã vào main qua #23/#24. Không có PR nào merge kiểu rebase hay squash cho P27.

## Nhánh là tổ tiên của origin/main

`--is-ancestor` trả 0, mọi commit đã có trong main với đúng SHA, không có commit `+`.

| Hạng mục | Nhánh | Đầu nhánh | is-ancestor | cherry |
| --- | --- | --- | --- | --- |
| f0 nền retention | `feat/p27-f0-retention-foundation` | `e7f2626` | có | 0 `+` |
| k1 trait, cấp nhân viên | `feat/p27-k1-staff-traits-levels` | `b932e92` | có | 0 `+` |
| k2 bảng Nhân viên | `feat/p27-k2-staff-panel-growth` | `3ddfbd3` | có | 0 `+` |
| k2 sửa sau review | `fix/p27-rfix-k2-staff-panel-growth-review-fix` | `f71f5a6` | có | 0 `+` |
| l1 đơn đặc biệt, VIP | `feat/p27-l1-special-orders-vip` | `13c6d46` | có | 0 `+` |
| m1 mở rộng, nội thất (sim) | `feat/p27-m1-expansion-furniture-sim-r1` | `b3dcc4e` | có | 0 `+` |
| r1 quà ngày, thành tích | `feat/p27-r1-daily-gift-achievements-r1` | `1ad1674` | có | 0 `+` |
| u1 bảng Việc | `feat/p27-u1-tasks-panel-retention` | `55b9835` | có | 0 `+` |
| u2 Tem trên HUD, gợi ý quà | `feat/p27-u2-tickets-hud-menu-hint-r3` | `0fd7b75` | có | 0 `+` |
| g1 vẽ phòng phụ, nội thất | `feat/p27-g1-render-expansion-furniture` | `37558f3` | có | 0 `+` |
| t1 test tích hợp | `test/p27-t1-p27-integration-tests` | `69bc9a0` | có | 0 `+` |
| docs spec | `docs/p27-docs-p27-docs-spec` | `b99e586` | có | 0 `+` |
| verify (lượt 0, 1) | `docs/p27-verify-p27-verify-report`, `-r1` | `6c82b8c` | có | 0 `+` |
| tích hợp | `feat/p27-retention-characters-expansion` (local và origin) | `9c2b8ce` | có | 0 `+` |
| verify lại | `test/t449-p27-rerun-verify` (local và origin) | `9c2b8ce` | có | 0 `+` |
| kiểm trước merge | `test/t450-p27-pre-merge-check` (local và origin) | `9c2b8ce` | có | 0 `+` |

## Nhánh không phải tổ tiên của origin/main

Mọi commit của 6 nhánh này đều là `+` (không commit nào trùng patch-id với main, tức không phải bản rebase). Mỗi nhánh là lượt làm cũ; bản thay thế ở cột cuối đã vào main và chứa cùng tính năng.

| Nhánh | Đầu nhánh | is-ancestor | Commit `+` | Bản thay thế trong main | Đối chiếu nội dung |
| --- | --- | --- | --- | --- | --- |
| `feat/p27-m1-expansion-furniture-sim` | `e535204` | không | `f3f8be7`, `2ee11d0`, `e535204` | `-r1`: `cba8512`, `6f47c59`, `b3dcc4e` | phòng phụ cấp 3–4, đèn neon, kệ sách, máy hát, sofa có trong `src/sim/data/upgrades.ts`, `src/sim/upgrades.ts` của main |
| `feat/p27-r1-daily-gift-achievements` | `2a1fe7b` | không | `6bb13ca`, `2a1fe7b` | `-r1`: `ad08591`, `1ad1674` | quà ngày, chuỗi, Tem, thành tích có trong `src/sim/retention.ts`, `src/sim/data/retention.ts` của main |
| `feat/p27-u2-tickets-hud-menu-hint` | `56a39bb` | không | `ac268d6`, `ffd5431`, `56a39bb` | `-r3`: `448ed4c`, `0fd7b75` | dòng quà ở Main Menu trong main dùng `card-sub` + `textContent`; bản `56a39bb` (`hint card-sub`) bị thay |
| `feat/p27-u2-tickets-hud-menu-hint-r2` | `5fc8afc` | không | `e4b8cd7`, `c073356`, `93c1fda`, `5fc8afc` | `-r3`: `448ed4c`, `0fd7b75` | sửa `5fc8afc` (`class: 'card-sub'`, `giftLine.textContent`) có nguyên văn ở `src/ui/screens/mainMenu.ts:95` và `:155` của main |
| `docs/p27-verify-p27-verify-report-r2` | `7014b1a` | không | `ea39c99`, `d4f18ab`, `7014b1a` | `75aedd1`, `ec75819`, `9c2b8ce` (t449) | ảnh `hud-*-p27`, `menu-*-p27`, `upgrades-*-p27` của lượt này không còn; main dùng bộ ảnh của r3 |
| `docs/p27-verify-p27-verify-report-r3` | `97f07bb` | không | `0fc3aed`, `826457d`, `97f07bb` | `75aedd1`, `ec75819`, `9c2b8ce` (t449) | `scripts/capture-p27.mjs` giống hệt; `docs/reports/p27-retention.md`, 14 ảnh `*-p27.jpg` có trong main ở bản chụp lại của t449; `scripts/check-layout.mjs` đã được các việc sau sửa tiếp |

Không tìm thấy nhánh, commit hay PR nào mang mã T445.

## Vì sao hệ thống báo P27 chưa merge

- Giả thuyết rebase không đúng: #23/#24 merge bằng merge commit `916bbd0`, nhánh tích hợp `9c2b8ce` là tổ tiên của `origin/main`, và `backup/main-before-sync-2026-10-20` (main local trước khi đồng bộ) cũng đã chứa `9c2b8ce`.
- Nguyên nhân khả dĩ nhất: hệ thống kiểm ancestry trên nhánh ghi cho từng hạng mục, mà với m1, r1, u2 và verify, nhánh đó là lượt làm cũ (`feat/p27-m1-expansion-furniture-sim`, `feat/p27-r1-daily-gift-achievements`, `feat/p27-u2-tickets-hud-menu-hint[-r2]`, `docs/p27-verify-p27-verify-report-r2/-r3`). Các lượt này không được merge; bản làm lại (`-r1`, `-r3`) hoặc bản chép tay sang t449 (`75aedd1`, `ec75819`) mới vào main, với patch khác nên cả ancestry lẫn so patch-id đều báo thiếu.
- Riêng hạng mục verify: nội dung r3 được chép lại thành commit mới trên nhánh t449 rồi chụp lại ảnh và viết lại báo cáo, nên `docs/p27-verify-p27-verify-report-r3` sẽ luôn báo chưa merge dù kết quả đã có trong main.

## Cách kiểm lại

```sh
git branch -a --no-merged origin/main --list '*p27*' '*t449*' '*t450*'
git log --cherry-mark --right-only --no-merges --format='%m %h %s' origin/main...<nhánh>
```

Dòng `>` là commit chưa có trong main theo patch-id, dòng `=` là commit đã có với SHA khác.
