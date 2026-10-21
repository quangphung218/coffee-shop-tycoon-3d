// Functions that run inside the page (Playwright serialises their source, so
// each is self-contained): hooks installed before the game's scripts, and
// probes evaluated on the last frame drawn. Shared by the shot kinds of
// scripts/lib/shots.mjs.

/**
 * Runs in the page before its scripts. Keeps the last scene and camera of
 * #scene (window.__mediaScene, __mediaCamera); while window.__mediaFocus
 * ({ x, y, z, ppm }) is set, draws with the camera moved across the view to
 * centre that point at `ppm` CSS px per metre (kept as __mediaView), and
 * puts the game's camera back after each frame.
 */
export function focusHooks() {
  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        const f = window.__mediaFocus;
        if (!f || !camera.isOrthographicCamera) return render.call(this, scene, camera);
        const pos = camera.position.clone();
        const zoom = camera.zoom;
        camera.updateMatrixWorld();
        const dir = camera.getWorldDirection(pos.clone());
        const d = pos.clone().set(f.x, f.y, f.z).sub(pos);
        camera.position.add(d.addScaledVector(dir, -d.dot(dir)));
        camera.zoom = (f.ppm * (camera.top - camera.bottom)) / this.domElement.clientHeight;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        try {
          return render.call(this, scene, camera);
        } finally {
          window.__mediaView = camera.clone();
          camera.position.copy(pos);
          camera.zoom = zoom;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/**
 * Runs in the page before its scripts. The game loop keeps the
 * requestAnimationFrame it finds at start-up, so the clock has to be in
 * place first. window.__mediaClock: frames run on the real clock until
 * `watch` is set; then the first frame a coin pops up on screen holds the
 * clock (`coin`, its height `spawnY`), and frames only run on `tick(ms)`,
 * with performance.now() and the frame time moved on by `ms`. Also does what
 * focusHooks does (last scene and camera, __mediaFocus zoom).
 */
export function coinHooks() {
  const raf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const clock = { watch: false, primed: false, manual: false, t: 0, held: [], coin: null, spawnY: 0 };
  const seen = new WeakSet();
  const check = () => {
    const camera = window.__mediaCamera;
    const group = window.__mediaScene?.getObjectByName('coins');
    if (!clock.watch || clock.manual || !group || !camera) return;
    for (const c of group.children) {
      if (!c.visible) {
        seen.delete(c);
        continue;
      }
      if (seen.has(c)) continue;
      seen.add(c);
      // Coins already up when the watch starts are mid-life: skip them.
      if (!clock.primed) continue;
      const p = c.getWorldPosition(new c.position.constructor());
      const y = p.y;
      p.project(camera);
      if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) continue;
      clock.coin = c;
      clock.spawnY = y;
      clock.manual = true;
      clock.t = realNow();
      return;
    }
    clock.primed = true;
  };
  clock.tick = (ms) => {
    clock.t += ms;
    for (const cb of clock.held.splice(0)) cb(clock.t);
  };
  window.__mediaClock = clock;
  performance.now = () => (clock.manual ? clock.t : realNow());
  window.requestAnimationFrame = (cb) => {
    if (clock.manual) {
      clock.held.push(cb);
      return 0;
    }
    return raf((ts) => {
      if (clock.manual) {
        clock.held.push(cb);
        return;
      }
      cb(ts);
      check();
    });
  };

  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        const f = window.__mediaFocus;
        if (!f || !camera.isOrthographicCamera) return render.call(this, scene, camera);
        const pos = camera.position.clone();
        const zoom = camera.zoom;
        camera.updateMatrixWorld();
        const dir = camera.getWorldDirection(pos.clone());
        const d = pos.clone().set(f.x, f.y, f.z).sub(pos);
        camera.position.add(d.addScaledVector(dir, -d.dot(dir)));
        camera.zoom = (f.ppm * (camera.top - camera.bottom)) / this.domElement.clientHeight;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        try {
          return render.call(this, scene, camera);
        } finally {
          window.__mediaView = camera.clone();
          camera.position.copy(pos);
          camera.zoom = zoom;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/**
 * Runs in the page before its scripts. focusHooks plus a clock the shot can
 * hold: window.__mediaClock.hold() freezes performance.now() and keeps every
 * requestAnimationFrame callback back, tick(ms) (async) moves the clock on
 * by `ms` and runs them once (one game frame, drawn with the focus camera;
 * it first waits a real frame when the game's callback is still on its way
 * from the real requestAnimationFrame), and release() lets the real clock
 * run again. A shot that holds the clock on
 * the frame an emote appears can move the camera and shoot without the
 * emote going away in between.
 */
export function clockHooks() {
  const raf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const clock = { manual: false, t: 0, held: [] };
  clock.hold = () => {
    if (clock.manual) return;
    clock.t = realNow();
    clock.manual = true;
  };
  clock.tick = async (ms) => {
    if (clock.held.length === 0) await new Promise((r) => raf(r));
    clock.t += ms;
    for (const cb of clock.held.splice(0)) cb(clock.t);
  };
  clock.release = () => {
    if (!clock.manual) return;
    clock.manual = false;
    for (const cb of clock.held.splice(0)) raf(cb);
  };
  window.__mediaClock = clock;
  performance.now = () => (clock.manual ? clock.t : realNow());
  window.requestAnimationFrame = (cb) => {
    if (clock.manual) {
      clock.held.push(cb);
      return 0;
    }
    return raf((ts) => {
      if (clock.manual) {
        clock.held.push(cb);
        return;
      }
      cb(ts);
    });
  };

  const hook = new EventTarget();
  hook.addEventListener('observe', (e) => {
    const renderer = e.detail;
    if (!renderer?.isWebGLRenderer || renderer.domElement?.id !== 'scene') return;
    queueMicrotask(() => {
      const render = renderer.render;
      renderer.render = function (scene, camera) {
        window.__mediaScene = scene;
        window.__mediaCamera = camera;
        const f = window.__mediaFocus;
        if (!f || !camera.isOrthographicCamera) return render.call(this, scene, camera);
        const pos = camera.position.clone();
        const zoom = camera.zoom;
        camera.updateMatrixWorld();
        const dir = camera.getWorldDirection(pos.clone());
        const d = pos.clone().set(f.x, f.y, f.z).sub(pos);
        camera.position.add(d.addScaledVector(dir, -d.dot(dir)));
        camera.zoom = (f.ppm * (camera.top - camera.bottom)) / this.domElement.clientHeight;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        try {
          return render.call(this, scene, camera);
        } finally {
          window.__mediaView = camera.clone();
          camera.position.copy(pos);
          camera.zoom = zoom;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
      };
    });
  });
  window.__THREE_DEVTOOLS__ = hook;
}

/** Runs in the page before its scripts: counts the frames drawn in window.__mediaFrames. */
export function framesCounter() {
  window.__mediaFrames = 0;
  const tick = () => {
    window.__mediaFrames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Runs in the page before its scripts: a headed window behind others reads as hidden, and the game pauses on a hidden tab. */
export function alwaysVisible() {
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
}

/**
 * Runs in the page. Characters and emotes of the last frame, in the view
 * drawn (__mediaView while focused): `emotes` [{ kind, world, box }] for the
 * emote meshes showing (a group of three meshes in `emoteColors`), and
 * `team` [{ world, box, shirt, hat }] for every body under 'actors' (shirt
 * and hat true when a mesh has the `uniform` colour), only `withTeam`.
 * Boxes are CSS px; `inside` is in the middle 85%.
 */
export function scanActors({ emoteColors, uniform, withTeam }) {
  const scene = window.__mediaScene;
  const cam = window.__mediaFocus ? window.__mediaView : window.__mediaCamera;
  if (!scene || !cam) return { emotes: [], team: [] };
  const r = document.getElementById('scene').getBoundingClientRect();
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const hex = (m) => m.material?.color?.getHex?.();
  const emoteHex = Object.values(emoteColors);
  const boxOf = (meshes) => {
    let [x0, y0, x1, y1, inside] = [Infinity, Infinity, -Infinity, -Infinity, true];
    for (const o of meshes) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) {
            const q = new o.position.constructor(x, y, z).applyMatrix4(o.matrixWorld).project(cam);
            inside &&= Math.abs(q.x) < 0.85 && Math.abs(q.y) < 0.85;
            const sx = r.left + ((q.x + 1) / 2) * r.width;
            const sy = r.top + ((1 - q.y) / 2) * r.height;
            [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
          }
        }
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, inside };
  };
  const world = (o) => {
    const p = o.getWorldPosition(new o.position.constructor());
    return { x: p.x, y: p.y, z: p.z };
  };
  const emotes = [];
  scene.traverse((o) => {
    if (!o.isMesh || !shown(o)) return;
    const kind = Object.keys(emoteColors).find((k) => emoteColors[k] === hex(o));
    const g = o.parent;
    if (!kind || !g || g.children.length !== 3 || !g.children.every((c) => c.isMesh && emoteHex.includes(hex(c)))) return;
    emotes.push({ kind, world: world(o), box: boxOf([o]) });
  });
  const team = [];
  if (!withTeam) return { emotes, team };
  for (const root of scene.getObjectByName('actors')?.children ?? []) {
    if (!root.visible) continue;
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh && shown(o) && o.geometry) meshes.push(o);
    });
    // Characters, not the coin popups that share the group.
    if (meshes.length < 5) continue;
    team.push({ world: world(root), box: boxOf(meshes), shirt: meshes.some((m) => hex(m) === uniform.shirt), hat: meshes.some((m) => hex(m) === uniform.hat) });
  }
  return { emotes, team };
}

/**
 * Runs in the page. The lights of the last frame: hemisphere, sun and
 * environment map, their total as totalLightOf in src/render/scene/renderer.ts
 * (hemi + env × 6 + sun), PointLights on, light pools showing, and the sun's
 * elevation (degrees) and side (west when it is toward -x).
 */
export function lightInfo() {
  const scene = window.__mediaScene;
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const out = { hemi: 0, sun: 0, env: 0, total: 0, points: 0, pools: 0, elevation: 0, west: false };
  scene?.traverse((o) => {
    if (!shown(o)) return;
    if (o.isHemisphereLight) out.hemi += o.intensity;
    if (o.isPointLight && o.intensity > 0) out.points++;
    if (o.name === 'light-pool' && (o.material?.opacity ?? 1) > 0.01) out.pools++;
    if (o.isDirectionalLight) {
      out.sun += o.intensity;
      const d = o.position.clone().sub(o.target.position).normalize();
      out.elevation = (Math.asin(d.y) * 180) / Math.PI;
      out.west = d.x < 0;
    }
  });
  out.env = scene?.environment ? scene.environmentIntensity : 0;
  out.total = out.hemi + out.env * 6 + out.sun;
  return out;
}

/**
 * Runs in the page. Screen box (CSS px) of the light pools showing (opacity
 * above 0: the pools are drawn by day too, at opacity 0), or null.
 */
export function poolBox() {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const r = document.getElementById('scene').getBoundingClientRect();
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  scene?.traverse((o) => {
    if (o.name !== 'light-pool' || !shown(o) || (o.material?.opacity ?? 1) <= 0.01) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const q = new o.position.constructor(x, y, z).applyMatrix4(o.matrixWorld).project(cam);
          const sx = r.left + ((q.x + 1) / 2) * r.width;
          const sy = r.top + ((1 - q.y) / 2) * r.height;
          [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
        }
      }
    }
  });
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * Runs in the page. The shadow the sun casts from one still street prop
 * (instanced lamps, trees: castShadow, not the traffic) `min`..`max` m tall,
 * the one nearest the middle of the view with its foot, top and shadow tip
 * in view: the screen box round them (CSS px), its height and shadow length
 * (m). Null when none is in view.
 */
export function shadowOf({ min, max }) {
  const scene = window.__mediaScene;
  const cam = window.__mediaCamera;
  const street = scene?.getObjectByName('street');
  let sun = null;
  scene?.traverse((o) => {
    if (!sun && o.isDirectionalLight) sun = o;
  });
  if (!street || !sun || !cam) return null;
  const dir = sun.position.clone().sub(sun.target.position).normalize();
  const V = dir.constructor;
  const r = document.getElementById('scene').getBoundingClientRect();
  const screen = (p) => {
    const q = p.clone().project(cam);
    return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height, inside: Math.abs(q.x) < 0.9 && q.y > -0.7 && q.y < 0.8 };
  };
  const inst = street.matrixWorld.clone();
  const world = street.matrixWorld.clone();
  let best = null;
  for (const o of street.children) {
    // Traffic is drawn without frustum culling; it moves, so its shadows do too.
    if (!o.isInstancedMesh || !o.castShadow || !o.visible || !o.frustumCulled) continue;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    const cx = (b.min.x + b.max.x) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, inst);
      world.multiplyMatrices(o.matrixWorld, inst);
      const foot = new V(cx, b.min.y, cz).applyMatrix4(world);
      const top = new V(cx, b.max.y, cz).applyMatrix4(world);
      const height = top.y - foot.y;
      if (height < min || height > max) continue;
      const tip = top.clone().addScaledVector(dir, -height / dir.y);
      const pts = [foot, top, tip].map(screen);
      if (!pts.every((p) => p.inside)) continue;
      const d = Math.hypot(pts[0].x - (r.left + r.width / 2), pts[0].y - (r.top + r.height / 2));
      if (best && d >= best.d) continue;
      best = { d, pts, height, length: Math.hypot(tip.x - foot.x, tip.z - foot.z) };
    }
  }
  if (!best) return null;
  const xs = best.pts.map((p) => p.x);
  const ys = best.pts.map((p) => p.y);
  const pad = 18;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { box: { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }, height: best.height, length: best.length };
}

/**
 * Runs in the page. The held coin in the last frame drawn by __mediaView:
 * the screen box (CSS px) of its sprites still showing, its small coins, its
 * coin's height above where it popped (m) and width over height (spin).
 * fx.ts adds the small coins first, so the coin and the chip are the last
 * two children (the only two in builds without the burst).
 */
export function coinMeasure() {
  const { coin: c, spawnY } = window.__mediaClock;
  const view = window.__mediaView;
  const V = c.position.constructor;
  const r = document.getElementById('scene').getBoundingClientRect();
  const shown = (o) => {
    for (let e = o; e; e = e.parent) if (!e.visible) return false;
    return true;
  };
  const right = new V().setFromMatrixColumn(view.matrixWorld, 0).normalize();
  const up = new V().setFromMatrixColumn(view.matrixWorld, 1).normalize();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of c.children) {
    if (!shown(s) || (s.material?.opacity ?? 0) < 0.03) continue;
    const p = s.getWorldPosition(new V());
    const size = s.getWorldScale(new V());
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const q = p.clone().addScaledVector(right, (a * size.x) / 2).addScaledVector(up, (b * size.y) / 2).project(view);
      const sx = r.left + ((q.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - q.y) / 2) * r.height;
      [x0, y0, x1, y1] = [Math.min(x0, sx), Math.min(y0, sy), Math.max(x1, sx), Math.max(y1, sy)];
    }
  }
  const coin = c.children[c.children.length - 2];
  return {
    box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    debris: Math.max(0, c.children.filter(shown).length - 2),
    lift: coin.getWorldPosition(new V()).y - spawnY,
    width: coin.scale.x / coin.scale.y,
  };
}

/**
 * Runs in the browser. Mean brightness (0–100% of white, Rec. 709 luma) of
 * each PNG (`imgs`, base64, CSS px at dpr 1): of the whole frame and of every
 * `cell` between `top` and `bottom`, the cells half a cell apart.
 */
export async function lumaCells({ imgs, cell, top, bottom }) {
  return Promise.all(
    imgs.map(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
      c.drawImage(bmp, 0, 0);
      const d = c.getImageData(0, 0, bmp.width, bmp.height).data;
      const luma = (x0, y0, w, h) => {
        let s = 0;
        let n = 0;
        for (let y = y0; y < y0 + h; y += 4) {
          for (let x = x0; x < x0 + w; x += 4) {
            const i = (y * bmp.width + x) * 4;
            s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            n++;
          }
        }
        return (s / n / 255) * 100;
      };
      const cells = [];
      for (let y = top; y + cell.h <= bottom; y += cell.h / 2) {
        for (let x = 0; x + cell.w <= bmp.width; x += cell.w / 2) cells.push({ x, y, w: cell.w, h: cell.h, luma: luma(x, y, cell.w, cell.h) });
      }
      return { mean: luma(0, 0, bmp.width, bmp.height), cells };
    }),
  );
}

/** Runs in the page. Union of the boxes of the selectors' first visible matches, CSS px; null when none. */
export function unionBox(sels) {
  const rs = sels.flatMap((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length > 0).slice(0, 1)).map((e) => e.getBoundingClientRect());
  if (rs.length === 0) return null;
  const x = Math.min(...rs.map((r) => r.left));
  const y = Math.min(...rs.map((r) => r.top));
  return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y };
}

/**
 * Runs in the page. The box (CSS px) of the element at `list` and the
 * h3.section-title of its parent reading `heading`, cut to the part of the
 * nearest scroll box on screen; null when `list` is not there.
 */
export function sectionBox({ list, heading }) {
  const ul = document.querySelector(list);
  if (!ul) return null;
  const h = [...ul.parentElement.querySelectorAll('h3.section-title')].find((e) => e.textContent.trim() === heading);
  let view = ul.parentElement;
  while (view && !(view.scrollHeight > view.clientHeight + 4 && getComputedStyle(view).overflowY !== 'visible')) view = view.parentElement;
  const v = (view ?? document.documentElement).getBoundingClientRect();
  const rs = [ul, h].filter(Boolean).map((e) => e.getBoundingClientRect());
  const x0 = Math.min(...rs.map((r) => r.left));
  const y0 = Math.max(v.top, Math.min(...rs.map((r) => r.top)));
  const x1 = Math.max(...rs.map((r) => r.right));
  const y1 = Math.min(v.bottom, Math.max(...rs.map((r) => r.bottom)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Runs in the page. Scrolls every scroll box inside the open panel to its end. */
export function scrollPanelToEnd() {
  for (const el of document.querySelectorAll('#ui > .panel:not([hidden]) *')) {
    if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight;
  }
}

/**
 * Runs in the page. One record per element matching `each`, with `fields`
 * read as: 'text' (the element's text), 'text:<sel>' (a child's text),
 * 'data:<name>' (dataset), 'attr:<name>', 'pressed' (aria-pressed),
 * 'disabled', 'height' (rounded CSS px), 'texts:<sel>|<join>' (the texts of
 * the children matching <sel>, joined with <join>, a space by default).
 */
export function readDom({ each, fields }) {
  const read = (el, spec) => {
    const m = /^(\w+)(?::(.*))?$/.exec(spec);
    const kind = m?.[1];
    const arg = m?.[2];
    if (kind === 'text') return (arg ? el.querySelector(arg)?.textContent : el.textContent)?.trim() ?? '';
    if (kind === 'texts') {
      const bar = arg.indexOf('|');
      const sel = bar < 0 ? arg : arg.slice(0, bar);
      return [...el.querySelectorAll(sel)].map((e) => e.textContent.trim()).join(bar < 0 ? ' ' : arg.slice(bar + 1));
    }
    if (kind === 'data') return el.dataset[arg];
    if (kind === 'attr') return el.getAttribute(arg);
    if (kind === 'pressed') return el.getAttribute('aria-pressed') === 'true';
    if (kind === 'disabled') return el.disabled;
    if (kind === 'height') return Math.round(el.getBoundingClientRect().height);
    throw new Error(`readDom: unknown field ${spec}`);
  };
  return [...document.querySelectorAll(each)].map((el) => Object.fromEntries(Object.entries(fields).map(([k, spec]) => [k, read(el, spec)])));
}

/** Runs in the page. Trimmed texts of the elements matching `sel`. */
export function textsOf(sel) {
  return [...document.querySelectorAll(sel)].map((e) => e.textContent.trim());
}
