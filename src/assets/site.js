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
