#!/usr/bin/env python3
"""Make the lab robot's voice clips with a local VOICEVOX engine. Standard library only (macOS afconvert).

    python3 tools/voice.py --list               list the engine's speakers and their style ids
    python3 tools/voice.py --speaker 47         make every clip with style 47
    python3 tools/voice.py --speaker 47 --sample out/   one line per candidate style, for listening

The Japanese lines are read from src/assets/lab.js (the dialogue table L, and the focus lines with each
object's name), so the clips always match the page. Each clip is AAC in .m4a, named by a hash of its
line, and src/assets/voice/index.json maps line -> file. Clips no longer used are removed.
The engine runs at http://127.0.0.1:50021 (VOICEVOX ENGINE, `run --host 127.0.0.1`).
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAB = ROOT / "src" / "assets" / "lab.js"
OUT = ROOT / "src" / "assets" / "voice"
ENGINE = "http://127.0.0.1:50021"
# words the engine would spell out letter by letter, given as they are said; the page text is unchanged
SAY = {"Lytro": "ライトロ", "8×8": "はちかけるはち", "RIM": "リム"}


def lines():
    src = LAB.read_text(encoding="utf-8")
    table = src[src.index("const L = {"):src.index("const FOCUS")]
    found = re.findall(r"\[\s*'([^']*[぀-ヿ一-鿿][^']*)'\s*,\s*\{", table)
    focus = src[src.index("const FOCUS"):src.index("];", src.index("const FOCUS"))]
    templates = re.findall(r"\[`([^`]*\$\{n\.jp\}[^`]*)`", focus)
    names_block = src[src.index("const NAMES = {"):src.index("};", src.index("const NAMES = {"))]
    # only the names a scene uses
    used = set(re.findall(r"NAMES\.(\w+)", src))
    names = [jp for key, jp in re.findall(r"(\w+): \{[^}]*jp: '([^']+)'", names_block) if key in used]
    found += [t.replace("${n.jp}", n) for t in templates for n in names]
    out = []
    for t in found:
        if t not in out:
            out.append(t)
    return out


def spoken(text):
    for a, b in SAY.items():
        text = text.replace(a, b)
    return text


def call(path, data=None, **params):
    url = f"{ENGINE}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def synth(text, speaker, speed):
    query = json.loads(call("/audio_query", b"", text=spoken(text), speaker=speaker))
    query["speedScale"] = speed
    query["prePhonemeLength"] = 0.05
    query["postPhonemeLength"] = 0.1
    return call("/synthesis", json.dumps(query).encode(), speaker=speaker)


def to_m4a(wav_bytes, dest):
    with tempfile.NamedTemporaryFile(suffix=".wav") as w:
        w.write(wav_bytes); w.flush()
        subprocess.run(["afconvert", w.name, str(dest), "-f", "m4af", "-d", "aac", "-b", "48000"], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--speaker", type=int, nargs="*")
    ap.add_argument("--speed", type=float, default=1.05)
    ap.add_argument("--sample")
    a = ap.parse_args()
    if a.list:
        for sp in json.loads(call("/speakers")):
            print(sp["name"], [(s["name"], s["id"]) for s in sp["styles"]])
        return
    if not a.speaker:
        sys.exit("--speaker is needed")
    if a.sample:
        d = Path(a.sample); d.mkdir(parents=True, exist_ok=True)
        text = lines()[1]
        for sid in a.speaker:
            to_m4a(synth(text, sid, a.speed), d / f"sample-{sid}.m4a")
            print("sample", sid)
        return
    OUT.mkdir(parents=True, exist_ok=True)
    index = {}
    for text in lines():
        name = hashlib.sha1(text.encode()).hexdigest()[:10] + ".m4a"
        to_m4a(synth(text, a.speaker[0], a.speed), OUT / name)
        index[text] = name
        print(name, text)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    for f in OUT.glob("*.m4a"):
        if f.name not in index.values():
            f.unlink()
    print(f"{len(index)} clips in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
