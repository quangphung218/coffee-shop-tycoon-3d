import type { MenuItemId, PersonaId, ReviewReason, Weather } from '../types';

/**
 * Customer personalities. Each one shapes how patient the customer is, what
 * they tend to order, whether they add a pastry, how long they linger and how
 * strictly they review. Personas are picked by a hash of the seed and the
 * customer id, never from the game RNG, so they do not disturb the deterministic
 * sequence the rest of the sim depends on.
 */
export interface Persona {
  id: PersonaId;
  name: string;
  /** Multiplier on base patience; below 1 is impatient, above 1 is patient. */
  patienceMult: number;
  /** Multiplier on how long they linger over a drink at a table. */
  sitMult: number;
  /** Order-weight multiplier per menu item; an item left out keeps weight 1. */
  itemWeights: Partial<Record<MenuItemId, number>>;
  /** Chance of adding a food item to the order, 0..1. */
  foodChance: number;
  /**
   * Review leaning: negative is lenient (sometimes bumps a star up), positive is
   * strict (sometimes knocks one off). The magnitude doubles as the probability.
   */
  reviewStrictness: number;
  /** Signature review lines by reason; reasons left out fall back to the shared texts. */
  reviewTexts: Partial<Record<ReviewReason, readonly string[]>>;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  office: {
    id: 'office',
    name: 'Dân văn phòng',
    patienceMult: 0.7,
    sitMult: 0.6,
    itemWeights: { americano: 2.2, espresso: 2, latte: 1.4, milk_tea: 0.5, frappe: 0.5 },
    foodChance: 0.15,
    reviewStrictness: 0,
    reviewTexts: {
      fast_service: ['Nhanh gọn, kịp giờ vào làm.', 'Pha nhanh, mua mang đi rất tiện.'],
      long_wait: ['Chờ lâu quá, suýt trễ giờ làm.', 'Đợi mãi mới có nước, sốt ruột ghê.'],
    },
  },
  student: {
    id: 'student',
    name: 'Sinh viên',
    patienceMult: 1.1,
    sitMult: 1.6,
    itemWeights: { milk_tea: 2.4, frappe: 1.8, lemon_tea: 1.5, espresso: 0.4, americano: 0.5 },
    foodChance: 0.2,
    reviewStrictness: 0,
    reviewTexts: {
      tasty: ['Trà sữa ngon mà giá hợp túi sinh viên.', 'Đồ uống ổn áp, ngồi học cả buổi được.'],
      nice_decor: ['Quán xinh, có chỗ ngồi học bài lâu.', 'Không gian thoải mái, ngồi mãi không chán.'],
    },
  },
  regular: {
    id: 'regular',
    name: 'Khách quen',
    patienceMult: 1.3,
    sitMult: 1.1,
    itemWeights: { latte: 1.4, cappuccino: 1.4, mocha: 1.2 },
    foodChance: 0.25,
    reviewStrictness: -0.4,
    reviewTexts: {
      tasty: ['Vẫn đậm vị như mọi khi, quán ruột của mình.', 'Ngon quen thuộc, ngày nào cũng ghé.'],
      fast_service: ['Nhân viên nhớ mặt, phục vụ chu đáo.', 'Quen rồi nên lúc nào cũng nhanh.'],
    },
  },
  connoisseur: {
    id: 'connoisseur',
    name: 'Người sành cà phê',
    patienceMult: 1,
    sitMult: 1.2,
    itemWeights: { espresso: 2.2, latte: 1.6, cappuccino: 1.6, mocha: 1.3, milk_tea: 0.2, lemon_tea: 0.2 },
    foodChance: 0.1,
    reviewStrictness: 0.4,
    reviewTexts: {
      tasty: ['Hạt pha chuẩn, hậu vị sạch, rất đáng.', 'Chiết xuất đều tay, cà phê có chiều sâu.'],
      long_wait: ['Chờ lâu mà ly chưa tới chuẩn, tiếc.', 'Đợi lâu, cà phê nguội mất cả hương.'],
    },
  },
  family: {
    id: 'family',
    name: 'Gia đình',
    patienceMult: 1.2,
    sitMult: 1.5,
    itemWeights: { latte: 1.3, mocha: 1.2, orange_juice: 1.6, milk_tea: 1.4 },
    foodChance: 0.7,
    reviewStrictness: 0,
    reviewTexts: {
      tasty: ['Cả nhà gọi nước lẫn bánh, ai cũng thích.', 'Đồ uống và bánh đều ngon, hợp đi cùng gia đình.'],
      nice_decor: ['Quán rộng rãi, cho trẻ con ngồi thoải mái.', 'Không gian ấm cúng, cả nhà ngồi vui.'],
    },
  },
};

export const PERSONA_IDS = Object.keys(PERSONAS) as PersonaId[];

/** Daytime buckets that shift the persona mix across the day. */
type Bucket = 'morning' | 'noon' | 'afternoon' | 'evening';

/** Base persona weights per daytime bucket (office early, student later). */
const HOUR_WEIGHTS: Record<Bucket, Record<PersonaId, number>> = {
  morning: { office: 4, student: 1, regular: 2.5, connoisseur: 1.5, family: 1 },
  noon: { office: 3, student: 1.5, regular: 2, connoisseur: 1, family: 2 },
  afternoon: { office: 1, student: 4, regular: 2, connoisseur: 1, family: 1.5 },
  evening: { office: 0.5, student: 3, regular: 2, connoisseur: 1, family: 3 },
};

/** Weather nudges the mix: rain keeps regulars in, heat brings students out. */
const WEATHER_PERSONA: Record<Weather, Partial<Record<PersonaId, number>>> = {
  sunny: {},
  rainy: { regular: 1.4, office: 1.2, student: 0.7 },
  hot: { student: 1.4, family: 1.2, office: 0.8 },
};

function timeBucket(minute: number): Bucket {
  if (minute < 11 * 60) return 'morning';
  if (minute < 14 * 60) return 'noon';
  if (minute < 18 * 60) return 'afternoon';
  return 'evening';
}

const PERSONA_SALT = 0x85ebca6b;
const ADDON_SALT = 0xc2b2ae35;
const ADDON_PICK_SALT = 0x27d4eb2f;
const UNIT = 4294967296;

/** A stable 32-bit hash of the seed, a customer id and a salt, independent of the game RNG. */
function customerHash(seed: number, id: number, salt: number): number {
  let h = ((seed >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ ((id + salt) >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** The persona of customer `id`, weighted by the hour and the weather. */
export function pickPersona(seed: number, id: number, minute: number, weather: Weather): PersonaId {
  const hourly = HOUR_WEIGHTS[timeBucket(minute)];
  const weatherAdj = WEATHER_PERSONA[weather];
  const weights = PERSONA_IDS.map((p) => hourly[p] * (weatherAdj[p] ?? 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = (customerHash(seed, id, PERSONA_SALT) / UNIT) * total;
  for (let i = 0; i < PERSONA_IDS.length; i++) {
    r -= weights[i]!;
    if (r < 0) return PERSONA_IDS[i]!;
  }
  return PERSONA_IDS[PERSONA_IDS.length - 1]!;
}

/** Deterministic roll in [0, 1) deciding whether customer `id` adds a pastry. */
export function addOnRoll(seed: number, id: number): number {
  return customerHash(seed, id, ADDON_SALT) / UNIT;
}

/** Deterministic roll in [0, 1) used to pick which food the add-on is. */
export function addOnPick(seed: number, id: number): number {
  return customerHash(seed, id, ADDON_PICK_SALT) / UNIT;
}
