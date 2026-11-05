/* Email: the address is put together here, so it never sits in the page as plain text. The address
   opens the mail app; the button copies it, or selects it where the clipboard is not allowed. */
document.querySelectorAll('.email[data-email-user]').forEach((box) => {
  const addr = `${box.dataset.emailUser}@${box.dataset.emailDomain}`;
  const a = box.querySelector('.addr'), v = box.querySelector('.v'), b = box.querySelector('.copy'), sr = box.querySelector('.sr');
  a.href = `mailto:${addr}`;
  v.textContent = addr;
  box.hidden = false;
  b.addEventListener('click', async () => {
    let said = b.dataset.done;
    try {
      await navigator.clipboard.writeText(addr);
      box.classList.add('copied');
    } catch (err) {
      // the address is left selected, and the button says so, for the visitor to copy by hand
      const r = document.createRange(); r.selectNodeContents(v);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      said = b.dataset.manual;
    }
    const t = b.querySelector('.t');
    b.dataset.label = b.dataset.label || t.textContent;
    t.textContent = said; sr.textContent = said;
    clearTimeout(b._t);
    b._t = setTimeout(() => { t.textContent = b.dataset.label; box.classList.remove('copied'); sr.textContent = ''; }, 2500);
  });
});

/* Before/after comparison: the slider moves the boundary between two images. */
document.querySelectorAll('[data-compare]').forEach((box) => {
  const input = document.getElementById(box.dataset.compare);
  if (!input) return;
  const set = () => box.style.setProperty('--pos', input.value + '%');
  input.addEventListener('input', set);
  set();
});

/* Copy buttons for code blocks such as BibTeX. */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const src = document.getElementById(b.dataset.copy);
  if (!src) return;
  const original = b.dataset.label || b.textContent;
  b.dataset.label = original;
  try {
    await navigator.clipboard.writeText(src.textContent);
    b.textContent = b.dataset.done || 'Copied';
  } catch (err) {
    const r = document.createRange(); r.selectNodeContents(src);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    b.textContent = b.dataset.manual || 'Selected';
  }
  setTimeout(() => { b.textContent = original; }, 2500);
});

/* Table of contents: marks the section being read. */
const toc = document.querySelector('.toc');
if (toc) {
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const sections = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
  let ticking = false;
  const mark = () => {
    ticking = false;
    const line = innerHeight * 0.3;
    let i = 0;
    sections.forEach((s, k) => { if (s && s.getBoundingClientRect().top <= line) i = k; });
    // at the very bottom the last sections may never reach the line
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) i = sections.length - 1;
    links.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
  mark();
}

/* Language hint: a visitor whose browser prefers another language this page exists in sees one quiet line
   at the top offering it. Nothing redirects; closing it is remembered on this device. */
(() => {
  const here = document.documentElement.lang;
  const alts = {};
  document.querySelectorAll('link[rel=alternate][hreflang]').forEach((l) => { alts[l.hreflang] = l.href; });
  const prefs = (navigator.languages || [navigator.language || '']).map((l) => l.slice(0, 2).toLowerCase())
    .filter((l) => ['ko', 'en', 'ja'].includes(l));
  if (!prefs.length || prefs[0] === here) return;
  // a Japanese reader on a Korean page that has no Japanese version is offered the English one
  const want = [...prefs, prefs[0] !== 'ko' ? 'en' : ''].find((l) => l && l !== here && alts[l]);
  if (!want) return;
  try { if (localStorage.getItem('lang-hint-off')) return; } catch (e) { /* storage unavailable */ }
  const text = { ko: ['한국어 페이지가 있습니다', '한국어로 보기', '닫기'],
                 en: ['This page is available in English', 'Read in English', 'Close'],
                 ja: ['日本語のページがあります', '日本語で見る', '閉じる'] }[want];
  const bar = document.createElement('div');
  bar.className = 'lang-hint'; bar.lang = want;
  bar.innerHTML = `<span></span><a></a><button type="button">×</button>`;
  bar.querySelector('span').textContent = text[0];
  const a = bar.querySelector('a'); a.textContent = text[1]; a.href = new URL(alts[want]).pathname; a.hreflang = want;
  const b = bar.querySelector('button'); b.setAttribute('aria-label', text[2]);
  b.addEventListener('click', () => { bar.remove(); try { localStorage.setItem('lang-hint-off', '1'); } catch (e) { /* storage unavailable */ } });
  document.body.insertBefore(bar, document.body.firstChild.nextSibling);
})();

/* Header: a hairline once the page has moved; the menu button opens the menu under the header (phones);
   on the home page the header's CV button waits until the introduction's own CV button has scrolled away. */
(() => {
  const head = document.querySelector('.site-head');
  if (!head) return;
  const mark = () => head.classList.toggle('scrolled', scrollY > 4);
  mark(); addEventListener('scroll', mark, { passive: true });
  const btn = head.querySelector('.menu-btn'), menu = document.getElementById('site-menu');
  if (btn && menu) {
    const set = (open) => { btn.setAttribute('aria-expanded', String(open)); menu.hidden = !open; };
    btn.addEventListener('click', () => set(menu.hidden));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  }
  const own = document.querySelector('.intro .ctas'), cta = head.querySelector('.cta');
  if (own && cta && 'IntersectionObserver' in window) {
    cta.classList.add('wait');
    new IntersectionObserver(([e]) => cta.classList.toggle('wait', e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' }).observe(own);
  }
})();
