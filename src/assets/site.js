/* Email copy buttons: the address is assembled on click so it never sits in the page as plain text. */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-email-user]');
  if (!b) return;
  const addr = `${b.dataset.emailUser}@${b.dataset.emailDomain}`;
  const original = b.dataset.label || b.textContent;
  b.dataset.label = original;
  try {
    await navigator.clipboard.writeText(addr);
    b.textContent = `${b.dataset.copied}: ${addr}`;
  } catch (err) {
    b.textContent = addr;
  }
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.textContent = original; }, 4000);
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
  }
  setTimeout(() => { b.textContent = original; }, 2500);
});
