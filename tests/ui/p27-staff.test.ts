// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch as simDispatch } from '../../src/sim';
import { STAFF_TRAITS } from '../../src/sim/data/staffTraits';
import { createNewGame } from '../../src/sim/state';
import { MAX_STAFF_LEVEL, maxStaff, STAFF_LEVEL_EXP, staffTraitOf, trainCost } from '../../src/sim/staffGrowth';
import type { Command, GameState, Staff } from '../../src/sim/types';
import { formatMoney } from '../../src/ui/core/format';
import type { PanelContext, PanelHandle } from '../../src/ui/hud/panels';
import { renderStaffPanel } from '../../src/ui/panels/staff';

interface Mounted {
  body: HTMLElement;
  sent: Command[];
  handle: PanelHandle | void;
}

function mount(state: GameState): Mounted {
  const body = document.createElement('div');
  document.body.append(body);
  const sent: Command[] = [];
  const ctx: PanelContext = {
    dispatch: (cmd) => {
      sent.push(cmd);
      return simDispatch(state, cmd);
    },
    getState: () => state,
    close: () => {},
  };
  return { body, sent, handle: renderStaffPanel(body, ctx) };
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

/** A new game with one barista hired; returns the state and the hire. */
function withHire(): { state: GameState; member: Staff } {
  const state = createNewGame('Quán Thử', 'normal', 42);
  simDispatch(state, { type: 'hire_staff', candidateId: state.candidates[0]!.id, role: 'barista' });
  return { state, member: state.staff[0]! };
}

const reasonOf = (body: HTMLElement, btn: HTMLElement): string => {
  const ids = (btn.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => body.querySelector(`#${id}`)?.textContent ?? '').join(' ');
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('P27 staff panel', () => {
  it('shows the trait chip with its effect on staff and candidate rows', () => {
    const { state, member } = withHire();
    const { body } = mount(state);
    const trait = STAFF_TRAITS[staffTraitOf(state, member)];
    const chip = q(body, `li[data-staff="${member.id}"] [data-trait]`);
    expect(chip.textContent).toBe(trait.name);
    expect(chip.getAttribute('title')).toBe(trait.description);
    const cand = state.candidates[0]!;
    const cchip = q(body, `li[data-candidate="${cand.id}"] [data-trait]`);
    expect(cchip.getAttribute('data-trait')).toBe(cand.trait);
    expect(cchip.textContent).toBe(STAFF_TRAITS[cand.trait!].name);
  });

  it('gives staff from an old save the hashed trait without writing it', () => {
    const { state, member } = withHire();
    delete member.trait;
    delete state.retention;
    const { body } = mount(state);
    expect(q(body, `li[data-staff="${member.id}"] [data-trait]`).getAttribute('data-trait')).toBe(staffTraitOf(state, member));
    expect(member.trait).toBeUndefined();
    expect(state.retention).toBeUndefined();
  });

  it('shows the level and an experience progressbar that follows the sim', () => {
    const { state, member } = withHire();
    member.exp = 120;
    const { body, handle } = mount(state);
    const row = q(body, `li[data-staff="${member.id}"]`);
    expect(row.textContent).toContain(`Cấp 1/${MAX_STAFF_LEVEL} · KN 120/${STAFF_LEVEL_EXP[1]}`);
    const bar = q(row, '[role="progressbar"]');
    expect(bar.classList.contains('progress')).toBe(true);
    expect(bar.getAttribute('aria-label')).toContain(member.name);
    expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.round((120 / STAFF_LEVEL_EXP[1]!) * 100)));
    expect(q(bar, 'span').style.width).toBe(`${Math.round((120 / STAFF_LEVEL_EXP[1]!) * 100)}%`);

    member.exp = 600.7;
    member.level = 3;
    handle!.update!(state);
    expect(row.textContent).toContain(`Cấp 3/${MAX_STAFF_LEVEL} · KN 600/${STAFF_LEVEL_EXP[3]}`);
    member.level = MAX_STAFF_LEVEL;
    handle!.update!(state);
    expect(row.textContent).toContain(`Cấp ${MAX_STAFF_LEVEL}/${MAX_STAFF_LEVEL} · KN tối đa`);
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
  });

  it('locks Đào tạo with the canTrain reason', () => {
    const { state, member } = withHire();
    const { body, handle } = mount(state);
    const btn = q<HTMLButtonElement>(body, `li[data-staff="${member.id}"] [data-action="train"]`);
    expect(btn.getAttribute('aria-label')).toContain(member.name);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(body, btn)).toContain(`${member.name} chưa đủ kinh nghiệm lên cấp 2`);
    btn.click();
    expect(body.querySelector('.confirm')).toBeNull();

    member.exp = STAFF_LEVEL_EXP[1];
    state.money = 0;
    handle!.update!(state);
    expect(reasonOf(body, btn)).toContain('Không đủ tiền đào tạo');

    state.money = 10_000_000;
    member.level = 3;
    member.exp = STAFF_LEVEL_EXP[3];
    handle!.update!(state);
    expect(btn.textContent).toBe(`Đào tạo · ${formatMoney(trainCost(member).money)} · 3 Tem`);
    expect(reasonOf(body, btn)).toContain('Cần 3 Tem để đào tạo lên cấp 4');

    state.phase = 'opening';
    handle!.update!(state);
    expect(reasonOf(body, btn)).toContain('Chỉ đào tạo nhân viên lúc chuẩn bị');

    member.level = MAX_STAFF_LEVEL;
    handle!.update!(state);
    expect(reasonOf(body, btn)).toContain('đã đạt cấp tối đa');
  });

  it('confirms in place and dispatches train_staff', () => {
    const { state, member } = withHire();
    member.exp = STAFF_LEVEL_EXP[1];
    state.money = 10_000_000;
    const { body, sent } = mount(state);
    const wage = member.wagePerDay;
    const btn = q<HTMLButtonElement>(body, `li[data-staff="${member.id}"] [data-action="train"]`);
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(btn.textContent).toBe(`Đào tạo · ${formatMoney(trainCost(member).money)}`);
    btn.click();
    const confirm = q(body, `li[data-staff="${member.id}"] .confirm`);
    expect(confirm.textContent).toContain(`Đào tạo ${member.name} lên cấp 2? Lương +8%, làm nhanh +6%.`);
    expect(btn.hidden).toBe(true);
    q<HTMLButtonElement>(confirm, '[data-action="confirm"]').click();
    expect(sent.at(-1)).toEqual({ type: 'train_staff', staffId: member.id });
    expect(member.level).toBe(2);
    expect(member.wagePerDay).toBeGreaterThan(wage);
    expect(q(body, `li[data-staff="${member.id}"]`).textContent).toContain('Cấp 2/5');
  });

  it('brings Đào tạo back after confirming so the next level can be trained', () => {
    const { state, member } = withHire();
    member.exp = STAFF_LEVEL_EXP[1];
    state.money = 10_000_000;
    const { body, sent, handle } = mount(state);
    const btn = q<HTMLButtonElement>(body, `li[data-staff="${member.id}"] [data-action="train"]`);
    btn.click();
    q<HTMLButtonElement>(body, '.confirm [data-action="confirm"]').click();
    expect(member.level).toBe(2);
    expect(q(body, `li[data-staff="${member.id}"] [data-action="train"]`)).toBe(btn);
    expect(btn.hidden).toBe(false);
    expect(document.activeElement).toBe(btn);

    member.exp = STAFF_LEVEL_EXP[2];
    handle!.update!(state);
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    btn.click();
    const confirm = q(body, `li[data-staff="${member.id}"] .confirm`);
    expect(confirm.textContent).toContain(`Đào tạo ${member.name} lên cấp 3?`);
    q<HTMLButtonElement>(confirm, '[data-action="confirm"]').click();
    expect(sent.filter((c) => c.type === 'train_staff')).toHaveLength(2);
    expect(member.level).toBe(3);
    expect(btn.hidden).toBe(false);
  });

  it('cancel closes the confirm and sends nothing', () => {
    const { state, member } = withHire();
    member.exp = STAFF_LEVEL_EXP[1];
    state.money = 10_000_000;
    const { body, sent } = mount(state);
    const before = sent.length;
    const btn = q<HTMLButtonElement>(body, `li[data-staff="${member.id}"] [data-action="train"]`);
    btn.click();
    q<HTMLButtonElement>(body, '.confirm [data-action="cancel"]').click();
    expect(body.querySelector('.confirm')).toBeNull();
    expect(btn.hidden).toBe(false);
    expect(sent.length).toBe(before);
  });

  it('counts and locks hiring against maxStaff(state)', () => {
    const state = createNewGame('Quán Thử', 'normal', 42);
    state.upgrades.expand_area = 3;
    const cap = maxStaff(state);
    expect(cap).toBe(7);
    const { body, handle } = mount(state);
    expect(body.textContent).toContain(`Đang có 0/${cap} người`);
    for (let i = 0; i < cap; i++) {
      state.staff.push({ ...state.candidates[0]!, id: 1000 + i, role: 'none' });
    }
    handle!.update!(state);
    expect(body.textContent).toContain(`Đang có ${cap}/${cap} người`);
    const hire = q<HTMLButtonElement>(body, '[data-action="hire"]');
    expect(hire.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(body, hire)).toContain(`Đã đủ ${cap} người`);
  });

  it('keeps the row (and an open role dropdown) when only experience changes', () => {
    const { state, member } = withHire();
    const { body, handle } = mount(state);
    const row = q(body, `li[data-staff="${member.id}"]`);
    member.exp = 30;
    handle!.update!(state);
    expect(q(body, `li[data-staff="${member.id}"]`)).toBe(row);
    expect(row.textContent).toContain('KN 30/');
  });
});
