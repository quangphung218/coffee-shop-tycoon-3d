// @vitest-environment jsdom
import { Scene, Vector3 } from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLICK_THRESHOLD_PX,
  DEFAULT_PITCH,
  DragTracker,
  MAX_ZOOM,
  MIN_ZOOM,
  clampPitch,
  clampZoom,
  damp,
  edgePanInput,
  keyAction,
  orbitOffset,
  panVector,
  shouldCameraHandleKey,
  zoomFromWheel,
  type CameraKeyEvent,
} from '../../src/render/scene/camera';
import { commandForHit } from '../../src/render/scene/picking';
import { pixelRatioFor, shadowsFor } from '../../src/render/scene/renderer';
import { ShopView, layoutKey } from '../../src/render/scene/shop';
import { createNewGame } from '../../src/sim/state';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { buyUpgrade, getShopLayout, nextUpgradeCost } from '../../src/sim/upgrades';

describe('zoom', () => {
  it('clamps to the zoom limits', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.2)).toBe(1.2);
    expect(clampZoom(5, 1, 3)).toBe(3);
  });

  it('zooms in on scroll up and out on scroll down, within limits', () => {
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 100)).toBeLessThan(1);
    let z = 1;
    for (let i = 0; i < 100; i++) z = zoomFromWheel(z, -500);
    expect(z).toBe(MAX_ZOOM);
    for (let i = 0; i < 100; i++) z = zoomFromWheel(z, 500);
    expect(z).toBe(MIN_ZOOM);
  });

  it('keeps the pitch between the tilt limits', () => {
    expect(clampPitch(-1)).toBeGreaterThan(0);
    expect(clampPitch(3)).toBeLessThan(Math.PI / 2);
    expect(clampPitch(DEFAULT_PITCH)).toBe(DEFAULT_PITCH);
  });
});

describe('panVector', () => {
  const out = { x: 0, z: 0 };

  it('moves away from a camera at +z when panning forward at yaw 0', () => {
    panVector(0, 0, 1, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
    panVector(0, 1, 0, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });

  it('follows the camera yaw', () => {
    // Camera at +x looking toward -x: forward is -x, right is -z.
    panVector(Math.PI / 2, 0, 1, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.z).toBeCloseTo(0);
    panVector(Math.PI / 2, 1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });

  it('points forward away from the camera position for any yaw', () => {
    const offset = new Vector3();
    for (const yaw of [0.3, 1.7, -2.4, 5]) {
      panVector(yaw, 0, 1, out);
      orbitOffset(yaw, DEFAULT_PITCH, offset);
      expect(out.x * offset.x + out.z * offset.z).toBeLessThan(0);
    }
  });

  it('does not pan faster on diagonals', () => {
    panVector(0.7, 1, 1, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1);
    panVector(0.7, 0, 0, out);
    expect(Math.hypot(out.x, out.z)).toBe(0);
  });
});

describe('edgePanInput', () => {
  const out = { right: 0, forward: 0 };

  it('pans toward the edge the pointer is near', () => {
    expect(edgePanInput(5, 300, 800, 600, 24, out)).toEqual({ right: -1, forward: 0 });
    expect(edgePanInput(795, 300, 800, 600, 24, out)).toEqual({ right: 1, forward: 0 });
    expect(edgePanInput(400, 5, 800, 600, 24, out)).toEqual({ right: 0, forward: 1 });
    expect(edgePanInput(790, 595, 800, 600, 24, out)).toEqual({ right: 1, forward: -1 });
    expect(edgePanInput(400, 300, 800, 600, 24, out)).toEqual({ right: 0, forward: 0 });
  });
});

describe('DragTracker', () => {
  it('treats a press with a small wobble as a click', () => {
    const d = new DragTracker();
    d.down(100, 100);
    expect(d.move(102, 101)).toBe(false);
    expect(d.up(103, 102)).toBe('click');
  });

  it('turns into a drag once past the threshold and stays one', () => {
    const d = new DragTracker();
    d.down(100, 100);
    expect(d.move(100 + CLICK_THRESHOLD_PX + 1, 100)).toBe(true);
    expect(d.dx).toBe(CLICK_THRESHOLD_PX + 1);
    // Coming back to the start does not make it a click again.
    expect(d.up(100, 100)).toBe('drag');
  });

  it('counts a jump between down and up as a drag', () => {
    const d = new DragTracker();
    d.down(0, 0);
    expect(d.up(40, 30)).toBe('drag');
  });

  it('ignores moves and ups without a press, and cancel drops the press', () => {
    const d = new DragTracker();
    expect(d.move(50, 50)).toBe(false);
    expect(d.up(50, 50)).toBeNull();
    d.down(0, 0);
    d.cancel();
    expect(d.up(0, 0)).toBeNull();
  });
});

describe('keyAction', () => {
  it('uses Q/E to rotate and WASD or arrows to pan by default', () => {
    expect(keyAction('KeyQ', 'qe-wasd')).toBe('rotateLeft');
    expect(keyAction('KeyE', 'qe-wasd')).toBe('rotateRight');
    expect(keyAction('KeyW', 'qe-wasd')).toBe('panForward');
    expect(keyAction('KeyA', 'qe-wasd')).toBe('panLeft');
    expect(keyAction('ArrowDown', 'qe-wasd')).toBe('panBack');
    expect(keyAction('KeyZ', 'qe-wasd')).toBeNull();
  });

  it('uses Q/A to rotate and only arrows to pan in qa-arrows mode', () => {
    expect(keyAction('KeyQ', 'qa-arrows')).toBe('rotateLeft');
    expect(keyAction('KeyA', 'qa-arrows')).toBe('rotateRight');
    expect(keyAction('KeyW', 'qa-arrows')).toBeNull();
    expect(keyAction('KeyD', 'qa-arrows')).toBeNull();
    expect(keyAction('ArrowLeft', 'qa-arrows')).toBe('panLeft');
  });
});

describe('shouldCameraHandleKey', () => {
  beforeAll(() => {
    document.body.innerHTML = `
    <canvas id="c"></canvas>
    <button id="hud">Nút</button>
    <input id="name">
    <textarea id="note"></textarea>
    <select id="pick"><option>1</option></select>
    <div id="edit" contenteditable="true"><b id="edit-in">x</b></div>
    <div class="dd"><button id="dd-btn"></button><ul role="listbox" id="list"><li role="option" id="opt">A</li></ul></div>
    <div role="tablist" id="tabs"><button role="tab" id="tab">Tab</button></div>
    <div role="menu"><button role="menuitem" id="item">Mục</button></div>`;
  });
  afterAll(() => document.body.replaceChildren());
  const key = (target: EventTarget | null, extra: Partial<CameraKeyEvent> = {}): CameraKeyEvent => ({
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target,
    ...extra,
  });
  const el = (id: string): Element => document.getElementById(id)!;

  it('lets keys on the page, the canvas and plain buttons move the camera', () => {
    expect(shouldCameraHandleKey(key(document.body))).toBe(true);
    expect(shouldCameraHandleKey(key(el('c')))).toBe(true);
    expect(shouldCameraHandleKey(key(el('hud')))).toBe(true);
    expect(shouldCameraHandleKey(key(el('dd-btn')))).toBe(true);
    expect(shouldCameraHandleKey(key(null))).toBe(true);
  });

  it('ignores keys the UI already handled or that carry a modifier', () => {
    expect(shouldCameraHandleKey(key(document.body, { defaultPrevented: true }))).toBe(false);
    expect(shouldCameraHandleKey(key(el('dd-btn'), { defaultPrevented: true }))).toBe(false);
    expect(shouldCameraHandleKey(key(document.body, { ctrlKey: true }))).toBe(false);
    expect(shouldCameraHandleKey(key(document.body, { metaKey: true }))).toBe(false);
    expect(shouldCameraHandleKey(key(document.body, { altKey: true }))).toBe(false);
  });

  it('ignores keys typed into fields', () => {
    for (const id of ['name', 'note', 'pick', 'edit', 'edit-in']) expect(shouldCameraHandleKey(key(el(id))), id).toBe(false);
  });

  it('ignores keys inside dropdowns, menus and tabs', () => {
    for (const id of ['list', 'opt', 'tabs', 'tab', 'item']) expect(shouldCameraHandleKey(key(el(id))), id).toBe(false);
  });
});

describe('damp', () => {
  it('approaches the target without overshooting and is frame-rate independent', () => {
    expect(damp(0, 10, 10, 0)).toBe(0);
    const one = damp(0, 10, 10, 0.1);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(10);
    expect(damp(damp(0, 10, 10, 0.05), 10, 10, 0.05)).toBeCloseTo(one);
  });
});

describe('renderer quality', () => {
  it('caps the pixel ratio per quality and shadows only on high', () => {
    expect(pixelRatioFor('low', 3)).toBe(1);
    expect(pixelRatioFor('medium', 3)).toBe(1.5);
    expect(pixelRatioFor('high', 3)).toBe(2);
    expect(pixelRatioFor('high', 1)).toBe(1);
    expect(shadowsFor('high')).toBe(true);
    expect(shadowsFor('medium')).toBe(false);
  });
});

function rich(): GameState {
  const s = createNewGame('A', 'normal', 1);
  s.money = 100_000_000;
  return s;
}

function buy(s: GameState, id: UpgradeId, levels = 1): void {
  for (let i = 0; i < levels && nextUpgradeCost(s, id) !== null; i++) expect(buyUpgrade(s, id).ok).toBe(true);
}

describe('ShopView', () => {
  it('builds the furniture from getShopLayout', () => {
    const s = rich();
    const shop = new ShopView(new Scene());
    expect(shop.update(s, 0, 0, 0)).toBe(true);
    const layout = getShopLayout(s);
    const counts = shop.counts();
    expect(counts.tables).toBe(layout.tables.length);
    expect(counts.chairs).toBe(layout.totalSeats);
    expect(counts.machines).toBe(layout.machines.length);
    expect(counts.parasols).toBe(0);
    expect(counts.decor).toBe(0);
    // Same layout next frame: nothing rebuilt.
    expect(shop.update(s, 0.016, 0.016, 0)).toBe(false);
    shop.dispose();
  });

  it('follows upgrades without rebuilding when nothing changed', () => {
    const s = rich();
    const shop = new ShopView(new Scene());
    shop.update(s, 0, 0, 0);
    const key = layoutKey(s);
    buy(s, 'outdoor_seating', 2);
    buy(s, 'expand_area', 2);
    buy(s, 'tables', 6);
    buy(s, 'fast_machine', 3);
    buy(s, 'plants', 3);
    buy(s, 'lights', 2);
    expect(layoutKey(s)).not.toBe(key);
    expect(shop.update(s, 1, 0.016, 0)).toBe(true);
    const layout = getShopLayout(s);
    const counts = shop.counts();
    expect(counts.tables).toBe(layout.tables.length);
    expect(counts.chairs).toBe(layout.totalSeats);
    expect(counts.parasols).toBe(layout.tables.filter((t) => t.zone === 'outdoor').length);
    expect(counts.machines).toBe(4);
    expect(counts.decor).toBe(5);
    expect(shop.extent.maxX).toBeGreaterThan(layout.indoor.maxX);
    shop.dispose();
  });

  it('shows cash and dirty cups on tables', () => {
    const s = rich();
    const shop = new ShopView(new Scene());
    s.tables[0]!.cash = 30_000;
    s.tables[1]!.trash = 5;
    shop.update(s, 0, 0, 0);
    expect(shop.counts().coins).toBe(1);
    expect(shop.counts().cups).toBe(3);
    s.tables[0]!.cash = 0;
    s.tables[1]!.trash = 1;
    shop.update(s, 0.1, 0.1, 0);
    expect(shop.counts().coins).toBe(0);
    expect(shop.counts().cups).toBe(1);
    shop.dispose();
  });
});

describe('commandForHit', () => {
  it('collects cash first, then cleans, on a table click', () => {
    const s = rich();
    const t = s.tables[0]!;
    expect(commandForHit(s, { kind: 'table', tableId: t.id })).toBeNull();
    t.trash = 2;
    expect(commandForHit(s, { kind: 'table', tableId: t.id })).toEqual({ type: 'clean_table', tableId: t.id });
    t.cash = 25_000;
    expect(commandForHit(s, { kind: 'table', tableId: t.id })).toEqual({ type: 'collect_cash', tableId: t.id });
    expect(commandForHit(s, { kind: 'trash', tableId: t.id })).toEqual({ type: 'clean_table', tableId: t.id });
    expect(commandForHit(s, { kind: 'table', tableId: 99_999 })).toBeNull();
  });

  it('brews the oldest pending order not already queued on a machine click', () => {
    const s = rich();
    expect(commandForHit(s, { kind: 'machine' })).toBeNull();
    s.orders.push(
      { id: 501, customerId: 1, itemId: 'latte', status: 'brewing', remaining: 2, staffId: null },
      { id: 502, customerId: 2, itemId: 'espresso', status: 'pending', remaining: 2, staffId: null },
      { id: 503, customerId: 3, itemId: 'mocha', status: 'pending', remaining: 3, staffId: null },
    );
    expect(commandForHit(s, { kind: 'machine' })).toEqual({ type: 'brew', orderId: 502 });
    s.playerTasks.push({ kind: 'brew', targetId: 502, remaining: 2 });
    expect(commandForHit(s, { kind: 'machine' })).toEqual({ type: 'brew', orderId: 503 });
  });
});
