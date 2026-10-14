import type { SaveSlot } from '../../save/save';
import { h, setChildren, uid } from '../core/dom';
import { icon } from '../core/icons';
import { screenLayer, type Screen } from '../core/screens';

export interface PauseActions {
  onResume(): void;
  /** Saves into a manual slot; returns an error message or null on success. */
  onSave(slot: SaveSlot): string | null;
  onSettings(): void;
  onMenu(): void;
  /** "Ngày 12 · 11:42 · Cao điểm" */
  subtitle(): string;
}

const MANUAL_SLOTS: readonly SaveSlot[] = ['1', '2', '3'];

/** Pause overlay: resume, save into slot 1–3 in place, settings, back to the main menu. */
export function createPause(actions: PauseActions): Screen {
  const titleId = uid('pause-t');
  const sub = h('p', { class: 'card-sub' });
  const status = h('p', { class: 'status-line', attrs: { role: 'status', style: 'margin-top:var(--space-3)' } });
  const resume = h(
    'button',
    { class: 'btn btn-primary btn-block', attrs: { type: 'button' }, on: { click: () => actions.onResume() } },
    icon('i-speed-1'),
    'Tiếp tục',
    h('kbd', { text: 'Space' }),
  );
  const saveLabelId = uid('save-l');
  const saveRow = h(
    'div',
    { class: 'save-row', attrs: { role: 'group', 'aria-labelledby': saveLabelId } },
    h('span', { class: 'label', id: saveLabelId }, icon('i-save'), 'Lưu ngay vào'),
    ...MANUAL_SLOTS.map((slot) =>
      h(
        'button',
        {
          class: 'btn btn-secondary',
          attrs: { type: 'button', 'data-save-slot': slot, 'aria-label': `Lưu vào slot ${slot}` },
          on: {
            click: () => {
              const error = actions.onSave(slot);
              status.classList.toggle('is-error', error !== null);
              setChildren(status, icon(error ? 'i-warning' : 'i-ok', { size: 16 }), error ?? `Đã lưu vào Slot ${slot}`);
            },
          },
        },
        `Slot ${slot}`,
      ),
    ),
  );
  const card = h(
    'div',
    { class: 'card w-pause' },
    h('h2', { id: titleId }, icon('i-pause', { size: 32 }), 'Đang tạm dừng'),
    sub,
    h(
      'div',
      { class: 'stack', attrs: { style: 'margin-top:var(--space-6)' } },
      resume,
      saveRow,
      h('button', { class: 'btn btn-secondary btn-block', attrs: { type: 'button' }, on: { click: () => actions.onSettings() } }, icon('i-settings'), 'Cài đặt'),
      h('button', { class: 'btn btn-secondary btn-block', attrs: { type: 'button' }, on: { click: () => actions.onMenu() } }, icon('i-home'), 'Về Main Menu'),
    ),
    status,
  );
  const el = screenLayer(card, { variant: 'scrim', modal: true, label: 'Đang tạm dừng' });
  el.setAttribute('aria-labelledby', titleId);
  el.removeAttribute('aria-label');
  return {
    el,
    onShow: () => {
      sub.textContent = actions.subtitle();
      status.textContent = '';
    },
    initialFocus: () => resume,
    onEscape: () => {
      actions.onResume();
      return true;
    },
  };
}
