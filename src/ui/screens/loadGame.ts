import { deleteSave, listSlots, loadGame, type SaveErrorKind, type SaveSlot, type SlotInfo } from '../../save/save';
import type { StorageLike } from '../../save/storage';
import type { GameState } from '../../sim/types';
import { h, isAriaDisabled, setChildren, uid } from '../core/dom';
import { formatMoney, formatSavedAt } from '../core/format';
import { icon } from '../core/icons';
import { SceneGate } from '../core/sceneGate';
import { screenLayer, type Screen } from '../core/screens';

export interface LoadGameActions {
  onLoaded(state: GameState, slot: SaveSlot): void;
  onBack(): void;
}

export function slotLabel(slot: SaveSlot): string {
  return slot === 'auto' ? 'Tự lưu' : `Slot ${slot}`;
}

const BROKEN_TEXT: Record<SaveErrorKind, string> = {
  not_found: 'Slot này đang trống.',
  corrupt: 'Dữ liệu bị ghi dở hoặc hỏng.',
  invalid: 'Dữ liệu thiếu thông tin cần thiết.',
  version_unsupported: 'Bản lưu từ phiên bản game mới hơn.',
  storage: 'Trình duyệt không cho đọc bộ nhớ.',
};

/**
 * Load Game: the autosave first, then slots 1–3. A broken slot says what is
 * wrong and keeps its data; deleting it is a separate, confirmed action done
 * in place (focus lands on "Hủy" first).
 */
export function createLoadGame(storage: StorageLike, actions: LoadGameActions, scene: SceneGate = new SceneGate()): Screen {
  const titleId = uid('load-title');
  const list = h('ul', { class: 'slots stack' });
  const back = h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => actions.onBack() } }, icon('i-back'), 'Quay lại');
  const card = h(
    'div',
    { class: 'card w-wide', attrs: { role: 'region', 'aria-labelledby': titleId } },
    h('h2', { id: titleId }, icon('i-load', { size: 32 }), 'Tải game'),
    h('p', { class: 'card-sub', text: 'Dữ liệu lưu trong trình duyệt này (localStorage). Xóa dữ liệu trình duyệt sẽ mất bản lưu.' }),
    list,
    scene.statusLine(),
    h('div', { class: 'foot' }, back),
  );

  function load(info: SlotInfo, item: HTMLElement): void {
    const r = loadGame(info.slot, storage);
    if (r.ok) {
      actions.onLoaded(r.value, info.slot);
      return;
    }
    // Loading failed after the list was built: say so in the slot, keep the data.
    item.className = 'slot slot-broken';
    const msg = h('div', { class: 'reason reason-danger', attrs: { role: 'alert' } }, icon('i-error', { size: 16 }), `Không mở được bản lưu. ${BROKEN_TEXT[r.error.kind]}`);
    item.querySelector('.slot-detail')?.replaceWith(msg);
  }

  function confirmDelete(info: SlotInfo, actionsRow: HTMLElement): void {
    const label = slotLabel(info.slot);
    const cancel = h('button', { class: 'btn btn-secondary', attrs: { type: 'button' } }, 'Hủy');
    const confirm = h('button', { class: 'btn btn-danger', attrs: { type: 'button' } }, icon('i-delete'), 'Xóa vĩnh viễn');
    const box = h(
      'div',
      { class: 'confirm', attrs: { role: 'group', 'aria-label': `Xác nhận xóa ${label}` } },
      h('p', {}, icon('i-delete'), `Xóa ${label}? Không hoàn tác được.`),
      cancel,
      confirm,
    );
    cancel.addEventListener('click', () => {
      box.replaceWith(actionsRow);
      actionsRow.querySelector<HTMLElement>('.btn-danger')?.focus();
    });
    confirm.addEventListener('click', () => {
      deleteSave(info.slot, storage);
      render();
      list.querySelector<HTMLElement>('button')?.focus();
    });
    actionsRow.replaceWith(box);
    cancel.focus();
  }

  function slotItem(info: SlotInfo, newest: boolean): HTMLElement {
    const label = slotLabel(info.slot);
    const item = h('li', { class: 'slot', attrs: { 'data-slot': info.slot } });
    const actionsRow = h('div', { class: 'slot-actions' });
    if (info.empty) {
      item.classList.add('slot-empty');
      item.append(
        h('div', { class: 'slot-thumb', attrs: { 'aria-hidden': 'true' } }, icon('i-dot-empty', { size: 32 })),
        h('div', {}, h('div', { class: 'slot-title' }, label, h('span', { class: 'badge badge-neutral', text: 'Trống' })), h('div', { class: 'slot-meta', text: 'Chưa có ván nào ở đây.' })),
      );
      return item;
    }
    const del = h('button', { class: 'btn btn-danger', attrs: { type: 'button' }, on: { click: () => confirmDelete(info, actionsRow) } }, icon('i-delete'), `Xóa ${label}`);
    if (info.error) {
      const reasonId = uid('r-broken');
      item.classList.add('slot-broken');
      item.append(
        h('div', { class: 'slot-thumb', attrs: { 'aria-hidden': 'true' } }, icon('i-warning', { size: 32 })),
        h(
          'div',
          {},
          h('div', { class: 'slot-title' }, label, h('span', { class: 'badge badge-danger' }, icon('i-error', { size: 16 }), 'Hỏng')),
          h('div', { text: `Không đọc được dữ liệu của slot này. ${BROKEN_TEXT[info.error]}` }),
          h('div', { class: 'slot-meta', text: 'Dữ liệu vẫn được giữ nguyên; slot khác vẫn dùng được.' }),
        ),
      );
      actionsRow.append(
        h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'aria-disabled': 'true', 'aria-describedby': reasonId } }, icon('i-lock'), `Tải ${label.toLowerCase()}`),
        del,
      );
      item.append(
        actionsRow,
        h('p', { class: 'reason reason-danger', id: reasonId, attrs: { style: 'grid-column:1/-1' } }, icon('i-lock', { size: 16 }), 'Không tải được vì dữ liệu hỏng.'),
      );
      return item;
    }
    item.append(
      h('div', { class: 'slot-thumb', attrs: { 'aria-hidden': 'true' } }, icon('i-cup-hot', { size: 32 })),
      h(
        'div',
        { class: 'slot-detail' },
        h('div', { class: 'slot-title' }, label, newest ? h('span', { class: 'badge badge-ok' }, icon('i-ok', { size: 16 }), 'Mới nhất') : null),
        h('div', { text: `${info.shopName ?? ''} · Ngày ${info.day ?? 1}` }),
        h(
          'div',
          { class: 'slot-meta' },
          icon('i-coin', { size: 16 }),
          `${formatMoney(info.money ?? 0)}${info.savedAt ? ` · Lưu ${formatSavedAt(info.savedAt)}` : ''}`,
        ),
      ),
    );
    const loadBtn = h(
      'button',
      { class: 'btn btn-primary', attrs: { type: 'button' }, on: { click: () => !isAriaDisabled(loadBtn) && load(info, item) } },
      icon('i-speed-1'),
      `Tải ${label.toLowerCase()}`,
    );
    // Loading drops straight into the shop, so it waits for the 3D scene.
    scene.bind(loadBtn);
    actionsRow.append(loadBtn);
    if (info.slot !== 'auto') actionsRow.append(del);
    item.append(actionsRow);
    return item;
  }

  function render(): void {
    const slots = listSlots(storage);
    let newest: SaveSlot | null = null;
    let newestAt = -1;
    for (const s of slots) {
      if (!s.empty && !s.error && (s.savedAt ?? 0) > newestAt) {
        newest = s.slot;
        newestAt = s.savedAt ?? 0;
      }
    }
    setChildren(list, ...slots.map((s) => slotItem(s, s.slot === newest)));
  }

  const el = screenLayer(card, { label: 'Tải game' });
  return {
    el,
    onShow: render,
    initialFocus: () => list.querySelector<HTMLElement>('.btn-primary') ?? back,
    onEscape: () => {
      actions.onBack();
      return true;
    },
  };
}
