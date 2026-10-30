# E-15: Short sessions on phones

Two parts: Part A (T-41) makes short, interrupted sessions safe; Part B (T-42) makes the first 60 seconds readable.

## Part A: autosave, remembered speed, day-2 hint

- Autosave runs on `hidden` and `pagehide` in every phase. The existing `keepAutosave` is kept. No save is written on bankruptcy.
- Game speed is saved to settings through `apply` / `changeSettings`. A new game starts at 1x on a fresh install.
- On day 2 a one-time hint is shown through a toast. Its flag is `cst3d:hint:speed`.
- Tests: `tests/ui/e15-short-sessions.test.ts`, 6 tests.

## Part B: first 60 seconds

- `src/ui/hud/serveHints.ts` shows serving labels. Positions come from the new `World.screenPoint` in `src/render/scene/index.ts`. Labels are HTML elements, so they add no draw calls (reasoned, not measured).
- Flag `cst3d:hint:serve` is stored outside the save. Labels appear on day 1 with no staff, new game only.
- The 5 s label timing is measured from the moment the customer joins the line. The first arrival is about 5.5 s (11 game minutes) after opening, so measuring from opening would be wrong. The sim is unchanged.
- Fixed the toast for the first "Khách bỏ đi".
- Day-1 Việc order changed in `src/ui/panels/tasks.ts`. The p27-tasks assertion was updated to match.
- Tests: `tests/ui/e15-serve-hints.test.ts`, 7 tests.

## p22 / p23 status

`git diff main -- src/sim` is empty, so the p22 and p23 economy results are unchanged.

## Check results

- `tsc`: pass.
- `build`: pass.
- Tests: 2143 pass, run with `vitest --configLoader runner`. Plain `vitest` fails with EPERM in this environment.
- `npm run layout`: UNVERIFIED. It was blocked by a missing vite binary (ENOENT) in the worktree.
- Draw calls: not measured, only reasoned from the HTML-label design.

## Flaky tests

The css-order test timed out once in a full run. It passes when run alone.
