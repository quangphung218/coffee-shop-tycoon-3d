// Boards (rows of frames side by side with titles, red rings, captions and
// notes, drawn on a canvas in the browser and written as JPEG), crops round
// rings, the DOM ring overlay for direct shots, and the JPEG shot itself.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { BOARD_WIDTH, DESK, HIDE_TOASTS, RED, ROOT, warn } from './capture.mjs';

/**
 * Runs in the browser. Draws `rows` of panels: each row has its `crop` (CSS
 * px) and `dpr`, each panel a title, its image (base64 of `mime`) cropped,
 * rings round its `boxes` (with a numbered badge when a box has a `label`)
 * and its caption in a red box; `notes` under all. Panels of a row share
 * one scale, so the row fits `width`; with `fit` the canvas shrinks to the
 * widest row instead of staying `width` wide. A row with `clampRings` keeps
 * every ring inside its panel (a ring round a full-width section or a list
 * longer than the view stays whole). Returns the JPEG as base64.
 */
export async function drawBoard({ rows, width, fit, notes, red, quality }) {
  const INK = '#2b1d14';
  const PAD = 24;
  const GAP = 24;
  const TITLE = 40;
  const CAP_LINE = 25;
  const NOTE_LINE = 24;
  const font = (weight, px) => `${weight} ${px}px Nunito, system-ui, sans-serif`;
  const wrap = (c, text, max) => {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > max) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const load = async (p) => createImageBitmap(await (await fetch(`data:${p.mime ?? 'image/png'};base64,${p.img}`)).blob());
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  const laid = [];
  let y = PAD;
  let widest = 0;
  for (const row of rows) {
    const n = row.panels.length;
    const scale = Math.min(1, (width - 2 * PAD - GAP * (n - 1)) / (n * row.crop.w * row.dpr));
    const k = row.dpr * scale;
    const pw = Math.round(row.crop.w * k);
    const ph = Math.round(row.crop.h * k);
    probe.font = font(700, 19);
    const caps = row.panels.map((p) => wrap(probe, p.caption, pw - 24));
    const capH = 16 + CAP_LINE * Math.max(...caps.map((c) => c.length));
    const imgs = await Promise.all(row.panels.map(load));
    laid.push({ row, k, pw, ph, caps, capH, imgs, top: y + TITLE });
    y += TITLE + ph + 10 + capH + GAP;
    widest = Math.max(widest, 2 * PAD + n * pw + (n - 1) * GAP);
  }
  const canvas = document.createElement('canvas');
  canvas.width = fit ? widest : width;
  probe.font = font(600, 17);
  const noteLines = notes.flatMap((t) => wrap(probe, t, canvas.width - 2 * PAD));
  canvas.height = y + NOTE_LINE * noteLines.length + PAD - GAP + 12;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  for (const { row, k, pw, ph, caps, capH, imgs, top } of laid) {
    const { crop, dpr } = row;
    for (const [i, p] of row.panels.entries()) {
      const x = PAD + i * (pw + GAP);
      let size = 22;
      ctx.font = font(700, size);
      while (size > 12 && ctx.measureText(p.title).width > pw) ctx.font = font(700, --size);
      ctx.fillStyle = INK;
      ctx.fillText(p.title, x, top - TITLE / 2 - 4);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgs[i], crop.x * dpr, crop.y * dpr, crop.w * dpr, crop.h * dpr, x, top, pw, ph);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, top, pw, ph);
      ctx.clip();
      for (const b of p.boxes) {
        let rx0 = x + (b.x - crop.x) * k - 8;
        let ry0 = top + (b.y - crop.y) * k - 8;
        let rx1 = x + (b.x + b.w - crop.x) * k + 8;
        let ry1 = top + (b.y + b.h - crop.y) * k + 8;
        if (row.clampRings) {
          const M = 7;
          rx0 = Math.max(x + M, rx0);
          ry0 = Math.max(top + M, ry0);
          rx1 = Math.min(x + pw - M, rx1);
          ry1 = Math.min(top + ph - M, ry1);
        }
        ctx.beginPath();
        ctx.roundRect(rx0, ry0, rx1 - rx0, ry1 - ry0, 12);
        for (const [w, color] of [[9, '#fff'], [5, red]]) {
          ctx.lineWidth = w;
          ctx.strokeStyle = color;
          ctx.stroke();
        }
        if (!b.label) continue;
        const R = 16;
        const bx = Math.min(x + pw - R - 4, Math.max(x + R + 4, rx0));
        const by = Math.min(top + ph - R - 4, Math.max(top + R + 4, ry0));
        ctx.beginPath();
        ctx.arc(bx, by, R, 0, 2 * Math.PI);
        ctx.fillStyle = red;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.font = font(800, 18);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, bx, by + 1);
        ctx.textAlign = 'start';
      }
      ctx.restore();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.strokeRect(x, top, pw, ph);
      const capTop = top + ph + 10;
      ctx.beginPath();
      ctx.roundRect(x, capTop, pw, capH, 10);
      ctx.fillStyle = red;
      ctx.fill();
      ctx.font = font(700, 19);
      ctx.fillStyle = '#fff';
      caps[i].forEach((t, j) => ctx.fillText(t, x + 12, capTop + 8 + CAP_LINE * j + CAP_LINE / 2));
    }
  }
  ctx.font = font(600, 17);
  ctx.fillStyle = INK;
  const notesTop = y - GAP + 12;
  noteLines.forEach((t, j) => ctx.fillText(t, PAD, notesTop + NOTE_LINE * j + NOTE_LINE / 2));
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

/**
 * Writes the drawBoard JPEG `file` (absolute). Each of `rows` has `crop`,
 * `dpr` (default 1), `clampRings` (default true) and `panels` with `title`,
 * `caption`, `boxes` and `png` or `jpeg` (Buffer). Returns the path relative
 * to the repo, or null (with a `!!`) when the board drew nothing.
 */
export async function writeBoard(browser, file, { rows, notes = [], width = BOARD_WIDTH, fit = false, quality = 0.86 }) {
  const page = await browser.newPage({ viewport: DESK, deviceScaleFactor: 1 });
  try {
    const jpeg = await page.evaluate(drawBoard, {
      rows: rows.map((r) => ({
        crop: r.crop,
        dpr: r.dpr ?? 1,
        clampRings: r.clampRings ?? true,
        panels: r.panels.map((p) => ({
          title: p.title,
          caption: p.caption,
          boxes: p.boxes ?? [],
          img: (p.jpeg ?? p.png).toString('base64'),
          mime: p.jpeg ? 'image/jpeg' : 'image/png',
        })),
      })),
      width,
      fit,
      notes,
      red: RED,
      quality,
    });
    // An empty canvas (NaN or zero size) gives "data:," and no JPEG.
    if (!jpeg) {
      warn(`${relative(ROOT, file)}: the board drew nothing`);
      return null;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(jpeg, 'base64'));
    return relative(ROOT, file);
  } finally {
    await page.close();
  }
}

/** A crop of `w`×`h` CSS px centred on `box` (shifted down by `down`), inside `view`. */
export function cropRound(box, w, h, view, down = 0) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2 + down;
  return {
    x: Math.round(Math.min(view.width - w, Math.max(0, cx - w / 2))),
    y: Math.round(Math.min(view.height - h, Math.max(0, cy - h / 2))),
    w,
    h,
  };
}

/** Smallest box holding both. */
export function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Grows `box` by `pad` CSS px each side. */
export const grow = (b, pad) => ({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });

/** The crop round all of `boxes` grown by `pad`, at least `min` wide and high, kept inside `view`. */
export function cropAround(boxes, { pad = 50, min = { w: 420, h: 320 }, view = DESK } = {}) {
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const x1 = Math.min(view.width, Math.max(...boxes.map((b) => b.x + b.w)) + pad);
  const y1 = Math.min(view.height, Math.max(...boxes.map((b) => b.y + b.h)) + pad);
  const crop = { x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.max(min.w, x1 - x0)), h: Math.round(Math.max(min.h, y1 - y0)) };
  crop.x = Math.min(crop.x, view.width - crop.w);
  crop.y = Math.min(crop.y, view.height - crop.h);
  return crop;
}

/** The crop centred on the span of `boxes` grown by `pad`, at least `min`, inside `view` (the coin board's). */
export function cropSpan(boxes, { pad = 34, min = { w: 200, h: 210 }, view = DESK } = {}) {
  const span = (lo, hi, least, limit) => {
    const mid = (lo + hi) / 2;
    const half = Math.max(hi - lo, least) / 2;
    const a = Math.max(0, Math.floor(mid - half));
    return [a, Math.min(limit, Math.ceil(mid + half)) - a];
  };
  const [x, w] = span(Math.min(...boxes.map((b) => b.x)) - pad, Math.max(...boxes.map((b) => b.x + b.w)) + pad, min.w, view.width);
  const [y, h] = span(Math.min(...boxes.map((b) => b.y)) - pad, Math.max(...boxes.map((b) => b.y + b.h)) + pad, min.h, view.height);
  return { x, y, w, h };
}

/** Draws red rings (fixed, over everything) around `boxes`, viewport CSS px. */
export function ringOverlay(page, boxes) {
  return page.evaluate(
    ({ boxes, red }) => {
      for (const b of boxes) {
        const d = document.createElement('div');
        Object.assign(d.style, {
          position: 'fixed',
          left: `${b.x - 6}px`,
          top: `${b.y - 6}px`,
          width: `${b.w + 12}px`,
          height: `${b.h + 12}px`,
          border: `4px solid ${red}`,
          borderRadius: '12px',
          boxShadow: '0 0 0 2px #fff',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        document.body.append(d);
      }
    },
    { boxes, red: RED },
  );
}

/** Shoots the page to the JPEG `file` (absolute), toasts hidden; returns the path relative to the repo. */
export async function writeShot(page, file, { quality = 78, hideToasts = true } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality, ...(hideToasts ? { style: HIDE_TOASTS } : {}) });
  return relative(ROOT, file);
}
