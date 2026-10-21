import type { GameState, UniformId } from '../types';

export type HatKind = 'none' | 'cap' | 'beret' | 'bandana';

/**
 * Team uniforms, unlocked by shop level. They change the shirt and hat of
 * the whole team (staff and player) and nothing else: aprons keep their
 * role colour, and money, patience and stars stay the same.
 */
export interface Uniform {
  id: UniformId;
  /** Vietnamese name shown in the picker and toasts. */
  name: string;
  /** Shop level the uniform opens at. */
  unlockLevel: number;
  shirt: number;
  hat: HatKind;
  /** Hat colour; unused when `hat` is 'none'. */
  hatColor: number;
}

/** Ordered by unlock level; colours come from the warm game palette. */
export const UNIFORMS: readonly Uniform[] = [
  { id: 'classic', name: 'Áo kem cổ điển', unlockLevel: 1, shirt: 0xfff9f0, hat: 'none', hatColor: 0xfff9f0 },
  { id: 'mint', name: 'Áo bạc hà, mũ lưỡi trai', unlockLevel: 3, shirt: 0xd9f6ea, hat: 'cap', hatColor: 0x3dbd8f },
  { id: 'latte', name: 'Áo latte, mũ nồi', unlockLevel: 5, shirt: 0xd9a877, hat: 'beret', hatColor: 0x6b3f24 },
  { id: 'coral', name: 'Áo san hô, khăn bandana', unlockLevel: 7, shirt: 0xffe3de, hat: 'bandana', hatColor: 0xf76b5a },
];

export const DEFAULT_UNIFORM: UniformId = 'classic';

export function uniformById(id: string): Uniform | undefined {
  return UNIFORMS.find((u) => u.id === id);
}

/** The uniform the team wears; saves without one (or with an id this build does not know) wear 'classic'. */
export function uniformOf(state: Pick<GameState, 'uniform'>): Uniform {
  return (state.uniform && uniformById(state.uniform)) || uniformById(DEFAULT_UNIFORM)!;
}

/** Uniforms open at shop level `level`, in unlock order. */
export function unlockedUniforms(level: number): Uniform[] {
  return UNIFORMS.filter((u) => u.unlockLevel <= level);
}
