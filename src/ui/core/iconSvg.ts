/**
 * The flat, hand-drawn icon set from design/t237-cartoon/icons/index.html,
 * kept as the reference the 3D models (src/icon-studio) were built from.
 * The game no longer draws these: UI and 3D labels use the atlas through
 * icons.ts. Only the icon studio's old-vs-new sheet imports this module, so
 * it stays out of the game bundle.
 *
 * ICON_SYMBOLS keeps each <symbol> body exactly as drawn there (all on a
 * 24×24 viewBox). An icon added after P18 has a model but no symbol here.
 */
import { AVATAR_DEFAULT, type IconId } from './icons';

const SYMBOLS = {
  // HUD & điều hướng
  'i-tasks': '<rect class="fk" x="4.5" y="4" width="15" height="17.5" rx="2.5"/><rect class="fh" x="8.5" y="2.5" width="7" height="4" rx="1.5"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  'i-menu': '<circle class="fh" cx="12" cy="12" r="5.2"/><circle class="fk" cx="12" cy="12" r="2.6"/><path d="M3.5 3.5v5a1.5 1.5 0 0 0 3 0v-5M5 10v10.5M20.5 20.5V3.5c-1.6.8-2.5 2.8-2.5 6V12h2.5"/>',
  'i-inventory': '<path class="fc" d="M3.5 7.5 12 3.5l8.5 4V17L12 21l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5V21M7.8 5.5l8.4 4"/>',
  'i-people': '<circle class="fs" cx="16.5" cy="7.5" r="3"/><path class="fs" d="M12.5 18.5a4.5 4.5 0 0 1 9 0z"/><circle class="fh" cx="9" cy="8.5" r="3.5"/><path class="fh" d="M3 20.5a6 6 0 0 1 12 0z"/>',
  'i-marketing': '<path class="fb" d="M3.5 10.5A1.5 1.5 0 0 1 5 9h2.5L16 4.5v15L7.5 15H5a1.5 1.5 0 0 1-1.5-1.5z"/><path class="fk" d="M7.5 15 9 19.5h2.5L10.5 15z"/><path d="M19 9c1.3 1.6 1.3 4.4 0 6"/>',
  'i-upgrades': '<rect class="fc" x="10.5" y="9.5" width="3" height="12" rx="1.5"/><path class="fs" d="M4.5 5.5A1.5 1.5 0 0 1 6 4h10l3.5 3v2a1 1 0 0 1-1 1H6a1.5 1.5 0 0 1-1.5-1.5z"/>',
  'i-reviews': '<path class="fs" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"/><circle class="fi ns" cx="8.5" cy="10" r="1.3"/><circle class="fi ns" cx="12" cy="10" r="1.3"/><circle class="fi ns" cx="15.5" cy="10" r="1.3"/>',
  'i-open': '<path class="fh" d="M5.5 17v-6a6.5 6.5 0 0 1 13 0v6l1.5 1.5H4z"/><path d="M10 21h4M12 2.5v2"/>',
  'i-next-day': '<circle class="fh" cx="12" cy="12" r="4.5"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  'i-camera': '<rect class="fs" x="2.5" y="7" width="13" height="10" rx="2.5"/><path class="fs" d="M15.5 10.5 21 7.5v9l-5.5-3z"/><circle class="fk" cx="7.5" cy="12" r="2"/>',
  'i-settings': '<path class="fs" d="M18.49 9.38 21.29 10.02 21.29 13.98 18.49 14.62A7 7 0 0 1 17.52 16.31L18.36 19.06 14.94 21.03 12.97 18.93A7 7 0 0 1 11.03 18.93L9.06 21.03 5.64 19.06 6.48 16.31A7 7 0 0 1 5.51 14.62L2.71 13.98 2.71 10.02 5.51 9.38A7 7 0 0 1 6.48 7.69L5.64 4.94 9.06 2.97 11.03 5.07A7 7 0 0 1 12.97 5.07L14.94 2.97 18.36 4.94 17.52 7.69A7 7 0 0 1 18.49 9.38Z"/><circle class="fk" cx="12" cy="12" r="3"/>',
  'i-pause': '<rect class="fh" x="6" y="4.5" width="4" height="15" rx="1.5"/><rect class="fh" x="14" y="4.5" width="4" height="15" rx="1.5"/>',
  'i-speed-1': '<path class="fm" d="M7 5.5v13a1 1 0 0 0 1.5.9L19 12.9a1 1 0 0 0 0-1.8L8.5 4.6A1 1 0 0 0 7 5.5z"/>',
  'i-speed-2': '<path class="fm" d="M3 6.5v11L11 12z"/><path class="fm" d="M12.5 6.5v11l8-5.5z"/>',
  'i-speed-4': '<path class="fm" d="M1.5 7v10L8 12z"/><path class="fm" d="M8.5 7v10L15 12z"/><path class="fm" d="M15.5 7v10l6.5-5z"/>',
  'i-close': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  'i-home': '<path class="fh" d="M4 11 12 4l8 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z"/><rect class="fc" x="9.5" y="14" width="5" height="7" rx="1"/>',
  'i-back': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'i-forward': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  // Pha trong ngày
  'i-phase-prep': '<path class="fc" d="M3 10.5h18l-2.2 8.6a2 2 0 0 1-1.9 1.4H7.1a2 2 0 0 1-1.9-1.4z"/><path d="M7.5 10.5 10 4.5M16.5 10.5 14 4.5M9 14v3M12 14v3M15 14v3"/>',
  'i-phase-open': '<rect class="fc" x="5.5" y="3" width="13" height="17.5" rx="2"/><rect class="fk" x="8.5" y="6" width="7" height="3.5" rx="1"/><path d="M3 20.5h18"/><circle class="fi ns" cx="15" cy="13" r="1.3"/>',
  'i-flame': '<path class="fb" d="M12 21.5c-4 0-6.5-2.8-6.5-6.3 0-3.7 3-5.6 3.8-9.7 2.7 1.6 3.3 3.8 3.4 5.4 1-.8 1.6-2 1.8-3.4 2.3 1.9 4 4.4 4 7.7 0 3.5-2.5 6.3-6.5 6.3z"/><path class="fh" d="M12 21.5c-1.7 0-2.8-1.2-2.8-2.8 0-1.7 1.4-2.7 2.8-4.2 1.4 1.5 2.8 2.5 2.8 4.2 0 1.6-1.1 2.8-2.8 2.8z"/>',
  'i-phase-close': '<path class="fh" d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  'i-clock': '<circle class="fk" cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  // Trạng thái & phản hồi
  'i-ok': '<circle class="fm" cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8 5.2-5.8"/>',
  'i-check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'i-warning': '<path class="fh" d="M10.3 4.3a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3z"/><path d="M12 9.5v4"/><circle class="fi ns" cx="12" cy="17" r="1.3"/>',
  'i-error': '<circle class="fb" cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>',
  'i-info': '<circle class="fs" cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle class="fi ns" cx="12" cy="7.7" r="1.3"/>',
  'i-lock': '<rect class="fh" x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>',
  'i-sparkle': '<path class="fh" d="M11 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path class="fh" d="M18.5 15c.3 1.7 1 2.4 2.5 2.7-1.5.3-2.2 1-2.5 2.7-.3-1.7-1-2.4-2.5-2.7 1.5-.3 2.2-1 2.5-2.7z"/>',
  'i-tip': '<path class="fh" d="M8.5 15.5a6.5 6.5 0 1 1 7 0V17h-7z"/><path d="M9 20.5h6M10.5 12l1.5 1.5 1.5-1.5"/>',
  'i-busy': '<path class="fh" d="M7 3.5h10c0 4-2.2 6.3-5 8.5 2.8 2.2 5 4.5 5 8.5H7c0-4 2.2-6.3 5-8.5C9.2 9.8 7 7.5 7 3.5z"/><path d="M5.5 3.5h13M5.5 20.5h13"/>',
  'i-free': '<circle class="fm" cx="12" cy="12" r="7"/><circle class="fk" cx="12" cy="12" r="2.5"/>',
  'i-rest': '<path d="M3.5 9h5l-5 6h5M12.5 4.5h4l-4 5h4M15 14.5h4.5l-4.5 5.5h4.5"/>',
  'i-auto': '<rect class="fs" x="4.5" y="7.5" width="15" height="12" rx="3"/><path d="M12 7.5V5M9.5 16.5h5M2.5 12v3M21.5 12v3"/><circle class="fh" cx="12" cy="4" r="1.5"/><circle class="fi ns" cx="9.5" cy="12.5" r="1.4"/><circle class="fi ns" cx="14.5" cy="12.5" r="1.4"/>',
  'i-trend-up': '<path class="fm" d="M12 5l8 13H4z"/>',
  'i-trend-down': '<path class="fb" d="M12 19 4 6h16z"/>',
  'i-equal': '<path d="M5.5 9.5h13M5.5 14.5h13"/>',
  'i-todo': '<rect class="fk" x="4.5" y="4.5" width="15" height="15" rx="3.5"/>',
  'i-dot': '<circle class="fh" cx="12" cy="12" r="6"/>',
  'i-dot-empty': '<circle class="fe" cx="12" cy="12" r="6"/>',
  'i-chevron-down': '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  'i-retry': '<path d="M19 12A7 7 0 0 1 6.64 16.5M5 12A7 7 0 0 1 17.36 7.5M17.4 3.5v4h-4M6.6 20.5v-4h4"/>',
  'i-reset': '<path d="M4.95 9.43A7.5 7.5 0 1 1 4.95 14.57M4.5 4.5v5h5"/>',
  // Tiền & sao
  'i-coin': '<circle class="fh" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9.5v5"/>',
  'i-star': '<path class="fh" d="M12 3.1 14.7 8.88 21.03 9.66 16.37 14.02 17.58 20.29 12 17.2 6.42 20.29 7.63 14.02 2.97 9.66 9.3 8.88Z"/>',
  'i-star-empty': '<path class="fe" d="M12 3.1 14.7 8.88 21.03 9.66 16.37 14.02 17.58 20.29 12 17.2 6.42 20.29 7.63 14.02 2.97 9.66 9.3 8.88Z"/>',
  // Báo cáo & đánh giá
  'i-chart': '<rect class="fk" x="3" y="3.5" width="18" height="17" rx="2.5"/><rect class="fm" x="6.5" y="12" width="3" height="5" rx="1"/><rect class="fh" x="10.5" y="7.5" width="3" height="9.5" rx="1"/><rect class="fb" x="14.5" y="10" width="3" height="7" rx="1"/>',
  'i-trophy': '<path d="M7 6H4.5v1.5a3 3 0 0 0 3 3M17 6h2.5v1.5a3 3 0 0 1-3 3M12 14v3.5"/><path class="fh" d="M7 4h10v5a5 5 0 0 1-10 0z"/><rect class="fc" x="7.5" y="17.5" width="9" height="3" rx="1"/>',
  'i-thumb-up': '<path class="fm" d="M7.5 10.5 11 4a2 2 0 0 1 2.5 1.8v3.7h4.6a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7.5z"/><rect class="fk" x="3" y="10" width="4.5" height="10.5" rx="1.5"/>',
  'i-thumb-down': '<g transform="rotate(180 12 12)"><path class="fb" d="M7.5 10.5 11 4a2 2 0 0 1 2.5 1.8v3.7h4.6a2 2 0 0 1 2 2.4l-1.3 6.5a2 2 0 0 1-2 1.6H7.5z"/><rect class="fk" x="3" y="10" width="4.5" height="10.5" rx="1.5"/></g>',
  // Hệ thống & cài đặt
  'i-load': '<path class="fh" d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10.5h18"/>',
  'i-delete': '<path class="fb" d="M6 7.5h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5z"/><path d="M4 7.5h16M9.5 7.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5M10 11v6M14 11v6"/>',
  'i-save': '<path class="fs" d="M4 6a2 2 0 0 1 2-2h10.5L20 7.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><rect class="fk" x="7.5" y="13" width="9" height="7" rx="1"/><path d="M8 4v4h7V4"/>',
  'i-music': '<path d="M9 17.5V6l10-2v11.5"/><circle class="fb" cx="6.5" cy="17.5" r="2.5"/><circle class="fb" cx="16.5" cy="15.5" r="2.5"/>',
  'i-sound': '<path class="fs" d="M4 9.5h3l5-4v13l-5-4H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
  'i-quality': '<rect class="fs" x="3" y="4" width="18" height="12.5" rx="2"/><path d="M12 16.5V20M8 20h8"/>',
  // Độ khó, nhiệt độ
  'i-easy': '<path d="M12 21v-9M7.5 21h9"/><path class="fl" d="M12 13c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7z"/><path class="fl" d="M12 11c0-4 2.2-6.5 7-6.5 0 4-2.5 6.5-7 6.5z"/>',
  'i-cup-hot': '<path class="fc" d="M5 10h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15.5z"/><path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.8 1 .8 2 0 3.5M12.5 3.5c-.8 1 .8 2 0 3.5"/>',
  'i-cold': '<circle class="fs" cx="12" cy="12" r="9"/><path d="M12 6.5v11M7.2 9.2l9.6 5.6M7.2 14.8l9.6-5.6"/>',
  // Nhân viên
  'i-role-server': '<path class="fs" d="M4 17a8 8 0 0 1 16 0z"/><circle class="fs" cx="12" cy="7.5" r="1.5"/><path d="M2.5 17h19M5 20.5h14"/>',
  'i-role-cleaner': '<path d="M19.5 3 13 10.5"/><path class="fh" d="M11 9.5l4 3.2c-1 3.8-3.8 6.8-7.5 8.3L3 19.8c.8-4.3 3.5-8 8-10.3z"/><path d="M10 12.7l3.6 2.8"/>',
  'i-chef': '<path class="fk" d="M7 14.5A4 4 0 0 1 6.5 6.6 4.5 4.5 0 0 1 12 4a4.5 4.5 0 0 1 5.5 2.6A4 4 0 0 1 17 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19z"/><path d="M7 16.5h10"/>',
  'i-avatar': '<circle class="av-skin" cx="12" cy="13" r="8"/><path class="av-hair" d="M4 12.5a8 8 0 0 1 16 0c-3.2 0-6-1.4-8-3.8-2 2.4-4.8 3.8-8 3.8z"/><circle class="fi ns" cx="9.3" cy="14.2" r="1.1"/><circle class="fi ns" cx="14.7" cy="14.2" r="1.1"/><path d="M10.3 17.2a2.2 2.2 0 0 0 3.4 0"/>',
  // Cảm xúc khách
  'i-face-happy': '<circle class="fm" cx="12" cy="12" r="9"/><circle class="fi ns" cx="9" cy="10" r="1.3"/><circle class="fi ns" cx="15" cy="10" r="1.3"/><path d="M8.5 13.5a3.5 3.5 0 0 0 7 0"/>',
  'i-face-ok': '<circle class="fh" cx="12" cy="12" r="9"/><circle class="fi ns" cx="9" cy="10" r="1.3"/><circle class="fi ns" cx="15" cy="10" r="1.3"/><path d="M9 15h6"/>',
  'i-face-worried': '<circle class="fo" cx="12" cy="12" r="9"/><circle class="fi ns" cx="9" cy="11" r="1.3"/><circle class="fi ns" cx="15" cy="11" r="1.3"/><path d="M7.5 7.5 10 8.5M16.5 7.5 14 8.5M9 16.5c1.8-1.3 4.2-1.3 6 0"/><path class="fs" d="M19.5 3c1 1.4 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.5-1.6 1.5-3z"/>',
  'i-face-angry': '<circle class="fb" cx="12" cy="12" r="9"/><circle class="fi ns" cx="9" cy="11.5" r="1.3"/><circle class="fi ns" cx="15" cy="11.5" r="1.3"/><path d="M7 8l3 1.5M17 8l-3 1.5M8.5 17c2-1.8 5-1.8 7 0"/>',
  // Món
  'i-espresso': '<path d="M9.5 3.5c-.8 1 .8 2 0 3.5M12.5 3.5c-.8 1 .8 2 0 3.5"/><ellipse class="fk" cx="11" cy="19.5" rx="8" ry="1.8"/><path class="fk" d="M5.5 9.5h11V13a5.5 5.5 0 0 1-11 0z"/><path d="M16.5 10.5h1a2.3 2.3 0 0 1 0 4.6h-1.8"/><ellipse class="fd" cx="11" cy="9.5" rx="5.5" ry="1.4"/>',
  'i-americano': '<path class="fd" d="M6.5 7h11l-1.3 12.6a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4z"/><rect class="fs" x="8.5" y="9.5" width="3.5" height="3.5" rx="1"/><rect class="fs" x="12.5" y="12.5" width="3.5" height="3.5" rx="1"/><path d="M5.5 7h13M14 7l1.5-4.5"/>',
  'i-latte': '<path class="fk" d="M7 3.5h10l-1.2 16a1.5 1.5 0 0 1-1.5 1.5H9.7a1.5 1.5 0 0 1-1.5-1.5z"/><path class="fc" d="M7.65 12h8.7l-.55 7.5a1.5 1.5 0 0 1-1.5 1.5H9.7a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M9.5 7h5"/>',
  'i-cappuccino': '<ellipse class="fk" cx="11" cy="19.5" rx="8" ry="1.8"/><path class="fc" d="M4.5 10h13v2.5a6.5 6.5 0 0 1-13 0z"/><path class="fk" d="M4.5 10c0-2.2 2.9-3.8 6.5-3.8s6.5 1.6 6.5 3.8z"/><path d="M17.5 11h1a2.3 2.3 0 0 1 0 4.6h-1.9"/><circle class="fc ns" cx="11" cy="8.4" r="1"/>',
  'i-mocha': '<path class="fd" d="M5.5 10h11v6a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5.5 16z"/><path d="M16.5 11.5H18a2.5 2.5 0 0 1 0 5h-1.5"/><path class="fk" d="M5 10C5 7.7 6.8 6.6 8.4 6.6 8.9 4.9 10.3 4 11 4s2.1.9 2.6 2.6c1.6 0 3.4 1.1 3.4 3.4z"/><path d="M8 8.6c1 .8 2 .8 3 0s2-.8 3 0"/>',
  'i-bubble-tea': '<path class="fc" d="M6.5 9h11l-1.4 10.6a1.5 1.5 0 0 1-1.5 1.3H9.4a1.5 1.5 0 0 1-1.5-1.3z"/><path class="fk" d="M5.5 9a6.5 3.5 0 0 1 13 0z"/><path d="M13.5 6.5l2-4"/><circle class="fd" cx="10" cy="17.3" r="1.2"/><circle class="fd" cx="13.8" cy="17.3" r="1.2"/><circle class="fd" cx="12" cy="14.6" r="1.2"/>',
  'i-lemon-tea': '<path class="fc" d="M6.5 8h11l-1.3 11.6a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4z"/><rect class="fs" x="9" y="11" width="3.5" height="3.5" rx="1"/><path d="M5.5 8h8"/><circle class="fh" cx="17.5" cy="7" r="3.5"/><path d="M17.5 4.8v4.4M15.3 7h4.4"/>',
  'i-orange-juice': '<path class="fo" d="M6.5 8h11l-1.3 11.6a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M5.5 8h8M10 8 8.5 2.5"/><circle class="fo" cx="17.5" cy="7.5" r="3.5"/><circle class="fk" cx="17.5" cy="7.5" r="1.5"/>',
  'i-croissant': '<path class="fc" d="M2.5 15.5C4 10.5 7.8 7.5 12 7.5s8 3 9.5 8c-1.5.9-3.2.8-4.3-.3-.9 1.6-2.7 2.3-5.2 2.3s-4.3-.7-5.2-2.3c-1.1 1.1-2.8 1.2-4.3.3z"/><path d="M9.3 8.2l1 8.8M14.7 8.2l-1 8.8"/>',
  'i-cake': '<path class="fk" d="M3.5 12.5 16.5 7l4 5.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path class="fb" d="M3.5 15h17v2.5h-17z"/><path d="M3.5 12.5h17"/><circle class="fb" cx="15.5" cy="5" r="2"/>',
  // Nguyên liệu
  'i-beans': '<ellipse class="fc" cx="8.5" cy="13.5" rx="4.2" ry="6" transform="rotate(-25 8.5 13.5)"/><path d="M6.6 8.4c2.4 2.4 0 6.2 3.8 10.2"/><ellipse class="fc" cx="16" cy="10.5" rx="3.6" ry="5.4" transform="rotate(25 16 10.5)"/><path d="M17.6 5.8c-2 2.3.2 5.6-3.2 9.4"/>',
  'i-milk': '<path class="fk" d="M7 9l2-4.5h6L17 9v10.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5z"/><path class="fs" d="M7 12.5h10V17H7z"/><path d="M7 9h10M10 4.5V3h4v1.5"/>',
  'i-sugar': '<rect class="fk" x="3.5" y="12" width="8" height="8" rx="1.5"/><rect class="fk" x="12.5" y="12" width="8" height="8" rx="1.5"/><rect class="fk" x="8" y="4" width="8" height="8" rx="1.5"/>',
  'i-cacao': '<rect class="fc" x="5" y="3.5" width="14" height="17" rx="2"/><path d="M5 8h14M12 3.5V12"/><path class="fb" d="M5 12h14v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z"/>',
  'i-tea': '<path class="fl" d="M5 19c0-8 5-14 15-14 0 10-6 15-15 14z"/><path d="M5 19l8.5-8.5"/>',
  'i-pearls': '<circle class="fd" cx="8" cy="15.5" r="3.5"/><circle class="fd" cx="15.5" cy="16" r="3.5"/><circle class="fd" cx="12" cy="9" r="3.5"/><circle class="fk ns" cx="7" cy="14.3" r="1"/><circle class="fk ns" cx="14.5" cy="14.8" r="1"/><circle class="fk ns" cx="11" cy="7.8" r="1"/>',
  'i-lemon': '<ellipse class="fh" cx="12" cy="12" rx="7.5" ry="5.5" transform="rotate(-35 12 12)"/><path d="M18 7.8l1.6-1.4M6 16.2l-1.6 1.4M9 11c.6-1.2 1.7-2.1 3-2.6"/>',
  'i-orange': '<circle class="fo" cx="12" cy="13.5" r="7.5"/><path d="M12 6V4.5M8.5 12c.4-1.3 1.3-2.2 2.5-2.7"/><path class="fl" d="M12 5.5c1-2 3-2.8 5-2.5-.5 2-2.5 3-5 2.5z"/>',
  'i-flour': '<path class="fk" d="M7.5 8h9c2.2 3 3.5 6.5 3.5 9.5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3c0-3 1.3-6.5 3.5-9.5z"/><path d="M7.5 8 6.5 4h11l-1 4M12 11.5V18M12 14l-2-1.5M12 14l2-1.5M12 16.5 10 15M12 16.5l2-1.5"/>',
  'i-butter': '<path class="fh" d="M3 12.5 8.5 8H21v6.5L15.5 19H3z"/><path d="M3 12.5h12.5V19M15.5 12.5 21 8"/>',
  'i-ice': '<rect class="fs" x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="M8 9c.7-.9 1.7-1.4 2.8-1.5"/>',
  'i-cup': '<path class="fk" d="M6.5 8h11l-1.4 11.6a1.5 1.5 0 0 1-1.5 1.4H9.4a1.5 1.5 0 0 1-1.5-1.4z"/><path class="fh" d="M7.4 11.5h9.2l-.5 4.5H7.9z"/><rect class="fb" x="5.5" y="5" width="13" height="3" rx="1.2"/>',
  // Marketing
  'i-flyer': '<path class="fk" d="M6 3.5h8.5l4 4v12A1.5 1.5 0 0 1 17 21H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M14.5 3.5v4h4M7.5 18h6"/><rect class="fb" x="7.5" y="10.5" width="8" height="4.5" rx="1"/>',
  'i-happy-hour': '<circle class="fh" cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M4 5.5l2.5-2M20 5.5l-2.5-2M7 19.5l-1.5 2M17 19.5l1.5 2"/>',
  'i-social': '<rect class="fs" x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path class="fb" d="M12 14s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z"/>',
  'i-kol': '<rect class="fb" x="9" y="2.5" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7"/>',
  // Nâng cấp
  'i-tables': '<rect class="fc" x="7" y="3" width="10" height="8" rx="2"/><rect class="fc" x="5.5" y="11" width="13" height="3.5" rx="1.5"/><path d="M7.5 14.5V21M16.5 14.5V21"/>',
  'i-machine': '<path class="fs" d="M5.5 9h13v10.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5z"/><rect class="fs" x="4" y="3" width="16" height="6" rx="2"/><path d="M10 9v2.5h4V9"/><path class="fk" d="M9.5 15h5v2.5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z"/><circle class="fh" cx="8" cy="6" r="1"/>',
  'i-fast-machine': '<path class="fh" d="M13.5 2.5 5 13.5h6l-1.5 8 9-11.5h-6z"/>',
  'i-counter': '<path class="fk" d="M16 12V3.5h3.5V12"/><path class="fc" d="M3.5 12h17v7.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><rect class="fs" x="5.5" y="5" width="9" height="7" rx="1.5"/><path d="M7.5 16h9"/>',
  'i-outdoor': '<path d="M12 11.5V21M8.5 21h7M12 4V2.5"/><path class="fb" d="M3 11.5a9 7.5 0 0 1 18 0c-1.5-1-3-1-4.5 0-1.5-1-3-1-4.5 0-1.5-1-3-1-4.5 0-1.5-1-3-1-4.5 0z"/>',
  'i-expand': '<rect class="fh" x="7.5" y="7.5" width="9" height="9" rx="2"/><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>',
  'i-plants': '<path class="fl" d="M12 14c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7z"/><path class="fl" d="M12 14c0-5 2.4-8.6 7-10 .4 5.2-2.2 9-7 10z"/><path class="fo" d="M6.5 14h11l-1.4 6a1.5 1.5 0 0 1-1.5 1H9.4a1.5 1.5 0 0 1-1.5-1z"/>',
  'i-paintings': '<rect class="fc" x="3" y="4" width="18" height="16" rx="2"/><rect class="fs" x="6" y="7" width="12" height="10" rx="1"/><path class="fl" d="M6 17l4-4.5 3 3 2-2 3 3.5z"/><circle class="fh" cx="15" cy="9.8" r="1.3"/>',
  'i-lights': '<path d="M12 2.5v5M10 17.5a2 2 0 0 0 4 0M4 18l-1.5 1M20 18l1.5 1"/><path class="fh" d="M5.5 14a6.5 6.5 0 0 1 13 0z"/>',
  'i-window-bar': '<rect class="fs" x="4" y="3" width="16" height="15" rx="2"/><path d="M12 3v15M4 10.5h16"/><rect class="fc" x="2.5" y="18" width="19" height="3" rx="1"/>',
  // Dụng cụ mới (tools mở theo cấp quán)
  'i-grinder': '<path class="fs" d="M6.5 10h11v8a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z"/><path class="fs" d="M8.5 10 7.5 6.5A1.2 1.2 0 0 1 8.7 5h6.6a1.2 1.2 0 0 1 1.2 1.5L15.5 10z"/><circle class="fd ns" cx="11" cy="7" r="0.9"/><circle class="fd ns" cx="13" cy="7.4" r="0.9"/><path d="M9.5 14.5h5"/>',
  'i-pastry-case': '<rect class="fk" x="3.5" y="8.5" width="17" height="8" rx="1.5"/><path class="fc" d="M3.5 16.5h17v2a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18.5z"/><path d="M3.5 12.5h17"/><circle class="fh" cx="8" cy="10.5" r="1.2"/><path class="fo ns" d="M12.5 9.5 16 11l-3.5 1.5z"/>',
  'i-blender': '<path class="fl" d="M8 6.5h8l-1 8.5H9z"/><path class="fs" d="M9 15h6l-.3 2.3a1 1 0 0 1-1 .9h-3.4a1 1 0 0 1-1-.9z"/><path class="fb" d="M7.7 6.5h8.6l.4-3H7.3z"/><rect class="fs" x="9" y="18.5" width="6" height="2" rx="1"/>',
  'i-ice-maker': '<rect class="fs" x="5" y="4" width="14" height="16" rx="2.5"/><rect class="fk" x="8" y="7" width="8" height="5" rx="1"/><rect class="fk" x="9" y="14.5" width="3" height="3" rx="0.6"/><rect class="fk" x="13" y="15" width="2.6" height="2.6" rx="0.6"/><circle class="fh" cx="16" cy="9.5" r="1"/>',
  'i-dishwasher': '<rect class="fc" x="5.5" y="3.5" width="13" height="17" rx="2"/><circle class="fs" cx="12" cy="13" r="4.5"/><circle class="fk" cx="12" cy="13" r="2.4"/><path d="M8 6.5h8"/><circle class="fh" cx="15.5" cy="6.5" r="0.9"/>',
  // Món mới, cấp quán và nhiệm vụ
  'i-frappe': '<path class="fc" d="M6.5 9h11l-1.3 10.6a1.5 1.5 0 0 1-1.5 1.4H9.3a1.5 1.5 0 0 1-1.5-1.4z"/><path class="fk" d="M5.5 9a6.5 3.5 0 0 1 13 0z"/><path class="fk" d="M7.5 6.5a4.5 2.5 0 0 1 9 0z"/><path d="M13.5 6.5 15 2.5"/><circle class="fb" cx="12" cy="4" r="1.2"/>',
  'i-level': '<path class="fh" d="M12 3 19 5.5v6c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5v-6z"/><path class="fk ns" d="M12 7.5 13.4 10.3 16.5 10.8 14.2 13 14.8 16 12 14.6 9.2 16 9.8 13 7.5 10.8 10.6 10.3z"/>',
  'i-mission': '<rect class="fc" x="5" y="4.5" width="14" height="16" rx="2"/><rect class="fk" x="7" y="6.5" width="10" height="12" rx="1"/><rect class="fd" x="9" y="3" width="6" height="3" rx="1.2"/><path d="M9 11l1.8 1.8L14 9M9.5 15.5h5"/>',
} as const satisfies Partial<Record<IconId, string>>;

/** Symbol bodies as drawn in the design file, keyed by id. */
export const ICON_SYMBOLS: Readonly<Partial<Record<IconId, string>>> = SYMBOLS;

/** Fill classes of the design file → their value in design/t237-cartoon/tokens.css. */
const FILLS: Readonly<Record<string, string>> = {
  fh: '#ffc145',
  fm: '#5fd3a8',
  fb: '#ff8a7a',
  fs: '#8fd3f4',
  fk: '#fffaf2',
  fc: '#d9a877',
  fd: '#6b3f24',
  fl: '#8fcf5f',
  fo: '#ffa04d',
  fe: '#ecd3b2',
  fi: '#3a2216',
};

const INK = '#3a2216';

export interface IconMarkupOptions {
  /** Width and height in px. Default 24. */
  size?: number;
  /** Avatar colours (hex); only i-avatar uses them. */
  skin?: string;
  hair?: string;
}

/**
 * Self-contained SVG (symbol + <use>, fills as hex) of the flat design icon;
 * empty when the icon has no flat drawing.
 */
export function iconSvgMarkup(id: IconId, opts: IconMarkupOptions = {}): string {
  const size = opts.size ?? 24;
  const fills: Record<string, string> = {
    ...FILLS,
    'av-skin': opts.skin ?? AVATAR_DEFAULT.skin,
    'av-hair': opts.hair ?? AVATAR_DEFAULT.hair,
  };
  const body = (ICON_SYMBOLS[id] ?? '').replace(/class="([^"]+)"/g, (_, list: string) =>
    list
      .split(' ')
      .map((c) => (c === 'ns' ? 'stroke="none"' : fills[c] ? `fill="${fills[c]}"` : ''))
      .filter(Boolean)
      .join(' '),
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" overflow="visible">` +
    `<defs><symbol id="${id}" viewBox="0 0 24 24" overflow="visible">${body}</symbol></defs>` +
    `<use href="#${id}" width="24" height="24"/></svg>`
  );
}
