# E-30: Expiry states and hints

Scope: UI only. `src/sim` is unchanged.

## Changes by place

### UX-401: High wage / High price expiry (T-109)
- Toast: replaces the existing expiry toast. It carries a button, "Đặt lại giá Cao" or "Đặt lại lương Cao", so the toast count is not higher than before.
- Dock badge: "1" on the last day and on the expiry day, during prep only.
- Việc lines: "Giá Cao vừa hết" / "Lương Cao vừa hết".
- Week-end: "Giá Cao hết vào ngày đầu tuần N".
- Caveat: the toast detects the expiry message by its text plus sim flags, so changing the message text would break detection.

### UX-402: Season lines (T-110)
- The lines describe the coming week. Reason: an "ends" line shown at week-end is too late to act on.
- N counts only styles not yet bought.
- Reuses the existing "Mới" dot. Applies to the Tem tab only.

### UX-405 and PO epic 2: hints (T-111)
- `sizeGoalHint` returns null at 3 cups. Otherwise it shows days left and a "Mở Menu" link.
- Hire hint in week-end for weeks 2-8, reusing `weekOneHints`. A lone server is told "Thuê pha chế".
- Uncarried-drink pill: shown after N=5 game minutes, at most once per day. Tapping it carries the drink. Not shown when there is no staff.

### UX-410: reset buttons no-wrap (T-112)
- `white-space: nowrap` is applied through `:where()` so it adds no specificity and does not clash with CSS order.
- New layout part, `reset`, for the layout check.

## Design choices
- Replace rather than add toasts, to keep notification volume flat.
- Show lines for the coming week so players can still act.
- Reuse existing parts (`weekOneHints`, "Mới" dot) instead of new components.
- `:where()` for nowrap, because rule order in the CSS is a known flaky area.

## Test evidence
- `npm run check`: green, 206 files, 2465 tests.
- `git diff main -- src/sim`: empty, so there is no sim diff.

## Layout and environment
- `LAYOUT_OFFLINE=1` (software WebGL) passes the reset batch and others. This is NOT equivalent to the real layout check.
- Real layout, perf and media are unverified: vite fails with EPERM / port 4173 in the sandbox.
- Draw calls: untouched (UI only), not measured.

## Flaky tests and notes
- css-order test: flaky.
- `tests/scripts/deploy-pages.test.ts` hung once in a reviewer's second `npm run check`. Unconfirmed; possibly sandbox git operations.
