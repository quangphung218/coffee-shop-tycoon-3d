// Placeholder entry point; replaced once the render and UI layers land.
const ui = document.getElementById('ui');
const canvas = document.getElementById('scene');
// Dev-only actors preview: npm run dev, then open /?preview=actors.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'actors' && canvas instanceof HTMLCanvasElement) {
  void import('./render/actors/preview').then((m) => m.startActorsPreview(canvas, ui));
} else if (ui) {
  const loading = document.createElement('div');
  loading.textContent = 'Loading';
  loading.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;color:#5b3a1e;';
  ui.appendChild(loading);
}
