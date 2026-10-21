// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../src/save/storage';
import { levelDef } from '../../src/sim/data/levels';
import { UNIFORMS } from '../../src/sim/data/uniforms';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent } from '../../src/sim/types';
import { createShell } from '../../src/ui/screens/shell';

const levelUp = (level: number): GameEvent => ({ type: 'level_up', level, unlocks: levelDef(level).unlocks });

afterEach(() => document.body.replaceChildren());

/** Toast titles the game screen shows after handling `events`. */
function toastTitles(events: GameEvent[]): string[] {
  const root = document.createElement('div');
  document.body.append(root);
  const shell = createShell({ root, storage: createMemoryStorage() });
  try {
    shell.startGame(createNewGame('Quán Áo', 'normal', 11));
    shell.handleEvents(events);
    return [...root.querySelectorAll('.toast-title')].map((p) => p.textContent ?? '');
  } finally {
    shell.dispose();
  }
}

describe('uniform unlock toast on the game screen', () => {
  it('shows "Mở khoá đồng phục X" next to the level-up toast when a level opens a uniform', () => {
    const mint = UNIFORMS.find((u) => u.unlockLevel === 3)!;
    const titles = toastTitles([levelUp(3)]);
    expect(titles).toContain(`Mở khoá đồng phục ${mint.name}`);
    expect(titles.some((t) => t.startsWith('Lên Cấp 3'))).toBe(true);
  });

  it('shows no uniform toast for a level that opens none', () => {
    expect(UNIFORMS.some((u) => u.unlockLevel === 2)).toBe(false);
    expect(toastTitles([levelUp(2)]).filter((t) => t.startsWith('Mở khoá đồng phục'))).toEqual([]);
  });
});
