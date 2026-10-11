/* RIM page: two viewers on the ICCAS 2026 scene, rendered with the paper's Blender script at 8 x 8 views.
   Views: the 64 rendered views (1000 px); the pointer picks a viewpoint and the nearest view is shown. Refocus: 31 images reconstructed from the 64 views (shift-and-sum) at depths spaced evenly
   from 0.36 to 1.55 m; the slider picks the depth.
   Both have a slider (the refocus viewer only that) and move on their own while untouched. */
(() => {
'use strict';
const NP = 8, C = (NP - 1) / 2, NF = 31, Z0 = 0.36, Z1 = 1.55;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
// phones get the 500 px set so 64 decoded views stay within their memory
const base = (fig) => fig.dataset.dir + (Math.min(window.innerWidth, screen.width || 9999) < 700 ? 's/' : '');
const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
// depth of each object (median over its pixels in the centre render, metres)
const OBJ = [
  { z: 0.3854, ko: '앞쪽 원숭이 머리', en: 'monkey head in front' },
  { z: 0.624, ko: '원환체', en: 'torus' },
  { z: 0.877, ko: '정육면체', en: 'cube' },
  { z: 1.1463, ko: '원뿔', en: 'cone' },
  { z: 1.4066, ko: '뒤쪽 구', en: 'sphere at the back' }
];

function viewer(fig, h) {
  const still = fig.querySelector('img'), cv = fig.querySelector('canvas'), input = fig.querySelector('input');
  cv.width = cv.height = h.size;
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', still.alt);
  still.hidden = true; cv.hidden = false;
  let last = -1e9, visible = false, raf = 0;
  if (h.pointer) cv.addEventListener('pointermove', (e) => {
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
  const dir = base(fig), imgs = await Promise.all([...Array(NP * NP)].map((_, i) => load(`${dir}v${Math.floor(i / NP)}${i % NP}.webp`)));
  if (imgs.some((i) => !i)) return;
  const S = imgs[0].naturalWidth, g = fig.querySelector('canvas').getContext('2d'), input = fig.querySelector('input');
  const row = document.createElement('canvas'); row.width = row.height = S;
  const rg = row.getContext('2d');
  const map = fig.querySelector('.vmap'), dots = [];
  for (let i = 0; i < NP * NP; i++) dots.push(map.appendChild(document.createElement('i')));
  let lit = -1;
  const u = [C, C], r = 3;
  const onCircle = (t) => { u[0] = C + r * Math.cos(2 * Math.PI * t); u[1] = C + r * Math.sin(2 * Math.PI * t); };
  onCircle(0);
  // the nearest rendered view; near a boundary it cross-fades briefly into the next one (a longer blend
  // would show two offset copies of the near objects, since the views differ by parallax)
  const ease = (f) => { const k = Math.min(1, Math.max(0, (f - 0.42) / 0.16)); return k * k * (3 - 2 * k); };
  const blendRow = (ctx, y, x0, fx) => {
    ctx.globalAlpha = 1; ctx.drawImage(imgs[y * NP + x0], 0, 0);
    if (fx > 0.002) { ctx.globalAlpha = fx; ctx.drawImage(imgs[y * NP + x0 + 1], 0, 0); ctx.globalAlpha = 1; }
  };
  viewer(fig, {
    size: S,
    pointer(x, y) { u[0] = x * (NP - 1); u[1] = y * (NP - 1); },
    slider(t) { onCircle(t); },
    auto(now) { const t = (now / 7000) % 1; onCircle(t); input.value = String(Math.round(t * 100)); },
    draw() {
      const x0 = Math.min(NP - 2, Math.floor(u[0])), y0 = Math.min(NP - 2, Math.floor(u[1])), fx = ease(u[0] - x0), fy = ease(u[1] - y0);
      blendRow(g, y0, x0, fx);
      if (fy > 0.002) { blendRow(rg, y0 + 1, x0, fx); g.globalAlpha = fy; g.drawImage(row, 0, 0); g.globalAlpha = 1; }
      const on = Math.round(u[1]) * NP + Math.round(u[0]);
      if (on !== lit) { if (lit >= 0) dots[lit].className = ''; dots[on].className = 'on'; lit = on; }
    }
  });
}

async function refocus(fig) {
  const dir = base(fig), frames = await Promise.all([...Array(NF)].map((_, i) => load(`${dir}f${String(i).padStart(2, '0')}.webp`)));
  if (frames.some((i) => !i)) return;
  const S = frames[0].naturalWidth, g = fig.querySelector('canvas').getContext('2d'), input = fig.querySelector('input'), label = fig.querySelector('.vizlabel');
  // v: 0 ... 1 along depth Z from Z0 to Z1 (the frames are spaced evenly in Z)
  const at = (z) => (z - Z0) / (Z1 - Z0);
  const lo = at(OBJ[0].z) - 0.04, hi = at(OBJ[OBJ.length - 1].z) + 0.04, span = (t) => lo + (hi - lo) * t;
  let v = at(OBJ[0].z);
  viewer(fig, {
    size: S,
    slider(t) { v = span(t); },
    auto(now) { v = at(OBJ[0].z) + (at(OBJ[4].z) - at(OBJ[0].z)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * now / 9000)); input.value = String(Math.round((v - lo) / (hi - lo) * 100)); },
    draw() {
      const f = Math.min(NF - 1, Math.max(0, v * (NF - 1))), i = Math.min(NF - 2, Math.floor(f)), a = f - i;
      g.globalAlpha = 1; g.drawImage(frames[i], 0, 0);
      if (a > 0.002) { g.globalAlpha = a; g.drawImage(frames[i + 1], 0, 0); g.globalAlpha = 1; }
      const z = Z0 + (Z1 - Z0) * v, o = OBJ.find((ob) => Math.abs(z - ob.z) < 0.06);
      label.textContent = o ? (lang === 'ko' ? `초점: ${o.ko} (${o.z.toFixed(2)} m)` : `Focus: ${o.en} (${o.z.toFixed(2)} m)`) : (lang === 'ko' ? `초점 깊이 ${z.toFixed(2)} m` : `Focus depth ${z.toFixed(2)} m`);
    }
  });
}

for (const fig of document.querySelectorAll('[data-viz]')) {
  (fig.dataset.viz === 'views' ? views(fig) : refocus(fig)).catch(() => { /* the still image stays */ });
}
})();
