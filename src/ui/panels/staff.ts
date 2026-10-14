import { MAX_STAFF, ROLE_NAMES, rolePlan } from '../../sim/staff';
import type { GameState, Staff, StaffRole, StaffTaskKind } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, setChildren, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { avatarIcon, ROLE_ICONS } from '../core/iconMap';
import { icon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { dropdown, inlineConfirm, keepFocus, reasonLine, sender, setIconText, setReason, toggle, withIcon, type DropdownOption } from './widgets';

export const ROLE_ORDER: readonly StaffRole[] = ['barista', 'server', 'cleaner', 'marketer', 'none'];
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

/** Round avatar; the sim's `look` picks one of the drawn skin/hair pairs. */
function avatar(look: number): HTMLElement {
  return h('span', { class: 'staff-av' }, avatarIcon(look, { size: 32 }));
}

/** Speed 0.8–1.3 shown as ×1,15 plus a bar. */
function speedMeter(speed: number): HTMLElement {
  const pct = Math.round(Math.max(0.1, Math.min(1, (speed - 0.7) / 0.6)) * 100);
  return h(
    'span',
    { class: 'meter' },
    'Tốc độ ',
    h('span', { class: 'progress', attrs: { 'aria-hidden': 'true' } }, h('span', { attrs: { style: `width:${pct}%` } })),
    ` ×${speed.toFixed(2).replace('.', ',')}`,
  );
}

/** Role a new hire starts in: the next free slot of the default plan. */
export function roleForHire(state: GameState): StaffRole {
  return rolePlan(null, state.staff.length + 1)[state.staff.length] ?? 'none';
}

/**
 * Nhân viên: staff with wage, speed, busy/free badge, a role dropdown and an
 * in-place "Cho nghỉ" confirm; today's candidates with "Tuyển"; the
 * Auto-assign switch. Usable in every phase.
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
  w.text(wages, (s) => formatMoney(s.staff.reduce((a, m) => a + m.wagePerDay, 0)));
  const teamCount = h('span');
  w.text(teamCount, (s) => `Đang có ${s.staff.length}/${MAX_STAFF} người`);

  function staffRow(member: Staff): HTMLElement {
    const badge = h('span');
    const meta = h('p', { class: 'item-meta' });
    const why = reasonLine(false);
    const dd = dropdown<StaffRole>(`Vai của ${member.name}`, ROLE_OPTIONS, (role) => send({ type: 'assign_role', staffId: member.id, role }));
    dd.el.setAttribute('data-staff', String(member.id));
    const fireBtn = h('button', { class: 'btn btn-danger btn-sm', attrs: { type: 'button', 'data-action': 'fire' }, text: 'Cho nghỉ' });
    const li = h(
      'li',
      { class: 'staff', attrs: { 'data-staff': member.id } },
      avatar(member.look),
      h('div', {}, h('p', { class: 'staff-name' }, member.name, ' ', badge), meta, speedMeter(member.speed)),
      h('div', { class: 'staff-row' }, h('span', { class: 'stepper-label', text: 'Vai' }), dd.el, fireBtn, why),
    );
    fireBtn.addEventListener('click', () => {
      fireBtn.hidden = true;
      li.append(
        inlineConfirm(
          `Cho ${member.name} nghỉ? Hôm nay không trả lương, không tuyển lại được.`,
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
        return m ? `${m.role}|${m.busy ? 1 : 0}|${m.task?.kind ?? ''}|${s.autoAssign ? 1 : 0}|${s.staff.map((x) => x.role).join()}` : '';
      },
      (_, s) => {
        const m = s.staff.find((x) => x.id === member.id);
        if (!m) return;
        badge.className = m.busy ? 'badge badge-warn' : 'badge badge-ok';
        setIconText(badge, m.busy ? 'i-busy' : 'i-free', m.busy ? 'Bận' : 'Rảnh');
        meta.textContent = `Lương ${formatMoney(m.wagePerDay)}/ngày${m.busy && m.task ? ` · ${TASK_TEXT[m.task.kind]}` : ''}`;
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

  function candidateRow(c: Staff): HTMLElement {
    const hire = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'hire' }, text: 'Tuyển' });
    const why = reasonLine(false);
    hire.addEventListener('click', () => {
      const s = ctx.getState();
      if (!s || isAriaDisabled(hire)) return;
      keepFocus(li, body, () => send({ type: 'hire_staff', candidateId: c.id, role: roleForHire(s) }));
    });
    rowsW.watch(
      (s) => s.staff.length >= MAX_STAFF,
      (full) => {
        setAriaDisabled(hire, full);
        setReason(why, hire, full ? `Đã đủ ${MAX_STAFF} người. Cho bớt một người nghỉ để tuyển.` : null);
      },
    );
    const li = h(
      'li',
      { class: 'staff', attrs: { 'data-candidate': c.id } },
      avatar(c.look),
      h('div', {}, h('p', { class: 'staff-name', text: c.name }), h('p', { class: 'item-meta', text: `Lương ${formatMoney(c.wagePerDay)}/ngày` }), speedMeter(c.speed)),
      h('div', { class: 'staff-row' }, hire, why),
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
      } else setChildren(staffList, ...s.staff.map(staffRow));
      if (s.candidates.length === 0) setChildren(candList, h('li', { class: 'item-meta', text: 'Hết ứng viên hôm nay. Ngày mai có người mới.' }));
      else setChildren(candList, ...s.candidates.map(candidateRow));
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
