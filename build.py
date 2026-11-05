#!/usr/bin/env python3
"""Build the personal site into dist/. Standard library only.

    python build.py            build and check
    python build.py --serve    build, check, then serve dist/ on http://127.0.0.1:8000

Pages live in src/pages/<lang>/. Each page starts with a meta comment:
    <!--meta {"title": "...", "description": "...", "nav": "work"} -->
and may use {{f:key}} for any value in data/facts.json, so the site and the CV
always show the same numbers. The build stops on any check failure.
"""
import hashlib
import html
import json
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, DIST = ROOT / "src", ROOT / "dist"
BASE = "https://zoocasso.github.io"
FACTS = json.loads((ROOT / "data" / "facts.json").read_text(encoding="utf-8"))
# Korean and Japanese webfonts come with hundreds of subsets, so their stylesheets are large. Every page
# gets the two families it uses; only the home page, which has the robot and the light name line, gets more.
GFONTS = "https://fonts.googleapis.com/css2?"
FONTS = GFONTS + "family=Gothic+A1:wght@400;500;700&family=Hahmlet:wght@700&display=swap"
DOT_FONT = GFONTS + "family=DotGothic16&display=swap"
# Japanese pages add a Japanese gothic for text and a mincho for headings; Latin letters and digits keep
# the Korean pages' faces through the CSS fallback order
JA_FONTS = GFONTS + "family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho:wght@700&display=swap"
LANGS = ("ko", "en", "ja")
# how each language names itself in the switcher, and where its pages live
LANG_NAME = {"ko": ("한국어", "한국어"), "en": ("EN", "English"), "ja": ("日本語", "日本語")}
PREFIX = {"ko": "", "en": "/en", "ja": "/ja"}
# a page not written yet in a language falls back to the first of these that has it
FALLBACK = {"ko": ("ko",), "en": ("en", "ko"), "ja": ("ja", "en", "ko")}

UI = {
    "ko": {"skip": "본문 바로가기", "work": "작업", "research": "연구", "cv": "이력서", "nav": "주 메뉴",
           "copy": "이메일 주소 복사", "copy_short": "복사", "copied": "복사됨", "selected": "선택됨",
           "updated": "마지막 업데이트", "pdf": "이력서 PDF", "pdf_file": "HyeongjuLee_Resume_KR.pdf",
           "locale": "ko_KR", "site": "이형주"},
    "en": {"skip": "Skip to content", "work": "Work", "research": "Research", "cv": "CV", "nav": "Main menu",
           "copy": "Copy email address", "copy_short": "Copy", "copied": "Copied", "selected": "Selected",
           "updated": "Last updated", "pdf": "CV (PDF)", "pdf_file": "HyeongjuLee_CV_EN.pdf",
           "locale": "en_US", "site": "Hyeongju Lee"},
    "ja": {"skip": "本文へ移動", "work": "実績", "research": "研究", "cv": "経歴", "nav": "メインメニュー",
           "copy": "メールアドレスをコピー", "copy_short": "コピー", "copied": "コピーしました", "selected": "選択しました",
           "updated": "最終更新", "pdf": "CV（英語・PDF）", "pdf_file": "HyeongjuLee_CV_EN.pdf",
           "locale": "ja_JP", "site": "イ・ヒョンジュ"},
}
EXISTING = set()
# any Korean or Japanese mobile number, in any common spelling, and international prefixes; the
# check holds no real number, since this file is public
PHONE = re.compile(r"(?<!\d)01[016-9][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)|(?<!\d)0[789]0[-. ]?\d{4}[-. ]?\d{4}(?!\d)|\+8[12][ -]?\d")


def fact(key, lang):
    if key not in FACTS:
        raise KeyError(key)
    v = FACTS[key]
    if isinstance(v, dict) and lang not in v:
        raise KeyError(f"{key} ({lang})")
    return v[lang] if isinstance(v, dict) else v


def url_for(lang, rel):
    """src/pages/<lang>/<rel>.html -> site path"""
    stem = rel[:-5]
    prefix = PREFIX[lang]
    if stem == "index":
        return prefix + "/"
    if stem.endswith("/index"):
        return f"{prefix}/{stem[:-6]}/"
    return f"{prefix}/{stem}/"


def out_file(path):
    return DIST / path.strip("/") / "index.html" if path.endswith("/") else DIST / path.strip("/")


def asset_version():
    h = hashlib.sha1()
    for p in sorted((SRC / "assets").rglob("*")):
        if p.is_file():
            h.update(p.read_bytes())
    return h.hexdigest()[:8]


def layout(lang, meta, body, path, alts_by_lang, v):
    t = UI[lang]
    title = meta["title"]
    full_title = title if meta.get("home") else f"{title} | {t['site']}"
    desc = meta["description"]
    nav = meta.get("nav", "")
    og = meta.get("image", f"/img/og-{lang}.jpg")
    alts = ""
    if len(alts_by_lang) > 1:
        alts = "".join(f'<link rel="alternate" hreflang="{k}" href="{BASE}{u}">\n' for k, u in alts_by_lang.items())
        alts += f'<link rel="alternate" hreflang="x-default" href="{BASE}{alts_by_lang.get("ko", path)}">\n'
    home = PREFIX[lang] + "/"

    def item(key, sub):
        cur = ' aria-current="page"' if nav == key else ""
        href = next((h for k in FALLBACK[lang] if (h := f"{PREFIX[k]}/{sub}/") in EXISTING), f"/{sub}/")
        return f'<a href="{href}"{cur}>{t[key]}</a>'

    def switch(k):
        # the same page in that language when it exists, otherwise that language's home page
        href = alts_by_lang.get(k, PREFIX[k] + "/")
        short, full = LANG_NAME[k]
        return (f'<a class="lang" href="{href}" hreflang="{k}" lang="{k}" aria-label="{full}">'
                f'<span>{short}</span></a>')
    jsonld = ""
    if meta.get("home"):
        person = {"@context": "https://schema.org", "@type": "Person", "name": fact("name", lang),
                  "alternateName": fact("name_alt", lang), "jobTitle": fact("role", lang),
                  "url": BASE + home, "sameAs": [FACTS["github"]],
                  "alumniOf": ["Kyushu Institute of Technology", "Hankyong National University"],
                  "award": "ICMV 2026 Best Poster Award"}
        jsonld = f'<script type="application/ld+json">{json.dumps(person, ensure_ascii=False)}</script>\n'
    extra_head = meta.get("head", "").replace("{{v}}", v)
    fonts = f'<link rel="stylesheet" href="{FONTS}">\n'
    if lang == "ja":
        fonts += f'<link rel="stylesheet" href="{JA_FONTS}">\n'
    if meta.get("home"):
        # the light weight only sets the name line under the h1, so it is cut down to those letters
        alt = urllib.parse.quote(fact("name_alt", lang))
        fonts += f'<link rel="stylesheet" href="{GFONTS}family=Hahmlet:wght@200&text={alt}&display=swap">\n'
        # the robot's lines appear only once the lab has started, so its font does not hold up the first paint
        fonts += (f'<link rel="preload" as="style" href="{DOT_FONT}" onload="this.onload=null;this.rel=\'stylesheet\'">\n'
                  f'<noscript><link rel="stylesheet" href="{DOT_FONT}"></noscript>\n')
    body_class = meta.get("body", "")
    # the 404 page is served at any missing address, so it names no address of its own and is not indexed
    if path == "/404.html":
        where = '<meta name="robots" content="noindex">\n'
    else:
        where = f'<link rel="canonical" href="{BASE}{path}">\n<meta property="og:url" content="{BASE}{path}">\n'
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(full_title)}</title>
<meta name="description" content="{html.escape(desc)}">
{where}{alts}<meta property="og:type" content="website">
<meta property="og:site_name" content="{t['site']}">
<meta property="og:title" content="{html.escape(full_title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="{BASE}{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{t['locale']}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#15181d">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fonts}<link rel="stylesheet" href="/assets/site.css?v={v}">
<script src="/assets/site.js?v={v}" defer></script>
{extra_head}{jsonld}</head>
<body class="{body_class}">
<a class="skip" href="#main">{t['skip']}</a>
<header class="site-head">
  <a class="brand" href="{home}">{fact('name', lang)}</a>
  <nav aria-label="{t['nav']}">
    {item('work', 'work')}
    {item('research', 'research')}
    {item('cv', 'cv')}
    <span class="nav-sep" aria-hidden="true"></span>
    <a class="ext" href="{FACTS['github']}" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg><span class="t">GitHub</span></a>
    {"".join(switch(k) for k in LANGS if k != lang)}
  </nav>
</header>
<main id="main">
{body}
</main>
<footer class="site-foot">
  <div class="foot-row">
    <span class="foot-name">{fact('name', lang)}</span>
    <div class="email plain" data-email-user="{FACTS['email_user']}" data-email-domain="{FACTS['email_domain']}" hidden><a class="addr"><svg class="i" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M3 5.5l7 5.5 7-5.5"/></svg><span class="v"></span></a><button class="copy" type="button" aria-label="{t['copy']}" data-done="{t['copied']}" data-manual="{t['selected']}"><svg class="i on-idle" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"/></svg><svg class="i on-done" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9"/></svg><span class="t">{t['copy_short']}</span></button><span class="sr" aria-live="polite"></span></div>
    <a href="/files/{t['pdf_file']}">{t['pdf']}</a>
    <a href="{FACTS['github']}" target="_blank" rel="noopener">GitHub</a>
  </div>
  <p>{t['updated']} {fact('updated', lang)}{'' if lang == 'ja' else '.'}</p>
</footer>
</body>
</html>
"""


TOKEN = re.compile(r"\{\{\s*f:([a-z0-9_]+)\s*\}\}")
META = re.compile(r"^\s*<!--meta\s*(\{.*?\})\s*-->\s*", re.S)


def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    v = asset_version()
    for sub in ("assets", "img", "files"):
        if (SRC / sub).exists():
            shutil.copytree(SRC / sub, DIST / sub)
    for f in ("favicon.svg", "robots.txt"):
        if (SRC / f).exists():
            shutil.copyfile(SRC / f, DIST / f)
    (DIST / ".nojekyll").write_text("")

    pages = {}
    for lang in LANGS:
        base = SRC / "pages" / lang
        if not base.exists():
            continue
        for p in sorted(base.rglob("*.html")):
            pages[(lang, p.relative_to(base).as_posix())] = p
    EXISTING.clear()
    EXISTING.update("/404.html" if rel == "404.html" else url_for(lang, rel) for (lang, rel) in pages)
    sitemap = []
    errors = []
    for (lang, rel), p in pages.items():
        raw = p.read_text(encoding="utf-8")
        m = META.match(raw)
        if not m:
            errors.append(f"{lang}/{rel}: missing meta comment")
            continue
        meta = json.loads(m.group(1))
        body = raw[m.end():]
        try:
            body = TOKEN.sub(lambda mm: html.escape(fact(mm.group(1), lang), quote=False), body)
        except KeyError as e:
            errors.append(f"{lang}/{rel}: unknown fact {e}")
            continue
        body = body.replace("{{v}}", v)
        if rel == "404.html":
            path, alts = "/404.html", {}
        else:
            path = url_for(lang, rel)
            alts = {k: url_for(k, rel) for k in LANGS if (k, rel) in pages}
        page = layout(lang, meta, body, path, alts, v)
        out = out_file(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
        if rel != "404.html":
            sitemap.append(path)
    sm = "".join(f"<url><loc>{BASE}{u}</loc></url>" for u in sitemap)
    (DIST / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{sm}</urlset>',
        encoding="utf-8")
    errors += check()
    if errors:
        print("\n".join("ERROR " + e for e in errors))
        sys.exit(1)
    print(f"built {len(pages)} pages into dist/ (assets v={v})")


def check():
    errors = []
    ref = re.compile(r'(?:href|src)="(/[^"#?]*)')
    for f in DIST.rglob("*.html"):
        name = f.relative_to(DIST).as_posix()
        t = f.read_text(encoding="utf-8")
        if "{{" in t:
            errors.append(f"{name}: unresolved template token")
        if PHONE.search(re.sub(r"<script.*?</script>", "", t, flags=re.S)):
            errors.append(f"{name}: looks like a phone number")
        if f"{FACTS['email_user']}@{FACTS['email_domain']}" in t:
            errors.append(f"{name}: plain email address (use the email chip, which site.js fills in)")
        if t.count("<h1") != 1:
            errors.append(f"{name}: expected exactly one <h1>, found {t.count('<h1')}")
        for img in re.findall(r"<img\b[^>]*>", t):
            if " alt=" not in img:
                errors.append(f"{name}: image without alt: {img[:80]}")
        for og in re.findall(r'property="og:image" content="' + re.escape(BASE) + r'(/[^"]+)"', t):
            if not (DIST / og.lstrip("/")).exists():
                errors.append(f"{name}: missing share image {og}")
        for link in ref.findall(t):
            target = DIST / link.lstrip("/")
            if link.endswith("/"):
                target = target / "index.html"
            if not target.exists():
                errors.append(f"{name}: broken internal link {link}")
    return errors


def serve():
    import functools
    import http.server
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    with http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler) as s:
        print("serving http://127.0.0.1:8000")
        s.serve_forever()


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        serve()
