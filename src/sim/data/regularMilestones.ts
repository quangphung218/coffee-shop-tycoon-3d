import type { GameState } from '../types';
import { REGULARS, type Regular } from './regulars';

/**
 * Sổ khách quen (E-18, E-22): each named regular has four visit milestones at
 * visit counts of their own. A milestone is reached when the regular's counted
 * visits (`state.regulars[id].visits`) reach its `visits`, so the book is
 * derived from the counter older saves already keep. Reaching one fires
 * 'regular_milestone' and pays a little Tem; nothing else in the game reads
 * them. Stories and dishes are shown only.
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
  milestones: readonly [RegularMilestone, RegularMilestone, RegularMilestone, RegularMilestone];
}

/** Milestones per regular. */
export const MILESTONE_COUNT = 4;
/** Tem of milestones 1–4: small, at most a VIP's 3 and below a week challenge (5–8). */
export const MILESTONE_TICKETS = [1, 2, 3, 3] as const;
/**
 * E-18's book: milestones 1–3 at 10/40/100 visits for every regular. A save
 * from before E-22 keeps what it reached there (RegularVisits.keptMilestones).
 */
export const E18_MILESTONE_VISITS = [10, 40, 100] as const;

type Four<T> = readonly [T, T, T, T];

/**
 * Visits of milestones 1–4 per regular. A regular comes about once a day from
 * day 2, so visit n lands on day n + 1. The 32 milestones are staggered to
 * fall in different weeks: milestone 1 in weeks 2–9, 2 in weeks 10–18, 3 in
 * weeks 19–32 and 4 (235–270 visits) in weeks 34–39, at most 2 a week for
 * b_steady2 on seeds 1 and 42 (tests/integration/e18-regular-milestones.test.ts).
 */
export const MILESTONE_VISITS: Readonly<Record<string, Four<number>>> = {
  co_lan: [10, 90, 195, 245],
  anh_minh: [25, 65, 145, 265],
  chu_tuan: [45, 115, 170, 235],
  chi_hoa: [15, 80, 220, 255],
  em_vy: [30, 110, 130, 270],
  bac_hung: [60, 75, 180, 240],
  chi_thao: [40, 120, 160, 260],
  anh_khoa: [50, 100, 205, 250],
};

function entry(regularId: string, favoriteDish: string, stories: Four<string>): RegularBookEntry {
  const visits = MILESTONE_VISITS[regularId]!;
  const m = (i: 0 | 1 | 2 | 3): RegularMilestone => ({ visits: visits[i], tickets: MILESTONE_TICKETS[i], story: stories[i] });
  return { regularId, favoriteDish, milestones: [m(0), m(1), m(2), m(3)] };
}

export const REGULAR_BOOK: readonly RegularBookEntry[] = [
  entry('co_lan', 'Bánh bông lan trứng muối', [
    'Cô Lan dạy văn ở trường cấp hai đầu phố. Sáng nào cô cũng ghé mua ly latte trước giờ vào lớp.',
    'Cô kể học trò hay trêu cô là "cô latte". Cô cười bảo ly cà phê sữa ở đây giúp cô chấm bài đỡ buồn ngủ.',
    'Cô Lan mang tới một tấm thiệp học trò vẽ quán mình. Cô dặn cứ treo lên tường, vì quán cũng là một phần buổi sáng của lớp cô.',
    'Cô Lan sắp nghỉ hưu sau ba mươi năm đứng lớp. Buổi dạy cuối, cô đặt ly latte cho cả lớp và dẫn học trò ghé quán chụp chung một tấm ảnh.',
  ]),
  entry('anh_minh', 'Bánh mì bơ tỏi', [
    'Anh Minh làm lập trình viên, hay ngồi góc gần ổ điện. Anh gọi americano và mở máy tính tới tận trưa.',
    'Anh bảo ở quán viết code nhanh hơn ở công ty. Hôm nay anh vừa sửa xong một lỗi khó và gọi thêm một ly để ăn mừng.',
    'Anh Minh khoe ứng dụng đầu tiên của mình vừa ra mắt. Trong phần cảm ơn, anh ghi tên quán vì đã cho anh chỗ ngồi yên tĩnh.',
    'Anh Minh giờ đã có nhóm riêng, cả nhóm họp mỗi sáng thứ Hai ở bàn góc quen. Anh nói công ty lớn đến đâu thì chỗ ngồi gần ổ điện này vẫn để dành cho anh.',
  ]),
  entry('chu_tuan', 'Bánh croissant', [
    'Chú Tuấn chạy xe ôm ở ngã tư gần quán. Chú uống espresso đứng, nói vài câu chuyện đường phố rồi đi ngay.',
    'Chú kể ngày trước chú pha cà phê phin cho cả xóm. Chú khen ly espresso ở đây đậm mà không đắng gắt.',
    'Chú Tuấn dẫn cả mấy anh em xe ôm tới ngồi một buổi chiều mưa. Chú bảo quán này là trạm dừng chân quen của chú rồi.',
    'Chú Tuấn đã thôi chạy xe, nhưng sáng nào cũng đi bộ ra ngã tư rồi ghé quán. Chú bảo không uống ly espresso ở đây thì chưa thấy ngày mới bắt đầu.',
  ]),
  entry('chi_hoa', 'Bánh tiramisu', [
    'Chị Hoa bán hoa ở chợ bên kia đường. Mỗi lần ghé, chị để lại vài bông cúc nhỏ trên quầy.',
    'Chị thích cappuccino có lớp bọt thật dày. Chị bảo nhìn bọt sữa mịn là biết người pha có tâm.',
    'Chị Hoa đặt riêng một lọ hoa tươi cho quán vào mỗi sáng thứ Hai. Chị nói quán đẹp thì khách vui, mà khách vui thì chị cũng vui.',
    'Chị Hoa mở thêm một sạp hoa nhỏ ngay trước cửa quán. Khách mua hoa thì ghé uống cà phê, khách uống cà phê thì mua bó hoa mang về.',
  ]),
  entry('em_vy', 'Bánh flan', [
    'Em Vy là sinh viên năm nhất, hay ôm sách vở tới ôn bài. Ly trà sữa luôn được em gọi thêm trân châu.',
    'Em vừa qua kỳ thi giữa kỳ với điểm cao. Em bảo ngồi học ở quán giúp em tập trung hơn ở ký túc xá.',
    'Em Vy rủ cả nhóm bạn tới tổ chức sinh nhật nhỏ ở quán. Em nói sau này đi làm rồi vẫn sẽ quay lại đây.',
    'Em Vy tốt nghiệp và đi làm ở một công ty gần đây. Ngày đầu nhận lương, em quay lại quán gọi trà sữa cho cả đội pha chế.',
  ]),
  entry('bac_hung', 'Bánh su kem', [
    'Bác Hùng đã nghỉ hưu, sáng nào cũng đi bộ một vòng hồ rồi ghé quán. Bác gọi mocha vì thích vị sô cô la.',
    'Bác kể hồi trẻ bác làm thợ sửa đồng hồ. Bác hay ngồi xem đồng hồ treo tường của quán chạy có đúng giờ không.',
    'Bác Hùng tặng quán chiếc đồng hồ quả lắc bác tự sửa. Bác dặn cứ để nó điểm giờ mở cửa mỗi sáng.',
    'Bác Hùng lên chức ông nội và dẫn cháu tới quán khoe. Bác dặn cháu lớn lên nhớ ghé đây, vì chiếc đồng hồ trên tường là của ông sửa.',
  ]),
  entry('chi_thao', 'Bánh tart chanh', [
    'Chị Thảo làm y tá ca đêm ở bệnh viện gần đây. Chị ghé lấy ly trà chanh mát lạnh sau mỗi ca trực.',
    'Chị bảo vị chua nhẹ giúp chị tỉnh táo trên đường về. Hôm nay chị kể vừa giúp một em bé chào đời bình an.',
    'Chị Thảo giới thiệu quán cho cả khoa của chị. Giờ cứ sáng sớm là có vài chiếc áo trắng ngồi đợi trà chanh.',
    'Chị Thảo vừa được làm điều dưỡng trưởng. Chị kể nhiều đêm trực mệt mỏi, chỉ nghĩ tới ly trà chanh buổi sáng là chị thấy đỡ hơn.',
  ]),
  entry('anh_khoa', 'Bánh waffle', [
    'Anh Khoa là thợ chụp ảnh tự do, lúc nào cũng đeo máy ảnh. Anh gọi cà phê đá xay và chụp vài tấm ánh nắng trong quán.',
    'Anh kể bức ảnh chụp quầy pha chế của quán vừa được đăng báo. Anh bảo ánh sáng buổi chiều ở đây rất đẹp.',
    'Anh Khoa mở một buổi triển lãm ảnh nhỏ ngay trong quán. Tấm ảnh lớn nhất là cảnh đội pha chế cười trong giờ cao điểm.',
    'Anh Khoa in một cuốn sách ảnh về những quán quen trong thành phố. Trang bìa là quầy pha chế của quán mình, chụp đúng lúc nắng chiều chiếu qua cửa sổ.',
  ]),
];

export function regularBookEntry(regularId: string): RegularBookEntry | undefined {
  return REGULAR_BOOK.find((e) => e.regularId === regularId);
}

/** Visits of milestones 1–4 of a regular; empty for an id the book does not know. */
export function milestoneVisits(regularId: string): readonly number[] {
  return MILESTONE_VISITS[regularId] ?? [];
}

/**
 * Milestones (0–4) a regular has reached with `visits` counted visits;
 * `kept` are those a save from before E-22 reached in E-18's book.
 */
export function milestonesReached(regularId: string, visits: number, kept = 0): number {
  return Math.max(kept, milestoneVisits(regularId).filter((v) => visits >= v).length);
}

/** Milestone (1–4) the regular reaches exactly on visit `visits`, or 0; one already kept from E-18 is not reached again. */
export function milestoneAt(regularId: string, visits: number, kept = 0): number {
  const milestone = milestoneVisits(regularId).indexOf(visits) + 1;
  return milestone > kept ? milestone : 0;
}

/** Milestones reached in E-18's book (10/40/100 visits for everyone), for a save from before E-22. */
export function e18MilestonesReached(visits: number): number {
  return E18_MILESTONE_VISITS.filter((v) => visits >= v).length;
}

/** One regular's page of the book, for the UI. */
export interface RegularBookPage {
  regular: Regular;
  favoriteDish: string;
  /** Counted visits; 0 before the first. */
  visits: number;
  /** Milestones reached, 0–4. */
  reached: number;
  /** Visits of the next milestone, null once all four are reached. */
  nextVisits: number | null;
  milestones: readonly (RegularMilestone & { reached: boolean })[];
}

/** Every regular's page in REGULARS order, derived from `state.regulars` (older saves included). */
export function regularBook(state: GameState): RegularBookPage[] {
  return REGULARS.map((regular) => {
    const book = regularBookEntry(regular.id)!;
    const seen = state.regulars?.[regular.id];
    const visits = seen?.visits ?? 0;
    const reached = milestonesReached(regular.id, visits, seen?.keptMilestones);
    return {
      regular,
      favoriteDish: book.favoriteDish,
      visits,
      reached,
      nextVisits: book.milestones[reached]?.visits ?? null,
      milestones: book.milestones.map((m, i) => ({ ...m, reached: i < reached })),
    };
  });
}
