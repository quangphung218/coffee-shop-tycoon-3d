// Placeholder entry point; replaced once the render and UI layers land.
const ui = document.getElementById('ui');
if (ui) {
  const loading = document.createElement('div');
  loading.textContent = 'Loading';
  loading.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;color:#5b3a1e;';
  ui.appendChild(loading);
}
