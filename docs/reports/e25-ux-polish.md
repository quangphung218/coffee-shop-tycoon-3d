# E-25: UX polish after review (UX-304 .. UX-312)

UI-only epic. UX-301/302/303 were E-24, not this one.

## UX code -> file -> test

| UX | Fix | Files | Test |
| --- | --- | --- | --- |
| 304 | Regulars row: no empty strip when closed; chevron follows `aria-expanded` | `src/ui/panels/tasks.ts`, `src/ui/panels/panels.css` | `tests/ui/t88-regulars-toasts.test.ts` |
| 306 | Day-1 "Khách bỏ đi" toast | `src/ui/core/toast.ts`, `src/ui/screens/game.ts` | `tests/ui/t88-regulars-toasts.test.ts` |
| 307 | Regular arrival toast only on a first visit or near a milestone | `src/ui/hud/events.ts` | `tests/ui/t88-regulars-toasts.test.ts` (also updated: `tests/ui/regulars-card.test.ts`, e20 challenge-milestones test) |
| 310 | Milestone toast "Xem chuyện" action | `src/ui/screens/game.ts`, `src/ui/panels/tasks.ts` | `tests/ui/t88-regulars-toasts.test.ts` |
| 305 | Style lock badge | `src/ui/panels/styles.ts`, `src/ui/panels/panels.css` | `tests/ui/t89-style-lock-bar.test.ts` |
| 312 | Preview bar confirm | `src/ui/panels/styles.ts`, `src/ui/panels/panels.css` | `tests/ui/t89-style-lock-bar.test.ts` |
| 308 | No-wrap labels, plus a layout-check rule | `src/ui/styles/ui.css`, `src/ui/panels/panels.css`, `scripts/check-layout.mjs` | `tests/ui/t90-nowrap-level-icon.test.ts` (`describe('UX-308 Phong cách quán slot tabs on one line')`, line 42), plus the no-wrap rule in `scripts/check-layout.mjs` |
| 309 | Main menu "Tiếp tục" on one line | `src/ui/screens/mainMenu.ts` (also `src/ui/styles/ui.css`, `scripts/check-layout.mjs`) | `tests/ui/t90-nowrap-level-icon.test.ts` |
| 311 | Week-end level icon stays 16 px at max level | `src/ui/screens/weekEnd.ts` (`ic-sm` size 16; CSS in `src/ui/styles/ui.css`) | `tests/ui/t90-nowrap-level-icon.test.ts` |

## Results

- `npm run check` green: 190 files, 2380 tests.
- No change under `src/sim`. `tests/integration/p22-strategies.test.ts` and `tests/integration/p23-long-run.test.ts` were re-run and match main row by row. Command: `npx vitest run --configLoader runner tests/integration/p22-strategies.test.ts tests/integration/p23-long-run.test.ts`. Result: 29 tests pass on both this branch and main (`git archive`); 480 table rows are identical, and only 4 run-time (ms) lines differ.
- Draw calls not measured: there is no 3D change.

## Not verified

- `LAYOUT_OFFLINE=1` layout check: 141 rows pass, but it runs on software WebGL and is **not equivalent** to a real device. Real layout, performance and media are unverified in the sandbox.
- The css-order test is flaky.

## Known limitation

A merged multi-milestone toast's "Xem chuyện" opens the first regular's row only.
