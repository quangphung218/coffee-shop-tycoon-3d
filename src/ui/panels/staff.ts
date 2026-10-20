import { totalWages } from '../../sim/economy';
import { canChangePolicy, policyLevel, WAGE_POLICY, wageMult } from '../../sim/policies';
import { STAFF_TRAITS } from '../../sim/data/staffTraits';
import { ROLE_NAMES, rolePlan } from '../../sim/staff';
import { canTrain, LEVEL_SPEED_STEP, MAX_STAFF_LEVEL, maxStaff, PROMOTION_WAGE_MULT, STAFF_LEVEL_EXP, staffExp, staffLevel, staffTraitOf, trainCost } from '../../sim/staffGrowth';
import type { GameState, PolicyLevel, Staff, StaffRole, StaffTaskKind } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, setChildren, uid, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { avatarIcon, ROLE_ICONS } from '../core/iconMap';
import { icon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { lockPolicyChoice } from './menu';
import { dropdown, inlineConfirm, keepFocus, reasonLine, segmented, sender, setIconText, setReason, toggle, withIcon, type DropdownOption } from './widgets';

export const ROLE_ORDER: readonly StaffRole[] = ['barista', 'server', 'cleaner', 'marketer', 'none'];

const WAGE_OPTIONS: readonly { value: PolicyLevel; label: string }[] = [
  { value: 'low', label: 'Thấp' },
  { value: 'standard', label: 'Chuẩn' },
  { value: 'high', label: 'Cao' },
];

/** "Cao: tổng lương 600.000đ/ngày, làm nhanh hơn 12%." for the current team. */
export function wagePolicyHint(state: GameState, level: PolicyLevel): string {
  const p = WAGE_POLICY[level];
  const name = WAGE_OPTIONS.find((o) => o.value === level)!.label;
  const total = formatMoney(Math.round(state.staff.reduce((a, m) => a + m.wagePerDay, 0) * p.wageMult));
  const pct = Math.round(Math.abs(p.speedMult - 1) * 100);
  const speed = p.speedMult > 1 ? `làm nhanh hơn ${pct}%` : p.speedMult < 1 ? `làm chậm hơn ${pct}%` : 'tốc độ gốc';
  return `${name}: tổng lương ${total}/ngày, ${speed}.`;
}

/** A daily wage at the chosen Mức lương. */
const paid = (s: GameState, wage: number): number => Math.round(wage * wageMult(s));
const ROLE_OPTIONS: readonly DropdownOption<StaffRole>[] = ROLE_ORDER.map((r) => ({ value: r, label: ROLE_NAMES[r], icon: ROLE_ICONS[r] }));

const TASK_TEXT: Record<StaffTaskKind, string> = {
  brew: 'đang pha',
  take_order: 'đang nhận order',
  serve: 'đang mang món',
  clean: 'đang lau bàn',
  collect: 'đang thu tiền',
  promote: 'đang mời khách',
  idle: 'đang chờ',
};

/** Avatar in the row's icon slot; the sim's `look` picks one of the drawn skin/hair pairs. */
function avatar(look: number): HTMLElement {
  return h('span', { class: 'item-icon' }, avatarIcon(look, { size: 32 }));
}

/** "Lương 200.000đ/ngày · tốc độ ×1,15": the meta line of a staff or candidate row. */
function staffMeta(wage: number, speed: number): string {
  return `Lương ${formatMoney(wage)}/ngày · tốc độ ×${speed.toFixed(2).replace('.', ',')}`;
}

/** Trait chip: the Vietnamese name, with what it does as the tooltip. */
function traitChip(state: GameState, member: Staff): HTMLElement {
  const t = STAFF_TRAITS[staffTraitOf(state, member)];
  return h('span', { class: 'badge badge-neutral', attrs: { 'data-trait': t.id, title: t.description }, text: t.name });
}

/** Why the member cannot be trained, or null. Reads a copy when the save has no retention yet, so the panel never writes state. */
export function trainBlock(state: GameState, staffId: number): string | null {
  return canTrain(state.retention ? state : { ...state }, staffId);
}

/** Experience toward the next level: whole minutes, the next threshold (null at the top level) and the 0..100 fill. */
export function expView(member: Staff): { exp: number; next: number | null; pct: number } {
  const level = staffLevel(member);
  const exp = Math.floor(staffExp(member));
  if (level >= MAX_STAFF_LEVEL) return { exp, next: null, pct: 100 };
  const next = STAFF_LEVEL_EXP[level]!;
  return { exp, next, pct: next > 0 ? Math.min(100, Math.round((exp / next) * 100)) : 100 };
}

/** "Đào tạo · 400.000đ · 3 Tem": the price of the next level on the button. */
function trainLabel(member: Staff): string {
  if (staffLevel(member) >= MAX_STAFF_LEVEL) return 'Đào tạo';
  const cost = trainCost(member);
  return `Đào tạo · ${formatMoney(cost.money)}${cost.tickets > 0 ? ` · ${cost.tickets} Tem` : ''}`;
}

const WAGE_STEP_PCT = Math.round((PROMOTION_WAGE_MULT - 1) * 100);
const SPEED_STEP_PCT = Math.round(LEVEL_SPEED_STEP * 100);

/** Role a new hire starts in: the next free slot of the default plan. */
export function roleForHire(state: GameState): StaffRole {
  return rolePlan(null, state.staff.length + 1)[state.staff.length] ?? 'none';
}

/**
 * Nhân viên: staff with trait, level, experience bar, wage, speed, busy/free
 * badge, a role dropdown and in-place "Đào tạo" and "Cho nghỉ" confirms;
 * today's candidates with their trait and "Tuyển"; the
 * Auto-assign switch and the Mức lương choice. Wages are shown at the chosen
 * Mức lương. Usable in every phase; Mức lương changes only while preparing.
 */
export function renderStaffPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  let rowsW = new Watcher<GameState>();
  const refresh = (s: GameState): void => {
    w.run(s);
    rowsW.run(s);
  };
  const send = sender(ctx, refresh);

  const autoId = 'staff-auto-label';
  const auto = toggle('Tự phân vai (Auto-assign)', 'Bật', 'Tắt', (next) => send({ type: 'set_auto_assign', enabled: next }));
  auto.el.removeAttribute('aria-label');
  auto.el.setAttribute('aria-labelledby', autoId);
  w.watch(
    (s) => !!s.autoAssign,
    (on) => auto.set(on),
  );

  const staffList = h('ul', { class: 'stack', attrs: { 'aria-label': 'Nhân viên đang làm' } });
  const candList = h('ul', { class: 'stack', attrs: { 'aria-label': 'Ứng viên hôm nay' } });
  const wages = h('b');
  w.text(wages, (s) => formatMoney(totalWages(s)));

  // Mức lương: a trade-off set in place; the hint gives the day's wage bill and work speed.
  const wageTitleId = uid('wage-policy');
  // Set while preparing only; once open the choice is locked with the reason under it.
  const wageSeg = segmented('Mức lương', 'wage', WAGE_OPTIONS, (level) => {
    const s = ctx.getState();
    if (s && canChangePolicy(s)) send({ type: 'set_policy', policy: 'wage', level });
    else if (s) wageSeg.set(policyLevel(s, 'wage'));
  });
  wageSeg.el.removeAttribute('aria-label');
  wageSeg.el.setAttribute('aria-labelledby', wageTitleId);
  const wageHint = h('p', { class: 'item-meta', attrs: { 'data-hint': 'wage' } });
  const wageWhy = reasonLine(false);
  w.watch(
    (s) => canChangePolicy(s),
    (_, s) => lockPolicyChoice(wageSeg.el, wageWhy, s),
  );
  w.watch(
    (s) => `${policyLevel(s, 'wage')}|${s.staff.map((m) => m.wagePerDay).join()}`,
    (_, s) => {
      const level = policyLevel(s, 'wage');
      wageSeg.set(level);
      wageHint.textContent = wagePolicyHint(s, level);
    },
  );
  const teamCount = h('span');
  w.text(teamCount, (s) => `Đang có ${s.staff.length}/${maxStaff(s)} người`);

  function staffRow(member: Staff, state: GameState): HTMLElement {
    const badge = h('span');
    const meta = h('p', { class: 'item-meta' });
    const levelText = h('span');
    const why = reasonLine(false);
    const trainWhy = reasonLine(false);
    const dd = dropdown<StaffRole>(`Vai của ${member.name}`, ROLE_OPTIONS, (role) => send({ type: 'assign_role', staffId: member.id, role }));
    dd.el.setAttribute('data-staff', String(member.id));
    const fireBtn = h('button', { class: 'btn btn-danger btn-sm', attrs: { type: 'button', 'data-action': 'fire', 'aria-label': `Cho ${member.name} nghỉ` }, text: 'Cho nghỉ' });
    const trainBtn = h('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button', 'data-action': 'train' } });
    const barFill = h('span');
    const bar = h('div', { class: 'progress', attrs: { role: 'progressbar', 'aria-label': `Kinh nghiệm của ${member.name}`, 'aria-valuemin': '0', 'aria-valuemax': '100' } }, barFill);
    const li = h(
      'li',
      { class: 'item item-row', attrs: { 'data-staff': member.id } },
      avatar(member.look),
      h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: member.name }), meta),
      h('span', { class: 'item-status' }, badge),
      h('div', { class: 'item-control' }, dd.el, fireBtn),
      // Third line: trait, level and experience, then Đào tạo, the bar and the reasons.
      h('div', { class: 'item-actions' }, h('p', { class: 'item-meta' }, traitChip(state, member), ' ', levelText), trainBtn, bar, why, trainWhy),
    );
    trainBtn.addEventListener('click', () => {
      const s = ctx.getState();
      const m = s?.staff.find((x) => x.id === member.id);
      if (!s || !m || isAriaDisabled(trainBtn)) return;
      trainBtn.hidden = true;
      li.append(
        inlineConfirm(
          `Đào tạo ${m.name} lên cấp ${staffLevel(m) + 1}? Lương +${WAGE_STEP_PCT}%, làm nhanh +${SPEED_STEP_PCT}%.`,
          'Đào tạo',
          'btn-primary',
          () => {
            // The row is not rebuilt on training, so bring Đào tạo back for the next level.
            trainBtn.hidden = false;
            trainBtn.focus();
            keepFocus(li, body, () => send({ type: 'train_staff', staffId: member.id }));
          },
          () => {
            trainBtn.hidden = false;
            trainBtn.focus();
          },
        ),
      );
    });
    rowsW.watch(
      (s) => {
        const m = s.staff.find((x) => x.id === member.id);
        return m ? `${staffLevel(m)}|${Math.floor(staffExp(m))}|${m.wagePerDay}|${trainBlock(s, m.id) ?? ''}` : '';
      },
      (_, s) => {
        const m = s.staff.find((x) => x.id === member.id);
        if (!m) return;
        const level = staffLevel(m);
        const { exp, next, pct } = expView(m);
        const expText = next === null ? 'KN tối đa' : `KN ${exp}/${next}`;
        levelText.textContent = `Cấp ${level}/${MAX_STAFF_LEVEL} · ${expText}`;
        barFill.style.width = `${pct}%`;
        bar.setAttribute('aria-valuenow', String(pct));
        bar.setAttribute('aria-valuetext', `Cấp ${level}/${MAX_STAFF_LEVEL}, ${expText}`);
        trainBtn.textContent = trainLabel(m);
        trainBtn.setAttribute('aria-label', level >= MAX_STAFF_LEVEL ? `Đào tạo ${m.name}` : `Đào tạo ${m.name} lên cấp ${level + 1}, ${trainLabel(m).slice('Đào tạo · '.length)}`);
        const block = trainBlock(s, m.id);
        setAriaDisabled(trainBtn, !!block);
        setReason(trainWhy, trainBtn, block ? `${block}.` : null);
      },
    );
    fireBtn.addEventListener('click', () => {
      fireBtn.hidden = true;
      // Once the doors opened the wage is owed for today (fireStaff).
      const phase = ctx.getState()?.phase;
      const wage = phase === 'preparation' || phase === 'report' ? 'Hôm nay không trả lương' : 'Vẫn trả lương hôm nay';
      li.append(
        inlineConfirm(
          `Cho ${member.name} nghỉ? ${wage}, không tuyển lại được.`,
          'Cho nghỉ',
          'btn-danger',
          () => keepFocus(li, body, () => send({ type: 'fire_staff', staffId: member.id })),
          () => {
            fireBtn.hidden = false;
            fireBtn.focus();
          },
        ),
      );
    });
    rowsW.watch(
      (s) => {
        const m = s.staff.find((x) => x.id === member.id);
        return m ? `${m.role}|${m.busy ? 1 : 0}|${m.task?.kind ?? ''}|${s.autoAssign ? 1 : 0}|${s.staff.map((x) => x.role).join()}|${paid(s, m.wagePerDay)}` : '';
      },
      (_, s) => {
        const m = s.staff.find((x) => x.id === member.id);
        if (!m) return;
        badge.className = m.busy ? 'badge badge-warn' : 'badge badge-ok';
        setIconText(badge, m.busy ? 'i-busy' : 'i-free', m.busy ? 'Bận' : 'Rảnh');
        meta.textContent = `${staffMeta(paid(s, m.wagePerDay), m.speed)}${m.busy && m.task ? ` · ${TASK_TEXT[m.task.kind]}` : ''}`;
        const others: Partial<Record<StaffRole, string>> = {};
        for (const r of ROLE_ORDER) {
          const names = s.staff.filter((x) => x.id !== m.id && x.role === r).map((x) => x.name);
          others[r] = names.length > 0 ? `${names.join(', ')} đang làm` : r === 'none' ? 'không làm gì' : 'trống';
        }
        dd.setNotes(others);
        const autoOn = !!s.autoAssign;
        dd.set(m.role, {
          disabled: autoOn,
          warn: !autoOn && m.role === 'none',
          display: autoOn
            ? { icon: 'i-auto', text: `Tự động: ${ROLE_NAMES[m.role]}` }
            : m.role === 'none'
              ? { icon: 'i-warning', text: 'Chưa có vai' }
              : undefined,
        });
        setReason(why, dd.button, autoOn ? 'Tắt Tự phân vai để chọn tay.' : null);
      },
    );
    return li;
  }

  function candidateRow(c: Staff, state: GameState): HTMLElement {
    const hire = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'hire', 'aria-label': `Tuyển ${c.name}` }, text: 'Tuyển' });
    const why = reasonLine(false);
    hire.addEventListener('click', () => {
      const s = ctx.getState();
      if (!s || isAriaDisabled(hire)) return;
      keepFocus(li, body, () => send({ type: 'hire_staff', candidateId: c.id, role: roleForHire(s) }));
    });
    rowsW.watch(
      (s) => (s.staff.length >= maxStaff(s) ? maxStaff(s) : 0),
      (cap) => {
        setAriaDisabled(hire, cap > 0);
        setReason(why, hire, cap > 0 ? `Đã đủ ${cap} người. Cho bớt một người nghỉ để tuyển.` : null);
      },
    );
    const meta = h('p', { class: 'item-meta' });
    rowsW.text(meta, (s) => staffMeta(paid(s, c.wagePerDay), c.speed));
    const li = h(
      'li',
      { class: 'item item-row', attrs: { 'data-candidate': c.id } },
      avatar(c.look),
      h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: c.name }), meta),
      hire,
      h('div', { class: 'item-actions' }, h('p', { class: 'item-meta' }, traitChip(state, c)), why),
    );
    return li;
  }

  // Rows are rebuilt only when someone joins or leaves, so an open dropdown survives frame updates.
  w.watch(
    (s) => `${s.staff.map((m) => m.id).join()}|${s.candidates.map((c) => c.id).join()}`,
    (_, s) => {
      rowsW = new Watcher<GameState>();
      if (s.staff.length === 0) {
        setChildren(
          staffList,
          h(
            'li',
            { class: 'empty' },
            icon('i-chef', { size: 48 }),
            h('p', { class: 'item-title', text: 'Chưa có nhân viên' }),
            h('p', { class: 'item-meta', text: 'Bạn đang tự làm mọi việc, sẽ chậm khi đông khách. Người đầu tiên nên là Pha chế.' }),
          ),
        );
      } else setChildren(staffList, ...s.staff.map((m) => staffRow(m, s)));
      if (s.candidates.length === 0) setChildren(candList, h('li', { class: 'item-meta', text: 'Hết ứng viên hôm nay. Ngày mai có người mới.' }));
      else setChildren(candList, ...s.candidates.map((c) => candidateRow(c, s)));
      rowsW.run(s);
    },
  );

  body.append(
    h(
      'div',
      { class: 'prep' },
      h(
        'div',
        { class: 'setting' },
        h('div', { class: 'setting-text' }, h('p', { class: 'item-title', id: autoId }, ...withIcon('i-auto', 'Tự phân vai (Auto-assign)', 24)), h('p', { class: 'item-meta', text: 'Mỗi sáng game xếp vai theo việc bị ùn hôm trước.' })),
        auto.el,
      ),
      h(
        'div',
        { class: 'setting', attrs: { 'data-policy': 'wage' } },
        h('div', { class: 'setting-text' }, h('p', { class: 'item-title', id: wageTitleId }, ...withIcon('i-coin', 'Mức lương', 24)), wageHint, wageWhy),
        wageSeg.el,
      ),
      h('p', { class: 'intro intro-icon' }, icon('i-people', { size: 16 }), teamCount),
      staffList,
      h('h3', { class: 'section-title', text: 'Ứng viên hôm nay' }),
      candList,
      h('div', { class: 'panel-foot' }, h('div', { class: 'foot-sum' }, h('span', { text: 'Tổng lương/ngày' }), wages)),
    ),
  );
  const state = ctx.getState();
  if (state) refresh(state);
  return { update: refresh };
}
