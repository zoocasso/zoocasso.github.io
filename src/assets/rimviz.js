/* RIM page: two small viewers drawn from the lab's layered scene (the same model as lab.js).
   Views: view u composites the four layers, each shifted by (K / 8) (u - c) / 48 of the width.
   Refocus: 25 images refocused offline (shift-and-sum of the 64 views, D = 0.30 ... 1.02), cross-faded.
   Both follow the pointer, have a slider for the keyboard, and move on their own while untouched. */
(() => {
'use strict';
const NP = 8, NL = 48, K = [3, 5, 7, 9], C = (NP - 1) / 2, S = 640;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/* shared: swap the still for a canvas, follow the pointer, drive the slider, and animate when idle */
function viewer(fig, h) {
  const still = fig.querySelector('img'), cv = fig.querySelector('canvas'), input = fig.querySelector('input');
  cv.width = cv.height = S;
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', still.alt);
  still.hidden = true; cv.hidden = false;
  let last = -1e9, visible = false, raf = 0;
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && !e.pressure) return;
    const r = cv.getBoundingClientRect();
    h.pointer(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    last = performance.now(); h.draw();
  });
  input.addEventListener('input', () => { h.slider(Number(input.value) / 100); last = performance.now(); h.draw(); });
  const tick = (now) => {
    raf = 0;
    if (!visible || reduce) return;
    if (now - last > 2500) { h.auto(now); h.draw(); }
    raf = requestAnimationFrame(tick);
  };
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(tick); }).observe(cv);
  h.draw();
}

async function views(fig) {
  const atlas = await load(fig.dataset.src), cell = atlas.naturalWidth / 2, sc = S / cell;
  const g = fig.querySelector('canvas').getContext('2d'), input = fig.querySelector('input');
  // the background layer is opaque: mirror it past its edges so a shifted copy never shows a gap
  const PAD = Math.ceil(K[3] / NP / NL * C * cell) + 2, bg = document.createElement('canvas');
  bg.width = bg.height = cell + 2 * PAD;
  const bgc = bg.getContext('2d');
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    bgc.setTransform(i ? -1 : 1, 0, 0, j ? -1 : 1, PAD + (i > 0 ? 2 * cell : 0), PAD + (j > 0 ? 2 * cell : 0));
    bgc.drawImage(atlas, cell, cell, cell, cell, 0, 0, cell, cell);
  }
  const map = fig.querySelector('.vmap'), dots = [];
  for (let i = 0; i < NP * NP; i++) dots.push(map.appendChild(document.createElement('i')));
  let lit = -1;
  // the circle the lab uses: it starts at view (6, 3)
  const a0 = Math.atan2(3 - C, 6 - C), r = Math.hypot(6 - C, 3 - C), u = [6, 3];
  const onCircle = (t) => { u[0] = C + r * Math.cos(a0 + 2 * Math.PI * t); u[1] = C + r * Math.sin(a0 + 2 * Math.PI * t); };
  viewer(fig, {
    // the pointer stays within the auto circle's radius: farther out, the empty backs of the layers show
    pointer(x, y) { u[0] = C + (x * 2 - 1) * r; u[1] = C + (y * 2 - 1) * r; },
    slider(t) { onCircle(t); },
    auto(now) { const t = (now / 6000) % 1; onCircle(t); input.value = String(Math.round(t * 100)); },
    draw() {
      g.clearRect(0, 0, S, S);
      for (let k = 3; k >= 0; k--) {
        const s = K[k] / NP / NL * S, dx = s * (u[0] - C), dy = s * (u[1] - C);
        if (k === 3) g.drawImage(bg, dx - PAD * sc, dy - PAD * sc, bg.width * sc, bg.height * sc);
        else g.drawImage(atlas, (k % 2) * cell, Math.floor(k / 2) * cell, cell, cell, dx, dy, S, S);
      }
      const on = Math.round(u[1]) * NP + Math.round(u[0]);
      if (on !== lit) { if (lit >= 0) dots[lit].className = ''; dots[on].className = 'on'; lit = on; }
    }
  });
}

async function refocus(fig) {
  const sheet = await load(fig.dataset.src), N = 25, COLS = 5, tile = sheet.naturalWidth / COLS, D0 = 0.30, DS = 0.03;
  const g = fig.querySelector('canvas').getContext('2d'), input = fig.querySelector('input'), label = fig.querySelector('.vizlabel');
  const names = { ko: ['앞쪽 원환체', '가운데 원숭이 머리', '뒤쪽 원뿔·정육면체'], en: ['torus in front', 'monkey head in the middle', 'cone and cube at the back'] }[lang];
  const at = (k) => (K[k] / NP - D0) / (DS * (N - 1));   // slider position where layer k is in focus
  // the pointer and the slider span the three objects, from the torus to the cone
  const lo = at(0) - 0.06, hi = at(2) + 0.06, span = (t) => lo + (hi - lo) * t;
  let v = at(0);
  const tileAt = (i) => g.drawImage(sheet, (i % COLS) * tile, Math.floor(i / COLS) * tile, tile, tile, 0, 0, S, S);
  viewer(fig, {
    pointer(x) { v = span(x); },
    slider(t) { v = span(t); },
    auto(now) { v = at(0) + (at(2) - at(0)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * now / 7000)); input.value = String(Math.round((v - lo) / (hi - lo) * 100)); },
    draw() {
      const f = v * (N - 1), i = Math.min(N - 2, Math.floor(f)), a = f - i;
      g.globalAlpha = 1; tileAt(i);
      if (a > 0.002) { g.globalAlpha = a; tileAt(i + 1); g.globalAlpha = 1; }
      const D = D0 + DS * f, k = [0, 1, 2].find((j) => Math.abs(D - K[j] / NP) < 0.05);
      label.textContent = k === undefined ? '' : (lang === 'ko' ? `초점: ${names[k]}` : `Focus: ${names[k]}`);
    }
  });
}

for (const fig of document.querySelectorAll('[data-viz]')) {
  (fig.dataset.viz === 'views' ? views(fig) : refocus(fig)).catch(() => { /* the still image stays */ });
}
})();
