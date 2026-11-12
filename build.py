#!/usr/bin/env python3
"""Build the personal site into dist/. Standard library only.

    python build.py            build and check
    python build.py --serve    build, check, then serve dist/ on http://127.0.0.1:8000

Pages live in src/pages/<lang>/. Each page starts with a meta comment:
    <!--meta {"title": "...", "description": "...", "nav": "systems"} -->
and may use these tokens:
    {{f:key}}        any value in data/facts.json, so the site and the CV always show the same numbers
    {{inc:name}}     src/partials/<lang>/<name>.html (the flow diagrams, shared by the home and detail pages)
    {{pdf:cv}}       the CV PDF for the page's language ({{pdf:portfolio}} for the portfolio)
The build stops on any check failure.
"""
import hashlib
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# SITE_DIST builds somewhere else (two builds at once, or a check that should not touch dist/)
SRC, DIST = ROOT / "src", Path(os.environ.get("SITE_DIST", ROOT / "dist"))
BASE = "https://zoocasso.github.io"
FACTS = json.loads((ROOT / "data" / "facts.json").read_text(encoding="utf-8"))
# Fonts, each pinned to an exact version: Pretendard (Korean and Latin; its JP build on Japanese pages) and
# JetBrains Mono for numbers and labels. The research page adds DotGothic16 for the lab robot's voice line,
# loaded without holding up the first paint.
PRETENDARD = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
PRETENDARD_JP = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp-dynamic-subset.min.css"
MONO = "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.1.1/index.css"
DOT = "https://cdn.jsdelivr.net/npm/@fontsource/dotgothic16@5.1.0/index.css"
# visit counts (GoatCounter: no cookies, no stored IP addresses). count.js skips localhost on its own, and
# opening any page with #toggle-goatcounter once stops counting that browser's own visits
GOATCOUNTER = "https://zoocasso.goatcounter.com/count"
LANGS = ("ko", "en", "ja")
PREFIX = {"ko": "", "en": "/en", "ja": "/ja"}
# the header's language control, in this order and with these labels (the owner's choice)
SWITCH = (("ko", "KR", "한국어"), ("ja", "JP", "日本語"), ("en", "EN", "English"))
# the CV and portfolio PDFs each language offers first (there are no Japanese PDFs; the English ones serve)
PDFS = {
    "ko": {"cv": "/files/HyeongjuLee_Resume_KR.pdf", "portfolio": "/files/HyeongjuLee_Portfolio_KR.pdf"},
    "en": {"cv": "/files/HyeongjuLee_CV_EN.pdf", "portfolio": "/files/HyeongjuLee_Portfolio_EN.pdf"},
    "ja": {"cv": "/files/HyeongjuLee_CV_EN.pdf", "portfolio": "/files/HyeongjuLee_Portfolio_EN.pdf"},
}

UI = {
    "ko": {"skip": "본문으로 건너뛰기", "sections": "섹션", "langs": "언어 선택", "home": "홈",
           "nav": (("systems", "시스템"), ("research", "연구"), ("work", "기타 작업"), ("history", "이력"), ("contact", "연락")),
           "cv": "이력서", "cv_pdf": "이력서 PDF", "pf": "포트폴리오", "pf_pdf": "포트폴리오 PDF", "pdf_note": "",
           "copy": "이메일 주소 복사", "copy_short": "이메일 복사", "mail": "메일 쓰기", "copied": "이메일 주소를 복사했습니다",
           "manual": "주소를 선택했습니다. 복사해 주세요",
           "ct_k": "연락", "ct_h": "채용·협업 문의는 이메일로 받습니다.",
           "ct_p": "데이터 엔지니어링, 백엔드, 비전 데이터 파이프라인 직무를 찾고 있습니다.",
           "sound": ("소리 켜기", "소리 끄기"), "locale": "ko_KR", "site": "이형주", "aria_home": "이형주 홈"},
    "en": {"skip": "Skip to content", "sections": "Sections", "langs": "Language", "home": "Home",
           "nav": (("systems", "Systems"), ("research", "Research"), ("work", "Other work"), ("history", "History"), ("contact", "Contact")),
           "cv": "CV", "cv_pdf": "CV PDF", "pf": "Portfolio", "pf_pdf": "Portfolio PDF", "pdf_note": "",
           "copy": "Copy email address", "copy_short": "Copy email", "mail": "Write an email", "copied": "Email address copied",
           "manual": "Address selected; please copy it",
           "ct_k": "Contact", "ct_h": "For roles and collaboration, please write by email.",
           "ct_p": "I am looking for roles in data engineering, backend development and vision data pipelines.",
           "sound": ("Sound on", "Sound off"), "locale": "en_US", "site": "Hyeongju Lee", "aria_home": "Hyeongju Lee, home"},
    "ja": {"skip": "本文へ移動", "sections": "セクション", "langs": "言語", "home": "ホーム",
           "nav": (("systems", "システム"), ("research", "研究"), ("work", "その他"), ("history", "経歴"), ("contact", "連絡先")),
           "cv": "英文CV", "cv_pdf": "英文CV（PDF）", "pf": "ポートフォリオ", "pf_pdf": "ポートフォリオ（英語・PDF）", "pdf_note": "英語・PDF",
           "copy": "メールアドレスをコピー", "copy_short": "メールをコピー", "mail": "メールを書く", "copied": "メールアドレスをコピーしました",
           "manual": "アドレスを選択しました。コピーしてください",
           "ct_k": "連絡先", "ct_h": "採用・共同研究のご連絡は、メールでお願いします。",
           "ct_p": "データエンジニアリング、バックエンド開発、ビジョンデータパイプラインの職種を志望しています。",
           "sound": ("音を出す", "音を消す"), "locale": "ja_JP", "site": "イ・ヒョンジュ", "aria_home": "イ・ヒョンジュ ホーム"},
}
EXISTING = set()
# any Korean or Japanese mobile number, in any common spelling, and international prefixes; the
# check holds no real number, since this file is public
PHONE = re.compile(r"(?<!\d)01[016-9][-. ]?\d{3,4}[-. ]?\d{4}(?!\d)|(?<!\d)0[789]0[-. ]?\d{4}[-. ]?\d{4}(?!\d)|\+8[12][ -]?\d")
# content rules from the owner, checked on every built page's visible text (see check()):
# never "수료" or start availability, no stack without evidence, no abandoned project, no "sole developer"
# for the genome work, nothing about what the commissioned research measures, no "last updated" line
FORBIDDEN = re.compile(
    r"수료|입사 ?가능|근무 ?가능|available from|available to start|入社可能|"
    r"MariaDB|PostgreSQL|\bReact\b|\bSpring\b|kr-public-data-agent|"
    r"단독 ?개발|sole developer|"
    r"卵|雌雄|\begg|계란|달걀|sexing|"
    r"last updated|최종 ?수정|최종 ?업데이트|最終更新", re.I)

SVG = {
    "cv": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 1.5h5l3.5 3.5v9.5h-8.5z"/><path d="M9 1.5V5h3.5M6 9h4.5M6 11.5h4.5"/></svg>',
    "pf": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 6h13M5 2.5V6"/></svg>',
    "mail": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M2 4l6 5 6-5"/></svg>',
    "copy": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>',
    "code": '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4"/></svg>',
    "brand": '<svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect width="26" height="26" rx="7" fill="#0B0D12"/><path d="M6.5 17C10 17 9.5 9 13 9s3 8 6.5 8" stroke="#fff" stroke-opacity=".45" stroke-width="1.5" fill="none"/><circle cx="6.5" cy="17" r="2.3" fill="#fff"/><circle cx="13" cy="9" r="2.3" fill="#7F9BFF"/><circle cx="19.5" cy="17" r="2.3" fill="#fff"/></svg>',
    "sound": '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4z"></path><path class="x" d="M17 9l5 6M22 9l-5 6" style="display:none"></path><path class="w" d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"></path></svg>',
}


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
    e = html.escape
    title = meta["title"]
    full_title = title if meta.get("home") else f"{title} | {t['site']}"
    desc = meta["description"]
    nav = meta.get("nav", "")
    is_home = bool(meta.get("home"))
    og = meta.get("image", f"/img/og-{lang}.jpg")
    home = PREFIX[lang] + "/"
    alts = ""
    if len(alts_by_lang) > 1:
        alts = "".join(f'<link rel="alternate" hreflang="{k}" href="{BASE}{u}">\n' for k, u in alts_by_lang.items())
        alts += f'<link rel="alternate" hreflang="x-default" href="{BASE}{alts_by_lang.get("ko", path)}">\n'

    # section links: on the home page they scroll to its sections; elsewhere research and history open their
    # own pages, and contact goes to the contact card that closes every page
    page_of = {"systems": home + "#systems", "research": home + "research/", "work": home + "#work",
               "history": home + "cv/", "contact": "#contact"}

    def nav_item(key, label):
        href = f"#{key}" if is_home else page_of[key]
        cur = ' aria-current="page"' if (nav == key or (nav == "cv" and key == "history")) else ""
        return f'<a href="{href}"{cur}>{e(label)}</a>'

    def switch(k, label, full):
        # one segmented control, the same order on every page. Every page exists in all three languages,
        # so the others go to the same page in that language (the 404 page falls back to each home)
        if k == lang:
            return f'<span aria-current="true" lang="{k}" title="{full}">{label}</span>'
        href = alts_by_lang.get(k, PREFIX[k] + "/")
        return f'<a href="{href}" hreflang="{k}" lang="{k}" title="{full}" aria-label="{full}">{label}</a>'

    jsonld = ""
    if is_home:
        person = {"@context": "https://schema.org", "@type": "Person", "name": fact("name", lang),
                  "alternateName": fact("name_alt", lang), "jobTitle": fact("role", lang),
                  "url": BASE + home, "sameAs": [FACTS["github"]],
                  "alumniOf": ["Kyushu Institute of Technology", "Hankyong National University"],
                  "award": "ICMV 2026 Best Poster Award"}
        jsonld = f'<script type="application/ld+json">{json.dumps(person, ensure_ascii=False)}</script>\n'
    extra_head = meta.get("head", "").replace("{{v}}", v)
    fonts = f'<link rel="stylesheet" href="{PRETENDARD_JP if lang == "ja" else PRETENDARD}">\n<link rel="stylesheet" href="{MONO}">\n'
    if meta.get("lab"):
        # the robot's lines appear only once the lab has started, so their font does not hold up the first paint
        fonts += (f'<link rel="preload" as="style" href="{DOT}" onload="this.onload=null;this.rel=\'stylesheet\'">\n'
                  f'<noscript><link rel="stylesheet" href="{DOT}"></noscript>\n')
    pdf = PDFS[lang]
    pdf_title = f' title="{e(t["pdf_note"])}"' if t["pdf_note"] else ""
    # research page only: the lab's sound toggle lives in the sticky header, so it can be switched off from
    # anywhere on the page; lab.js shows it once the lab has started
    sound_btn = "" if not meta.get("lab") else (
        f'<button class="btn snd" type="button" data-sound hidden>{SVG["sound"]}<span class="label">{e(t["sound"][1])}</span></button>\n      ')
    contact_k = (f'<b>05</b> {e(t["ct_k"])}' if is_home else e(t["ct_k"]))
    copy_attrs = f'type="button" data-email-copy data-goatcounter-click="email-copy" data-done="{e(t["copied"])}" data-manual="{e(t["manual"])}"'
    # the 404 page is served at any missing address, so it names no address of its own and is not indexed
    if path == "/404.html":
        where = '<meta name="robots" content="noindex">\n'
    else:
        where = f'<link rel="canonical" href="{BASE}{path}">\n<meta property="og:url" content="{BASE}{path}">\n'
    body_class = meta.get("body", "")
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc)}">
{where}{alts}<meta property="og:type" content="website">
<meta property="og:site_name" content="{t['site']}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{BASE}{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="{t['locale']}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F3F4F7">
<meta name="color-scheme" content="light">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
{fonts}<link rel="stylesheet" href="/assets/site.css?v={v}">
<script src="/assets/site.js?v={v}" defer></script>
<script data-goatcounter="{GOATCOUNTER}" async src="https://gc.zgo.at/count.js"></script>
{extra_head}{jsonld}</head>
<body class="{body_class}" data-eu="{FACTS['email_user']}" data-ed="{FACTS['email_domain']}">
<a class="skip" href="#main">{t['skip']}</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="{home}" aria-label="{e(t['aria_home'])}">{SVG['brand']}<span><span class="brand-name">{fact('name', lang)}</span> <span class="brand-sub">{fact('name_alt', lang)}</span></span></a>
    <nav class="nav" aria-label="{t['sections']}">
      {"".join(nav_item(k, label) for k, label in t["nav"])}
    </nav>
    <div class="top-actions">
      {sound_btn}<span class="lang" role="group" aria-label="{t['langs']}">{"".join(switch(k, label, full) for k, label, full in SWITCH)}</span>
      <a class="btn btn-primary" href="{pdf['cv']}"{pdf_title} aria-label="{e(t['cv_pdf'])}">{SVG['cv']}<span class="lbl">{e(t['cv'])}</span><span class="lbl-long"> PDF</span></a>
      <a class="btn btn-pf" href="{pdf['portfolio']}"{pdf_title} aria-label="{e(t['pf_pdf'])}">{SVG['pf']}<span class="lbl">{e(t['pf'])}</span></a>
      <button class="btn btn-icon" {copy_attrs} aria-label="{e(t['copy'])}" title="{e(t['copy'])}">{SVG['mail']}</button>
    </div>
  </div>
</header>
<main id="main">
{body}
</main>
<section class="foot-contact" id="contact" aria-labelledby="ct-h">
  <div class="wrap">
    <div class="contact">
      <div>
        <div class="sec-kicker">{contact_k}</div>
        <h2 id="ct-h">{e(t['ct_h'])}</h2>
        <a class="contact-mail" data-mailto><span data-email-text></span></a>
        <p class="contact-lead">{e(t['ct_p'])}</p>
        <p class="contact-status"><i class="dot" aria-hidden="true"></i>{e(fact('status', lang))}</p>
      </div>
      <div class="contact-actions">
        <button class="btn btn-primary btn-lg" {copy_attrs}>{SVG['copy']}{e(t['copy'])}</button>
        <a class="btn btn-lg" data-mailto>{SVG['mail']}{e(t['mail'])}</a>
        <a class="btn btn-lg" href="{pdf['cv']}">{SVG['cv']}{e(t['cv_pdf'])}</a>
        <a class="btn btn-lg" href="{pdf['portfolio']}">{SVG['pf']}{e(t['pf_pdf'])}</a>
        <a class="btn btn-lg" href="{FACTS['github']}" target="_blank" rel="noopener">{SVG['code']}github.com/zoocasso</a>
      </div>
    </div>
  </div>
</section>
<footer class="foot">
  <div class="wrap"><span>{fact('name', lang)} · {fact('name_alt', lang)}</span><span class="foot-links"><a href="{home}">{e(t['home'])}</a><a href="{home}cv/">{e(t['cv'] if lang != 'ja' else '経歴')}</a><a href="{FACTS['github']}" target="_blank" rel="noopener">GitHub</a></span></div>
</footer>
</body>
</html>
"""


TOKEN = re.compile(r"\{\{\s*f:([a-z0-9_]+)\s*\}\}")
INC = re.compile(r"\{\{\s*inc:([a-z0-9_-]+)\s*\}\}")
PDF_TOKEN = re.compile(r"\{\{\s*pdf:(cv|portfolio)\s*\}\}")
PDF_LINK = re.compile(r'<a ((?:[^>]*? )?href="/files/([^"]+)\.pdf")')


def click_events(page):
    """GoatCounter counts clicks on elements that carry data-goatcounter-click: PDF links here, and the
    email copy buttons, which carry it in their markup."""
    # PDFs open in a new tab, so the site is still there when the reader closes the file
    return PDF_LINK.sub(lambda m: f'<a data-goatcounter-click="pdf-{m.group(2)}" target="_blank" rel="noopener" {m.group(1)}', page)


META = re.compile(r"^\s*<!--meta\s*(\{.*?\})\s*-->\s*", re.S)


def include(body, lang):
    def one(m):
        p = SRC / "partials" / lang / f"{m.group(1)}.html"
        if not p.exists():
            raise KeyError(f"partial {lang}/{m.group(1)}")
        return p.read_text(encoding="utf-8")
    return INC.sub(one, body)


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
            body = include(body, lang)
            body = TOKEN.sub(lambda mm: html.escape(fact(mm.group(1), lang), quote=False), body)
        except KeyError as e:
            errors.append(f"{lang}/{rel}: unknown {e}")
            continue
        body = PDF_TOKEN.sub(lambda mm: PDFS[lang][mm.group(1)], body)
        body = body.replace("{{v}}", v)
        if rel == "404.html":
            path, alts = "/404.html", {}
        else:
            path = url_for(lang, rel)
            alts = {k: url_for(k, rel) for k in LANGS if (k, rel) in pages}
        page = click_events(layout(lang, meta, body, path, alts, v))
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


def visible_text(t):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", " ", t, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", t))


def check():
    errors = []
    _IDS.clear()
    ref = re.compile(r'(?:href|src)="(/[^"#?]*)')
    for f in DIST.rglob("*.html"):
        name = f.relative_to(DIST).as_posix()
        t = f.read_text(encoding="utf-8")
        text = visible_text(t)
        if "{{" in t:
            errors.append(f"{name}: unresolved template token")
        if PHONE.search(re.sub(r"<script.*?</script>", "", t, flags=re.S)):
            errors.append(f"{name}: looks like a phone number")
        if f"{FACTS['email_user']}@{FACTS['email_domain']}" in t:
            errors.append(f"{name}: plain email address (site.js puts it together from data-eu and data-ed)")
        if t.count("<h1") != 1:
            errors.append(f"{name}: expected exactly one <h1>, found {t.count('<h1')}")
        for hit in FORBIDDEN.findall(text):
            errors.append(f"{name}: content rule: {hit!r}")
        # Japanese pages name the commissioned research's partner as 日立グループ, never the company alone
        if name.startswith("ja/") and re.search(r"日立(?!グループ)|Hitachi", text):
            errors.append(f"{name}: content rule: Hitachi must read 日立グループ on Japanese pages")
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
        # anchors must exist on the page they point at, on this page or another
        for frag in re.findall(r'href="#([^"]+)"', t):
            if frag not in ids_of(f):
                errors.append(f"{name}: anchor #{frag} has no target")
        for link, frag in re.findall(r'href="(/[^"#?]*)#([^"]+)"', t):
            target = DIST / link.lstrip("/")
            if link.endswith("/"):
                target = target / "index.html"
            if target.exists() and frag not in ids_of(target):
                errors.append(f"{name}: anchor {link}#{frag} has no target")
    return errors


_IDS = {}


def ids_of(f):
    if f not in _IDS:
        _IDS[f] = set(re.findall(r'\bid="([^"]+)"', f.read_text(encoding="utf-8")))
    return _IDS[f]


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
