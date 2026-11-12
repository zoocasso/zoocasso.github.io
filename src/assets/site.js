/* Site behaviour, vanilla JS: the email (copy and mail links), the system tabs, the flow diagrams (dots along
   the edges, a node's path on click, the inspector, "my work only"), the before/after slider, BibTeX copy
   and the language hint. */
(() => {
'use strict';
document.documentElement.classList.add('js');
const lang = ['en', 'ja'].includes(document.documentElement.lang) ? document.documentElement.lang : 'ko';
const WIDE = matchMedia('(min-width: 960px)');
const SVGNS = 'http://www.w3.org/2000/svg';
const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));

/* ── Toast ─────────────────────────────────────── */
let toastEl;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg><span></span>';
    document.body.appendChild(toastEl);
  }
  toastEl.querySelector('span').textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

/* ── Email: put together here, so the address never sits in the page as plain text ── */
const addr = document.body.dataset.eu && document.body.dataset.ed ? `${document.body.dataset.eu}@${document.body.dataset.ed}` : '';
if (addr) {
  $$('[data-mailto]').forEach((a) => { a.href = `mailto:${addr}`; });
  $$('[data-email-text]').forEach((s) => { s.textContent = addr; });
}
// the Clipboard API first; where it is refused (an embedded browser, an old one), the older copy command
function copyText(text) {
  const legacy = () => new Promise((res, rej) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy') ? res() : rej(new Error('copy')); } catch (e) { rej(e); }
    document.body.removeChild(ta);
  });
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(legacy);
  return legacy();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-email-copy]');
  if (!b || !addr) return;
  e.preventDefault();
  copyText(addr).then(() => {
    toast(`${b.dataset.done} · ${addr}`);
    b.classList.add('is-done'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('is-done'), 2600);
  }, () => {
    // where copying is not allowed at all, the address in the contact card is selected and the toast shows it
    const v = document.querySelector('[data-email-text]');
    if (v) {
      const r = document.createRange(); r.selectNodeContents(v);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    toast(`${b.dataset.manual} · ${addr}`);
  });
});

/* ── BibTeX and other copy buttons that name an element ── */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const src = document.getElementById(b.dataset.copy);
  if (!src) return;
  const original = b.dataset.label || b.textContent;
  b.dataset.label = original;
  try { await copyText(src.textContent); b.textContent = b.dataset.done || 'Copied'; }
  catch (err) {
    const r = document.createRange(); r.selectNodeContents(src);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    b.textContent = b.dataset.manual || 'Selected';
  }
  setTimeout(() => { b.textContent = original; }, 2500);
});

/* ── Before/after comparison: the slider moves the boundary between two images ── */
$$('[data-compare]').forEach((box) => {
  const input = document.getElementById(box.dataset.compare);
  if (!input) return;
  const set = () => box.style.setProperty('--pos', input.value + '%');
  input.addEventListener('input', set);
  set();
});

/* ── "My work only": other parties' nodes and edges step back ── */
$$('[data-mine-toggle]').forEach((t) => {
  t.addEventListener('click', () => {
    const on = t.getAttribute('aria-pressed') !== 'true';
    $$('[data-mine-toggle]').forEach((x) => x.setAttribute('aria-pressed', String(on)));
    document.body.classList.toggle('mine-only', on);
  });
});

/* ── Tabs (system explorer) ─────────────────────── */
const tablist = document.querySelector('[role="tablist"]');
const tabs = tablist ? $$('[role="tab"]', tablist) : [];
function activate(tab, focus) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const p = document.getElementById(t.getAttribute('aria-controls'));
    if (p) p.hidden = !on;
  });
  if (focus) tab.focus();
  requestAnimationFrame(drawAll);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => activate(t));
  t.addEventListener('keydown', (e) => {
    const k = e.key; let j = -1;
    if (k === 'ArrowRight') j = (i + 1) % tabs.length;
    if (k === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    if (k === 'Home') j = 0;
    if (k === 'End') j = tabs.length - 1;
    if (j > -1) { e.preventDefault(); activate(tabs[j], true); }
  });
});
function openFromHash(hash) {
  if (!hash || hash.indexOf('#sys-') !== 0) return;
  const t = tabs.filter((x) => '#' + x.getAttribute('aria-controls') === hash)[0];
  if (t) activate(t);
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href*="#sys-"]');
  if (a && a.pathname === location.pathname) openFromHash(a.hash);
});
addEventListener('hashchange', () => openFromHash(location.hash));

/* ── Flow diagrams ──────────────────────────────── */
const flows = $$('.flow');
const ownerOf = (n) => (n ? n.getAttribute('data-owner') || 'ext' : 'ext');
function edgeKind(a, b) {
  const oa = ownerOf(a), ob = ownerOf(b);
  if (oa === 'other' || ob === 'other') return 'other';
  if (oa === 'me' || ob === 'me' || oa === 'shared' || ob === 'shared') return 'me';
  return 'base';
}
function parseEdges(flow) {
  const list = [];
  const spec = flow.getAttribute('data-edges');
  if (spec) {
    spec.split(';').forEach((s) => {
      s = s.trim(); if (!s) return;
      const m = s.match(/^([\w-]+)\s*>\s*([\w-]+)(?:\s*\|\s*([^@]*))?(?:@([\d.]+))?$/);
      if (m) list.push({ a: m[1], b: m[2], label: (m[3] || '').trim(), t: m[4] ? parseFloat(m[4]) : 0.5 });
    });
  } else {
    // lanes: each lane's nodes follow one another
    $$('.lane > ol', flow).forEach((ol) => {
      const ns = $$('.node[data-id]', ol);
      for (let i = 1; i < ns.length; i++) list.push({ a: ns[i - 1].dataset.id, b: ns[i].dataset.id, label: ns[i].getAttribute('data-in') || '', t: 0.5 });
    });
  }
  return list;
}
const HINT = { ko: '노드를 누르면 그 노드를 지나는 데이터 경로가 강조됩니다.', en: 'Click a node to highlight the data path through it.', ja: 'ノードを押すと、そのノードを通るデータの経路が強調されます。' }[lang];

function setupFlow(flow) {
  const nodes = {};
  $$('.node[data-id]', flow).forEach((n) => { nodes[n.dataset.id] = n; });
  const edges = parseEdges(flow).filter((e) => nodes[e.a] && nodes[e.b]);

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'flow-svg'); svg.setAttribute('aria-hidden', 'true');
  const labels = document.createElement('div');
  labels.className = 'flow-labels'; labels.setAttribute('aria-hidden', 'true');
  flow.insertBefore(svg, flow.firstChild);
  flow.insertBefore(labels, svg.nextSibling);

  edges.forEach((e) => {
    const kind = edgeKind(nodes[e.a], nodes[e.b]);
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'edge ' + kind);
    const base = document.createElementNS(SVGNS, 'path');
    base.setAttribute('class', kind === 'other' ? 'edge-other' : 'edge-base');
    g.appendChild(base);
    let anim = null;
    if (kind === 'me') { anim = document.createElementNS(SVGNS, 'path'); anim.setAttribute('class', 'edge-flow'); g.appendChild(anim); }
    const arrow = document.createElementNS(SVGNS, 'path'); arrow.setAttribute('class', 'edge-arrow');
    g.appendChild(arrow);
    svg.appendChild(g);
    Object.assign(e, { g, base, anim, arrow, kind });
    if (e.label) {
      const l = document.createElement('span');
      l.className = 'elabel ' + kind; l.textContent = e.label;
      labels.appendChild(l); e.l = l;
    }
  });

  const insp = flow.nextElementSibling && flow.nextElementSibling.classList.contains('inspector') ? flow.nextElementSibling : null;
  const state = { flow, nodes, edges, svg, insp, pinned: null, path: false };
  flow._state = state;

  function stageName(n) {
    const s = n.querySelector('.node-stage');
    if (s) return s.textContent;
    const st = n.closest('.stage');
    const h = st && st.querySelector('.stage-h');
    if (!h) return '';
    const num = h.querySelector('.n');
    const label = h.textContent.replace(num ? num.textContent : '', '').trim();
    return (num ? num.textContent + ' · ' : '') + label;
  }
  function renderInspector(n) {
    if (!insp) return;
    const owner = ownerOf(n);
    const side = insp.querySelector('.insp-side'), main = insp.querySelector('.insp-main');
    const t = n.querySelector('.node-title'), m = n.querySelector('.node-metric'), g = n.querySelector('.node-tag');
    side.innerHTML = '';
    const k = document.createElement('div'); k.className = 'insp-k'; k.textContent = stageName(n); side.appendChild(k);
    const h = document.createElement('p'); h.className = 'insp-title'; h.textContent = t ? t.textContent : ''; side.appendChild(h);
    if (m) { const p = document.createElement('p'); p.className = 'insp-metric'; p.textContent = m.textContent; side.appendChild(p); }
    if (g) { const s = document.createElement('span'); s.className = 'insp-tag ' + owner; s.textContent = g.textContent; side.appendChild(s); }
    const hint = document.createElement('p'); hint.className = 'insp-hint'; hint.textContent = HINT; side.appendChild(hint);
    const d = n.querySelector('.node-detail');
    main.innerHTML = d ? d.innerHTML : '';
  }
  // everything upstream and downstream of a node: the data that reaches it and where its output goes
  function pathOf(id) {
    const onE = new Set(), onN = new Set([id]);
    const walk = (from, fwd) => {
      const stack = [from], seen = new Set([from]);
      while (stack.length) {
        const cur = stack.pop();
        edges.forEach((e, i) => {
          const a = fwd ? e.a : e.b, b = fwd ? e.b : e.a;
          if (a === cur) { onE.add(i); onN.add(b); if (!seen.has(b)) { seen.add(b); stack.push(b); } }
        });
      }
    };
    walk(id, true); walk(id, false);
    return { onE, onN };
  }
  function show(n, withPath) {
    Object.keys(nodes).forEach((id) => nodes[id].classList.remove('sel', 'inpath'));
    n.classList.add('sel');
    const { onE, onN } = pathOf(n.dataset.id);
    edges.forEach((e, i) => { const on = onE.has(i); e.g.classList.toggle('on', on); if (e.l) e.l.classList.toggle('on', on); });
    onN.forEach((id) => nodes[id].classList.add('inpath'));
    flow.classList.toggle('has-path', !!withPath);
    renderInspector(n);
  }
  function pin(n, withPath) { state.pinned = n; state.path = withPath; show(n, withPath); }
  state.restore = () => { if (state.pinned) show(state.pinned, state.path); };

  Object.keys(nodes).forEach((id) => {
    const n = nodes[id], btn = n.querySelector('.node-btn');
    const det = n.querySelector('.node-detail');
    if (det) { det.id = det.id || ('d-' + id); btn.setAttribute('aria-controls', det.id); }
    btn.addEventListener('click', () => {
      if (WIDE.matches) {
        // a second click on the same node lets the whole diagram come back
        pin(n, !(state.pinned === n && state.path));
      } else {
        const open = !n.classList.contains('open');
        n.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      }
    });
    btn.addEventListener('focus', () => { if (WIDE.matches && btn.matches(':focus-visible')) pin(n, true); });
    btn.addEventListener('mouseenter', () => { if (WIDE.matches) show(n, true); });
  });
  flow.addEventListener('mouseleave', () => { if (WIDE.matches) state.restore(); });
  flow.addEventListener('click', (e) => { if (WIDE.matches && !e.target.closest('.node-btn') && state.pinned) pin(state.pinned, false); });
  flow.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.pinned) pin(state.pinned, false); });

  const def = flow.querySelector('.node[data-default]') || flow.querySelector('.node[data-owner="me"]');
  if (def) pin(def, false);
  if ('ResizeObserver' in window) new ResizeObserver(() => draw(state)).observe(flow);
}

const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
function draw(state) {
  const flow = state.flow;
  if (!WIDE.matches || !flow.offsetParent) return;
  const fr = flow.getBoundingClientRect();
  state.svg.setAttribute('viewBox', `0 0 ${fr.width} ${fr.height}`);
  state.edges.forEach((e) => {
    const A = state.nodes[e.a].querySelector('.node-btn').getBoundingClientRect();
    const B = state.nodes[e.b].querySelector('.node-btn').getBoundingClientRect();
    let d, arrow, lx, ly;
    const sameCol = Math.abs((A.left + A.width / 2) - (B.left + B.width / 2)) < 8;
    if (sameCol) {
      const x = A.left + A.width / 2 - fr.left;
      const down = B.top >= A.bottom;
      const y1 = (down ? A.bottom : A.top) - fr.top, y2 = (down ? B.top : B.bottom) - fr.top;
      const dir = down ? 1 : -1;
      d = `M${x} ${y1} L${x} ${y2 - dir * 5}`;
      arrow = `M${x - 4} ${y2 - dir * 6} L${x + 4} ${y2 - dir * 6} L${x} ${y2}Z`;
      lx = x; ly = y1 + (y2 - y1) * e.t;
    } else {
      const x1 = A.right - fr.left, y1 = A.top + A.height / 2 - fr.top;
      const x2 = B.left - fr.left, y2 = B.top + B.height / 2 - fr.top;
      const x2a = x2 - 6, dx = Math.max(24, (x2a - x1) * 0.5), c1 = x1 + dx, c2 = x2a - dx;
      d = `M${x1} ${y1} C${c1} ${y1} ${c2} ${y2} ${x2a} ${y2}`;
      arrow = `M${x2 - 7} ${y2 - 4} L${x2 - 7} ${y2 + 4} L${x2 - 1} ${y2}Z`;
      lx = bez(x1, c1, c2, x2a, e.t); ly = bez(y1, y1, y2, y2, e.t);
    }
    e.base.setAttribute('d', d);
    if (e.anim) e.anim.setAttribute('d', d);
    e.arrow.setAttribute('d', arrow);
    if (e.l) { e.l.style.left = lx + 'px'; e.l.style.top = ly + 'px'; }
  });
}
function drawAll() { flows.forEach((f) => { if (f._state) draw(f._state); }); }
function syncMode() {
  flows.forEach((f) => {
    const st = f._state;
    if (st) {
      if (WIDE.matches) st.restore();
      else { f.classList.remove('has-path'); Object.keys(st.nodes).forEach((id) => st.nodes[id].classList.remove('sel', 'inpath')); }
    }
    $$('.node', f).forEach((n) => {
      const b = n.querySelector('.node-btn');
      if (!b) return;
      if (WIDE.matches) b.removeAttribute('aria-expanded');
      else b.setAttribute('aria-expanded', String(n.classList.contains('open')));
    });
  });
  drawAll();
}
flows.forEach(setupFlow);
const initial = tabs.filter((t) => t.getAttribute('aria-selected') === 'true')[0] || tabs[0];
if (initial) activate(initial);
syncMode();
if (WIDE.addEventListener) WIDE.addEventListener('change', syncMode); else WIDE.addListener(syncMode);
addEventListener('resize', drawAll);
addEventListener('load', drawAll);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);
openFromHash(location.hash);

/* ── Language hint: a visitor whose browser prefers another language sees one quiet line offering it.
   Nothing redirects; closing it is remembered on this device. ── */
(() => {
  const here = document.documentElement.lang;
  const alts = {};
  $$('link[rel=alternate][hreflang]').forEach((l) => { alts[l.hreflang] = l.href; });
  const prefs = (navigator.languages || [navigator.language || '']).map((l) => l.slice(0, 2).toLowerCase()).filter((l) => ['ko', 'en', 'ja'].includes(l));
  if (!prefs.length || prefs[0] === here) return;
  const want = prefs.find((l) => l !== here && alts[l]);
  if (!want) return;
  try { if (localStorage.getItem('lang-hint-off')) return; } catch (e) { /* storage unavailable */ }
  const text = { ko: ['한국어 페이지가 있습니다', '한국어로 보기', '닫기'], en: ['This page is available in English', 'Read in English', 'Close'], ja: ['日本語のページがあります', '日本語で見る', '閉じる'] }[want];
  const bar = document.createElement('div');
  bar.className = 'lang-hint'; bar.lang = want;
  bar.innerHTML = '<span></span><a></a><button type="button">×</button>';
  bar.querySelector('span').textContent = text[0];
  const a = bar.querySelector('a'); a.textContent = text[1]; a.href = new URL(alts[want]).pathname + location.hash; a.hreflang = want;
  const b = bar.querySelector('button'); b.setAttribute('aria-label', text[2]);
  b.addEventListener('click', () => { bar.remove(); try { localStorage.setItem('lang-hint-off', '1'); } catch (e) { /* storage unavailable */ } });
  document.body.insertBefore(bar, document.body.firstChild.nextSibling);
})();
})();
