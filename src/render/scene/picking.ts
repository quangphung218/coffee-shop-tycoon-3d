import { Raycaster, Vector2, type Camera, type Intersection } from 'three';
import type { Command, GameState } from '../../sim/types';
import type { SceneHit, ShopView } from './shop';

/**
 * Turns a click on the shop into a player Command. Table: collect the cash if
 * there is any, otherwise clean it; the cash and cup icons pick their own
 * action. Coffee machine: brew the oldest pending order the player has not
 * queued yet.
 * Returns null when the click has nothing to do.
 */
export function commandForHit(state: GameState, hit: SceneHit): Command | null {
  if (hit.kind === 'machine') {
    const order = state.orders.find(
      (o) => o.status === 'pending' && !state.playerTasks.some((t) => t.kind === 'brew' && t.targetId === o.id),
    );
    return order ? { type: 'brew', orderId: order.id } : null;
  }
  const table = state.tables.find((t) => t.id === hit.tableId);
  if (!table) return null;
  const collect: Command = { type: 'collect_cash', tableId: table.id };
  const clean: Command = { type: 'clean_table', tableId: table.id };
  if (hit.kind === 'cash') return table.cash > 0 ? collect : null;
  if (hit.kind === 'trash') return table.trash > 0 ? clean : null;
  if (table.cash > 0) return collect;
  if (table.trash > 0) return clean;
  return null;
}

/** Raycasts a canvas click against the shop's pickable meshes. */
export class Picker {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hits: Intersection[] = [];

  constructor(
    private readonly camera: Camera,
    private readonly shop: ShopView,
  ) {}

  /** Nearest shop element under canvas point (x, y) in CSS px of a w×h canvas. */
  hitAt(x: number, y: number, w: number, h: number): SceneHit | null {
    if (w <= 0 || h <= 0) return null;
    this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.shop.prepareForPick();
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.shop.pickables, true, this.hits);
    for (const hit of this.hits) {
      const resolved = this.shop.resolveHit(hit.object, hit.instanceId);
      if (resolved) return resolved;
    }
    return null;
  }

  pick(state: GameState, x: number, y: number, w: number, h: number): Command | null {
    const hit = this.hitAt(x, y, w, h);
    return hit ? commandForHit(state, hit) : null;
  }
}
