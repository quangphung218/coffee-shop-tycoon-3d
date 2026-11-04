import type { GameState } from '../types';
import { REGULARS, newRegularOrder, regularById, type Regular } from './regulars';

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
  // Season 2 (E-27, NEW_REGULARS): a new regular moves in once one of the
  // first eight reaches milestone 4. Measured for b_steady2 Normal (seeds 1,
  // 42, 7, 2026): the move-ins land on fixed slot days about 5 days apart
  // (237, 242, ..., 273), only who fills each slot is shuffled by seed, and a
  // new regular then comes every day, so visit v falls on day moveIn + v - 1.
  // Rule (T-97, one re-stagger): visits = 50 + 40·m + OFFSETS[(i + 3·m) % 8]
  // for milestone m = 0..3 of the i-th NEW_REGULARS entry, OFFSETS =
  // [1, 2, 3, 4, 6, 7, 8, 9]. Near-equal thresholds per milestone let the
  // 5-day slot gaps space the milestones whatever the shuffle; 40 visits per
  // milestone is one slot cycle, so milestone m+1 starts after milestone m of
  // the last slot; the rotation stops a clash in one milestone repeating in the
  // next. At most 3 a week for every one of the 8! move-in orders. Milestone 1
  // (51+ visits, day 287+) never falls in weeks 1–40. Offsets are never 0 or 5
  // and 50 and 40 are multiples of 5, so no threshold is a multiple of 5 and
  // none is shared with each other or with the first eight.
  co_mai: [51, 94, 138, 172],
  anh_duc: [52, 96, 139, 173],
  chi_ngoc: [53, 97, 131, 174],
  chu_bay: [54, 98, 132, 176],
  em_nam: [56, 99, 133, 177],
  ba_tu: [57, 91, 134, 178],
  anh_phong: [58, 92, 136, 179],
  chi_linh: [59, 93, 137, 171],
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

/** Book of the season-2 regulars (E-27), in NEW_REGULARS order. */
export const NEW_REGULAR_BOOK: readonly RegularBookEntry[] = [
  entry('co_mai', 'Bánh quy yến mạch', [
    'Cô Mai là thủ thư ở thư viện quận, vừa chuyển về căn nhà đầu hẻm. Cô gọi ly cold brew rồi ngồi đọc sách tới khi tan nắng.',
    'Cô bảo quán yên tĩnh y như phòng đọc của cô. Cô để lại trên kệ vài cuốn sách cũ cho khách mượn đọc.',
    'Kệ sách nhỏ của cô Mai giờ đã kín ba ngăn. Khách mượn một cuốn thì để lại một cuốn khác, cô gọi đó là thư viện cà phê.',
    'Cô Mai tổ chức buổi đọc truyện cho trẻ con trong xóm mỗi chiều thứ Bảy. Bọn nhỏ nghe xong thì xếp hàng chờ cô ký tên vào cuốn sổ mượn sách.',
  ]),
  entry('anh_duc', 'Bánh mì phô mai', [
    'Anh Đức là kiến trúc sư, mới thuê văn phòng ở tầng trên tiệm may gần quán. Anh gọi cappuccino và phác thảo lên khăn giấy.',
    'Anh khen trần quán cao nên ánh sáng vào đều. Anh hỏi mượn cây bút chì của quầy và quên trả tới tận hôm sau.',
    'Anh Đức vẽ tặng quán bản phác thảo mặt tiền lúc mới mở cửa. Anh dặn treo cạnh quầy để khách thấy quán đã đổi khác bao nhiêu.',
    'Công trình đầu tiên anh Đức tự thiết kế vừa khánh thành. Anh bảo ý tưởng ô cửa sổ lớn là lấy từ chỗ ngồi quen của anh ở quán.',
  ]),
  entry('chi_ngoc', 'Bánh bông lan cam', [
    'Chị Ngọc dạy đàn piano cho trẻ con trong khu phố. Giữa hai buổi học, chị ghé uống ly nước cam cho mát giọng.',
    'Chị kể có cậu học trò nhỏ tập mãi một bài mà chưa thuộc. Chị bảo dạy đàn cũng như pha cà phê, phải kiên nhẫn từng chút.',
    'Cậu học trò ấy vừa đàn trọn bài trong buổi biểu diễn của lớp. Chị Ngọc mua bánh cho cả lớp và mang tới quán ăn mừng.',
    'Chị Ngọc mở lớp nhạc riêng ngay con phố này. Buổi khai giảng, chị dẫn học trò ghé quán đàn một bài tặng đội pha chế.',
  ]),
  entry('chu_bay', 'Bánh bao nhân thịt', [
    'Chú Bảy mở tiệm sửa xe đạp ở góc chợ, tay lúc nào cũng dính dầu. Chú uống americano đen, không đường, đứng ngay quầy.',
    'Chú kể đã sửa xe cho ba thế hệ trong xóm. Chú bảo cái chuông xe đạp kêu trong là chú nghe ra ngay xe của ai.',
    'Chú Bảy sửa lại chiếc xe đạp cũ dựng trước cửa quán làm chỗ treo chậu cây. Khách đi ngang ai cũng dừng lại chụp ảnh.',
    'Chú Bảy truyền nghề cho đứa cháu và chỉ ghé tiệm buổi sáng. Chú nói sáng nào không có ly americano ở đây thì tay chú không vững.',
  ]),
  entry('em_nam', 'Bánh sừng bò sô cô la', [
    'Em Nam vừa đi học vừa chạy giao hàng buổi tối. Em gọi đá xay và ngồi tranh thủ làm bài tập trước giờ nhận đơn.',
    'Em bảo quán có ổ cắm sạc điện thoại là cứu em mỗi ngày. Em còn thuộc tên món của quán hơn cả tên các môn học.',
    'Em Nam mua được chiếc xe máy mới bằng tiền tự để dành. Em chở ly đá xay đầu tiên của ngày về tặng mẹ.',
    'Em Nam ra trường và nhận việc ở một công ty giao vận. Ngày đầu đi làm, em ghé quán mua cà phê cho cả phòng mới.',
  ]),
  entry('ba_tu', 'Xôi lá dứa', [
    'Bà Tư bán xôi ở đầu hẻm đã hơn hai mươi năm. Dọn hàng xong, bà ghé quán gọi ly latte thật nóng.',
    'Bà bảo trước giờ chỉ uống cà phê phin, giờ mới biết thêm vị latte. Bà hay mang theo một gói xôi nhỏ để mời người pha.',
    'Bà Tư gửi quán công thức xôi lá dứa của bà. Bà dặn món ngon thì phải làm bằng cái tâm, như ly cà phê bà uống mỗi sáng.',
    'Con cháu bà Tư tổ chức mừng thọ bà ngay tại quán. Bà cắt bánh xong thì bảo quán này giờ cũng như một góc nhà của bà.',
  ]),
  entry('anh_phong', 'Bánh brownie', [
    'Anh Phong là đầu bếp ở nhà hàng hai dãy phố. Trước ca chiều, anh ghé uống ly mocha và hỏi chuyện về hạt cà phê.',
    'Anh bảo vị sô cô la trong ly mocha ở đây vừa tới. Anh nói nấu ăn hay pha chế thì cũng cần đúng lửa và đúng lúc.',
    'Anh Phong mời đội pha chế tới nếm thử thực đơn mới của nhà hàng. Món tráng miệng anh làm có chút cà phê của quán.',
    'Anh Phong mở được nhà hàng riêng, ngay trên con phố này. Anh đặt cà phê của quán cho món tráng miệng cuối bữa.',
  ]),
  entry('chi_linh', 'Bánh tart trứng', [
    'Chị Linh làm ở ngân hàng, vừa được chuyển về chi nhánh gần quán. Chị gọi trà chanh mang đi và luôn đi vội.',
    'Chị kể giờ nghỉ trưa ngắn nên chị chỉ kịp uống một ly. Chị bảo ly trà chanh ở đây là phần thưởng sau buổi sáng đếm tiền.',
    'Chị Linh rủ cả phòng ghé quán vào chiều thứ Sáu. Từ đó cuối tuần nào cũng có một bàn đông người mặc áo sơ mi trắng.',
    'Chị Linh lên làm trưởng chi nhánh. Ngày nhận chức, chị đặt trà chanh cho cả chi nhánh và ghé quán cảm ơn.',
  ]),
];

/** Every regular's book entry, the first eight then season 2. */
const ALL_BOOK: readonly RegularBookEntry[] = [...REGULAR_BOOK, ...NEW_REGULAR_BOOK];

export function regularBookEntry(regularId: string): RegularBookEntry | undefined {
  return ALL_BOOK.find((e) => e.regularId === regularId);
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

/**
 * Season-2 regulars (NEW_REGULARS) that have moved in, in the order they did:
 * each is the `succeededBy` of one of the first eight in `state.regulars`.
 */
export function movedInRegulars(state: GameState): Regular[] {
  const seen = state.regulars ?? {};
  const ids = new Set(REGULARS.flatMap((r) => (seen[r.id]?.succeededBy ? [seen[r.id]!.succeededBy!] : [])));
  return newRegularOrder(state.seed).filter((id) => ids.has(id)).map((id) => regularById(id)!);
}

/** Regulars the book shows: the first eight, then the season-2 ones that moved in. */
export function bookRegulars(state: GameState): Regular[] {
  return [...REGULARS, ...movedInRegulars(state)];
}

/** Every regular's page, REGULARS order then season 2 as they moved in, derived from `state.regulars` (older saves included). */
export function regularBook(state: GameState): RegularBookPage[] {
  return bookRegulars(state).map((regular) => {
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
