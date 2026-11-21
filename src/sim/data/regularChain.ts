import type { MenuItemId } from '../types';

/**
 * Season 3+ regulars (E-32). Once a season-2 or later regular completes
 * milestone 4, their successor moves in to their place, so the Sổ khách quen
 * never runs out. Each first-eight place is a chain: first-eight regular,
 * season-2 regular NEW_REGULARS[i], then generated regulars i, i + 8,
 * i + 16, ... (chainSuccessor in regulars.ts). generatedProfile(k) is pure
 * data of k, no RNG and no state.
 *
 * Stories are composed, not written per season: a profession template gives
 * the facts of each of the four milestone beats of the first two seasons
 * (1: who they are, 2: they open up about their work, 3: they bring
 * something or someone to the shop, 4: a turning point in their life), and
 * the beat adds a second sentence about the shop. Two sentences per
 * milestone, no emoji.
 *
 * Uniqueness: given names come from pools that leave out the 16 regulars of
 * seasons 1–2 and the female and male pools share none, so every generated
 * name differs from every other regular's. A profession is the template's job
 * and workplace; after the 16 templates are used once, each later round
 * moves the workplace to a numbered street (đường số 2, 3, ...), so no two
 * regulars share one either.
 */

export interface GeneratedProfile {
  id: string;
  /** 0-based index: chain slot k % 8, generation k / 8 after season 2. */
  index: number;
  /** Form of address + given name, e.g. "Chị Hằng". */
  name: string;
  /** Job and workplace; unique per regular. */
  profession: string;
  favorite: MenuItemId;
  favoriteDish: string;
  look: number;
  /** Visits of milestones 1–4. */
  visits: readonly [number, number, number, number];
  /** Two sentences per milestone. */
  stories: readonly [string, string, string, string];
}

type Form = 'Cô' | 'Chị' | 'Anh' | 'Chú' | 'Em';

interface ProfessionTemplate {
  form: Form;
  female: boolean;
  /** Job, used in the profession label. */
  job: string;
  /** Workplace phrase of the first round. */
  place: string;
  /** Workplace head for later rounds: `${street} trên đường số n`. */
  street: string;
  favorite: MenuItemId;
  favoriteDish: string;
  /** Beat 1, sentence 1; {N} is the name, {P} the workplace. */
  intro: string;
  /** Beats 2–4, sentence 1; {N} is the name. */
  work: string;
  bring: string;
  turn: string;
}

/** Alternating female/male, so the k-th generated regular is female for even k % 16. */
const TEMPLATES: readonly ProfessionTemplate[] = [
  {
    form: 'Chị', female: true, job: 'thợ may áo dài', place: 'ở một tiệm nhỏ cuối phố', street: 'ở một tiệm may',
    favorite: 'cappuccino', favoriteDish: 'Bánh chuối nướng',
    intro: '{N} may áo dài {P}.',
    work: '{N} kể mùa cưới năm nay tiệm nhận may gần trăm bộ áo dài.',
    bring: '{N} may tặng đội pha chế mỗi người một chiếc tạp dề có thêu tên quán.',
    turn: '{N} vừa có bộ áo dài đầu tiên được trình diễn ở nhà văn hóa quận.',
  },
  {
    form: 'Anh', female: false, job: 'bác sĩ thú y', place: 'ở phòng khám cuối con dốc', street: 'ở một phòng khám',
    favorite: 'americano', favoriteDish: 'Bánh mì que',
    intro: '{N} là bác sĩ thú y {P}.',
    work: '{N} kể vừa bó bột cho một chú chó nhỏ bị gãy chân.',
    bring: '{N} dẫn chú chó nhỏ ấy, giờ đã chạy nhảy khỏe mạnh, tới quán chào đội pha chế.',
    turn: '{N} mở được phòng khám riêng, có cả một góc nhận nuôi chó mèo bị bỏ rơi.',
  },
  {
    form: 'Chị', female: true, job: 'dược sĩ', place: 'ở hiệu thuốc đầu phố', street: 'ở một hiệu thuốc',
    favorite: 'lemon_tea', favoriteDish: 'Bánh bò nướng',
    intro: '{N} là dược sĩ {P}.',
    work: '{N} kể mùa mưa này người tới mua thuốc cảm đông tới mức không kịp ăn trưa.',
    bring: '{N} mang tới quán một hộp thuốc nhỏ để dành cho lúc đội pha chế lỡ đứt tay.',
    turn: '{N} vừa mở được hiệu thuốc của riêng mình, ngay gần chợ.',
  },
  {
    form: 'Anh', female: false, job: 'họa sĩ vẽ tranh tường', place: 'ở xưởng vẽ trong con hẻm sau chợ', street: 'ở một xưởng vẽ',
    favorite: 'cold_brew', favoriteDish: 'Bánh quế',
    intro: '{N} là họa sĩ vẽ tranh tường, làm việc {P}.',
    work: '{N} kể bức tranh tường mới nhất của mình dài gần hết một dãy phố.',
    bring: '{N} vẽ lên bức tường cạnh cửa quán cảnh buổi sáng có người xếp hàng mua cà phê.',
    turn: '{N} vừa được mời vẽ tranh cho nhà ga mới của thành phố.',
  },
  {
    form: 'Cô', female: true, job: 'thợ làm bánh mì', place: 'ở lò bánh trong hẻm nhỏ', street: 'ở một lò bánh',
    favorite: 'latte', favoriteDish: 'Bánh mì hoa cúc',
    intro: '{N} làm bánh mì {P}, ngày nào cũng dậy từ ba giờ sáng để nhồi bột.',
    work: '{N} kể bí quyết của ổ bánh giòn là canh lửa lò cho thật đều.',
    bring: '{N} mang tới quán một rổ bánh mì vừa ra lò để đội pha chế ăn sáng.',
    turn: '{N} vừa truyền lại lò bánh cho con gái và được cả xóm tới chúc mừng.',
  },
  {
    form: 'Chú', female: false, job: 'thợ cắt tóc', place: 'ở tiệm nhỏ cạnh gốc cây bàng', street: 'ở một tiệm nhỏ',
    favorite: 'espresso', favoriteDish: 'Bánh pía',
    intro: '{N} cắt tóc {P} đã gần ba mươi năm.',
    work: '{N} kể có người đã cắt tóc ở tiệm từ hồi còn đi học, giờ dẫn cả con trai tới.',
    bring: '{N} mang chiếc ghế cắt tóc cũ bằng gỗ tới tặng quán làm chỗ ngồi chờ.',
    turn: '{N} vừa giao tiệm cho cậu học việc và chỉ cắt cho khách quen vào sáng Chủ nhật.',
  },
  {
    form: 'Chị', female: true, job: 'huấn luyện viên yoga', place: 'ở câu lạc bộ trên tầng ba khu chợ', street: 'ở một câu lạc bộ',
    favorite: 'orange_juice', favoriteDish: 'Bánh yến mạch chuối',
    intro: '{N} dạy yoga {P}.',
    work: '{N} kể lớp sáng sớm của mình toàn các cô các bác ngoài sáu mươi tuổi.',
    bring: '{N} dẫn cả lớp yoga tới quán sau buổi tập ngoài công viên.',
    turn: '{N} vừa mở được phòng tập riêng, có cửa sổ nhìn ra hàng cây.',
  },
  {
    form: 'Anh', female: false, job: 'phóng viên', place: 'ở ngay ngã ba gần quán', street: 'ở một tòa nhà',
    favorite: 'americano', favoriteDish: 'Bánh mì thịt nướng',
    intro: '{N} là phóng viên, tòa soạn {P}.',
    work: '{N} kể bài phóng sự mới nhất của mình viết về những gánh hàng rong buổi sớm.',
    bring: '{N} viết một bài nhỏ về quán và mang tờ báo tới tặng đội pha chế.',
    turn: '{N} vừa nhận giải báo chí của thành phố cho loạt bài về khu phố này.',
  },
  {
    form: 'Cô', female: true, job: 'người bán trái cây', place: 'ở sạp đầu chợ', street: 'ở một sạp nhỏ',
    favorite: 'orange_juice', favoriteDish: 'Bánh flan dừa',
    intro: '{N} bán trái cây {P}.',
    work: '{N} kể mùa xoài năm nay ngọt nên sạp bán hết từ trước trưa.',
    bring: '{N} mang tới quán một giỏ cam thật mọng để đội pha chế ép nước.',
    turn: '{N} vừa xây xong căn nhà mới bằng tiền dành dụm từ sạp trái cây.',
  },
  {
    form: 'Anh', female: false, job: 'kỹ sư điện', place: 'ở khu chung cư mới gần quán', street: 'ở một khu nhà',
    favorite: 'frappe', favoriteDish: 'Bánh mì bơ đường',
    intro: '{N} là kỹ sư điện, đang làm cho công trình {P}.',
    work: '{N} kể cả tuần nay đội của mình kéo dây điện cho hai mươi tầng nhà.',
    bring: '{N} tranh thủ ngày nghỉ sửa giúp quán dàn đèn trên quầy cho sáng hơn.',
    turn: '{N} vừa được làm trưởng công trình đầu tiên của đời mình.',
  },
  {
    form: 'Chị', female: true, job: 'hướng dẫn viên du lịch', place: 'có văn phòng gần bến xe', street: 'có văn phòng',
    favorite: 'cappuccino', favoriteDish: 'Bánh dừa nướng',
    intro: '{N} làm hướng dẫn viên cho một công ty du lịch {P}.',
    work: '{N} kể vừa dẫn một đoàn khách nước ngoài đi hết các con hẻm trong phố cũ.',
    bring: '{N} dẫn cả đoàn khách ghé quán để họ nếm thử cà phê của phố mình.',
    turn: '{N} vừa mở công ty du lịch nhỏ của riêng mình, chuyên đưa khách đi các quán quen.',
  },
  {
    form: 'Chú', female: false, job: 'thợ mộc', place: 'ở xưởng gỗ cuối hẻm', street: 'ở một xưởng gỗ',
    favorite: 'mocha', favoriteDish: 'Bánh gai',
    intro: '{N} làm thợ mộc {P}, tay áo lúc nào cũng dính mùn cưa.',
    work: '{N} kể vừa đóng xong một chiếc tủ cưới cho cô dâu mới trong xóm.',
    bring: '{N} đóng tặng quán một chiếc kệ gỗ nhỏ để bày ly tách.',
    turn: '{N} vừa nhận lớp học việc đầu tiên ở xưởng và dạy các em từng đường bào.',
  },
  {
    form: 'Cô', female: true, job: 'giáo viên mầm non', place: 'ở trường mẫu giáo cạnh công viên', street: 'ở một trường mẫu giáo',
    favorite: 'milk_tea', favoriteDish: 'Bánh bông lan cuộn',
    intro: '{N} dạy mầm non {P}.',
    work: '{N} kể hôm nay cả lớp tập hát mãi mới thuộc một bài.',
    bring: '{N} mang tới quán xấp tranh các bé vẽ ly cà phê để tặng đội pha chế.',
    turn: '{N} vừa được làm hiệu trưởng trường mẫu giáo.',
  },
  {
    form: 'Anh', female: false, job: 'nhạc công guitar', place: 'ở phòng trà bên kia sông', street: 'ở một phòng trà',
    favorite: 'mocha', favoriteDish: 'Bánh sô-cô-la nóng chảy',
    intro: '{N} chơi guitar mỗi tối {P}.',
    work: '{N} kể đêm qua khách xin hát lại một bài tới ba lần.',
    bring: '{N} mang đàn tới và chơi vài bài cho quán trong một buổi chiều mưa.',
    turn: '{N} vừa ra album đầu tiên, trong đó có một bài viết về quán.',
  },
  {
    form: 'Em', female: true, job: 'học sinh lớp mười hai', place: 'nhà ở con hẻm sau quán', street: 'nhà',
    favorite: 'milk_tea', favoriteDish: 'Bánh su sầu riêng',
    intro: '{N} là học sinh lớp mười hai, {P}.',
    work: '{N} kể đang ôn thi đại học và mơ sau này làm bác sĩ.',
    bring: '{N} rủ cả nhóm bạn tới quán ôn bài vào mỗi tối thứ Năm.',
    turn: '{N} vừa đỗ đại học y và ghé quán khoe giấy báo nhập học.',
  },
  {
    form: 'Chú', female: false, job: 'bưu tá', place: 'khắp mấy con phố quanh quán', street: 'dọc các ngõ',
    favorite: 'latte', favoriteDish: 'Bánh tiêu',
    intro: '{N} là bưu tá, ngày nào cũng đạp xe đưa thư {P}.',
    work: '{N} kể có lá thư phải đi tìm cả buổi mới đưa được tận tay người nhận.',
    bring: '{N} mang tới quán tấm bưu thiếp một khách quen cũ gửi về chào cả quán.',
    turn: '{N} vừa nghỉ hưu sau ba mươi năm đưa thư và được cả khu phố tiễn chân.',
  },
];

/**
 * Sentence 2 of each beat, about the shop; {F} is the form of address
 * (capitalised), {f} the same in lower case, {D} the favourite drink. The k-th
 * regular uses variant (k + beat) % 3, so neighbours in a season differ.
 */
const BEATS: readonly (readonly [string, string, string])[] = [
  [
    '{F} gọi một ly {D} rồi ngồi ở bàn gần cửa sổ.',
    'Lần nào ghé, {f} cũng gọi ly {D} quen thuộc.',
    '{F} thích ly {D} của quán vì uống xong thấy tỉnh cả buổi.',
  ],
  [
    '{F} bảo ngồi ở quán một lúc là thấy nhẹ cả người.',
    '{F} khen ly {D} ở đây lúc nào cũng pha vừa miệng.',
    '{F} nói giờ đã thuộc tên từng người trong đội pha chế.',
  ],
  [
    '{F} nói quán này giờ đã thành một phần ngày thường của {f}.',
    'Từ hôm đó, khách quen nào ghé quán cũng hỏi thăm {f}.',
    '{F} bảo được góp một chút cho quán là {f} vui rồi.',
  ],
  [
    '{F} bảo dù bận đến đâu, sáng nào cũng phải ghé quán uống ly {D} đã.',
    'Hôm ấy, {f} đặt {D} cho cả đội pha chế để cảm ơn quán.',
    '{F} nói những buổi ngồi ở quán đã giúp {f} đi được tới hôm nay.',
  ],
];

const DRINK_NAMES: Readonly<Partial<Record<MenuItemId, string>>> = {
  espresso: 'espresso',
  americano: 'americano',
  latte: 'latte',
  cappuccino: 'cappuccino',
  mocha: 'mocha',
  frappe: 'cà phê đá xay',
  milk_tea: 'trà sữa',
  lemon_tea: 'trà chanh',
  orange_juice: 'nước cam',
  cold_brew: 'cold brew',
};

/** Given names of seasons 1–2 (Lan, Minh, ... Linh) are left out; the two pools share none. */
const FEMALE_NAMES = [
  'Hằng', 'Trang', 'Nhung', 'Yến', 'Hạnh', 'Thu', 'Hương', 'Quyên', 'Diệp', 'Ngân',
  'Hiền', 'Loan', 'Oanh', 'Phượng', 'Châu', 'Uyên', 'Thư', 'Trinh', 'Giang', 'Dung',
  'Nga', 'My', 'Thủy', 'Xuân', 'Duyên', 'Tâm', 'Hà', 'Ánh', 'Huyền', 'Nhi',
] as const;
const MALE_NAMES = [
  'Quân', 'Tùng', 'Hải', 'Long', 'Sơn', 'Thắng', 'Dũng', 'Hiếu', 'Bình', 'Trung',
  'Toàn', 'Lộc', 'Vinh', 'Kiên', 'Thành', 'Hoàng', 'Nghĩa', 'Tín', 'Hậu', 'Quang',
  'Tài', 'Huy', 'Lâm', 'Đạt', 'Tiến', 'Khải', 'Phúc', 'Bảo', 'Cường', 'Việt',
] as const;
/** Middle names for later rounds of the pools ("Chị Thanh Hằng"), then family names. */
const FEMALE_MIDDLE = ['Thanh', 'Bích', 'Kim', 'Diệu', 'Mỹ', 'Phương', 'Hồng', 'Quỳnh', 'Tuyết', 'Khánh'] as const;
const MALE_MIDDLE = ['Quốc', 'Hữu', 'Gia', 'Đình', 'Xuân', 'Mạnh', 'Công', 'Trọng', 'Minh', 'Thế'] as const;
const FAMILY = ['Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương'] as const;

/**
 * The n-th given name of a pool: the pool once, then middle + given, then
 * family + middle + given. Distinct for n < pool·(1 + middle·(1 + family)),
 * 3,330 per gender, about 830 seasons.
 */
function givenName(n: number, pool: readonly string[], middle: readonly string[]): string {
  const given = pool[n % pool.length]!;
  const round = Math.floor(n / pool.length);
  if (round === 0) return given;
  const m = middle[(round - 1) % middle.length]!;
  const f = Math.floor((round - 1) / middle.length);
  return f === 0 ? `${m} ${given}` : `${FAMILY[(f - 1) % FAMILY.length]!} ${m} ${given}`;
}

/**
 * Spacing rule (E-32, the one data-only rule): a chain keeps E-27's season-2
 * rhythm forever. Counting visits along the chain from the season-2 regular's
 * first, chain milestone M (0, 1, 2, ...) is reached at
 * chainVisits(i, M) = 50 + 40·M + OFFSETS[(i + 3·M) % 8], which for M = 0..3 is
 * exactly NEW_REGULARS[i]'s MILESTONE_VISITS. Generated regular k = 8·(g - 1) + i
 * (g = 1, 2, ... after season 2) holds chain milestones 4g..4g+3, so their own
 * thresholds are those minus the chain visits at their predecessor's
 * milestone 4. The slot pattern E-27 measured (at most 3 a week) thus repeats
 * every 40 visits instead of drifting with each successor's own offsets.
 */
const OFFSETS = [1, 2, 3, 4, 6, 7, 8, 9] as const;
/** Slots per season: one chain per first-eight regular. */
const CHAIN_SLOTS = 8;

export function chainVisits(i: number, m: number): number {
  return 50 + 40 * m + OFFSETS[(i + 3 * m) % 8]!;
}

/** Visits of milestones 1–4 of the k-th generated regular, counted from their own first visit. */
export function generatedVisits(k: number): readonly [number, number, number, number] {
  const i = k % CHAIN_SLOTS;
  const first = 4 * (Math.floor(k / CHAIN_SLOTS) + 1);
  const before = chainVisits(i, first - 1);
  const v = (m: number): number => chainVisits(i, first + m) - before;
  return [v(0), v(1), v(2), v(3)];
}

const ID_PREFIX = 'gen_';

export function generatedId(k: number): string {
  return `${ID_PREFIX}${k}`;
}

/** Index of a generated id, or -1 for any other string. */
export function generatedIndex(id: string): number {
  if (!id.startsWith(ID_PREFIX)) return -1;
  const digits = id.slice(ID_PREFIX.length);
  if (!/^(0|[1-9]\d{0,8})$/.test(digits)) return -1;
  return Number(digits);
}

function fill(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w)\}/g, (_, key: string) => vars[key] ?? '');
}

/** Season 3+ regular k (k >= 0). */
export function generatedProfile(k: number): GeneratedProfile {
  const t = TEMPLATES[k % TEMPLATES.length]!;
  const round = Math.floor(k / TEMPLATES.length);
  // Templates alternate female/male, so each gender's n-th regular is k / 2.
  const n = Math.floor(k / 2);
  const given = t.female ? givenName(n, FEMALE_NAMES, FEMALE_MIDDLE) : givenName(n, MALE_NAMES, MALE_MIDDLE);
  const name = `${t.form} ${given}`;
  const place = round === 0 ? t.place : `${t.street} trên đường số ${round + 1}`;
  const vars = { N: name, P: place, F: t.form, f: t.form.toLowerCase(), D: DRINK_NAMES[t.favorite] ?? t.favorite };
  const firsts = [t.intro, t.work, t.bring, t.turn];
  const story = (beat: number): string => `${fill(firsts[beat]!, vars)} ${fill(BEATS[beat]![(k + beat) % 3]!, vars)}`;
  return {
    id: generatedId(k),
    index: k,
    name,
    profession: `${t.job} ${place}`,
    favorite: t.favorite,
    favoriteDish: t.favoriteDish,
    look: 8 + (k % 8),
    visits: generatedVisits(k),
    stories: [story(0), story(1), story(2), story(3)],
  };
}
