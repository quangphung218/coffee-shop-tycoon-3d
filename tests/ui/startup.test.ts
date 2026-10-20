// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initialComponents } from '../../src/ui/core/loadProgress';
import { SceneGate } from '../../src/ui/core/sceneGate';
import { guardFrame, once, restartWorldLoad, retryModule, runEvents, watchAudioUnlock } from '../../src/ui/core/startup';

describe('watchAudioUnlock', () => {
  const tap = (target: EventTarget): void => void target.dispatchEvent(new Event('pointerdown'));

  it('keeps listening through a tap before the audio is in, then unlocks once and stops', () => {
    const target = new EventTarget();
    const unlock = vi.fn();
    let audio: { unlock(): void } | null = null;
    watchAudioUnlock(target, () => audio);

    expect(() => tap(target)).not.toThrow();
    expect(unlock).not.toHaveBeenCalled();

    audio = { unlock };
    tap(target);
    expect(unlock).toHaveBeenCalledTimes(1);

    tap(target);
    target.dispatchEvent(new Event('keydown'));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks on a key press too', () => {
    const target = new EventTarget();
    const unlock = vi.fn();
    watchAudioUnlock(target, () => ({ unlock }));
    target.dispatchEvent(new Event('keydown'));
    tap(target);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('listens in the capture phase, before handlers that stop the event', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.append(child);
    child.addEventListener('pointerdown', (e) => e.stopPropagation());
    const unlock = vi.fn();
    watchAudioUnlock(parent, () => ({ unlock }));
    child.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('stops listening when its return value is called', () => {
    const target = new EventTarget();
    const unlock = vi.fn();
    watchAudioUnlock(target, () => ({ unlock }))();
    tap(target);
    expect(unlock).not.toHaveBeenCalled();
  });
});

describe('retryModule', () => {
  const failed = new Error('Failed to fetch dynamically imported module');

  it('reloads and still throws when the import fails but the site answers', async () => {
    const reload = vi.fn();
    await expect(retryModule(() => Promise.reject(failed), async () => true, reload)).rejects.toBe(failed);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('throws without reloading when offline', async () => {
    const reload = vi.fn();
    await expect(retryModule(() => Promise.reject(failed), async () => false, reload)).rejects.toBe(failed);
    expect(reload).not.toHaveBeenCalled();
  });

  it('returns the module when the import works, without asking whether online', async () => {
    const mod = { createWorld: () => null };
    const online = vi.fn(async () => true);
    const reload = vi.fn();
    const load = vi.fn().mockRejectedValueOnce(failed).mockResolvedValueOnce(mod);
    await expect(retryModule(load, async () => false, reload)).rejects.toBe(failed);
    await expect(retryModule(load, online, reload)).resolves.toBe(mod);
    expect(online).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('once (useGame)', () => {
  it('mounts the game once when the game chunk and loadWorld both hand it over', async () => {
    const mount = vi.fn((m: { id: number }) => ({ game: m.id }));
    const useGame = once(mount);
    const chunk = Promise.resolve({ id: 1 });
    const [a, b] = await Promise.all([chunk.then(useGame), chunk.then(useGame)]);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it('keeps the first game after Thử lại brings a fresh module', () => {
    const mount = vi.fn((m: { id: number }) => ({ game: m.id }));
    const useGame = once(mount);
    const first = useGame({ id: 1 });
    expect(useGame({ id: 2 })).toBe(first);
    expect(mount).toHaveBeenCalledTimes(1);
  });

  it('runs again after a call that threw', () => {
    const mount = vi.fn().mockImplementationOnce(() => {
      throw new Error('mount failed');
    }).mockReturnValue('game');
    const useGame = once(mount);
    expect(() => useGame(1)).toThrow('mount failed');
    expect(useGame(1)).toBe('game');
    expect(useGame(1)).toBe('game');
    expect(mount).toHaveBeenCalledTimes(2);
  });
});

describe('Thử lại on the code item', () => {
  it('puts a failed code item back to loading and the world items to waiting', () => {
    const scene = new SceneGate({ status: 'loading', progress: 0, slow: false, components: initialComponents() });
    scene.setComponent('code', { status: 'error' });
    scene.set({ slow: true });
    scene.onRetry = (id) => {
      if (id === 'code') restartWorldLoad(scene);
    };
    const line = scene.statusLine();
    expect(scene.state.status).toBe('error');

    const retry = line.querySelector<HTMLButtonElement>('[data-component="code"] .scene-load-retry');
    expect(retry?.hidden).toBe(false);
    retry!.click();

    const byId = new Map(scene.state.components.map((c) => [c.id, c]));
    expect(byId.get('code')?.status).toBe('loading');
    for (const id of ['world', 'shaders', 'labels'] as const) expect(byId.get(id)).toMatchObject({ status: 'waiting', progress: 0 });
    expect(scene.state.status).toBe('loading');
    expect(scene.state.slow).toBe(false);
    expect(retry!.hidden).toBe(true);
  });
});

describe('guardFrame', () => {
  it('schedules the next frame even when the frame throws, and logs once per failing run', () => {
    const queue: ((now: number) => void)[] = [];
    const schedule = (cb: (now: number) => void): void => void queue.push(cb);
    const report = vi.fn();
    let fail = true;
    const body = vi.fn(() => {
      if (fail) throw new Error('boom');
    });
    schedule(guardFrame(body, schedule, report));

    for (let t = 0; t < 3; t++) queue.shift()!(t);
    expect(body).toHaveBeenCalledTimes(3);
    expect(queue).toHaveLength(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toEqual(new Error('boom'));

    fail = false;
    queue.shift()!(3);
    fail = true;
    queue.shift()!(4);
    expect(report).toHaveBeenCalledTimes(2);
    expect(queue).toHaveLength(1);
  });
});

describe('runEvents', () => {
  it('runs every step, empties the queue even when one throws, then rethrows the first error', () => {
    const queue = [1, 2];
    const seen: number[][] = [];
    const first = new Error('first');
    expect(() =>
      runEvents(queue, [
        () => seen.push([...queue]),
        () => {
          throw first;
        },
        () => {
          throw new Error('second');
        },
        () => seen.push([...queue]),
      ]),
    ).toThrow(first);
    expect(seen).toEqual([[1, 2], [1, 2]]);
    expect(queue).toEqual([]);
  });
});
