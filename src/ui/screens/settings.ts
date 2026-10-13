import { DEFAULT_SETTINGS, saveSettings, type GameSpeed, type Quality, type Settings } from '../../save/settings';
import type { StorageLike } from '../../save/storage';
import { h, uid } from '../core/dom';
import { screenLayer, type Screen } from '../core/screens';

export interface SettingsActions {
  /** Called after every change, already saved; apply it to audio, renderer and game. */
  onChange(settings: Settings): void;
  onBack(): void;
}

export interface SettingsScreen extends Screen {
  /** Current values shown by the form. */
  readonly value: Settings;
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

/**
 * Settings: music and SFX volume, graphics quality, game speed and camera
 * keys. Every change applies at once and is saved; there is no Save button.
 */
export function createSettings(storage: StorageLike, initial: Settings, actions: SettingsActions): SettingsScreen {
  let value: Settings = { ...initial };
  const titleId = uid('set-title');
  const status = h('span', { class: 'status-line', attrs: { role: 'status' } });

  function commit(patch: Partial<Settings>): void {
    value = { ...value, ...patch };
    const saved = saveSettings(value, storage);
    status.classList.toggle('is-error', !saved);
    status.textContent = saved ? '✓ Đã lưu cài đặt' : '⚠️ Không lưu được, chỉ áp dụng cho lần chơi này';
    actions.onChange({ ...value });
  }

  function range(label: string, key: 'musicVolume' | 'sfxVolume'): { row: HTMLElement; sync(): void } {
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
    const row = h('div', { class: 'set-row' }, h('label', { class: 'label', attrs: { for: id }, text: label }), h('div', { class: 'range-wrap' }, input, out));
    return { row, sync };
  }

  function seg<T extends string | number>(
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
      h('div', { class: 'field' }, h('span', { class: 'label', id: labelId, text: label }), h('span', { class: 'hint', text: hint })),
      h(
        'div',
        { class: 'seg', attrs: { role: 'radiogroup', 'aria-labelledby': labelId } },
        ...options.map((o, i) => h('label', { class: 'seg-opt' }, radios[i]!, h('span', { text: o.label }))),
      ),
    );
    return { row, sync };
  }

  const music = range('🎵 Nhạc nền', 'musicVolume');
  const sfx = range('🔔 Hiệu ứng (chuông cửa, máy pha, tiền)', 'sfxVolume');
  const quality = seg(
    '🖥️ Chất lượng',
    'Thấp: không bóng đổ, phố thưa. Cao: bóng đổ, phố đông xe và người.',
    'quality',
    QUALITY_OPTIONS,
    () => value.quality,
    (q) => commit({ quality: q }),
  );
  const speed = seg(
    '⏩ Tốc độ khi mở cửa',
    'Có thể đổi bất cứ lúc nào trên HUD.',
    'speed',
    SPEED_OPTIONS,
    () => value.gameSpeed,
    (s) => commit({ gameSpeed: s }),
  );

  const panLabelId = uid('pan-l');
  const panState = h('span', { class: 'toggle-state' });
  const panToggle = h(
    'button',
    {
      class: 'toggle',
      attrs: { type: 'button', role: 'switch', 'aria-labelledby': panLabelId, name: 'cameraKeys' },
      on: {
        click: () => {
          commit({ cameraKeys: value.cameraKeys === 'qe-wasd' ? 'qa-arrows' : 'qe-wasd' });
          syncKeys();
        },
      },
    },
    h('span', { class: 'toggle-track', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'toggle-thumb' })),
    panState,
  );
  const keysList = h('div', { class: 'keys' });

  function syncKeys(): void {
    const wasd = value.cameraKeys === 'qe-wasd';
    panToggle.setAttribute('aria-checked', String(wasd));
    panState.textContent = wasd ? 'Bật' : 'Tắt';
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
    speed.sync();
    syncKeys();
  }

  const done = h('button', { class: 'btn btn-primary', attrs: { type: 'button' }, on: { click: () => actions.onBack() } }, 'Xong');
  const form = h(
    'form',
    { class: 'card w-wide', attrs: { 'aria-labelledby': titleId } },
    h('h2', { id: titleId, text: '⚙️ Cài đặt' }),
    h('p', { class: 'section-title', text: 'Âm thanh' }),
    music.row,
    sfx.row,
    h('p', { class: 'section-title', text: 'Đồ họa' }),
    quality.row,
    h('p', { class: 'section-title', text: 'Trò chơi' }),
    speed.row,
    h(
      'div',
      { class: 'set-row' },
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'label', id: panLabelId, text: '⌨️ Di chuyển camera bằng WASD' }),
        h('span', { class: 'hint', text: 'Tắt để dùng Q/A xoay camera như phím gốc; khi bật, xoay bằng Q/E.' }),
      ),
      panToggle,
    ),
    h('p', { class: 'section-title', text: 'Phím tắt' }),
    keysList,
    h(
      'div',
      { class: 'foot' },
      status,
      h(
        'button',
        {
          class: 'btn btn-secondary',
          attrs: { type: 'button' },
          on: {
            click: () => {
              commit({ ...DEFAULT_SETTINGS });
              syncAll();
            },
          },
        },
        '↺ Về mặc định',
      ),
      done,
    ),
  );
  form.addEventListener('submit', (e) => e.preventDefault());

  const el = screenLayer(form, { variant: 'scrim', label: 'Cài đặt', modal: true });
  return {
    el,
    get value() {
      return { ...value };
    },
    onShow: () => {
      status.textContent = '';
      syncAll();
    },
    initialFocus: () => form.querySelector<HTMLElement>('input'),
    onEscape: () => {
      actions.onBack();
      return true;
    },
  };
}
