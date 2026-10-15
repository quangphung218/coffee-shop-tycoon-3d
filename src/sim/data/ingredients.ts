import type { IngredientDef, IngredientId } from '../types';

export const INGREDIENTS: readonly IngredientDef[] = [
  { id: 'coffee_beans', name: 'Cà phê hạt', icon: '🫘', unit: 'g', unitPrice: 300, packSize: 500, lowStock: 100 },
  { id: 'milk', name: 'Sữa tươi', icon: '🥛', unit: 'ml', unitPrice: 40, packSize: 1000, lowStock: 300 },
  { id: 'sugar', name: 'Đường', icon: '🧂', unit: 'g', unitPrice: 25, packSize: 1000, lowStock: 100 },
  { id: 'cacao', name: 'Bột cacao', icon: '🍫', unit: 'g', unitPrice: 400, packSize: 200, lowStock: 30 },
  { id: 'tea', name: 'Trà', icon: '🍵', unit: 'g', unitPrice: 500, packSize: 100, lowStock: 20 },
  { id: 'pearls', name: 'Trân châu', icon: '⚫', unit: 'g', unitPrice: 80, packSize: 1000, lowStock: 150 },
  { id: 'lemon', name: 'Chanh', icon: '🍋', unit: 'quả', unitPrice: 3000, packSize: 10, lowStock: 3 },
  { id: 'orange', name: 'Cam', icon: '🍊', unit: 'quả', unitPrice: 5000, packSize: 12, lowStock: 6 },
  { id: 'flour', name: 'Bột bánh', icon: '🌾', unit: 'g', unitPrice: 30, packSize: 1000, lowStock: 150 },
  { id: 'butter', name: 'Bơ', icon: '🧈', unit: 'g', unitPrice: 250, packSize: 250, lowStock: 60 },
  { id: 'ice', name: 'Đá viên', icon: '🧊', unit: 'g', unitPrice: 3, packSize: 5000, lowStock: 600 },
  { id: 'cup', name: 'Ly', icon: '🥤', unit: 'cái', unitPrice: 1500, packSize: 50, lowStock: 10 },
];

const BY_ID = new Map<IngredientId, IngredientDef>(INGREDIENTS.map((i) => [i.id, i]));

export function getIngredient(id: IngredientId): IngredientDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown ingredient: ${id}`);
  return def;
}

export function isIngredientId(id: string): id is IngredientId {
  return BY_ID.has(id as IngredientId);
}
