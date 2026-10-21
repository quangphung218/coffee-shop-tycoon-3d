import { Mesh, Scene, type MeshLambertMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createActors } from '../../src/render/actors';
import { APRON_COLORS, CAP_COLOR, createCharacter, materialFor, type Character, type CharacterRole } from '../../src/render/actors/rig';
import { dispatch } from '../../src/sim';
import { UNIFORMS, uniformById } from '../../src/sim/data/uniforms';
import { createNewGame } from '../../src/sim/state';
import type { UniformId } from '../../src/sim/types';

type Parts = { body: Mesh; arms: Mesh[]; apron: Mesh; hair: Mesh; hat: Mesh };
const parts = (ch: Character): Parts => ch as unknown as Parts;
const colorOf = (m: Mesh): number => (m.material as MeshLambertMaterial).color.getHex();

/** Every drawn mesh under `root`, skipping hidden subtrees. */
function visibleMeshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  const walk = (o: Object3D): void => {
    if (!o.visible) return;
    if (o instanceof Mesh) out.push(o);
    for (const c of o.children) walk(c);
  };
  walk(root);
  return out;
}

describe('team uniforms on the rig', () => {
  const workers: Exclude<CharacterRole, 'customer' | 'none' | 'player'>[] = ['barista', 'server', 'cleaner', 'marketer'];

  it('dresses staff in the uniform shirt, sleeves and hat, aprons by role', () => {
    for (const u of UNIFORMS) {
      for (const role of workers) {
        const ch = createCharacter({ role, look: 2, uniform: u.id });
        const p = parts(ch);
        expect(ch.uniform).toBe(u.id);
        expect(p.body.material).toBe(materialFor(u.shirt));
        for (const arm of p.arms) expect(arm.material).toBe(materialFor(u.shirt));
        expect(p.apron.visible).toBe(true);
        expect(p.apron.material).toBe(materialFor(APRON_COLORS[role]));
        expect(p.hat.visible).toBe(u.hat !== 'none');
        // A hat hides the hair under it.
        expect(p.hair.visible).toBe(u.hat === 'none');
        if (u.hat !== 'none') expect(p.hat.material).toBe(materialFor(u.hatColor));
      }
    }
  });

  it('gives each hat its own shared geometry', () => {
    const geos = new Set(
      (['mint', 'latte', 'coral'] as const).map((id) => parts(createCharacter({ role: 'barista', look: 0, uniform: id })).hat.geometry),
    );
    expect(geos.size).toBe(3);
    // Built once and shared, like every other part.
    expect(parts(createCharacter({ role: 'server', look: 5, uniform: 'latte' })).hat.geometry).toBe(
      parts(createCharacter({ role: 'cleaner', look: 1, uniform: 'latte' })).hat.geometry,
    );
  });

  it('keeps the player red cap with classic and swaps it for the uniform hat otherwise', () => {
    const classic = parts(createCharacter({ role: 'player', look: 3 }));
    expect(classic.hat.visible).toBe(true);
    expect(classic.hat.material).toBe(materialFor(CAP_COLOR));
    expect(classic.hair.visible).toBe(false);
    expect(classic.body.material).toBe(materialFor(uniformById('classic')!.shirt));
    expect(classic.apron.material).toBe(materialFor(APRON_COLORS.player));
    const coral = uniformById('coral')!;
    const p = parts(createCharacter({ role: 'player', look: 3, uniform: 'coral' }));
    expect(p.hat.material).toBe(materialFor(coral.hatColor));
    expect(p.hat.geometry).toBe(parts(createCharacter({ role: 'barista', look: 0, uniform: 'coral' })).hat.geometry);
    expect(p.body.material).toBe(materialFor(coral.shirt));
    expect(p.apron.material).toBe(materialFor(APRON_COLORS.player));
  });

  it('leaves customers as they were', () => {
    const plain = parts(createCharacter({ role: 'customer', look: 4 }));
    const dressed = createCharacter({ role: 'customer', look: 4, uniform: 'latte' });
    const p = parts(dressed);
    expect(dressed.uniform).toBe('classic');
    expect(p.body.material).toBe(plain.body.material);
    expect(p.hat.visible).toBe(false);
    expect(p.apron.visible).toBe(false);
    expect(p.hair.visible).toBe(true);
  });

  it('takes the hat off again when a pooled body goes back to classic or to a customer', () => {
    const ch = createCharacter({ role: 'barista', look: 1, uniform: 'mint' });
    ch.setLook({ role: 'barista', look: 1, uniform: 'classic' });
    expect(parts(ch).hat.visible).toBe(false);
    expect(parts(ch).hair.visible).toBe(true);
    ch.setLook({ role: 'barista', look: 1, uniform: 'latte' });
    ch.setLook({ role: 'customer', look: 1 });
    expect(parts(ch).hat.visible).toBe(false);
    expect(parts(ch).hair.visible).toBe(true);
  });

  it('falls back to classic for an unknown uniform id', () => {
    const ch = createCharacter({ role: 'barista', look: 0, uniform: 'velvet' as UniformId });
    expect(ch.uniform).toBe('classic');
    expect(parts(ch).body.material).toBe(materialFor(uniformById('classic')!.shirt));
  });
});

describe('team uniforms in the actors view', () => {
  function shop(): ReturnType<typeof createNewGame> {
    const state = createNewGame('Test', 'normal', 3);
    const roles = ['barista', 'server'] as const;
    state.candidates.slice(0, 2).forEach((c, i) => dispatch(state, { type: 'hire_staff', candidateId: c.id, role: roles[i]! }));
    return state;
  }

  it('re-dresses staff and the player in place when the uniform changes', () => {
    const state = shop();
    const scene = new Scene();
    const actors = createActors(scene);
    actors.update(state, 0);
    const root = scene.getObjectByName('actors')!;
    const created = actors.stats().created;
    const latte = uniformById('latte')!;
    const shirts = (): number => visibleMeshes(root).filter((m) => colorOf(m) === latte.shirt).length;
    expect(shirts()).toBe(0);

    state.shopLevel = latte.unlockLevel;
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'latte' })).toBe(true);
    actors.update(state, 0);
    // Two staff and the player: a body and two sleeves each; no new bodies built.
    expect(shirts()).toBe(3 * 3);
    expect(actors.stats().created).toBe(created);
    expect(actors.stats().live).toBe(3);
    const hats = visibleMeshes(root).filter((m) => colorOf(m) === latte.hatColor);
    expect(hats).toHaveLength(3);

    // One material per colour, however many times the uniform switches.
    for (const id of ['mint', 'coral', 'latte', 'classic'] as const) {
      state.uniform = id;
      actors.update(state, 0);
    }
    const byColor = new Map<number, Set<unknown>>();
    for (const m of visibleMeshes(root)) {
      const hex = colorOf(m);
      if (!byColor.has(hex)) byColor.set(hex, new Set());
      byColor.get(hex)!.add(m.material);
    }
    for (const mats of byColor.values()) expect(mats.size).toBe(1);
    // Back on classic: no hats on the staff, only the player's red cap.
    expect(visibleMeshes(root).filter((m) => colorOf(m) === CAP_COLOR)).toHaveLength(1);
    actors.dispose();
  });

  it('dresses the warm-up workers in every uniform', () => {
    const state = shop();
    const scene = new Scene();
    const actors = createActors(scene);
    actors.update(state, 0);
    actors.prebuild();
    const root = scene.getObjectByName('actors')!;
    const colors = new Set<number>();
    actors.drawWarm(() => {
      for (const m of visibleMeshes(root)) colors.add(colorOf(m));
    });
    for (const u of UNIFORMS) {
      expect(colors).toContain(u.shirt);
      if (u.hat !== 'none') expect(colors).toContain(u.hatColor);
    }
    expect(colors).toContain(CAP_COLOR);
    actors.dispose();
  });
});
