/**
 * Short gameplay tips shown while the game loads: on the #boot screen in
 * index.html (vite.config.ts writes this list into the page) and in the
 * Main Menu's loading line. Plain text, no emoji, under ~90 characters.
 */
export const LOADING_TIPS: readonly string[] = [
  'Nhập đủ nguyên liệu lúc chuẩn bị, hết hàng giữa giờ cao điểm là mất khách.',
  'Thiếu người thì bấm thẳng vào khách, quầy hay bàn để tự phục vụ.',
  'Khách chờ lâu sẽ bỏ về. Thêm nhân viên trước giờ cao điểm trưa và tối.',
  'Trang trí làm quán hút khách và được thêm sao.',
  'Mức giá Cao tăng tiền mỗi ly nhưng bớt khách và sao.',
  'Tab Chỉ số trong Daily Report chỉ ra chỗ cần sửa cho ngày mai.',
  'Nhấn 1, 2, 3 để đổi tốc độ, Space để tạm dừng.',
];

/** Index of the tip the #boot screen picked (window.__cstTip), so the menu keeps showing the same one. */
export function currentTipIndex(): number {
  const i = (globalThis as { __cstTip?: unknown }).__cstTip;
  return typeof i === 'number' && i >= 0 && i < LOADING_TIPS.length ? i : 0;
}
