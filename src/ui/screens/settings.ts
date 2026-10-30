import {
  DEFAULT_SETTINGS,
  saveSettings,
  type CameraKeys,
  type CameraRotateSpeed,
  type GameSpeed,
  type Quality,
  type ReducedMotion,
  type Settings,
} from '../../save/settings';
import { clearPlayLog, exportPlayLog, readPlayLogStatus, type PlayLogPhase } from '../../save/playlog';
import type { StorageLike } from '../../save/storage';
import { VERSION_LABEL } from '../../version';
import { h, setChildren, uid } from '../core/dom';
import { formatClock, formatSavedAt } from '../core/format';
import { icon, type IconId } from '../core/icons';
import { screenLayer, type Screen } from '../core/screens';
import { phaseLabel } from '../core/phase';

export interface SettingsActions {
  /** Called after every change, already saved; apply it to audio, renderer and game. */
  onChange(settings: Settings): void;
  onBack(): void;
}

export interface SettingsScreen extends Screen {
  /** Current values shown by the form. */
  readonly value: Settings;
  /** Saves a change made outside the form (the HUD speed buttons) and reports it like one made here. */
  apply(patch: Partial<Settings>): void;
}

const QUALITY_OPTIONS: readonly { value: Quality; label: string }[] = [
  { value: 'low', label: 'Thấp' },
  { value: 'medium', label: 'Vừa' },
  { value: 'high', label: 'Cao' },
];
const SPEED_OPTIONS: readonly { value: GameSpeed; label: string }[] = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
];
const ROTATE_OPTIONS: readonly { value: CameraRotateSpeed; label: string }[] = [
  { value: 'slow', label: 'Chậm' },
  { value: 'normal', label: 'Vừa' },
  { value: 'fast', label: 'Nhanh' },
];
const MOTION_OPTIONS: readonly { value: ReducedMotion; label: string }[] = [
  { value: 'system', label: 'Theo máy' },
  { value: 'reduce', label: 'Luôn giảm' },
];
const CAMERA_KEY_OPTIONS: readonly { value: CameraKeys; label: string }[] = [
  { value: 'qe-wasd', label: 'WASD di chuyển · Q/E xoay' },
  { value: 'qa-arrows', label: 'Mũi tên di chuyển · Q/A xoay' },
];

/** How long "Về mặc định" and "Xoá" stay armed waiting for a second click, ms. */
const RESET_CONFIRM_MS = 3000;

function playLogPhaseLabel(phase: PlayLogPhase): string {
  if (phase === 'menu') return 'Menu chính';
  if (phase === 'week_end') return 'Kết tuần';
  return phaseLabel(phase);
}

/** Epoch ms → "20261016" in local time, for the export file name. */
function dateStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Settings grouped into Âm thanh, Hiển thị, Điều khiển and Trò chơi, each item
 * with a one-line purpose, then Số liệu chơi (play log view, export, clear).
 * Every change applies at once and is saved; there is no Save button.
 * "Về mặc định" and "Xoá" confirm in place (no modal).
 */
export function createSettings(storage: StorageLike, initial: Settings, actions: SettingsActions): SettingsScreen {
  let value: Settings = { ...initial };
  const titleId = uid('set-title');
  const status = h('span', { class: 'status-line', attrs: { role: 'status' } });

  function commit(patch: Partial<Settings>): void {
    value = { ...value, ...patch };
    const saved = saveSettings(value, storage);
    status.classList.toggle('is-error', !saved);
    setChildren(
      status,
      icon(saved ? 'i-ok' : 'i-warning', { size: 16 }),
      saved ? 'Đã lưu cài đặt' : 'Không lưu được, chỉ áp dụng cho lần chơi này',
    );
    actions.onChange({ ...value });
  }

  function range(iconId: IconId, label: string, hint: string, key: 'musicVolume' | 'sfxVolume'): { row: HTMLElement; sync(): void } {
    const id = uid(key);
    const out = h('span', { class: 'range-val', attrs: { 'aria-hidden': 'true' } });
    const input = h('input', { class: 'range', id, attrs: { type: 'range', min: 0, max: 100, step: 5, name: key } });
    const sync = (): void => {
      const pct = Math.round(value[key] * 100);
      input.value = String(pct);
      input.setAttribute('aria-valuetext', `${pct} phần trăm`);
      out.textContent = `${pct}%`;
    };
    input.addEventListener('input', () => {
      commit({ [key]: Number(input.value) / 100 });
      sync();
    });
    const row = h(
      'div',
      { class: 'set-row' },
      h('div', { class: 'field' }, h('label', { class: 'label', attrs: { for: id } }, icon(iconId), label), h('span', { class: 'hint', text: hint })),
      h('div', { class: 'range-wrap' }, input, out),
    );
    return { row, sync };
  }

  function seg<T extends string | number>(
    iconId: IconId,
    label: string,
    hint: string,
    name: string,
    options: readonly { value: T; label: string }[],
    get: () => T,
    set: (v: T) => void,
  ): { row: HTMLElement; sync(): void } {
    const labelId = uid(name);
    const group = uid(name);
    const radios = options.map((o) =>
      h('input', { attrs: { type: 'radio', name: group, value: String(o.value), 'data-setting': name }, on: { change: () => set(o.value) } }),
    );
    const sync = (): void => {
      radios.forEach((r, i) => (r.checked = options[i]!.value === get()));
    };
    const row = h(
      'div',
      { class: 'set-row' },
      h('div', { class: 'field' }, h('span', { class: 'label', id: labelId }, icon(iconId), label), h('span', { class: 'hint', text: hint })),
      h(
        'div',
        { class: 'seg', attrs: { role: 'radiogroup', 'aria-labelledby': labelId } },
        ...options.map((o, i) => h('label', { class: 'seg-opt' }, radios[i]!, h('span', { text: o.label }))),
      ),
    );
    return { row, sync };
  }

  const music = range('i-music', 'Nhạc nền', 'Nhạc nền trong quán.', 'musicVolume');
  const sfx = range('i-sound', 'Hiệu ứng', 'Chuông cửa, máy pha, tiếng tiền.', 'sfxVolume');
  const quality = seg(
    'i-quality',
    'Chất lượng đồ họa',
    'Thấp: không bóng đổ, phố thưa. Cao: bóng đổ, phố đông xe và người.',
    'quality',
    QUALITY_OPTIONS,
    () => value.quality,
    (q) => commit({ quality: q }),
  );
  const motion = seg(
    'i-rest',
    'Giảm chuyển động',
    'Tắt bớt hoạt họa. "Theo máy" dùng cài đặt của hệ điều hành.',
    'reducedMotion',
    MOTION_OPTIONS,
    () => value.reducedMotion,
    (m) => commit({ reducedMotion: m }),
  );
  const cameraKeys = seg(
    'i-camera',
    'Kiểu phím camera',
    'Chọn cụm phím di chuyển và xoay camera.',
    'cameraKeys',
    CAMERA_KEY_OPTIONS,
    () => value.cameraKeys,
    (k) => {
      commit({ cameraKeys: k });
      syncKeys();
    },
  );
  const rotate = seg(
    'i-camera',
    'Tốc độ xoay camera',
    'Khi kéo chuột và giữ phím xoay.',
    'cameraRotateSpeed',
    ROTATE_OPTIONS,
    () => value.cameraRotateSpeed,
    (r) => commit({ cameraRotateSpeed: r }),
  );
  const speed = seg(
    'i-speed-2',
    'Tốc độ mặc định khi mở cửa',
    'Đổi nhanh bằng phím 1 / 2 / 3 trên HUD.',
    'speed',
    SPEED_OPTIONS,
    () => value.gameSpeed,
    (s) => commit({ gameSpeed: s }),
  );

  const keysList = h('div', { class: 'keys' });

  function syncKeys(): void {
    const wasd = value.cameraKeys === 'qe-wasd';
    keysList.replaceChildren(
      h('span', { text: wasd ? 'W A S D / mũi tên: di chuyển camera' : 'Mũi tên: di chuyển camera' }),
      h('span', { text: wasd ? 'Q E: xoay camera' : 'Q A (hoặc E): xoay camera' }),
      h('span', { text: 'Kéo chuột trái: xoay · Cuộn: thu phóng' }),
      h('span', { text: 'Space: tạm dừng · 1 2 3: tốc độ 1x 2x 4x' }),
      h('span', { text: 'Home: đặt lại camera' }),
      h('span', { text: 'Esc: đóng panel / mở Tạm dừng' }),
    );
  }

  function syncAll(): void {
    music.sync();
    sfx.sync();
    quality.sync();
    motion.sync();
    cameraKeys.sync();
    rotate.sync();
    speed.sync();
    syncKeys();
  }

  // "Về mặc định": first click arms it (label changes for RESET_CONFIRM_MS),
  // a second click within that window resets. One signal changes: the text.
  let resetArmed = false;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const resetBtn = h('button', { class: 'btn btn-secondary', attrs: { type: 'button' } });
  function paintReset(): void {
    setChildren(resetBtn, icon('i-reset'), resetArmed ? 'Bấm lần nữa để đặt lại' : 'Về mặc định');
  }
  function disarmReset(): void {
    resetArmed = false;
    if (resetTimer !== null) clearTimeout(resetTimer);
    resetTimer = null;
    paintReset();
  }
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      paintReset();
      resetTimer = setTimeout(disarmReset, RESET_CONFIRM_MS);
      return;
    }
    disarmReset();
    commit({ ...DEFAULT_SETTINGS });
    syncAll();
  });
  paintReset();

  // Số liệu chơi: where the player last stopped, the raw JSON and its export.
  const playLogTitleId = uid('set-playlog');
  const playLogSummary = h('p', { class: 'playlog-summary' });
  const playLogPre = h('pre', { class: 'playlog-json' });
  // Export and "Xoá" report here, next to their buttons. aria-live rather than
  // role="status": the form's own status line stays the first one.
  const playLogNote = h('span', { class: 'status-line playlog-note', attrs: { 'aria-live': 'polite' } });
  function notePlayLog(ok: boolean, text: string): void {
    playLogNote.classList.toggle('is-error', !ok);
    setChildren(playLogNote, icon(ok ? 'i-ok' : 'i-warning', { size: 16 }), text);
  }
  function syncPlayLog(): void {
    const read = readPlayLogStatus(storage);
    playLogSummary.classList.toggle('is-error', !read.ok);
    if (!read.ok) {
      playLogSummary.setAttribute('role', 'alert');
      setChildren(
        playLogSummary,
        icon('i-warning', { size: 16 }),
        'Không đọc được số liệu chơi: trình duyệt chặn bộ nhớ hoặc dữ liệu hỏng. Thử tắt chế độ ẩn danh hoặc bấm Xoá để ghi lại từ đầu.',
      );
    } else {
      playLogSummary.removeAttribute('role');
      const last = read.entries.at(-1);
      playLogSummary.textContent = last
        ? `Lần dừng gần nhất: Ngày ${last.day} · ${playLogPhaseLabel(last.phase)} · ${formatClock(last.minute)} (giờ game) · ${formatSavedAt(last.at)}`
        : 'Chưa có dữ liệu';
    }
    playLogPre.textContent = exportPlayLog(storage);
  }

  // Where blob URLs are missing or refuse the Blob (jsdom, locked-down browsers)
  // the JSON is still readable in "Xem JSON".
  function downloadPlayLog(): void {
    const failed = (): void => notePlayLog(false, 'Không tải được file, hãy chép JSON trong mục Xem JSON');
    if (typeof URL.createObjectURL !== 'function') return failed();
    let href: string;
    try {
      href = URL.createObjectURL(new Blob([exportPlayLog(storage)], { type: 'application/json' }));
    } catch {
      return failed();
    }
    setChildren(playLogNote);
    const link = h('a', { attrs: { href, download: `playlog-${dateStamp(Date.now())}.json` } });
    link.hidden = true;
    form.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
  const exportBtn = h(
    'button',
    { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: downloadPlayLog } },
    icon('i-save'),
    'Xuất JSON',
  );

  // "Xoá" confirms in place like "Về mặc định".
  let clearArmed = false;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  const clearBtn = h('button', { class: 'btn btn-secondary', attrs: { type: 'button' } });
  function paintClear(): void {
    setChildren(clearBtn, icon('i-delete'), clearArmed ? 'Bấm lần nữa để xoá' : 'Xoá');
  }
  function disarmClear(): void {
    clearArmed = false;
    if (clearTimer !== null) clearTimeout(clearTimer);
    clearTimer = null;
    paintClear();
  }
  clearBtn.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      paintClear();
      clearTimer = setTimeout(disarmClear, RESET_CONFIRM_MS);
      return;
    }
    disarmClear();
    const cleared = clearPlayLog(storage);
    notePlayLog(
      cleared,
      cleared
        ? 'Đã xoá số liệu chơi'
        : 'Không xoá được số liệu chơi: trình duyệt chặn bộ nhớ. Thử tắt chế độ ẩn danh hoặc cho phép trang lưu dữ liệu, rồi bấm Xoá lại.',
    );
    syncPlayLog();
  });
  paintClear();

  const playLogGroup = h(
    'section',
    { class: 'set-group playlog', attrs: { 'aria-labelledby': playLogTitleId } },
    h('p', { class: 'playlog-title', id: playLogTitleId, text: 'Số liệu chơi' }),
    playLogSummary,
    h('p', { class: 'hint', text: 'Chỉ lưu trên máy này, không có thông tin cá nhân.' }),
    h('details', { class: 'keys-details playlog-details' }, h('summary', {}, icon('i-chevron-down', { size: 16 }), 'Xem JSON'), playLogPre),
    h('div', { class: 'playlog-actions' }, exportBtn, clearBtn),
    playLogNote,
  );

  function group(title: string, ...rows: HTMLElement[]): HTMLElement {
    const id = uid('set-group');
    return h('section', { class: 'set-group', attrs: { 'aria-labelledby': id } }, h('p', { class: 'section-title', id, text: title }), ...rows);
  }

  // Title and footer stay put; only .settings-body scrolls (see ui.css).
  const done = h('button', { class: 'btn btn-primary', attrs: { type: 'button' }, on: { click: () => actions.onBack() } }, 'Xong');
  const form = h(
    'form',
    { class: 'card w-wide settings-sheet', attrs: { 'aria-labelledby': titleId } },
    h('div', { class: 'settings-head' }, h('h2', { id: titleId }, icon('i-settings', { size: 32 }), 'Cài đặt')),
    h(
      'div',
      { class: 'settings-body' },
      group('Âm thanh', music.row, sfx.row),
      group('Hiển thị', quality.row, motion.row),
      group(
        'Điều khiển',
        cameraKeys.row,
        rotate.row,
        h('details', { class: 'keys-details' }, h('summary', {}, icon('i-chevron-down', { size: 16 }), 'Phím tắt'), keysList),
      ),
      group('Trò chơi', speed.row),
      playLogGroup,
      h('p', { class: 'hint app-version', text: `Phiên bản ${VERSION_LABEL}` }),
    ),
    h('div', { class: 'foot settings-foot' }, status, resetBtn, done),
  );
  form.addEventListener('submit', (e) => e.preventDefault());

  const el = screenLayer(form, { variant: 'scrim', label: 'Cài đặt', modal: true });
  el.classList.add('is-sheet');
  return {
    el,
    get value() {
      return { ...value };
    },
    apply(patch) {
      value = { ...value, ...patch };
      saveSettings(value, storage);
      syncAll();
      actions.onChange({ ...value });
    },
    onShow: () => {
      status.textContent = '';
      setChildren(playLogNote);
      disarmReset();
      disarmClear();
      syncAll();
      syncPlayLog();
    },
    initialFocus: () => form.querySelector<HTMLElement>('input'),
    onEscape: () => {
      actions.onBack();
      return true;
    },
  };
}
