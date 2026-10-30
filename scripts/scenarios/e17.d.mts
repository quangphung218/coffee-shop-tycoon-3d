import type { Scenario } from '../capture.mjs';
import type { StyleSlot } from '../../src/sim/types';

export const LOOKS: Readonly<Record<'mint' | 'brick' | 'royal', Readonly<Record<StyleSlot, string>>>>;
export function shotFile(look: string): string;
declare const scenario: Scenario;
export default scenario;
