import { describe, it } from 'vitest';
import { hardEnabled, longSim } from './suite';

/** Hard is measured, not asserted, and only with LONGSIM_HARD=1: `LONGSIM_HARD=1 npm run sim:long -- hard`. */
if (hardEnabled()) longSim('hard', { seeds: [1, 42, 7, 2026], measureOnly: true });
else describe.skip('E-19 40 weeks, hard (set LONGSIM_HARD=1)', () => it('measured on demand', () => {}));
