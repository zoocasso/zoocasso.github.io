/* Lens array lab: a planar image is captured through a pinhole array (simulated), rearranged with RIM,
   and reconstructed. Rendering is WebGL2; music, sound effects and the robot voice are synthesized with Web Audio. */
(() => {
'use strict';
const root = document.getElementById('lab');
if (!root) return;
const q = (s) => root.querySelector(s);
const stage = q('.stage'), canvas = q('canvas.gl'), dialogEl = q('.dialog');
const lang = document.documentElement.lang === 'en' ? 'en' : 'ko';
const NP = 8, W = 2.0, ZS = 0.3;
const small = Math.min(window.innerWidth, screen.width || 9999) < 640;
const NL = small ? 32 : 48, R = NL * NP, COUNT = R * R, VIEWS = NP * NP;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => n.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');

/* ================= sound: everything is synthesized here ================= */
const Snd = (() => {
  let ctx = null, master, music, sfx, voice, noiseBuf = null, on = false, nextT = 0, step = 0, loop = 0, timer = 0, room = false;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    const wet = ctx.createGain(); wet.gain.value = 0.3; delay.connect(wet); wet.connect(master);
    music = ctx.createGain(); music.gain.value = 0; music.connect(master); music.connect(delay);
    sfx = ctx.createGain(); sfx.gain.value = 0.75; sfx.connect(master); sfx.connect(delay);
    voice = ctx.createGain(); voice.gain.value = 0.42; voice.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(type, f, t, a, peak, dec, dest, filt) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    let head = o;
    if (filt) { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = filt; o.connect(b); head = b; }
    head.connect(g); g.connect(dest);
    env(g, t, a, peak, dec);
    o.start(t); o.stop(t + a + dec + 0.05);
  }
  function noise(t, dur, type, freq, peak, dest, qv) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = freq; if (qv) b.Q.value = qv;
    const g = ctx.createGain();
    s.connect(b); b.connect(g); g.connect(dest);
    env(g, t, 0.003, peak, dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  /* music: the "royal road" progression (IV-V-iii-vi) in C at 84 BPM; keys, bass, soft drums, a music-box line */
  const BPM = 84, S16 = 60 / BPM / 4;
  const CH = [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]];
  const BASS = [41, 43, 40, 45];
  const MEL = [
    [[0, 69], [3, 72], [6, 76], [10, 74], [12, 72]],
    [[0, 74], [4, 67], [8, 69], [11, 74]],
    [[0, 76], [3, 74], [6, 71], [8, 67], [12, 64]],
    [[0, 69], [4, 72], [7, 76], [10, 79], [13, 76]]
  ];
  function keys(notes, t, dur, peak) {
    for (const n of notes) {
      tone('triangle', midi(n), t, 0.02, peak, dur, music, 1500);
      tone('sine', midi(n) * 2.001, t, 0.01, peak * 0.35, dur * 0.6, music);
    }
  }
  function playStep(st, t) {
    const bar = Math.floor(st / 16), s = st % 16;
    if (s === 0) keys(CH[bar], t, S16 * 7, 0.045);
    if (s === 6 || s === 10) keys(CH[bar], t, S16 * 3, 0.03);
    if (s === 0 || s === 8) tone('sine', midi(BASS[bar]), t, 0.01, 0.16, S16 * 6, music, 600);
    if (s === 14) tone('sine', midi(BASS[bar] + 7), t, 0.01, 0.1, S16 * 2, music, 600);
    if (s === 0 || s === 8) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(g); g.connect(music); env(g, t, 0.004, 0.22, 0.16); o.start(t); o.stop(t + 0.25);
    }
    if (s === 4 || s === 12) noise(t, 0.13, 'bandpass', 1900, 0.05, music, 0.8);
    if (s % 4 === 2) noise(t, 0.035, 'highpass', 7500, 0.022, music);
    if (loop % 2 === 1) for (const [ms, n] of MEL[bar]) if (ms === s) {
      tone('sine', midi(n + 12), t, 0.004, 0.05, 0.7, music);
      tone('sine', midi(n + 12) * 3, t, 0.002, 0.012, 0.25, music);
    }
    if (Math.random() < 0.18) noise(t + Math.random() * S16, 0.004, 'highpass', 3000, 0.02 + Math.random() * 0.03, music);
  }
  function scheduler() {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.25) {
      playStep(step, nextT);
      nextT += S16; step = (step + 1) % 64; if (step === 0) loop++;
    }
  }
  function startRoom() {
    if (room) return; room = true;
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.05;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    const hum = ctx.createOscillator(), hg = ctx.createGain(); hum.frequency.value = 120; hg.gain.value = 0.005;
    hum.connect(hg); hg.connect(master); hum.start();
  }
  const live = () => on && ctx;
  return {
    get on() { return on; },
    async enable() {
      init(); if (!ctx) return false;
      try { await ctx.resume(); } catch (e) { return false; }
      on = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.9, t + 0.4);
      startRoom();
      if (!timer) {
        nextT = t + 1.4; step = 0;
        music.gain.setValueAtTime(0, t); music.gain.linearRampToValueAtTime(0.55, t + 5);
        timer = setInterval(scheduler, 90);
      }
      return true;
    },
    disable() {
      if (!ctx) return;
      on = false;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.3);
      setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 400);
    },
    chime() {
      if (!live()) return;
      const t = ctx.currentTime + 0.05;
      [[76, 0], [72, 0.34], [79, 0.68]].forEach(([n, dt]) => {
        tone('sine', midi(n), t + dt, 0.006, 0.22, 1.5, sfx);
        tone('sine', midi(n) * 4.01, t + dt, 0.003, 0.03, 0.4, sfx);
      });
    },
    shutter() {
      if (!live()) return;
      const t = ctx.currentTime;
      noise(t, 0.03, 'highpass', 2500, 0.3, sfx); noise(t + 0.075, 0.05, 'bandpass', 1200, 0.2, sfx, 1.2);
    },
    motor(dur) {
      if (!live()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), og = ctx.createGain(), lf = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(115, t + dur * 0.5); o.frequency.linearRampToValueAtTime(65, t + dur);
      lf.frequency.value = 11; lg.gain.value = 6; lf.connect(lg); lg.connect(o.frequency);
      o.connect(og); og.connect(sfx);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.06, t + 0.25); og.gain.setValueAtTime(0.06, t + Math.max(0.3, dur - 0.3)); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); lf.start(t); o.stop(t + dur + 0.1); lf.stop(t + dur + 0.1);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 1.4;
      b.frequency.setValueAtTime(300, t); b.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.5); b.frequency.exponentialRampToValueAtTime(320, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(b); b.connect(g); g.connect(sfx); s.start(t); s.stop(t + dur + 0.1);
    },
    ticks(n, dur) {
      if (!live()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < n; i++) tone('sine', 1500 + i * 40, t + dur * (i / n), 0.002, 0.04, 0.05, sfx);
    },
    focus() {
      if (!live()) return;
      const t = ctx.currentTime;
      tone('sine', midi(88), t, 0.004, 0.12, 0.5, sfx); tone('sine', midi(95), t + 0.11, 0.004, 0.12, 0.9, sfx);
    },
    blip(ch) {
      if (!live()) return;
      const k = (ch.charCodeAt(0) * 7) % 9 - 4;
      tone('square', 520 * Math.pow(2, k / 12), ctx.currentTime, 0.006, 0.09, 0.05, voice, 1900);
    },
    key() { if (live()) noise(ctx.currentTime, 0.012, 'highpass', 4000, 0.02, sfx); },
    ui() { if (live()) tone('sine', 1320, ctx.currentTime, 0.003, 0.05, 0.06, sfx); }
  };
})();

/* ================= robot screen: a face drawn with lenslets ================= */
const Face = (() => {
  const c = q('.robot canvas'), g = c.getContext('2d'), COLS = 14, ROWS = 9;
  const F = {
    idle: ['..............', '..............', '...##....##...', '...##....##...', '..............', '..............', '.....####.....', '..............', '..............'],
    blink: ['..............', '..............', '..............', '...##....##...', '..............', '..............', '.....####.....', '..............', '..............'],
    talk: ['..............', '..............', '...##....##...', '...##....##...', '..............', '.....####.....', '.....#..#.....', '......##......', '..............'],
    workL: ['..............', '..............', '..##....##....', '..##....##....', '..............', '..............', '......##......', '..............', '..............'],
    workR: ['..............', '..............', '....##....##..', '....##....##..', '..............', '..............', '......##......', '..............', '..............'],
    happy: ['..............', '..............', '....#....#....', '...#.#..#.#...', '..............', '....#....#....', '.....####.....', '..............', '..............']
  };
  let mode = 'idle', mouth = false, last = '', gx = 0, gy = 0;
  const shift = (s, dx) => dx > 0 ? '.'.repeat(dx) + s.slice(0, -dx) : dx < 0 ? s.slice(-dx) + '.'.repeat(-dx) : s;
  function gaze(base) {
    // move the eye rows (2 and 3) toward the pointer
    if (!gx && !gy) return base;
    const rows = base.slice(), eyes = [rows[2], rows[3]];
    rows[2] = rows[3] = '.'.repeat(COLS);
    rows[2 + gy] = shift(eyes[0], gx); rows[3 + gy] = shift(eyes[1], gx);
    return rows;
  }
  function paint(key) {
    const sig = key + gx + ',' + gy;
    if (sig === last) return; last = sig;
    const rows = key.startsWith('work') ? F[key] : gaze(F[key]), cw = c.width / COLS, chh = c.height / ROWS, r = Math.min(cw, chh) * 0.36;
    g.clearRect(0, 0, c.width, c.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const lit = rows[y][x] === '#';
      g.beginPath(); g.arc((x + 0.5) * cw, (y + 0.5) * chh, r, 0, Math.PI * 2);
      g.fillStyle = lit ? '#e3c47f' : 'rgba(236,232,223,0.07)';
      g.shadowColor = lit ? 'rgba(227,196,127,0.8)' : 'transparent';
      g.shadowBlur = lit ? r * 1.6 : 0;
      g.fill();
    }
  }
  function frame(now) {
    let key = mode;
    if (mode === 'idle') key = (now % 4200) < 140 ? 'blink' : 'idle';
    else if (mode === 'talk') key = mouth ? 'talk' : 'idle';
    else if (mode === 'work') key = Math.floor(now / 380) % 2 ? 'workL' : 'workR';
    paint(key);
  }
  function look(clientX, clientY) {
    const r = c.getBoundingClientRect();
    gx = Math.max(-1, Math.min(1, Math.round((clientX - (r.left + r.width / 2)) / 260)));
    gy = Math.max(-1, Math.min(1, Math.round((clientY - (r.top + r.height / 2)) / 260)));
  }
  return { set(m) { mode = m; }, get mode() { return mode; }, flap() { mouth = !mouth; }, frame, look };
})();

/* ================= dialogue: Japanese voice line, subtitle in the page language ================= */
const L = {
  greet: ['いらっしゃいませ！ レンズ研究所へようこそ。', { ko: '어서 오세요! 렌즈 연구실에 오신 걸 환영합니다.', en: 'Welcome to the lens lab!' }],
  intro: ['奥行きのある景色を、レンズで撮って元に戻してみますね。', { ko: '깊이가 다른 물체들이 놓인 장면을 렌즈 배열로 찍었다가 다시 되살려 볼게요.', en: "I'll capture a scene with depth through a lens array, then bring it back." }],
  A: ['まずは撮影。奥行きの違う物体からの光が、レンズを通って小さな像になります。', { ko: `먼저 찍습니다. 깊이가 다른 물체에서 나온 빛이 ${NL}×${NL}개 렌즈를 지나 저마다 작고 뒤집힌 영상을 만듭니다. 이것이 요소 영상입니다.`, en: `Capture. Light from objects at different depths passes ${NL}×${NL} lenses and forms small, flipped elemental images.` }],
  B: ['次は並べ替え。同じ位置のピクセルを集めると、ひとつの視点になります。', { ko: `다음은 재배열(RIM)입니다. 모든 렌즈에서 같은 자리의 픽셀만 모으면 한 방향에서 본 시점 영상 ${VIEWS}장이 돼요.`, en: `Rearrange (RIM). Taking the same pixel from every lens gives ${VIEWS} views, each from one direction.` }],
  C: ['最後に再構成。距離を変えると、ピントの合う物体が変わります。', { ko: `마지막으로 재구성입니다. 시점 영상 ${VIEWS}장을 거리에 맞춰 겹치는데, 거리를 바꾸면 초점이 맞는 물체가 바뀝니다.`, en: `Reconstruct. The ${VIEWS} views are overlapped by distance; change the distance and a different object comes into focus.` }],
  done: ['ピクセルはひとつも失われていません。奥行きごとにピントを合わせ直せます。', { ko: `${fmt(COUNT)}개 픽셀을 하나도 버리지 않고, 깊이마다 초점을 다시 맞출 수 있어요.`, en: `Not one of the ${fmt(COUNT)} pixels was lost, and focus can be set at any depth.` }],
  idle: ['距離のつまみを動かしたり、画像を入れたりしてみてください。', { ko: '재구성 거리를 움직여 초점을 옮겨 보세요. 직접 이미지를 넣어도 됩니다.', en: 'Move the distance slider, or try your own image.' }],
  rev: ['逆再生もできます。一対一の並べ替えですから。', { ko: 'RIM은 일대일 재배열이라 픽셀 하나 잃지 않고 요소 영상으로 되돌아갑니다.', en: 'RIM is one-to-one, so the elemental images come back without losing a pixel.' }],
  bad: ['あれ？ この画像は開けませんでした。', { ko: '이 파일은 열 수 없어요. JPG, PNG, WebP 이미지를 넣어 주세요.', en: "I can't open this file. Try a JPG, PNG or WebP image." }],
  load2: ['画像、受け取りました！ 主役と背景の二層に分けますね。', { ko: '이미지를 받았습니다! 가장자리 색을 배경으로 보고, 주인공과 배경 두 층으로 세웠어요.', en: 'Got it! I split it into a subject layer and a background layer using the edge colour.' }],
  scene: ['サンプルの景色をもう一度並べました。', { ko: '예시 장면을 다시 세웠어요. 원환체, 원숭이 머리, 원뿔·정육면체가 서로 다른 깊이에 있습니다.', en: 'The sample scene is back: torus, monkey head, cone and cube at different depths.' }],
  chart: ['解像度チャートを一枚の板として置きました。', { ko: '해상도 차트를 한 장의 판으로 세웠어요. 초점이 맞는 거리는 하나입니다.', en: 'The resolution chart stands as one flat card, so there is one in-focus distance.' }],
  load1: ['画像、受け取りました！ 一枚の板として置きますね。', { ko: '이미지를 받았습니다! 배경을 가려내기 어려워 한 장의 판으로 세웠어요.', en: "Got it! The background was hard to separate, so it stands as one flat card." }]
};
const FOCUS = [
  (n) => [`距離を手前に合わせると、${n.jp}がくっきり。`, { ko: `거리를 앞쪽에 맞추면 ${n.ko}에 초점이 맞고, 나머지는 흐려집니다.`, en: `Focus near: the ${n.en} is sharp, the rest blurs.` }],
  (n) => [`もう少し奥へ。今度は${n.jp}。`, { ko: `조금 더 뒤로. 이번엔 ${n.ko}에 초점이 맞았어요.`, en: `A little further: now the ${n.en}.` }],
  (n) => [`いちばん奥は${n.jp}。`, { ko: `가장 뒤의 ${n.ko}에도 맞출 수 있어요.`, en: `And the farthest: the ${n.en}.` }]
];
const ej = q('.dialog .jp'), ek = q('.dialog .ko'), liveEl = q('[data-live]');
let sayTimer = 0;
function sayLine(line, after) {
  const jp = line[0], sub = line[1][lang];
  liveEl.textContent = sub;
  clearInterval(sayTimer);
  if (reduce) { ej.textContent = jp; ek.textContent = sub; if (after) after(); return; }
  let i = 0, k = 0; ej.textContent = ''; ek.textContent = '';
  const rest = Face.mode === 'talk' ? 'idle' : Face.mode;
  if (rest !== 'work') Face.set('talk');
  sayTimer = setInterval(() => {
    if (i < jp.length) {
      const ch = jp[i++]; ej.textContent = jp.slice(0, i);
      if (!/[\s、。！？…]/.test(ch)) { Snd.blip(ch); Face.flap(); }
    } else if (k < sub.length) {
      k = Math.min(sub.length, k + 2); ek.textContent = sub.slice(0, k);
      if (k % 6 === 0) Snd.key();
    } else {
      clearInterval(sayTimer);
      if (Face.mode === 'talk') Face.set(rest);
      if (after) after();
    }
  }, 48);
}
const say = (key, after) => sayLine(L[key], after);

/* ================= WebGL2 scene ================= */
/* The scene is a stack of image layers at different depths in front of a pinhole (lens) array.
   Layer k sits at distance K[k] * ZS from the array; a ray through lens s that leaves sensor pixel u
   meets layer k at lens - K[k] * (u - c) / R, and the first opaque layer it meets is what that
   elemental-image pixel records. RIM then swaps (s, u) to (u, s), and reconstruction shifts each view
   by d * (u - c) / NL: when d equals K[k] / NP the samples of layer k land back where they came from. */
const K = [3, 5, 7, 9];
const DMAX = K[3] / NP * 1.1;
function fallback() {
  q('.fallback').hidden = false; canvas.hidden = true;
  root.querySelectorAll('.lab-tools .needs-gl').forEach((el) => { el.hidden = true; });
}
const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, depth: true });
if (!gl) { fallback(); return; }
const floatOK = !!gl.getExtension('EXT_color_buffer_float');
function sh(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function prog(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
const PV = `#version 300 es
precision highp float;
uniform sampler2D uImg;
uniform mat4 uVP;
uniform float uK[4];
uniform float uNL, uNP, uW, uZs, uA, uB, uC, uD, uPx, uP11;
out vec4 vCol;
float ease(float t){ return t < .5 ? 4.*t*t*t : 1. - pow(-2.*t + 2., 3.) / 2.; }
float lag(float t, float d, float spread){ return clamp((t - d * spread) / (1. - spread), 0., 1.); }
vec3 plane(vec2 n, float z){ return vec3((n.x - .5) * uW, (.5 - n.y) * uW, z); }
vec4 layer(int k, vec2 uv){
  vec2 cell = vec2(float(k % 2), float(k / 2));
  return texture(uImg, (clamp(uv, vec2(.001), vec2(.999)) + cell) * .5);
}
void main(){
  float R = uNL * uNP;
  int iR = int(R);
  vec2 px = vec2(float(gl_VertexID % iR), float(gl_VertexID / iR));
  vec2 s = floor(px / uNP);
  vec2 u = px - s * uNP;
  float c = (uNP - 1.) * .5;
  vec2 uo = u - c;
  vec2 lens = (s + .5) / uNL;
  // follow the ray outward and keep the first opaque layer it meets
  vec4 col = vec4(0.); float kap = uK[3]; int hit = 3;
  for (int k = 0; k < 4; k++) {
    vec2 o = lens - uK[k] * uo / R;
    if (o.x < 0. || o.x > 1. || o.y < 0. || o.y > 1.) continue;
    vec4 t = layer(k, o);
    if (t.a > .5) { col = t; kap = uK[k]; hit = k; break; }
  }
  vec2 obj = lens - kap * uo / R;
  vec2 ei = (px + .5) / R;
  vec2 sai = (u * uNL + s + .5) / R;
  vec2 rec = lens - uD * uo / uNL;
  float a = ease(lag(uA, length(lens - .5) * 1.4142, .45));
  vec3 O = plane(obj, -kap * uZs), P = plane(lens, 0.), S = plane(ei, uZs);
  vec3 pos = a < .5 ? mix(O, P, a * 2.) : mix(P, S, a * 2. - 1.);
  float dB = (u.y * uNP + u.x) / (uNP * uNP - 1.);
  float b = ease(lag(uB, dB, .55));
  pos = mix(pos, plane(sai, uZs), b);
  pos.z += sin(3.14159 * b) * .22 * (.5 + .5 * dB);
  float cc = ease(lag(uC, length(uo) / (c * 1.4143), .4));
  pos = mix(pos, plane(rec, uZs), cc);
  pos.z += sin(3.14159 * cc) * .08;
  float dk = kap / uNP;
  float focus = 1. - smoothstep(0., .2, abs(uD - dk) / dk);
  float cells = mix(1., mix(uNP, 1., focus), cc);
  vec4 v = uVP * vec4(pos, 1.);
  gl_Position = v;
  gl_PointSize = clamp(uPx * uP11 * (uW / R) * cells / (2. * v.w) * 1.12, 1., 64.);
  vCol = col;
}`;
const PF = `#version 300 es
precision mediump float;
in vec4 vCol; out vec4 o;
void main(){ if (vCol.a < .03) discard; o = vec4(vCol.rgb, 1.); }`;
const QV = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const QF = `#version 300 es
precision highp float;
uniform sampler2D uAcc;
out vec4 o;
void main(){
  vec4 a = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0);
  if (a.a <= 0.) discard;
  o = vec4(a.rgb / a.a, clamp(a.a, 0., 1.));
}`;
const LV = `#version 300 es
in vec3 aPos; uniform mat4 uVP;
void main(){ gl_Position = uVP * vec4(aPos, 1.); }`;
const LF = `#version 300 es
precision mediump float;
uniform vec4 uCol; out vec4 o;
void main(){ o = uCol; }`;
const EV = `#version 300 es
in vec4 aP; uniform mat4 uVP; uniform float uT, uPx, uP11, uAsp, uMA; uniform vec2 uM;
out float vK; out float vA; out float vG;
void main(){
  vec3 p = aP.xyz; float seed = abs(aP.w); vK = step(0., aP.w);
  if (vK > .5) { p.x += sin(uT * .13 + seed * 40.) * .12; p.y += sin(uT * .21 + seed * 17.) * .18; p.z += cos(uT * .1 + seed * 9.) * .1; }
  vec4 v = uVP * vec4(p, 1.);
  vec2 ndc = v.xy / v.w;
  vec2 dm = (ndc - uM) * vec2(uAsp, 1.);
  float near = length(dm);
  // the pointer works like a torch on the breadboard, and pushes the dust aside
  vG = uMA * smoothstep(.8, 0., near);
  if (vK > .5 && near > .001) v.xy += normalize(dm) / vec2(uAsp, 1.) * uMA * smoothstep(.35, 0., near) * .09 * v.w;
  gl_Position = v;
  float sz = vK > .5 ? .018 + .02 * fract(seed * 13.7) : .034 * (1. + .5 * vG);
  gl_PointSize = clamp(uPx * uP11 * sz / (2. * v.w), 1., 18.);
  vA = vK > .5 ? (.25 + .35 * (.5 + .5 * sin(uT * .9 + seed * 23.))) : .16 + .6 * vG;
}`;
const EF = `#version 300 es
precision mediump float;
in float vK; in float vA; in float vG; out vec4 o;
void main(){
  vec2 d2 = gl_PointCoord - .5; float d = length(d2);
  if (d > .5) discard;
  vec3 col = vK > .5 ? vec3(.89, .77, .5) : mix(vec3(.62, .64, .68), vec3(.95, .82, .55), vG);
  o = vec4(col, vA * (vK > .5 ? smoothstep(.5, 0., d) : smoothstep(.5, .3, d)));
}`;
let P, Q, LN, E;
try { P = prog(PV, PF); Q = prog(QV, QF); LN = prog(LV, LF); E = prog(EV, EF); }
catch (err) { fallback(); return; }
const emptyVAO = gl.createVertexArray();

const lines = [], h = W / 2;
for (let i = 0; i <= NL; i++) { const x = -h + W * i / NL; lines.push(x, -h, 0, x, h, 0, -h, x, 0, h, x, 0); }
const gridCount = lines.length / 3;
lines.push(-h, -h, ZS, h, -h, ZS, h, -h, ZS, h, h, ZS, h, h, ZS, -h, h, ZS, -h, h, ZS, -h, -h, ZS);
const lineVAO = gl.createVertexArray(); gl.bindVertexArray(lineVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(LN.p, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

/* environment: an optical breadboard (holes on a regular pitch) below the bench, and dust in the light */
const env = [];
for (let zi = 0; zi < 40; zi++) for (let xi = 0; xi < 52; xi++) env.push(-5.1 + xi * 0.2, -1.45, -5.6 + zi * 0.2, -1 - Math.random() * 0.001);
const DUST = small ? 160 : 340;
for (let i = 0; i < DUST; i++) env.push(-3.6 + Math.random() * 7, -1.2 + Math.random() * 3, -4.5 + Math.random() * 7, 0.001 + Math.random());
const envCount = env.length / 4;
const envVAO = gl.createVertexArray(); gl.bindVertexArray(envVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(env), gl.STATIC_DRAW);
const aP = gl.getAttribLocation(E.p, 'aP'); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

/* accumulation target: overlapping views are averaged, which is what reconstruction does */
let acc = null, accTex = null, accW = 0, accH = 0;
function ensureAcc(w, hh) {
  if (!floatOK || (w === accW && hh === accH)) return;
  accW = w; accH = hh;
  if (accTex) gl.deleteTexture(accTex);
  accTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, accTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, hh, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  if (!acc) acc = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, acc); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2), nf = 1 / (n - f); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; }
function look(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
const FOV = 34 * Math.PI / 180;
const easeIO = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const st = { A: 0, B: 0, C: 0, D: 0, cam: 0 };
const ptr = { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, mx: 0, my: 0, ma: 0, inside: false };
let VP = null, P11 = 1, hasImage = false;
const T0 = performance.now();
const wideLayout = () => window.innerWidth >= 1180;
function camera(asp, now) {
  // on wide screens the introduction sits on the left, so the scene is drawn off-axis to the right
  const shift = wideLayout() ? 0.36 : 0;
  const sh2 = stage.clientHeight || 1;
  const frac = Math.min(0.42, Math.max(0.08, (sh2 - dialogEl.offsetTop + 14) / sh2));
  const V = Math.max(2.1 * h / (1.95 - 2 * frac), 1.08 * h / (asp * (1 - shift)));
  const fit = V / Math.tan(FOV / 2), lift = -V * (frac - 0.025);
  const k = easeIO(st.cam);
  const drift = reduce ? 0 : Math.sin(now / 5200) * 0.08;
  const amp = 1 - 0.35 * k;
  const ox = (ptr.sx * 1.05 + drift) * amp, oy = (ptr.sy * 0.62 + drift * 0.5) * amp;
  // the oblique view stands beside the camera body and looks through the lens array at the layered scene
  const eObl = small ? [2.0 + ox, 1.2 + oy, 4.6] : [2.6 + ox, 1.35 + oy, 3.9];
  const tObl = [0, -0.1, -0.9];
  const eFr = [ox * 0.9, lift + oy * 0.9, ZS + fit];
  const proj = persp(FOV, asp, 0.05, 40);
  proj[8] = -shift;
  P11 = proj[5];
  return mul(proj, look(lerp3(eObl, eFr, k), lerp3(tObl, [0, lift, ZS], k), [0, 1, 0]));
}
function project(p, w, hh) {
  const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], ww = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
  return [(x / ww * .5 + .5) * w, (1 - (y / ww * .5 + .5)) * hh];
}
const BG = [0x1c / 255, 0x20 / 255, 0x27 / 255];
const tags = { obj: q('[data-tag=obj]'), lens: q('[data-tag=lens]'), sen: q('[data-tag=sen]') };
function draw(now) {
  const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
  const cw = Math.max(1, Math.round(stage.clientWidth * dpr)), ch = Math.max(1, Math.round(stage.clientHeight * dpr));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  ptr.sx += (ptr.x - ptr.sx) * 0.07; ptr.sy += (ptr.y - ptr.sy) * 0.07;
  ptr.mx += (ptr.tx - ptr.mx) * 0.2; ptr.my += (ptr.ty - ptr.my) * 0.2;
  ptr.ma += ((ptr.inside ? 1 : 0) - ptr.ma) * 0.08;
  VP = camera(cw / ch, now);
  ensureAcc(cw, ch);
  const t = (now - T0) / 1000;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cw, ch);
  gl.clearColor(BG[0], BG[1], BG[2], 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(E.p); gl.uniformMatrix4fv(E.u.uVP, false, VP); gl.uniform1f(E.u.uT, t); gl.uniform1f(E.u.uPx, ch); gl.uniform1f(E.u.uP11, P11);
  gl.uniform1f(E.u.uAsp, cw / ch); gl.uniform2f(E.u.uM, ptr.mx, ptr.my); gl.uniform1f(E.u.uMA, ptr.ma);
  gl.bindVertexArray(envVAO); gl.drawArrays(gl.POINTS, 0, envCount);
  gl.disable(gl.BLEND);
  if (hasImage) {
    // while the layers stand in 3D, near points hide far ones (depth test); once views overlap for
    // reconstruction, they are averaged in a float buffer instead
    const averaging = floatOK && st.C > 0.001;
    if (averaging) { gl.bindFramebuffer(gl.FRAMEBUFFER, acc); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
    else { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); }
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u.uImg, 0);
    gl.uniformMatrix4fv(P.u.uVP, false, VP);
    gl.uniform1fv(P.u.uK, K);
    gl.uniform1f(P.u.uNL, NL); gl.uniform1f(P.u.uNP, NP);
    gl.uniform1f(P.u.uW, W); gl.uniform1f(P.u.uZs, ZS);
    gl.uniform1f(P.u.uA, st.A); gl.uniform1f(P.u.uB, st.B); gl.uniform1f(P.u.uC, st.C); gl.uniform1f(P.u.uD, st.D);
    gl.uniform1f(P.u.uPx, ch); gl.uniform1f(P.u.uP11, P11);
    gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.POINTS, 0, COUNT);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (averaging) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(Q.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accTex); gl.uniform1i(Q.u.uAcc, 0);
      gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }
  }
  const fade = 1 - easeIO(st.cam);
  gl.useProgram(LN.p); gl.uniformMatrix4fv(LN.u.uVP, false, VP);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(lineVAO);
  if (fade > 0.01) { gl.uniform4f(LN.u.uCol, 0.79, 0.64, 0.36, 0.42 * fade); gl.drawArrays(gl.LINES, 0, gridCount); }
  gl.uniform4f(LN.u.uCol, 0.79, 0.64, 0.36, 0.28 + 0.3 * fade);
  gl.drawArrays(gl.LINES, gridCount, 8);
  gl.disable(gl.BLEND); gl.bindVertexArray(null);
  const sw = stage.clientWidth, shh = stage.clientHeight;
  const place = (el, p) => { const s = project(p, sw, shh); el.style.transform = `translate(${s[0]}px, ${s[1] - 6}px) translate(0, -100%)`; el.style.opacity = fade.toFixed(2); };
  place(tags.obj, [-h, h, -K[layers.first] * ZS]); place(tags.lens, [-h, h, 0]); place(tags.sen, [-h, h, ZS]);
  Face.frame(now);
}
let running = false, visible = true, raf = 0;
function loop(now) { raf = 0; draw(now); if (running && visible && !document.hidden) raf = requestAnimationFrame(loop); }
function request() { if (!raf) raf = requestAnimationFrame(loop); }
function start() { if (reduce) { request(); return; } running = true; request(); }
new ResizeObserver(() => request()).observe(stage);
new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }).observe(stage);
document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
window.addEventListener('pointermove', (e) => {
  if (reduce) return;
  ptr.x = e.clientX / window.innerWidth * 2 - 1; ptr.y = -(e.clientY / window.innerHeight * 2 - 1);
  const r = canvas.getBoundingClientRect();
  ptr.tx = (e.clientX - r.left) / r.width * 2 - 1; ptr.ty = -((e.clientY - r.top) / r.height * 2 - 1);
  ptr.inside = ptr.tx > -1 && ptr.tx < 1 && ptr.ty > -1 && ptr.ty < 1;
  stage.style.setProperty('--tx', (e.clientX - r.left) + 'px');
  stage.style.setProperty('--ty', (e.clientY - r.top) + 'px');
  stage.style.setProperty('--ta', ptr.inside ? '1' : '0');
  Face.look(e.clientX, e.clientY);
});
root.addEventListener('pointerleave', () => { ptr.inside = false; stage.style.setProperty('--ta', '0'); });

/* ================= layers: which objects stand at which depth ================= */
const NAMES = {
  torus: { ko: '앞쪽 원환체', jp: '手前のドーナツ', en: 'torus in front' },
  monkey: { ko: '가운데 원숭이 머리', jp: '真ん中のサルの頭', en: 'monkey head in the middle' },
  back: { ko: '뒤쪽 원뿔·정육면체', jp: '奥の円すいと立方体', en: 'cone and cube at the back' },
  bg: { ko: '배경', jp: '背景', en: 'background' },
  subject: { ko: '주인공', jp: '主役', en: 'subject' },
  card: { ko: '이미지', jp: '画像', en: 'image' },
  chart: { ko: '해상도 차트', jp: '解像度チャート', en: 'resolution chart' }
};
let layers = { names: [NAMES.torus, NAMES.monkey, NAMES.back, NAMES.bg], used: [0, 1, 2], first: 0 };

/* ================= timeline ================= */
let token = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
function tween(key, to, ms, my) {
  return new Promise((res) => {
    const from = st[key];
    if (reduce || ms <= 0) { st[key] = to; request(); return res(); }
    const t0 = performance.now();
    const tick = (now) => {
      if (my !== token) return res();
      const k = Math.min(1, (now - t0) / ms);
      st[key] = from + (to - from) * (key === 'D' ? easeIO(k) : k);
      request();
      if (k < 1) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
}
const depth = q('[data-depth]'), depthOut = q('[data-depth-out]');
const focusLabel = lang === 'ko' ? (n) => `${n} 초점` : (n) => `Focus: ${n}`;
function focusedLayer() {
  for (const k of layers.used) if (Math.abs(st.D - K[k] / NP) < 0.05) return k;
  return -1;
}
function setDepthUI(enabled) {
  const pct = Math.round(st.D / DMAX * 100), k = focusedLayer();
  depth.disabled = !enabled; depth.value = String(pct);
  const name = k >= 0 ? layers.names[k][lang] : '';
  depthOut.textContent = enabled ? (k >= 0 ? focusLabel(name) : pct + '%') : '–';
  depth.setAttribute('aria-valuetext', k >= 0 ? focusLabel(name) : `${pct}%`);
}
const stepBtns = [...root.querySelectorAll('[data-step]')];
function steps(n) { stepBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.step) === n))); }
async function doCapture(my) {
  steps(1); setDepthUI(false); Face.set('work'); say('A');
  st.B = 0; st.C = 0; st.cam = 0; st.A = 0;
  await wait(500); if (my !== token) return false;
  Snd.shutter(); Snd.motor(3.8);
  await tween('A', 1, 3800, my); if (my !== token) return false;
  await tween('cam', 1, 1500, my); return my === token;
}
async function doRim(my) {
  steps(2); setDepthUI(false); Face.set('work'); say('B');
  st.A = 1; st.cam = 1; st.C = 0; st.B = 0;
  await wait(300); if (my !== token) return false;
  Snd.ticks(16, 3.0); Snd.motor(3.2);
  await tween('B', 1, 3200, my); return my === token;
}
async function doRecon(my) {
  steps(3); Face.set('work'); say('C');
  st.A = 1; st.cam = 1; st.B = 1; st.D = 0; st.C = 0;
  await wait(300); if (my !== token) return false;
  Snd.motor(2.2);
  await tween('C', 1, 1800, my); if (my !== token) return false;
  await wait(1200); if (my !== token) return false;
  // walk the focus from the nearest layer to the farthest one
  for (let i = 0; i < layers.used.length; i++) {
    const k = layers.used[i];
    await tween('D', K[k] / NP, 1500, my); if (my !== token) return false;
    Snd.focus(); setDepthUI(true);
    await new Promise((r) => sayLine(FOCUS[Math.min(i, FOCUS.length - 1)](layers.names[k]), r)); if (my !== token) return false;
    await wait(900); if (my !== token) return false;
  }
  await tween('D', K[layers.first] / NP, 1300, my); if (my !== token) return false;
  setDepthUI(true); Face.set('happy');
  say('done', () => { if (my === token) setTimeout(() => { if (my === token) say('idle'); }, 2600); });
  return true;
}
async function playAll(my) {
  if (!(await doCapture(my))) return;
  await wait(500); if (my !== token) return;
  if (!(await doRim(my))) return;
  await wait(600); if (my !== token) return;
  await doRecon(my);
}
function jumpToEnd() { st.A = 1; st.cam = 1; st.B = 1; st.C = 1; st.D = K[layers.first] / NP; setDepthUI(true); steps(3); Face.set('happy'); say('done'); request(); }
stepBtns.forEach((b) => b.addEventListener('click', () => {
  Snd.ui(); const my = ++token; const n = Number(b.dataset.step);
  if (n === 1) doCapture(my); else if (n === 2) doRim(my); else doRecon(my);
}));
q('[data-reverse]').addEventListener('click', async () => {
  Snd.ui(); const my = ++token;
  if (st.B === 0 && st.C === 0) { st.A = 1; st.cam = 1; st.B = 1; }
  setDepthUI(false); steps(2); Face.set('work'); say('rev');
  Snd.motor(st.C > 0 ? 4 : 2.6);
  if (st.C > 0) { await tween('C', 0, 1400, my); if (my !== token) return; }
  await tween('B', 0, 2600, my); if (my === token) Face.set('idle');
});
depth.addEventListener('input', () => {
  token++; st.A = 1; st.B = 1; st.C = 1; st.cam = 1;
  const before = focusedLayer();
  st.D = DMAX * Number(depth.value) / 100;
  setDepthUI(true); request();
  const now = focusedLayer();
  if (now >= 0 && now !== before) Snd.focus();
});

/* ================= images in: build a 2 x 2 atlas of depth layers ================= */
const CELL = 512;
function uploadAtlas(source) {
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  hasImage = true; request();
}
function squareCrop(img) {
  const w = document.createElement('canvas'); w.width = w.height = CELL;
  const g = w.getContext('2d', { willReadFrequently: true }), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.min(iw, ih);
  g.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, CELL, CELL);
  return w;
}
function atlasFromPicture(img) {
  // a single photo has no depth: estimate the background from the border colour, stand the rest in front
  const w = squareCrop(img), g = w.getContext('2d', { willReadFrequently: true });
  const src = g.getImageData(0, 0, CELL, CELL), px = src.data, N = CELL * CELL;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    if (x > 7 && x < CELL - 8 && y > 7 && y < CELL - 8) continue;
    const i = (y * CELL + x) * 4; r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++;
  }
  r /= n; gg /= n; b /= n;
  const alpha = new Uint8ClampedArray(N); let cover = 0;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(px[i * 4] - r, px[i * 4 + 1] - gg, px[i * 4 + 2] - b);
    const a = Math.max(0, Math.min(1, (d - 38) / 30));
    alpha[i] = a * 255; if (a > 0.5) cover++;
  }
  cover /= N;
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = CELL * 2;
  const ag = atlas.getContext('2d');
  if (cover < 0.04 || cover > 0.8) {
    ag.drawImage(w, CELL, 0);
    return { atlas, names: [NAMES.bg, NAMES.card, NAMES.bg, NAMES.bg], used: [1], first: 1, line: 'load1' };
  }
  const sub = new ImageData(CELL, CELL), back = new ImageData(CELL, CELL);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    sub.data[o] = px[o]; sub.data[o + 1] = px[o + 1]; sub.data[o + 2] = px[o + 2]; sub.data[o + 3] = alpha[i];
    const keep = alpha[i] < 50;
    back.data[o] = keep ? px[o] : r; back.data[o + 1] = keep ? px[o + 1] : gg; back.data[o + 2] = keep ? px[o + 2] : b; back.data[o + 3] = 255;
  }
  ag.putImageData(sub, 0, 0); ag.putImageData(back, CELL, CELL);
  return { atlas, names: [NAMES.subject, NAMES.bg, NAMES.bg, NAMES.bg], used: [0, 3], first: 0, line: 'load2' };
}
function atlasFromChart() {
  const c = document.createElement('canvas'); c.width = c.height = CELL;
  const g = c.getContext('2d');
  g.fillStyle = '#efece4'; g.fillRect(0, 0, CELL, CELL); g.fillStyle = '#16181c';
  for (const [x, y, w] of [[60, 70, 26], [250, 70, 18], [380, 70, 12], [60, 300, 9], [200, 300, 6.5], [310, 300, 4.5], [400, 300, 3.2]]) {
    for (let i = 0; i < 3; i++) g.fillRect(x, y + i * w * 2, w * 5, w);
    for (let i = 0; i < 3; i++) g.fillRect(x + w * 6 + i * w * 2, y, w, w * 5);
  }
  g.font = '700 28px "Gothic A1", sans-serif'; g.fillText('RIM', 60, 470);
  g.font = '400 18px "Gothic A1", sans-serif'; g.fillText('lens array test chart', 140, 468);
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = CELL * 2;
  atlas.getContext('2d').drawImage(c, CELL, 0);
  return { atlas, names: [NAMES.bg, NAMES.chart, NAMES.bg, NAMES.bg], used: [1], first: 1, line: 'chart' };
}
function useLayers(info, mode) {
  layers = { names: info.names, used: info.used, first: info.first };
  uploadAtlas(info.atlas);
  st.A = 0; st.B = 0; st.C = 0; st.cam = 0; st.D = 0; setDepthUI(false); steps(0);
  if (mode === 'still') return;
  const my = ++token;
  if (reduce) { jumpToEnd(); return; }
  if (mode === 'opening') { say('greet', () => { if (my === token) say('intro', () => { if (my === token) setTimeout(() => { if (my === token) playAll(my); }, 600); }); }); return; }
  sayLine(L[info.line] || L.load2, () => { if (my === token) playAll(my); });
}
const sceneURL = root.dataset.layers;
function loadScene(mode) {
  const img = new Image();
  img.onload = () => useLayers({ atlas: img, names: [NAMES.torus, NAMES.monkey, NAMES.back, NAMES.bg], used: [0, 1, 2], first: 0, line: 'scene' }, mode);
  img.src = sceneURL;
}
const sampleBtns = [...root.querySelectorAll('[data-sample-btn]')];
function pick(which) { sampleBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sampleBtn === which))); }
sampleBtns.forEach((b) => b.addEventListener('click', () => {
  Snd.ui(); pick(b.dataset.sampleBtn);
  if (b.dataset.sampleBtn === 'chart') useLayers(atlasFromChart(), 'load'); else loadScene('load');
}));
function takeFile(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) { Face.set('idle'); say('bad'); return; }
  pick('none');
  const url = URL.createObjectURL(f), img = new Image();
  img.onload = () => { useLayers(atlasFromPicture(img), 'load'); URL.revokeObjectURL(url); };
  img.onerror = () => { Face.set('idle'); say('bad'); URL.revokeObjectURL(url); };
  img.src = url;
}
q('[data-file]').addEventListener('change', (e) => takeFile(e.target.files[0]));
const drop = q('.drop');
let dragDepth = 0;
stage.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; drop.hidden = false; });
stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.hidden = true; });
stage.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; drop.hidden = true; takeFile(e.dataTransfer.files[0]); });
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) takeFile(f); });

/* ================= sound: on by default ================= */
/* Browsers only allow audio after the visitor's first click, tap or key press, so the sound is
   "on" from the start and actually begins at that first gesture anywhere on the page. A visitor
   who turns it off is remembered on this device. */
const soundBtn = q('[data-sound]'), soundHint = q('[data-sound-hint]');
const soundText = { ko: ['소리 켜기', '소리 끄기'], en: ['Sound on', 'Sound off'] }[lang];
let wantSound = true;
try { if (localStorage.getItem('lab-sound') === 'off') wantSound = false; } catch (e) { /* storage unavailable */ }
function soundUI() {
  soundBtn.setAttribute('aria-pressed', String(wantSound));
  soundBtn.querySelector('.label').textContent = wantSound ? soundText[1] : soundText[0];
  soundBtn.querySelector('.x').style.display = wantSound ? 'none' : '';
  soundBtn.querySelector('.w').style.display = wantSound ? '' : 'none';
  soundHint.hidden = !(wantSound && !Snd.on);
}
function startSound() {
  if (!wantSound || Snd.on) return;
  Snd.enable().then((ok) => { if (ok) Snd.chime(); soundUI(); });
}
const GESTURES = ['pointerdown', 'keydown', 'touchend'];
function firstGesture(e) {
  if (e.target && e.target.closest && e.target.closest('[data-sound]')) return;
  GESTURES.forEach((t) => window.removeEventListener(t, firstGesture, true));
  startSound();
}
GESTURES.forEach((t) => window.addEventListener(t, firstGesture, true));
soundBtn.addEventListener('click', () => {
  wantSound = !wantSound;
  try { localStorage.setItem('lab-sound', wantSound ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
  if (wantSound) startSound(); else Snd.disable();
  soundUI();
});
soundUI();

/* the layered sample scene stands in front of the lens array; the demo plays itself once the page is calm */
setDepthUI(false);
start();
loadScene(reduce ? 'still' : 'opening');
})();
