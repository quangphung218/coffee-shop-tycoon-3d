import { DIFFICULTIES } from '../../sim/data/difficulty';
import type { SlotInfo } from '../../save/slots';
import type { Difficulty } from '../../sim/types';
import { h, isAriaDisabled, uid } from '../core/dom';
import { formatMoney } from '../core/format';
import { icon, type IconId } from '../core/icons';
import { SceneGate } from '../core/sceneGate';
import { screenLayer, type Screen } from '../core/screens';

export const SHOP_NAME_MIN = 1;
export const SHOP_NAME_MAX = 24;

const NAME_ERROR = `Nhập tên quán, từ ${SHOP_NAME_MIN} đến ${SHOP_NAME_MAX} ký tự`;

/** Returns the error message for a shop name, or null when it is fine. Spaces at the ends do not count. */
export function validateShopName(name: string): string | null {
  const length = [...name.trim()].length;
  return length < SHOP_NAME_MIN || length > SHOP_NAME_MAX ? NAME_ERROR : null;
}

const DIFFICULTY_TEXT: Record<Difficulty, { icon: IconId; note: string }> = {
  easy: { icon: 'i-easy', note: 'Khách đông và kiên nhẫn hơn, giá nhập rẻ' },
  normal: { icon: 'i-cup-hot', note: 'Cân bằng, nên chọn lần đầu' },
  hard: { icon: 'i-flame', note: 'Khách khó tính, giá nhập cao hơn' },
};

export interface NewGameActions {
  onStart(shopName: string, difficulty: Difficulty): void;
  onBack(): void;
  /** The autosave this run will overwrite at the end of day 1 with no free slot to keep it (save.ts autosaveAtRisk). */
  autosaveAtRisk?(): SlotInfo | null;
}

/** New Game form: shop name with inline validation, Easy/Normal/Hard with starting money. */
export function createNewGame(actions: NewGameActions, scene: SceneGate = new SceneGate()): Screen {
  const inputId = uid('shop-name');
  const hintId = uid('shop-hint');
  const countId = uid('shop-count');
  const errId = uid('shop-err');
  const titleId = uid('ng-title');

  const input = h('input', {
    class: 'input',
    id: inputId,
    attrs: { type: 'text', name: 'shop-name', maxlength: SHOP_NAME_MAX, autocomplete: 'off', 'aria-describedby': `${hintId} ${countId}` },
    props: { value: 'Cà Phê Gió Mùa' },
  });
  const count = h('span', { class: 'hint', id: countId });
  const errMsg = h('span', { class: 'error-msg', id: errId, hidden: true }, icon('i-error', { size: 16 }), `Lỗi: ${NAME_ERROR}`);
  const field = h(
    'div',
    { class: 'field' },
    h('label', { class: 'label', attrs: { for: inputId }, text: 'Tên quán' }),
    h('span', { class: 'hint', id: hintId, text: `${SHOP_NAME_MIN}–${SHOP_NAME_MAX} ký tự. Hiện trên biển hiệu, báo cáo và bản lưu.` }),
    errMsg,
    input,
    count,
  );
  const summaryLink = h('a', {
    attrs: { href: `#${inputId}` },
    text: NAME_ERROR,
    on: {
      click: (e) => {
        e.preventDefault();
        input.focus();
      },
    },
  });
  const summary = h(
    'div',
    { class: 'error-summary', hidden: true, attrs: { role: 'alert', tabindex: -1 } },
    h('h3', {}, icon('i-warning'), 'Cần sửa 1 mục trước khi bắt đầu'),
    h('ul', {}, h('li', {}, summaryLink)),
  );

  const radios: HTMLInputElement[] = [];
  const choices = (Object.keys(DIFFICULTIES) as Difficulty[]).map((id) => {
    const def = DIFFICULTIES[id];
    const radio = h('input', { attrs: { type: 'radio', name: 'difficulty', value: id }, props: { checked: id === 'normal' } });
    radios.push(radio);
    return h(
      'label',
      { class: 'choice' },
      radio,
      h('span', { class: 'choice-title' }, icon(DIFFICULTY_TEXT[id].icon), def.name),
      h('span', { class: 'choice-meta', attrs: { 'data-start-money': def.startMoney }, text: `Vốn ${formatMoney(def.startMoney)}` }),
      h('span', { class: 'choice-meta', text: DIFFICULTY_TEXT[id].note }),
      h('span', { class: 'choice-check' }, icon('i-check', { size: 16 }), 'Đang chọn'),
    );
  });

  function setError(message: string | null): void {
    const bad = message !== null;
    field.classList.toggle('field-error', bad);
    errMsg.hidden = !bad;
    summary.hidden = !bad;
    if (bad) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${hintId} ${errId} ${countId}`);
    } else {
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', `${hintId} ${countId}`);
    }
  }

  function updateCount(): void {
    count.textContent = `${[...input.value.trim()].length}/${SHOP_NAME_MAX} ký tự`;
  }

  input.addEventListener('input', () => {
    updateCount();
    // Clear the error as soon as the name becomes valid; new errors wait for submit or blur.
    if (!field.classList.contains('field-error')) return;
    if (validateShopName(input.value) === null) setError(null);
  });
  input.addEventListener('blur', () => {
    if (input.value.length > 0) setError(validateShopName(input.value));
  });

  // Every slot is taken: say which game the first autosave replaces.
  const atRisk = h('p', { class: 'hint', hidden: true, attrs: { 'data-autosave-warning': '' } });
  function showAtRisk(): void {
    const info = actions.autosaveAtRisk?.() ?? null;
    atRisk.hidden = info === null;
    if (!info) return;
    const game = info.shopName ? `ván ${info.shopName} (ngày ${info.day})` : 'một ván không đọc được';
    atRisk.replaceChildren(
      icon('i-warning', { size: 16 }),
      `Ô Tự lưu đang giữ ${game}, Slot 1–3 đều đã có ván. Hết ngày 1, ván mới sẽ ghi đè ô Tự lưu. Muốn giữ ván cũ thì xoá một slot trong Tải game trước.`,
    );
  }

  const startBtn = h('button', { class: 'btn btn-primary', attrs: { type: 'submit' } }, 'Bắt đầu ngày 1', icon('i-forward'));
  // Starting drops straight into the shop, so it waits for the 3D scene.
  scene.bind(startBtn);

  const form = h(
    'form',
    { class: 'card w-form', attrs: { 'aria-labelledby': titleId, novalidate: true } },
    h('h2', { id: titleId }, icon('i-sparkle', { size: 32 }), 'Ván mới'),
    h('p', { class: 'card-sub', text: 'Đặt tên quán và chọn độ khó. Âm lượng, đồ họa đổi sau trong Cài đặt.' }),
    h(
      'div',
      { class: 'stack', attrs: { style: 'margin-top:var(--space-6);gap:var(--space-6)' } },
      summary,
      field,
      h('fieldset', {}, h('legend', { text: 'Độ khó' }), h('div', { class: 'choice-grid' }, ...choices)),
    ),
    atRisk,
    scene.statusLine(),
    h(
      'div',
      { class: 'foot' },
      h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => actions.onBack() } }, icon('i-back'), 'Quay lại'),
      startBtn,
    ),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Enter in the name field submits too; the shop opens once the scene is ready.
    if (isAriaDisabled(startBtn)) return;
    const error = validateShopName(input.value);
    setError(error);
    if (error) {
      summary.focus();
      return;
    }
    const difficulty = (radios.find((r) => r.checked)?.value ?? 'normal') as Difficulty;
    actions.onStart(input.value.trim(), difficulty);
  });

  const el = screenLayer(form, { label: 'Ván mới' });
  return {
    el,
    onShow: () => {
      setError(null);
      updateCount();
      showAtRisk();
    },
    initialFocus: () => input,
    onEscape: () => {
      actions.onBack();
      return true;
    },
  };
}
