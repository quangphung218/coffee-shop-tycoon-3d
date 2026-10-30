import type { GameState } from '../types';
import { REGULARS, type Regular } from './regulars';

/**
 * Sổ khách quen (E-18): each named regular has three visit milestones. A
 * milestone is reached when the regular's counted visits (`state.regulars[id].visits`)
 * reach its `visits`, so the book is derived from the counter older saves
 * already keep. Reaching one fires 'regular_milestone' and pays a little Tem;
 * nothing else in the game reads them. Stories and dishes are shown only.
 */
export interface RegularMilestone {
  /** Counted visits that reach this milestone. */
  visits: number;
  /** Tem paid once, on the visit that reaches it. */
  tickets: number;
  /** Vietnamese story of 2–3 sentences unlocked in the book. */
  story: string;
}

export interface RegularBookEntry {
  regularId: string;
  /** Dish they love, shown in the book; it does not change what they order. */
  favoriteDish: string;
  milestones: readonly [RegularMilestone, RegularMilestone, RegularMilestone];
}

/**
 * Visits of milestones 1, 2 and 3, the same for every regular. A regular comes
 * about once a day from day 2, so steady play reaches 100 in week 15
 * (tests/integration/e18-regular-milestones.test.ts).
 */
export const MILESTONE_VISITS = [10, 40, 100] as const;
/** Tem of milestones 1, 2 and 3: small, below a VIP (3) and a week challenge (5–8). */
export const MILESTONE_TICKETS = [1, 2, 3] as const;

function entry(regularId: string, favoriteDish: string, stories: readonly [string, string, string]): RegularBookEntry {
  const m = (i: 0 | 1 | 2): RegularMilestone => ({ visits: MILESTONE_VISITS[i], tickets: MILESTONE_TICKETS[i], story: stories[i] });
  return { regularId, favoriteDish, milestones: [m(0), m(1), m(2)] };
}

export const REGULAR_BOOK: readonly RegularBookEntry[] = [
  entry('co_lan', 'Bánh bông lan trứng muối', [
    'Cô Lan dạy văn ở trường cấp hai đầu phố. Sáng nào cô cũng ghé mua ly latte trước giờ vào lớp.',
    'Cô kể học trò hay trêu cô là "cô latte". Cô cười bảo ly cà phê sữa ở đây giúp cô chấm bài đỡ buồn ngủ.',
    'Cô Lan mang tới một tấm thiệp học trò vẽ quán mình. Cô dặn cứ treo lên tường, vì quán cũng là một phần buổi sáng của lớp cô.',
  ]),
  entry('anh_minh', 'Bánh mì bơ tỏi', [
    'Anh Minh làm lập trình viên, hay ngồi góc gần ổ điện. Anh gọi americano và mở máy tính tới tận trưa.',
    'Anh bảo ở quán viết code nhanh hơn ở công ty. Hôm nay anh vừa sửa xong một lỗi khó và gọi thêm một ly để ăn mừng.',
    'Anh Minh khoe ứng dụng đầu tiên của mình vừa ra mắt. Trong phần cảm ơn, anh ghi tên quán vì đã cho anh chỗ ngồi yên tĩnh.',
  ]),
  entry('chu_tuan', 'Bánh croissant', [
    'Chú Tuấn chạy xe ôm ở ngã tư gần quán. Chú uống espresso đứng, nói vài câu chuyện đường phố rồi đi ngay.',
    'Chú kể ngày trước chú pha cà phê phin cho cả xóm. Chú khen ly espresso ở đây đậm mà không đắng gắt.',
    'Chú Tuấn dẫn cả mấy anh em xe ôm tới ngồi một buổi chiều mưa. Chú bảo quán này là trạm dừng chân quen của chú rồi.',
  ]),
  entry('chi_hoa', 'Bánh tiramisu', [
    'Chị Hoa bán hoa ở chợ bên kia đường. Mỗi lần ghé, chị để lại vài bông cúc nhỏ trên quầy.',
    'Chị thích cappuccino có lớp bọt thật dày. Chị bảo nhìn bọt sữa mịn là biết người pha có tâm.',
    'Chị Hoa đặt riêng một lọ hoa tươi cho quán vào mỗi sáng thứ Hai. Chị nói quán đẹp thì khách vui, mà khách vui thì chị cũng vui.',
  ]),
  entry('em_vy', 'Bánh flan', [
    'Em Vy là sinh viên năm nhất, hay ôm sách vở tới ôn bài. Ly trà sữa luôn được em gọi thêm trân châu.',
    'Em vừa qua kỳ thi giữa kỳ với điểm cao. Em bảo ngồi học ở quán giúp em tập trung hơn ở ký túc xá.',
    'Em Vy rủ cả nhóm bạn tới tổ chức sinh nhật nhỏ ở quán. Em nói sau này đi làm rồi vẫn sẽ quay lại đây.',
  ]),
  entry('bac_hung', 'Bánh su kem', [
    'Bác Hùng đã nghỉ hưu, sáng nào cũng đi bộ một vòng hồ rồi ghé quán. Bác gọi mocha vì thích vị sô cô la.',
    'Bác kể hồi trẻ bác làm thợ sửa đồng hồ. Bác hay ngồi xem đồng hồ treo tường của quán chạy có đúng giờ không.',
    'Bác Hùng tặng quán chiếc đồng hồ quả lắc bác tự sửa. Bác dặn cứ để nó điểm giờ mở cửa mỗi sáng.',
  ]),
  entry('chi_thao', 'Bánh tart chanh', [
    'Chị Thảo làm y tá ca đêm ở bệnh viện gần đây. Chị ghé lấy ly trà chanh mát lạnh sau mỗi ca trực.',
    'Chị bảo vị chua nhẹ giúp chị tỉnh táo trên đường về. Hôm nay chị kể vừa giúp một em bé chào đời bình an.',
    'Chị Thảo giới thiệu quán cho cả khoa của chị. Giờ cứ sáng sớm là có vài chiếc áo trắng ngồi đợi trà chanh.',
  ]),
  entry('anh_khoa', 'Bánh waffle', [
    'Anh Khoa là thợ chụp ảnh tự do, lúc nào cũng đeo máy ảnh. Anh gọi cà phê đá xay và chụp vài tấm ánh nắng trong quán.',
    'Anh kể bức ảnh chụp quầy pha chế của quán vừa được đăng báo. Anh bảo ánh sáng buổi chiều ở đây rất đẹp.',
    'Anh Khoa mở một buổi triển lãm ảnh nhỏ ngay trong quán. Tấm ảnh lớn nhất là cảnh đội pha chế cười trong giờ cao điểm.',
  ]),
];

export function regularBookEntry(regularId: string): RegularBookEntry | undefined {
  return REGULAR_BOOK.find((e) => e.regularId === regularId);
}

/** Milestones (0–3) reached with `visits` counted visits. */
export function milestonesReached(visits: number): number {
  return MILESTONE_VISITS.filter((v) => visits >= v).length;
}

/** Milestone (1–3) reached exactly on visit `visits`, or 0. */
export function milestoneAt(visits: number): number {
  return MILESTONE_VISITS.indexOf(visits as (typeof MILESTONE_VISITS)[number]) + 1;
}


/** One regular's page of the book, for the UI. */
export interface RegularBookPage {
  regular: Regular;
  favoriteDish: string;
  /** Counted visits; 0 before the first. */
  visits: number;
  /** Milestones reached, 0–3. */
  reached: number;
  /** Visits of the next milestone, null once all three are reached. */
  nextVisits: number | null;
  milestones: readonly (RegularMilestone & { reached: boolean })[];
}

/** Every regular's page in REGULARS order, derived from `state.regulars` (older saves included). */
export function regularBook(state: GameState): RegularBookPage[] {
  return REGULARS.map((regular) => {
    const book = regularBookEntry(regular.id)!;
    const visits = state.regulars?.[regular.id]?.visits ?? 0;
    const reached = milestonesReached(visits);
    return {
      regular,
      favoriteDish: book.favoriteDish,
      visits,
      reached,
      nextVisits: MILESTONE_VISITS[reached] ?? null,
      milestones: book.milestones.map((m) => ({ ...m, reached: visits >= m.visits })),
    };
  });
}
