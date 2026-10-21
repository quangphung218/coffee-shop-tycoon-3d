import type { IngredientAmount, MenuItemDef, MenuItemId } from '../types';
import { getIngredient } from './ingredients';

type MenuItemSpec = Omit<MenuItemDef, 'cost'>;

/** Ingredient cost of one serving, in đồng. */
export function ingredientCost(ingredients: readonly IngredientAmount[]): number {
  return Math.round(ingredients.reduce((sum, a) => sum + getIngredient(a.id).unitPrice * a.qty, 0));
}

const SPECS: MenuItemSpec[] = [
  {
    id: 'espresso',
    name: 'Espresso',
    icon: '☕',
    category: 'drink',
    price: 25000,
    prepMinutes: 2,
    ingredients: [
      { id: 'coffee_beans', qty: 18 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'hot',
    popularity: 0.5,
  },
  {
    id: 'americano',
    name: 'Americano',
    icon: '☕',
    category: 'drink',
    price: 30000,
    prepMinutes: 3,
    ingredients: [
      { id: 'coffee_beans', qty: 18 },
      { id: 'ice', qty: 150 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'cold',
    popularity: 0.6,
  },
  {
    id: 'latte',
    name: 'Latte',
    icon: '🥛',
    category: 'drink',
    price: 40000,
    prepMinutes: 4,
    ingredients: [
      { id: 'coffee_beans', qty: 18 },
      { id: 'milk', qty: 150 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'hot',
    popularity: 0.9,
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    icon: '☕',
    category: 'drink',
    price: 40000,
    prepMinutes: 4,
    ingredients: [
      { id: 'coffee_beans', qty: 18 },
      { id: 'milk', qty: 120 },
      { id: 'cacao', qty: 2 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'hot',
    popularity: 0.8,
  },
  {
    id: 'mocha',
    name: 'Mocha',
    icon: '🍫',
    category: 'drink',
    price: 45000,
    prepMinutes: 5,
    ingredients: [
      { id: 'coffee_beans', qty: 18 },
      { id: 'milk', qty: 120 },
      { id: 'cacao', qty: 15 },
      { id: 'sugar', qty: 10 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'hot',
    popularity: 0.6,
  },
  {
    id: 'frappe',
    name: 'Cà phê đá xay',
    icon: '🥤',
    category: 'drink',
    price: 45000,
    prepMinutes: 5,
    ingredients: [
      { id: 'coffee_beans', qty: 18 },
      { id: 'milk', qty: 120 },
      { id: 'ice', qty: 200 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'cold',
    popularity: 0.7,
  },
  {
    id: 'milk_tea',
    name: 'Trà sữa',
    icon: '🧋',
    category: 'drink',
    price: 35000,
    prepMinutes: 4,
    ingredients: [
      { id: 'tea', qty: 5 },
      { id: 'milk', qty: 100 },
      { id: 'sugar', qty: 20 },
      { id: 'pearls', qty: 50 },
      { id: 'ice', qty: 150 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'cold',
    popularity: 1,
  },
  {
    id: 'lemon_tea',
    name: 'Trà chanh',
    icon: '🍋',
    category: 'drink',
    price: 20000,
    prepMinutes: 2,
    ingredients: [
      { id: 'tea', qty: 5 },
      { id: 'lemon', qty: 1 },
      { id: 'sugar', qty: 25 },
      { id: 'ice', qty: 200 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'cold',
    popularity: 0.8,
  },
  {
    id: 'orange_juice',
    name: 'Nước cam',
    icon: '🍊',
    category: 'drink',
    price: 35000,
    prepMinutes: 3,
    ingredients: [
      { id: 'orange', qty: 3 },
      { id: 'sugar', qty: 10 },
      { id: 'ice', qty: 100 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'cold',
    popularity: 0.5,
  },
  {
    id: 'croissant',
    name: 'Bánh croissant',
    icon: '🥐',
    category: 'food',
    price: 30000,
    prepMinutes: 3,
    ingredients: [
      { id: 'flour', qty: 80 },
      { id: 'butter', qty: 30 },
      { id: 'sugar', qty: 5 },
    ],
    temperature: 'hot',
    popularity: 0.5,
  },
  {
    id: 'cake',
    name: 'Bánh ngọt',
    icon: '🍰',
    category: 'food',
    price: 35000,
    prepMinutes: 2,
    ingredients: [
      { id: 'flour', qty: 60 },
      { id: 'butter', qty: 20 },
      { id: 'sugar', qty: 30 },
      { id: 'milk', qty: 50 },
      { id: 'cacao', qty: 5 },
    ],
    temperature: 'cold',
    popularity: 0.6,
  },
  {
    // Steeped ahead in the cold brew tower (MENU_REQUIRES), so it is only poured: the shortest prep, like espresso.
    id: 'cold_brew',
    name: 'Cold brew',
    icon: '🧊',
    category: 'drink',
    price: 40000,
    prepMinutes: 2,
    ingredients: [
      { id: 'coffee_beans', qty: 22 },
      { id: 'ice', qty: 150 },
      { id: 'cup', qty: 1 },
    ],
    temperature: 'cold',
    popularity: 0.6,
  },
  {
    // Baked in the oven (MENU_REQUIRES).
    id: 'cookie',
    name: 'Bánh quy sô-cô-la',
    icon: '🍪',
    category: 'food',
    price: 30000,
    prepMinutes: 2,
    ingredients: [
      { id: 'flour', qty: 50 },
      { id: 'butter', qty: 20 },
      { id: 'sugar', qty: 15 },
      { id: 'cacao', qty: 8 },
    ],
    temperature: 'hot',
    popularity: 0.5,
  },
];

export const MENU: readonly MenuItemDef[] = SPECS.map((s) => ({ ...s, cost: ingredientCost(s.ingredients) }));

const BY_ID = new Map<MenuItemId, MenuItemDef>(MENU.map((m) => [m.id, m]));

export function getMenuItem(id: MenuItemId): MenuItemDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown menu item: ${id}`);
  return def;
}

/** True for drinks made with coffee beans; the grinder speeds these up. */
export function isCoffeeDrink(def: MenuItemDef): boolean {
  return def.ingredients.some((a) => a.id === 'coffee_beans');
}
