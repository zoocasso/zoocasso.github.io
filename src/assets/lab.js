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
// the synthetic scenes use fewer lenses; the real Lytro light field needs more to stay recognisable
const NL_SIM = small ? 32 : 48, NL_REAL = small ? 64 : 128, VIEWS = NP * NP;
let NL = NL_SIM, R = NL * NP, COUNT = R * R;
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
    /* true only when the browser lets this page play sound before any click (e.g. a site the visitor uses often) */
    autoplayOK() { init(); return !!ctx && ctx.state === 'running'; },
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
  tap: ['画面をクリックすると、音といっしょに始まります。', { ko: '화면을 한 번 누르면 소리와 함께 시작해요.', en: 'Click anywhere to start, with sound.' }],
  greet: ['いらっしゃいませ！ 奥行きのある景色を、レンズで撮って元に戻してみますね。', { ko: '어서 오세요! 깊이가 다른 물체들을 렌즈 배열로 찍었다가 다시 되살려 볼게요.', en: "Welcome! I'll capture a scene with depth through a lens array, then bring it back." }],
  A: () => scene.kind === 'lytro'
    ? ['本物のLytroで撮った、レンズごとの画像です。拡大すると、小さな丸い像が並んでいます。', { ko: '이건 실제 Lytro 카메라로 찍어 Lytro 소프트웨어가 디코딩한 렌즈릿 영상이에요. 확대하면 렌즈마다 작고 둥근 사진이 있어요. 렌즈 하나하나가 작은 카메라인 셈이고, 그 가운데 8×8 픽셀이 8×8개 시점이 됩니다. 3D 형상이 없으니 촬영은 흉내 내지 않아요.', en: 'This is a real Lytro capture: the lenslet image as decoded by Lytro\'s software. Zoom in and each lens holds a small round picture: every lens is a tiny camera, and its central 8×8 pixels become the 8×8 views. There is no 3D shape here, so the capture is not simulated.' }]
    : scene.kind === 'blender'
    ? ['カシャッ。小さなカメラごとに、小さな写真が一枚ずつ撮れました。', { ko: `찰칵. 작은 카메라마다 8×8 픽셀짜리 사진이 센서에 한 장씩 찍혔어요. 이것이 요소 영상입니다. 여기서는 블렌더로 렌더링한 8×8 시점 영상으로 만들었어요.`, en: `Click. Each tiny camera left an 8×8-pixel picture on the sensor: the elemental images, built here from 8×8 views rendered in Blender.` }]
    : ['カシャッ。小さなカメラごとに、小さな写真が一枚ずつ撮れました。', { ko: `찰칵. 작은 카메라마다 8×8 픽셀짜리 사진이 센서에 한 장씩 찍혔어요. 이것이 요소 영상입니다.`, en: `Click. Each tiny camera left an 8×8-pixel picture on the sensor: these are the elemental images.` }],
  cams: () => ['レンズの一つひとつが、小さなカメラです。少しずつ違う場所から、同時に撮ります。', { ko: `렌즈 배열의 렌즈 하나하나는 아주 작은 카메라예요. ${NL}×${NL}대가 조금씩 다른 자리에서 동시에 찍습니다.`, en: `Each lens in the array is a tiny camera. ${NL}×${NL} of them take the picture at once, each from a slightly different spot.` }],
  B: ['次は並べ替え。小さな写真から同じ位置のピクセルを集めると、ひとつの方向から見た写真になります。', { ko: `다음은 재배열(RIM)입니다. 작은 사진들에서 같은 자리의 픽셀만 모으면, 한 방향에서 본 큰 사진 한 장이 돼요. 자리마다 한 장씩, ${VIEWS}장입니다.`, en: `Rearrange (RIM). Take the pixel at the same spot from every tiny picture and you get one larger picture seen from one direction; one per spot, ${VIEWS} in all.` }],
  views: ['ほら、視点ごとに手前と奥のずれ方がちがいます。', { ko: '보세요. 시점마다 앞의 물체와 뒤의 물체가 서로 다르게 움직여요. 같은 그림이 아니라 서로 다른 방향에서 본 영상입니다.', en: 'Look: from view to view, near and far objects move differently. They are not copies but views from different directions.' }],
  C: ['最後に再構成。重ねる面を奥へ動かすと、その奥行きの物体がくっきり戻ります。', { ko: `마지막으로 재구성입니다. 시점 영상 ${VIEWS}장을 한 면에 겹치는데, 그 면을 뒤로 옮기면 그 깊이에 있던 물체가 선명하게 되살아나요.`, en: `Reconstruct. The ${VIEWS} views are overlapped on one plane; move the plane back and whatever stood at that depth comes back sharp.` }],
  done: () => ['ピクセルはひとつも失われていません。奥行きごとにピントを合わせ直せます。', { ko: `${fmt(COUNT)}개 픽셀을 하나도 버리지 않고, 깊이마다 초점을 다시 맞출 수 있어요.`, en: `Not one of the ${fmt(COUNT)} pixels was lost, and focus can be set at any depth.` }],
  idle: () => scene.kind === 'lytro'
    ? ['画面を押すと、その場所にピントを合わせます。', { ko: '화면을 누르면 그 자리에 초점이 맞아요. "추정 깊이 층"을 켜면 시점들이 어느 깊이에서 잘 맞는지 볼 수 있어요.', en: 'Click the picture to focus there. Turn on "Estimated depth layers" to see at which depths the views agree.' }]
    : ['距離のつまみを動かしてみてください。並べ替えのあとは、マウスで視点も変えられます。', { ko: '재구성 거리를 움직여 초점을 옮겨 보세요. "2 재배열"을 누른 뒤 화면 위에서 마우스를 움직이면 시점도 바꿔 볼 수 있어요.', en: 'Move the distance slider. After "2 Rearrange", move the mouse over the stage to change the view.' }],
  lay: ['視点がよく合う奥行きを、層にして広げました。推定ですよ。', { ko: '64개 시점이 깊이마다 얼마나 잘 맞는지를 층으로 펼쳤어요. 측정한 3D가 아니라 추정이라, 애매한 곳은 여러 층에 흐리게 퍼집니다.', en: 'How well the 64 views agree at each depth, spread out as layers. This is an estimate, not measured 3D, so ambiguous places spread faintly over several layers.' }],
  flat: ['ここは模様がなくて、どの奥行きでも同じくらい合います。', { ko: '여기는 무늬가 거의 없어서, 시점들이 어느 깊이에서든 비슷하게 맞아요. 이런 곳에서는 초점을 고를 수 없어요.', en: 'There is almost no texture here, so the views match about equally at every depth; no focus can be chosen from this spot.' }],
  pickf: ['ここで視点がいちばんよく合う面に、ピントを合わせました。', { ko: '누른 자리에서 시점들이 가장 잘 맞는 면으로 초점을 옮겼어요.', en: 'Focus moved to the plane where the views agree best at that spot.' }],
  rev: ['逆再生もできます。一対一の並べ替えですから。', { ko: 'RIM은 일대일 재배열이라 픽셀 하나 잃지 않고 요소 영상으로 되돌아갑니다.', en: 'RIM is one-to-one, so the elemental images come back without losing a pixel.' }],
  bad: ['あれ？ この画像は開けませんでした。', { ko: '이 파일은 열 수 없어요. JPG, PNG, WebP 이미지를 넣어 주세요.', en: "I can't open this file. Try a JPG, PNG or WebP image." }],
  load2: ['画像、受け取りました！ 主役と背景の二層に分けますね。', { ko: '이미지를 받았습니다! 가장자리 색을 배경으로 보고, 주인공과 배경 두 층으로 세웠어요.', en: 'Got it! I split it into a subject layer and a background layer using the edge colour.' }],
  scene: ['ブレンダーの景色です。8×8の視点から描きました。', { ko: '블렌더로 8×8 시점을 렌더링한 장면이에요. 앞에서부터 원숭이 머리, 원환체, 정육면체, 원뿔, 구가 놓여 있습니다.', en: 'A scene rendered in Blender from 8×8 viewpoints: monkey head, torus, cube, cone and sphere, from near to far.' }],
  lytro: ['スタンフォードのLytroデータです。本物のカメラで撮った景色ですよ。', { ko: '실제 Lytro 라이트필드 카메라로 찍은 장면이에요. Stanford Lytro Light Field Archive의 사진에서, 정지 표지판을 나뭇가지가 가리는 부분을 렌즈 128×128개만큼 잘라 왔어요.', en: 'A real scene shot with a Lytro light-field camera, from the Stanford Lytro Light Field Archive: 128×128 lenses cut from the photo where a branch hides part of a stop sign.' }],
  load1: ['画像、受け取りました！ 一枚の板として置きますね。', { ko: '이미지를 받았습니다! 배경을 가려내기 어려워 한 장의 판으로 세웠어요.', en: "Got it! The background was hard to separate, so it stands as one flat card." }]
};
const FOCUS = [
  (n) => [`${n.jp}の位置で、くっきり。`, { ko: `${n.ko} 자리에서 선명해졌어요.`, en: `Sharp where the ${n.en} stood.` }],
  (n) => [`もっと奥へ。${n.jp}。`, { ko: `더 뒤로 가면 ${n.ko}.`, en: `Further back: the ${n.en}.` }],
  (n) => [`いちばん奥は${n.jp}。`, { ko: `가장 뒤의 ${n.ko}까지.`, en: `And the farthest: the ${n.en}.` }],
  (n) => [`その奥の${n.jp}まで。`, { ko: `그 뒤의 ${n.ko}까지.`, en: `On to the ${n.en} behind it.` }]
];
const ej = q('.dialog .jp'), ek = q('.dialog .ko'), liveEl = q('[data-live]');
let sayTimer = 0;
function sayLine(line, after) {
  const jp = line[0], sub = line[1][lang];
  liveEl.textContent = sub;
  clearInterval(sayTimer);
  // the subtitle shows in full as the line starts, like a film subtitle, while the Japanese is typed out
  ek.textContent = sub;
  if (reduce) { ej.textContent = jp; if (after) after(); return; }
  ek.classList.remove('fade'); void ek.offsetWidth; ek.classList.add('fade');
  // after the Japanese ends, hold as long as typing the subtitle used to take, so the pacing stays the same
  let i = 0, hold = Math.ceil(sub.length / 2); ej.textContent = '';
  const rest = Face.mode === 'talk' ? 'idle' : Face.mode;
  if (rest !== 'work') Face.set('talk');
  sayTimer = setInterval(() => {
    if (i < jp.length) {
      const ch = jp[i++]; ej.textContent = jp.slice(0, i);
      if (!/[\s、。！？…]/.test(ch)) { Snd.blip(ch); Face.flap(); }
      if (i === jp.length && Face.mode === 'talk') Face.set(rest);
    } else if (hold > 0) {
      hold--;
    } else {
      clearInterval(sayTimer);
      if (after) after();
    }
  }, 48);
}
const say = (key, after) => sayLine(typeof L[key] === 'function' ? L[key]() : L[key], after);

/* ================= WebGL2 scene ================= */
/* A pinhole (lens) array: the elemental-image pixel u under lens s records the point at
   lens - dk (u - c) / NL, where dk (lens units per view step) grows with the point's distance in front
   of the array (z = -NP * ZS * dk). The sample scenes give each pixel its colour and dk from a light
   field (views + depth); a picture dropped in becomes a stack of layers at distances K[k] * ZS, and a
   pixel records the first opaque layer its ray meets. RIM then swaps (s, u) to (u, s), and
   reconstruction shifts each view by d * (u - c) / NL: at d = dk the samples land back where they came from. */
const K = [3, 5, 7, 9];
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
uniform sampler2D uImg, uDep;
uniform mat4 uVP;
uniform float uK[4];
uniform float uNL, uNP, uW, uZs, uA, uB, uC, uD, uPx, uP11, uReal, uDepV, uDlo, uDhi, uZa, uZb, uVw, uAvg, uSky, uGrow;
uniform vec2 uVs;
out vec4 vCol;
out float vW;
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
  // dk: the shift per view step that brings this sample back into focus (its depth)
  vec4 col = vec4(0.); float dk, sky = 0.;
  if (uReal > .5) {
    // a light field: elemental-image pixel (s, u) is view u at position s, stored as a mosaic of views;
    // its depth is either one map per lens (estimated) or a mosaic like the views (rendered)
    ivec2 at = ivec2(u * uNL + s);
    col = vec4(texelFetch(uImg, at, 0).rgb, 1.);
    float dz = texelFetch(uDep, uDepV > .5 ? at : ivec2(s), 0).r;
    dk = mix(uDlo, uDhi, dz);
    sky = uSky * step(.998, dz);
  } else {
    // follow the ray outward and keep the first opaque layer it meets
    float kap = uK[3];
    for (int k = 0; k < 4; k++) {
      vec2 o = lens - uK[k] * uo / R;
      if (o.x < 0. || o.x > 1. || o.y < 0. || o.y > 1.) continue;
      vec4 t = layer(k, o);
      if (t.a > .5) { col = t; kap = uK[k]; break; }
    }
    dk = kap / uNP;
  }
  vec2 obj = lens - dk * uo / uNL;
  vec2 ei = (px + .5) / R;
  vec2 sai = (u * uNL + s + .5) / R;
  vec2 rec = lens - uD * uo / uNL;
  float a = ease(lag(uA, length(lens - .5) * 1.4142, .45));
  vec3 O = plane(obj, clamp(uZa + uZb * dk, -2.9, -.3)), P = plane(lens, 0.), S = plane(ei, uZs);
  vec3 pos = a < .5 ? mix(O, P, a * 2.) : mix(P, S, a * 2. - 1.);
  if (sky > .5 && a < .5) col.a = 0.;
  float grow = mix(uGrow, 1., min(1., a * 2.));
  float dB = (u.y * uNP + u.x) / (uNP * uNP - 1.);
  float b = ease(lag(uB, dB, .55));
  pos = mix(pos, plane(sai, uZs), b);
  pos.z += sin(3.14159 * b) * .22 * (.5 + .5 * dB);
  // then one view at a time fills the sensor; uVs picks the view, blending the nearest four
  float vw = ease(clamp(uVw, 0., 1.));
  pos = mix(pos, plane(lens, uZs), vw);
  pos.z += sin(3.14159 * vw) * .12;
  vec2 dv = max(1. - abs(u - uVs), 0.);
  float w = dv.x * dv.y;
  float cc = ease(lag(uC, length(uo) / (c * 1.4143), .4));
  // reconstruction opens up again: every view counts the same
  vW = mix(1., uAvg > .5 ? w : step(.5, w), vw * (1. - cc));
  // the views are overlapped on a plane in front of the lens array: shifting by d per view step
  // brings back what stands at depth d, so the plane is drawn at that depth in the scene
  pos = mix(pos, plane(rec, uZa + uZb * uD), cc);
  float focus = 1. - smoothstep(0., .2, abs(uD - dk) / max(dk, .05));
  // a single view, and a real light field refocused by shift-and-sum, cover a whole lens per sample
  float cellsC = uReal > .5 ? uNP : mix(uNP, 1., focus);
  float cells = mix(mix(1., uNP, vw), cellsC, cc);
  vec4 v = uVP * vec4(pos, 1.);
  gl_Position = v;
  gl_PointSize = clamp(uPx * uP11 * (uW / R) * cells * grow / (2. * v.w) * 1.12, 1., 64.);
  vCol = col;
}`;
const PF = `#version 300 es
precision mediump float;
in vec4 vCol; in float vW; out vec4 o;
void main(){ if (vCol.a < .03 || vW < .002) discard; o = vec4(vCol.rgb * vW, vW); }`;
const QV = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const QF = `#version 300 es
precision highp float;
uniform sampler2D uAcc;
uniform float uOp;
out vec4 o;
void main(){
  vec4 a = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0);
  if (a.a <= 0.) discard;
  o = vec4(a.rgb / a.a, clamp(a.a, 0., 1.) * uOp);
}`;
/* estimated depth layers (real light field): one quad per plane of the plane sweep, far ones first.
   Colour: the views shifted to that plane and averaged; weight: how well the 64 views agree there,
   relative to the other planes (softmax of the variance), so a clear match stands on one layer and an
   ambiguous one spreads thinly over several. The layer at the slider's depth is drawn brighter. */
const YV = `#version 300 es
uniform mat4 uVP; uniform float uW, uZa, uZb, uK0, uK1, uN;
out vec2 vUV; flat out int vK; out float vD;
void main(){
  vec2 Q[6] = vec2[6](vec2(0., 0.), vec2(1., 0.), vec2(1., 1.), vec2(0., 0.), vec2(1., 1.), vec2(0., 1.));
  int k = int(uN) - 1 - gl_InstanceID;
  float d = uK0 + (uK1 - uK0) * float(k) / (uN - 1.);
  vec2 n = Q[gl_VertexID];
  vUV = n; vK = k; vD = d;
  gl_Position = uVP * vec4((n.x - .5) * uW, (.5 - n.y) * uW, uZa + uZb * d, 1.);
}`;
const YF = `#version 300 es
precision highp float;
uniform sampler2D uLay, uLayA; uniform float uNL, uCols, uFade, uDsel, uK0, uK1;
in vec2 vUV; flat in int vK; in float vD; out vec4 o;
void main(){
  ivec2 cell = ivec2(vK % int(uCols), vK / int(uCols));
  ivec2 t = cell * int(uNL) + ivec2(min(floor(vUV * uNL), vec2(uNL - 1.)));
  vec3 c = texelFetch(uLay, t, 0).rgb;
  float a = texelFetch(uLayA, t, 0).r;
  float sel = exp(-pow((vD - uDsel) / (.06 * (uK1 - uK0)), 2.));
  float g = uFade * mix(.5, 1., sel);
  if (a * g < .004) discard;
  o = vec4(c * a * g, a * g);
}`;
const LV = `#version 300 es
in vec3 aPos; uniform mat4 uVP; uniform float uZ;
void main(){ gl_Position = uVP * vec4(aPos + vec3(0., 0., uZ), 1.); }`;
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
let P, Q, LN, E, Y;
try { P = prog(PV, PF); Q = prog(QV, QF); LN = prog(LV, LF); E = prog(EV, EF); Y = prog(YV, YF); }
catch (err) { fallback(); return; }
const emptyVAO = gl.createVertexArray();

const h = W / 2, lineBuf = gl.createBuffer();
let gridCount = 0;
function buildLines(nl) {
  // one line per lens, thinned out when the lenses get too fine to draw; then the sensor outline
  const lines = [], step = Math.ceil(nl / 48);
  for (let i = 0; i <= nl; i += step) { const x = -h + W * i / nl; lines.push(x, -h, 0, x, h, 0, -h, x, 0, h, x, 0); }
  if (nl % step) lines.push(h, -h, 0, h, h, 0, -h, h, 0, h, h, 0);
  gridCount = lines.length / 3;
  lines.push(-h, -h, ZS, h, -h, ZS, h, -h, ZS, h, h, ZS, h, h, ZS, -h, h, ZS, -h, h, ZS, -h, -h, ZS);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
}
const lineVAO = gl.createVertexArray(); gl.bindVertexArray(lineVAO);
buildLines(NL);
const aPos = gl.getAttribLocation(LN.p, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
/* step 1 opens on camera models standing in the lens array: every lens with the sensor behind it is a
   tiny camera looking at the scene. A few of them are drawn, larger than a lens so they can be seen:
   the body between the lens array and the sensor, a lens barrel in front, and the way it looks */
const iconBuf = gl.createBuffer(), iconVAO = gl.createVertexArray();
gl.bindVertexArray(iconVAO); gl.bindBuffer(gl.ARRAY_BUFFER, iconBuf);
gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
let iconCount = 0;
function buildIcons() {
  const v = [], seg = (a, b) => v.push(...a, ...b), bw = 0.075, bh = 0.055, r = 0.036, zf = -0.05;
  for (const fy of [0.2, 0.5, 0.8]) for (const fx of [0.2, 0.5, 0.8]) {
    // the nearest lens centre
    const x = ((Math.floor(fx * NL) + .5) / NL - .5) * W, y = (.5 - (Math.floor(fy * NL) + .5) / NL) * W;
    const c = [[-bw, -bh], [bw, -bh], [bw, bh], [-bw, bh]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4];
      seg([x + ax, y + ay, 0.01], [x + bx, y + by, 0.01]); seg([x + ax, y + ay, ZS], [x + bx, y + by, ZS]);
      seg([x + ax, y + ay, 0.01], [x + ax, y + ay, ZS]);
    }
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12 * 2 * Math.PI, a1 = (i + 1) / 12 * 2 * Math.PI;
      seg([x + r * Math.cos(a0), y + r * Math.sin(a0), zf], [x + r * Math.cos(a1), y + r * Math.sin(a1), zf]);
      if (i % 3 === 0) seg([x + r * Math.cos(a0), y + r * Math.sin(a0), zf], [x + r * Math.cos(a0), y + r * Math.sin(a0), 0.01]);
    }
    // where it looks: a short, narrow cone toward the scene
    for (const [ax, ay] of c) seg([x, y, zf], [x + ax * 1.6, y + ay * 1.6, -0.42]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, iconBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  iconCount = v.length / 3;
}
function setNL(nl) { if (nl === NL) return; NL = nl; R = NL * NP; COUNT = R * R; buildLines(NL); }

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
// depth is data, read texel by texel: without these settings the texture has no mipmaps for its
// default filter, is incomplete, and every read returns 0 (all points at one depth)
const depTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, depTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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

const st = { A: 0, B: 0, C: 0, D: 0, cam: 0, icons: 0, V: 0, vt: 0, Lay: 0 };
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
  // the oblique view stands beside the camera body, on its left, and looks through the lens array at
  // the scene: light then travels left to right (object, lens array, sensor) as in the diagram beside
  // the robot, and objects at different depths stand apart instead of lining up behind one another
  const eObl = small ? [-2.0 + ox, 1.2 + oy, 4.6] : [-2.6 + ox, 1.35 + oy, 3.9];
  // on phones the dialogue covers more of the stage, so the side view aims lower to lift the scene
  const tObl = [0, small ? -0.5 : -0.1, -0.9];
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
// spots for a plane's name, as (x, y) on the plane from -1 to 1: along the top edge from the right
// corner, then along the bottom edge; a name at or right of the middle ends at its spot, others start there
const SPOT_X = [1, 0.5, 0, -0.5, -1], SPOTS = [...SPOT_X.map((x) => [x, 1]), ...SPOT_X.map((x) => [x, -1])], robotEl = q('.robot');
let spotK = 0, recK = 0;
const tags = { obj: q('[data-tag=obj]'), lens: q('[data-tag=lens]'), sen: q('[data-tag=sen]'), rec: q('[data-tag=rec]') };
const recLabel = tags.rec.textContent;
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
  const vs = viewSel();
  if (hasImage) {
    // while the layers stand in 3D, near points hide far ones (depth test); once views overlap for
    // reconstruction, they are averaged in a float buffer instead
    const averaging = floatOK && (st.C > 0.001 || st.V > 0.001);
    if (averaging) { gl.bindFramebuffer(gl.FRAMEBUFFER, acc); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
    else { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); }
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depTex); gl.uniform1i(P.u.uDep, 1); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(P.u.uReal, scene.real ? 1 : 0); gl.uniform1f(P.u.uDepV, scene.perView ? 1 : 0);
    gl.uniform1f(P.u.uSky, scene.sky ? 1 : 0); gl.uniform1f(P.u.uGrow, scene.grow || 1);
    gl.uniform1f(P.u.uDlo, scene.lo || 0); gl.uniform1f(P.u.uDhi, scene.hi || 0);
    gl.uniform1f(P.u.uZa, scene.za); gl.uniform1f(P.u.uZb, scene.zb);
    gl.uniformMatrix4fv(P.u.uVP, false, VP);
    gl.uniform1fv(P.u.uK, K);
    gl.uniform1f(P.u.uNL, NL); gl.uniform1f(P.u.uNP, NP);
    gl.uniform1f(P.u.uW, W); gl.uniform1f(P.u.uZs, ZS);
    gl.uniform1f(P.u.uA, st.A); gl.uniform1f(P.u.uB, st.B); gl.uniform1f(P.u.uC, st.C); gl.uniform1f(P.u.uD, st.D);
    gl.uniform1f(P.u.uPx, ch); gl.uniform1f(P.u.uP11, P11);
    gl.uniform1f(P.u.uVw, st.V); gl.uniform2f(P.u.uVs, vs[0], vs[1]); gl.uniform1f(P.u.uAvg, averaging ? 1 : 0);
    gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.POINTS, 0, COUNT);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (averaging) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(Q.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accTex); gl.uniform1i(Q.u.uAcc, 0);
      gl.uniform1f(Q.u.uOp, 1 - easeIO(st.Lay));
      gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }
    if (st.Lay > 0.001 && layTex) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(Y.p); gl.uniformMatrix4fv(Y.u.uVP, false, VP);
      gl.uniform1f(Y.u.uW, W); gl.uniform1f(Y.u.uZa, scene.za); gl.uniform1f(Y.u.uZb, scene.zb);
      gl.uniform1f(Y.u.uK0, LYTRO.k0); gl.uniform1f(Y.u.uK1, LYTRO.k1); gl.uniform1f(Y.u.uN, LAYERS);
      gl.uniform1f(Y.u.uNL, NL); gl.uniform1f(Y.u.uCols, LAYER_COLS); gl.uniform1f(Y.u.uFade, easeIO(st.Lay)); gl.uniform1f(Y.u.uDsel, st.D);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, layTex); gl.uniform1i(Y.u.uLay, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, layATex); gl.uniform1i(Y.u.uLayA, 1); gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(emptyVAO); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, LAYERS);
      gl.disable(gl.BLEND);
    }
  }
  const fade = 1 - easeIO(st.cam), rc = hasImage ? easeIO(Math.min(1, st.C * 1.5)) : 0, zRec = scene.za + scene.zb * st.D;
  gl.useProgram(LN.p); gl.uniformMatrix4fv(LN.u.uVP, false, VP); gl.uniform1f(LN.u.uZ, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(lineVAO);
  // the lens grid steps back while the reconstruction plane is shown through it
  if (fade > 0.01) { gl.uniform4f(LN.u.uCol, 0.79, 0.64, 0.36, 0.42 * fade * (1 - 0.75 * rc)); gl.drawArrays(gl.LINES, 0, gridCount); }
  gl.uniform4f(LN.u.uCol, 0.79, 0.64, 0.36, 0.28 + 0.3 * fade);
  gl.drawArrays(gl.LINES, gridCount, 8);
  if (rc > 0.01) {
    // the same square outline, moved to the reconstruction plane
    gl.uniform1f(LN.u.uZ, zRec - ZS); gl.uniform4f(LN.u.uCol, 0.89, 0.77, 0.5, 0.8 * rc);
    gl.drawArrays(gl.LINES, gridCount, 8);
  }
  if (st.icons > 0.01 && hasImage) {
    gl.bindVertexArray(iconVAO); gl.uniform1f(LN.u.uZ, 0);
    gl.uniform4f(LN.u.uCol, 0.99, 0.9, 0.62, 0.85 * st.icons); gl.drawArrays(gl.LINES, 0, iconCount);
  }
  gl.disable(gl.BLEND); gl.bindVertexArray(null);
  const sw = stage.clientWidth, shh = stage.clientHeight;
  showViewMap(vs);
  // the names of the object, lens array and sensor planes share one spot on their planes' top (or else
  // bottom) edges, so from left to right they read in the order the light travels. The spot is the first
  // where no name hides behind the robot, the ray diagram or the dialogue box or overlaps another name
  // (which spot is free depends on the screen width); it is kept while it stays clear, so names do not jump
  const sr = stage.getBoundingClientRect();
  const boxes = [robotEl, raybox, lfzoom, laynote, dialogEl].filter((el) => el && !el.hidden).map((el) => {
    const r = el.getBoundingClientRect(); return [r.left - sr.left, r.top - sr.top, r.right - sr.left, r.bottom - sr.top];
  });
  const hit = (r, list) => list.some((b) => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]);
  const at = (el, z, k) => {
    const [cx, cy] = SPOTS[k], s = project([cx * h, cy * h, z], sw, shh), w = el.offsetWidth, hh = el.offsetHeight;
    const x0 = cx >= 0 ? s[0] - w : s[0], y0 = cy > 0 ? s[1] - 6 - hh : s[1] + 6;
    return { el, s, k, r: [x0, y0, x0 + w, y0 + hh] };
  };
  const put = (p, o) => {
    const [cx, cy] = SPOTS[p.k];
    p.el.style.transform = `translate(${p.s[0]}px, ${p.s[1] + (cy > 0 ? -6 : 6)}px) translate(${cx >= 0 ? '-100%' : '0'}, ${cy > 0 ? '-100%' : '0'})`;
    p.el.style.opacity = o.toFixed(2);
  };
  const group = [...(scene.kind === 'lytro' ? [] : [[tags.obj, scene.za + scene.zb * scene.targets[0].d]]), [tags.lens, 0], [tags.sen, ZS]];
  if (scene.kind === 'lytro') tags.obj.style.opacity = '0';
  if (fade > 0.01 && tags.lens.offsetWidth) {
    let best = null;
    for (const k of [spotK, ...SPOTS.keys()]) {
      const ps = group.map(([el, z]) => at(el, z, k)), done = [];
      let bad = 0;
      for (const p of ps) { if (hit(p.r, boxes) || hit(p.r, done)) bad++; done.push(p.r); }
      if (!best || bad < best.bad) best = { k, ps, bad };
      if (!bad) break;
    }
    // where no spot is clear for all three (narrow screens), a name that would hide behind a box or
    // another name is left out rather than drawn half covered
    spotK = best.k;
    const shown = [];
    best.ps.forEach((p, i) => {
      const ok = !hit(p.r, boxes) && !hit(p.r, shown);
      if (ok) shown.push(p.r);
      put(p, ok ? (p.el === tags.obj ? fade * (1 - rc) : fade) : 0);
    });
  } else group.forEach(([el]) => { el.style.opacity = '0'; });
  if (fade * rc > 0.01 && tags.rec.offsetWidth) {
    let p = null;
    for (const k of [recK, ...SPOTS.keys()]) { p = at(tags.rec, zRec, k); if (!hit(p.r, boxes)) break; }
    recK = p.k; put(p, hit(p.r, boxes) ? 0 : fade * rc);
  } else tags.rec.style.opacity = '0';
  if (cta && !cta.hidden) {
    // the link to the paper page sits just above the dialogue box, whatever its height
    const b = Math.round(shh - dialogEl.offsetTop + 10);
    if (b !== ctaBottom) { ctaBottom = b; cta.style.bottom = b + 'px'; }
  }
  Face.frame(now);
}
/* which view step 2 shows: it starts at view HI and circles the centre; after the step is over
   the pointer chooses (left-right and up-down over the stage) */
const HI = [6, 3], VC = (NP - 1) / 2;
let viewDrive = false;
const vsNow = [HI[0], HI[1]];
function viewSel() {
  let tx, ty;
  if (viewDrive && ptr.inside) {
    tx = VC + Math.max(-1, Math.min(1, ptr.tx * 1.15)) * VC; ty = VC - Math.max(-1, Math.min(1, ptr.ty * 1.15)) * VC;
  } else {
    const a0 = Math.atan2(HI[1] - VC, HI[0] - VC), r = Math.hypot(HI[0] - VC, HI[1] - VC), a = a0 + st.vt * Math.PI * 2;
    tx = VC + r * Math.cos(a); ty = VC + r * Math.sin(a);
  }
  vsNow[0] += (tx - vsNow[0]) * (viewDrive ? 0.25 : 1); vsNow[1] += (ty - vsNow[1]) * (viewDrive ? 0.25 : 1);
  return vsNow;
}
const vmap = q('.vmap'), vcells = [];
if (vmap) for (let i = 0; i < NP * NP; i++) vcells.push(vmap.appendChild(document.createElement('i')));
let vmapOn = -2;
function showViewMap(vs) {
  if (!vmap) return;
  const on = st.V > 0.5 && st.C < 0.3 ? Math.round(vs[1]) * NP + Math.round(vs[0]) : -1;
  if (on === vmapOn) return;
  if (vmapOn >= 0) vcells[vmapOn].className = '';
  if (on >= 0) vcells[on].className = 'on';
  vmap.hidden = on < 0; vmapOn = on;
}
let running = false, visible = true, raf = 0, still = false;
function loop(now) { raf = 0; draw(now); if (running && visible && !document.hidden) raf = requestAnimationFrame(loop); }
function request() { if (!raf) raf = requestAnimationFrame(loop); }
function start() { if (reduce || still) { request(); return; } running = true; request(); }
// the dialogue box's height sets the camera framing and the link above it, so a longer line redraws
const resized = new ResizeObserver(() => request()); resized.observe(stage); resized.observe(dialogEl);
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
  monkey: { ko: '원숭이 머리', jp: 'サルの頭', en: 'monkey head' },
  torus: { ko: '원환체', jp: 'ドーナツ', en: 'torus' },
  cube: { ko: '정육면체', jp: '立方体', en: 'cube' },
  cone: { ko: '원뿔', jp: '円すい', en: 'cone' },
  sphere: { ko: '구', jp: '球', en: 'sphere' },
  bg: { ko: '배경', jp: '背景', en: 'background' },
  subject: { ko: '주인공', jp: '主役', en: 'subject' },
  card: { ko: '이미지', jp: '画像', en: 'image' },
  bush: { ko: '앞쪽 나뭇가지', jp: '手前の枝', en: 'branch in front' },
  stop: { ko: '정지 표지판', jp: '止まれの標識', en: 'stop sign' },
  building: { ko: '차와 건물', jp: '車と建物', en: 'cars and building' }
};
/* a scene says where focus can go: targets (depth d, name) from near to far, the slider range, and
   how a depth maps to a distance in front of the lens array (z = za + zb * d) */
function synthScene(names, used, point) {
  return { kind: 'synth', real: false, nl: NL_SIM, targets: used.map((k) => ({ d: K[k] / NP, name: names[k] })),
    dMin: 0, dMax: K[3] / NP * 1.1, za: 0, zb: -NP * ZS, tol: 0.05, point: point || [0.5, 0.5] };
}
/* Lytro sample (Stanford Lytro Light Field Archive, occlusions_26). The archive's decoded lenslet image
   has 541 x 376 lenses with 14 x 14 pixels under each; 128 x 128 lenses are cut from it without
   resampling and the central 8 x 8 pixels of each are used (phones: 2 x 2 lenses averaged). There is no
   3D shape, so nothing is placed in space: the capture starts on the sensor. d: shift per view step
   (lens units) of the three focus stops, where the 64 views agree best over the branch, the sign and the
   cars behind. Layers: the planes of the plane sweep (k0 ... k1) drawn as the estimated depth layers;
   depth along the stack is this shift (disparity), not metres. */
const LYTRO = { 128: { d: [-0.5, 0.2, 0.6], k0: -1.2, k1: 1.2 }, 64: { d: [-0.2, 0.1, 0.3], k0: -0.6, k1: 0.6 } }[NL_REAL];
const LAYERS = 25, LAYER_COLS = 5;
const layerD = (k) => LYTRO.k0 + (LYTRO.k1 - LYTRO.k0) * k / (LAYERS - 1);
function lytroScene() {
  const d = LYTRO.d, names = [NAMES.bush, NAMES.stop, NAMES.building], span = d[2] - d[0];
  const zNear = -K[0] * ZS, zFar = -K[2] * ZS, zb = (zFar - zNear) / span;
  return { kind: 'lytro', real: true, nl: NL_REAL, targets: d.map((x, i) => ({ d: x, name: names[i] })),
    dMin: LYTRO.k0, dMax: LYTRO.k1, za: zNear - zb * d[0], zb, tol: span * 0.06, point: [0.5, 0.5] };
}
/* Blender sample: the ICCAS 2026 scene rendered from 8 x 8 cameras (the paper's script), with a depth
   pass for every view. A camera array shifts near objects most; each view was shifted to line the
   views up on a plane 0.28 m away, just in front of the monkey (as when refocusing there), and then
   each object's dk is positive and grows with distance, as for a lens array: z = -NP * ZS * dk holds
   exactly, so the light cone drawn from the point lands where its pixels are. At 64 lenses. */
const BLENDER = { lo: 0.3552, hi: 1.2, d: [0.3747, 0.7553, 0.9327, 1.0354, 1.0974], point: [0.768, 0.373], pointD: 0.3579 };
function blenderScene() {
  const names = [NAMES.monkey, NAMES.torus, NAMES.cube, NAMES.cone, NAMES.sphere];
  return { kind: 'blender', real: true, perView: true, nl: 64, targets: BLENDER.d.map((x, i) => ({ d: x, name: names[i] })),
    sky: true, grow: 1.6, walk: [0, 1, 3], dMin: 0.3, dMax: 1.2, za: 0, zb: -NP * ZS, tol: 0.025, lo: BLENDER.lo, hi: BLENDER.hi,
    point: BLENDER.point, pointD: BLENDER.pointD };
}
let scene = blenderScene();

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
  return scene.targets.findIndex((t) => Math.abs(st.D - t.d) < scene.tol);
}
function setDepthUI(enabled) {
  const pct = Math.round((st.D - scene.dMin) / (scene.dMax - scene.dMin) * 100), k = focusedLayer();
  depth.disabled = !enabled; depth.value = String(pct);
  const name = k >= 0 ? scene.targets[k].name[lang] : '';
  depthOut.textContent = enabled ? (k >= 0 ? focusLabel(name) : pct + '%') : '–';
  depth.setAttribute('aria-valuetext', k >= 0 ? focusLabel(name) : `${pct}%`);
  tags.rec.textContent = k >= 0 ? `${recLabel} · ${name}` : recLabel;
}
/* while reconstructing, the camera stands partway between the side view and the frontal one,
   so the plane can be seen moving into the depth of the scene */
const CAM_REC = 0.3;
const cta = q('.lab-cta');
let ctaBottom = -1;
function finish() { root.classList.add('played'); if (cta) cta.hidden = false; }
function unfinish() { root.classList.remove('played'); if (cta) cta.hidden = true; }
const stepBtns = [...root.querySelectorAll('[data-step]')];
function steps(n) { stepBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.step) === n))); }
/* the panel beside the introduction: three tiny cameras and the pictures they take */
const raybox = q('.raybox');
/* step 1 of the real capture: the whole photo (each lens's central 8 x 8 averaged), then the 128 x 128
   lenses used, then the decoded lenslet image itself at 14 pixels per lens, with one lens's central
   8 x 8 outlined: those are the 8 x 8 views */
const lfzoom = q('.lfzoom'), lfc = lfzoom && lfzoom.querySelector('canvas');
const LFZ = { all: [541, 376], crop: [88, 60, 128], zoom: [88 + 26, 60 + 34, 32, 24] };
let lfImgs = null, lfRaf = 0;
function lfDraw(t) {
  const g = lfc.getContext('2d'), Wc = lfc.width, Hc = lfc.height, asp = Wc / Hc;
  const [zx, zy, zw, zh] = LFZ.zoom, [cx0, cy0, cn] = LFZ.crop;
  const fit = (x, y, w, h) => { const ww = Math.max(w, h * asp); return [x + w / 2 - ww / 2, y + h / 2 - ww / asp / 2, ww]; };
  // the lens outlined at the end (one whose small image shows an edge of the sign letters behind the
  // branch), and a view about ten lenses wide around it
  const lx = zx + 9, ly = zy + 15, R2 = [lx + .5 - 5, ly + .5 - 5 / asp, 10];
  const R0 = fit(0, 0, LFZ.all[0], LFZ.all[1]), R1 = fit(cx0, cy0, cn, cn);
  const e = (a, b, k) => a.map((v, i) => v + (b[i] - v) * easeIO(Math.min(1, Math.max(0, k))));
  const R = t < .45 ? e(R0, R1, (t - .1) / .3) : e(R1, R2, (t - .5) / .3);
  const [x, y, w] = R, h = w / asp, s = Wc / w;
  g.fillStyle = '#0e1013'; g.fillRect(0, 0, Wc, Hc);
  g.imageSmoothingEnabled = true; g.drawImage(lfImgs.photo, x, y, w, h, 0, 0, Wc, Hc);
  // the decoded lenslet image takes over once single lenses are a few pixels wide
  const k = Math.min(1, Math.max(0, (70 - w) / 30));
  if (k > 0) {
    g.globalAlpha = k; g.imageSmoothingEnabled = false;
    g.drawImage(lfImgs.zoom, 0, 0, zw * 14, zh * 14, (zx - x) * s, (zy - y) * s, zw * s, zh * s);
    g.globalAlpha = 1;
  }
  g.lineWidth = 2; g.strokeStyle = '#e3c27f';
  if (w > 150) g.strokeRect((cx0 - x) * s, (cy0 - y) * s, cn * s, cn * s);
  else if (w > 16) g.strokeRect((R2[0] - x) * s, (R2[1] - y) * s, 10 * s, 10 / asp * s);
  if (t > .85) {
    // one lens: its 14 x 14 pixels, and the central 8 x 8 that are used
    const a = Math.min(1, (t - .85) / .08);
    g.globalAlpha = a; g.lineWidth = 1.5; g.strokeStyle = '#ece8df';
    g.strokeRect((lx - x) * s, (ly - y) * s, s, s);
    g.strokeStyle = '#e3c27f'; g.lineWidth = 2;
    g.strokeRect((lx - x + 3 / 14) * s, (ly - y + 3 / 14) * s, 8 / 14 * s, 8 / 14 * s);
    g.globalAlpha = 1;
  }
}
function lfZoom(on) {
  if (!lfzoom) return;
  cancelAnimationFrame(lfRaf);
  lfzoom.hidden = !(on && lfImgs);
  if (lfzoom.hidden) return;
  const t0 = performance.now(), dur = 6800;
  const frame = (now) => {
    const t = reduce ? 1 : Math.min(1, (now - t0) / dur);
    lfDraw(t);
    if (t < 1 && !lfzoom.hidden) lfRaf = requestAnimationFrame(frame);
  };
  lfRaf = requestAnimationFrame(frame);
}
/* step 3 of the real capture: the estimated depth layers, switched on by the visitor */
const layBtn = q('[data-layers-btn]'), laynote = q('[data-laynote]');
function layersOff() {
  st.Lay = 0;
  if (layBtn) layBtn.setAttribute('aria-pressed', 'false');
  if (laynote) laynote.hidden = true;
}
if (layBtn) layBtn.addEventListener('click', async () => {
  Snd.ui(); const my = ++token, on = layBtn.getAttribute('aria-pressed') !== 'true';
  layBtn.setAttribute('aria-pressed', String(on)); laynote.hidden = !on;
  lfZoom(false); viewDrive = false; st.A = 1; st.B = 1; st.V = 0;
  if (st.C < 1) { steps(3); await tween('C', 1, 900, my); if (my !== token) return; }
  setDepthUI(true); finish();
  if (on) say('lay');
  await Promise.all([tween('Lay', on ? 1 : 0, 1300, my), tween('cam', on ? 0.02 : CAM_REC, 1300, my)]);
});
/* click-to-focus on the reconstruction of the real capture: the click is followed onto the plane in
   view, and the focus goes to the layer where the 64 views agree best in the 5 x 5 lenses around it
   (the same agreement as the depth layers); every pixel shown is still an average of captured views */
function inv4(m) {
  const a = m, o = new Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5];
  const b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12];
  const b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
  return o;
}
function unproject(m, x, y, z) {
  const v = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
  return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
}
canvas.addEventListener('click', (e) => {
  if (scene.kind !== 'lytro' || st.C < 0.99 || st.Lay > 0.5 || !layA || !VP) return;
  const r = canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = 1 - (e.clientY - r.top) / r.height * 2;
  const m = inv4(VP), p0 = unproject(m, nx, ny, -1), p1 = unproject(m, nx, ny, 1), zr = scene.za + scene.zb * st.D;
  const u = (zr - p0[2]) / (p1[2] - p0[2]), X = p0[0] + (p1[0] - p0[0]) * u, Yw = p0[1] + (p1[1] - p0[1]) * u;
  const sx = Math.floor((X / W + .5) * NL), sy = Math.floor((.5 - Yw / W) * NL);
  if (sx < 0 || sy < 0 || sx >= NL || sy >= NL) return;
  let bk = 0, bs = -1, total = 0;
  for (let k = 0; k < LAYERS; k++) {
    const ox = (k % LAYER_COLS) * NL, oy = Math.floor(k / LAYER_COLS) * NL;
    let sum = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const x = Math.min(NL - 1, Math.max(0, sx + i)), y = Math.min(NL - 1, Math.max(0, sy + j));
      sum += layA.data[((oy + y) * layA.w + ox + x) * 4];
    }
    total += sum;
    if (sum > bs) { bs = sum; bk = k; }
  }
  const my = ++token; let moving = true;
  // where the views match about equally at every depth (no texture), no plane can be chosen: say so
  if (bs < 2 * total / LAYERS) { Face.set('idle'); say('flat'); return; }
  Snd.focus(); say('pickf');
  tween('D', layerD(bk), 900, my).then(() => { moving = false; if (my === token) setDepthUI(true); });
  const tick = () => { if (moving && my === token) { setDepthUI(true); requestAnimationFrame(tick); } };
  requestAnimationFrame(tick);
});
function rayBox(on) {
  if (!raybox) return;
  raybox.classList.remove('on');
  if (on) { raybox.hidden = false; void raybox.offsetWidth; raybox.classList.add('on'); } else raybox.hidden = true;
}
async function doCapture(my) {
  steps(1); setDepthUI(false); Face.set('work'); viewDrive = false; layersOff();
  st.B = 0; st.C = 0; st.cam = 0; st.A = 0; st.V = 0; st.icons = 0;
  if (scene.kind === 'lytro') {
    // a real capture: the recorded lenslet image is the data, so it is shown on the sensor as it is and
    // zoomed into beside the robot; nothing is placed in space
    st.A = 1; request();
    say('A'); lfZoom(true);
    await tween('cam', 1, 2600, my); if (my !== token) return false;
    await wait(4600); if (my !== token) return false;
    return true;
  }
  {
    // before the capture: each lens is a tiny camera
    say('cams'); rayBox(true);
    await tween('icons', 1, 900, my); if (my !== token) return false;
    await wait(4200); if (my !== token) return false;
  }
  say('A');
  await wait(300); if (my !== token) return false;
  Snd.shutter(); Snd.motor(3.2);
  rayBox(false);
  await Promise.all([tween('A', 1, 3200, my), tween('icons', 0, 1600, my)]); if (my !== token) return false;
  await tween('cam', 1, 1200, my); return my === token;
}
async function doRim(my) {
  steps(2); setDepthUI(false); Face.set('work'); say('B'); viewDrive = false; rayBox(false); lfZoom(false); layersOff();
  st.A = 1; st.cam = 1; st.C = 0; st.B = 0; st.V = 0; st.vt = 0; st.icons = 0;
  await wait(600); if (my !== token) return false;
  Snd.ticks(16, 2.6); Snd.motor(2.8);
  await tween('B', 1, 2800, my); if (my !== token) return false;
  // one view fills the sensor, then the view travels around: near and far objects shift differently
  say('views');
  await tween('V', 1, 1000, my); if (my !== token) return false;
  await tween('vt', 1, 3400, my); if (my !== token) return false;
  viewDrive = true; return true;
}
async function doRecon(my) {
  steps(3); Face.set('work'); say('C'); viewDrive = false; rayBox(false); lfZoom(false); layersOff();
  st.A = 1; st.B = 1; st.D = 0; st.C = 0; st.cam = 1; st.icons = 0;
  await wait(250); if (my !== token) return false;
  Snd.motor(2.0);
  // the views leave the sensor for the reconstruction plane while the camera steps back to show the depth
  await Promise.all([tween('C', 1, 1800, my), tween('cam', CAM_REC, 1800, my)]); if (my !== token) return false;
  await wait(400); if (my !== token) return false;
  // move the plane from the nearest target to the farthest one (a few of them, if there are many)
  const walk = scene.walk || scene.targets.map((_, i) => i);
  for (let i = 0; i < walk.length; i++) {
    const t = scene.targets[walk[i]];
    await tween('D', t.d, 1100, my); if (my !== token) return false;
    Snd.focus(); setDepthUI(true);
    // the last stop is "the farthest" only when nothing stands behind it
    const line = i === 0 ? FOCUS[0] : i < walk.length - 1 ? FOCUS[1] : walk[i] === scene.targets.length - 1 ? FOCUS[2] : FOCUS[3];
    await new Promise((r) => sayLine(line(t.name), r)); if (my !== token) return false;
    await wait(500); if (my !== token) return false;
  }
  await tween('D', scene.targets[0].d, 1000, my); if (my !== token) return false;
  setDepthUI(true); Face.set('happy'); finish();
  say('done', () => { if (my === token) setTimeout(() => { if (my === token) say('idle'); }, 2600); });
  return true;
}
async function playAll(my) {
  unfinish();
  if (!(await doCapture(my))) return;
  await wait(300); if (my !== token) return;
  if (!(await doRim(my))) return;
  await wait(300); if (my !== token) return;
  await doRecon(my);
}
function jumpToEnd() { lfZoom(false); layersOff(); st.A = 1; st.cam = CAM_REC; st.B = 1; st.C = 1; st.D = scene.targets[0].d; setDepthUI(true); steps(3); Face.set('happy'); finish(); say('done'); request(); }
stepBtns.forEach((b) => b.addEventListener('click', () => {
  Snd.ui(); const my = ++token; const n = Number(b.dataset.step);
  if (n === 1) doCapture(my); else if (n === 2) doRim(my); else doRecon(my);
}));
q('[data-reverse]').addEventListener('click', async () => {
  Snd.ui(); const my = ++token; lfZoom(false); layersOff();
  if (st.B === 0 && st.C === 0) { st.A = 1; st.cam = 1; st.B = 1; }
  setDepthUI(false); steps(2); Face.set('work'); say('rev');
  Snd.motor(st.C > 0 ? 4 : 2.6);
  viewDrive = false;
  if (st.C > 0 || st.V > 0) { await Promise.all([tween('C', 0, 1400, my), tween('V', 0, 1400, my), tween('cam', 1, 1400, my)]); if (my !== token) return; }
  await tween('B', 0, 2600, my); if (my === token) Face.set('idle');
});
depth.addEventListener('input', () => {
  token++; st.A = 1; st.B = 1; st.C = 1; if (st.Lay < 0.5) st.cam = CAM_REC;
  const before = focusedLayer();
  st.D = scene.dMin + (scene.dMax - scene.dMin) * Number(depth.value) / 100;
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
  const alpha = new Uint8ClampedArray(N); let cover = 0, mx = 0, my = 0;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(px[i * 4] - r, px[i * 4 + 1] - gg, px[i * 4 + 2] - b);
    const a = Math.max(0, Math.min(1, (d - 38) / 30));
    alpha[i] = a * 255; if (a > 0.5) { cover++; mx += i % CELL; my += Math.floor(i / CELL); }
  }
  const centre = cover ? [mx / cover / CELL, my / cover / CELL] : [0.5, 0.5];
  cover /= N;
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = CELL * 2;
  const ag = atlas.getContext('2d');
  if (cover < 0.04 || cover > 0.8) {
    ag.drawImage(w, CELL, 0);
    return { atlas, scene: synthScene([NAMES.bg, NAMES.card, NAMES.bg, NAMES.bg], [1]), line: 'load1' };
  }
  const sub = new ImageData(CELL, CELL), back = new ImageData(CELL, CELL);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    sub.data[o] = px[o]; sub.data[o + 1] = px[o + 1]; sub.data[o + 2] = px[o + 2]; sub.data[o + 3] = alpha[i];
    const keep = alpha[i] < 50;
    back.data[o] = keep ? px[o] : r; back.data[o + 1] = keep ? px[o + 1] : gg; back.data[o + 2] = keep ? px[o + 2] : b; back.data[o + 3] = 255;
  }
  ag.putImageData(sub, 0, 0); ag.putImageData(back, CELL, CELL);
  return { atlas, scene: synthScene([NAMES.subject, NAMES.bg, NAMES.bg, NAMES.bg], [0, 3], centre), line: 'load2' };
}
/* before the first click the scene is alive but the story waits, so it can start with its sound */
let waiting = false, waitTimer = 0;
function endWait() { waiting = false; clearTimeout(waitTimer); stage.classList.remove('waiting'); }
function opening(my) {
  say('greet', () => { if (my === token) setTimeout(() => { if (my === token) playAll(my); }, 400); });
}
function useLayers(info, mode) {
  scene = info.scene; setNL(scene.nl); buildIcons();
  uploadAtlas(info.atlas);
  if (credit) credit.hidden = scene.kind !== 'lytro';
  // the real capture has no 3D shape: its samples start on the sensor
  st.A = scene.kind === 'lytro' ? 1 : 0; st.B = 0; st.C = 0; st.cam = 0; st.D = 0; st.icons = 0; st.V = 0; st.vt = 0; viewDrive = false; rayBox(false);
  lfZoom(false); layersOff(); if (layBtn) layBtn.hidden = scene.kind !== 'lytro';
  setDepthUI(false); steps(0);
  if (mode === 'still') return;
  if (mode === 'wait' && !waiting) mode = 'opening'; // the click came while the scene was loading
  if (mode !== 'wait') endWait();
  const my = ++token;
  if (reduce) { jumpToEnd(); return; }
  if (mode === 'wait') { Face.set('idle'); say('tap'); return; }
  if (mode === 'opening') { opening(my); return; }
  sayLine(L[info.line] || L.load2, () => { if (my === token) playAll(my); });
}
const credit = q('[data-credit]');
function loadLightField(viewsURL, depURL, make, line, mode) {
  // the view mosaic and its depth map are both needed before the scene can stand
  const views = new Image(), dep = new Image(); let n = 0;
  const ready = () => {
    if (++n < 2) return;
    gl.bindTexture(gl.TEXTURE_2D, depTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);   // values, not colours
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, dep);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    useLayers({ atlas: views, scene: make(), line }, mode);
  };
  views.onload = ready; dep.onload = ready;
  views.src = viewsURL; dep.src = depURL;
}
const loadScene = (mode) => loadLightField('/img/lab-blender-views.webp', '/img/lab-blender-depth.png', blenderScene, 'scene', mode);
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
let layTex = null, layATex = null, layA = null;
function dataTexture(img) {
  // texels read one by one, as values
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
  return t;
}
function loadLytro(mode) {
  const files = [`lytro-views-${NL_REAL}.webp`, 'lytro-photo.webp', 'lytro-eslf-zoom.webp', `lytro-layers-${NL_REAL}.webp`, `lytro-layers-a-${NL_REAL}.png`];
  Promise.all(files.map((f) => loadImg('/img/' + f))).then(([views, photo, zoom, lay, layAimg]) => {
    lfImgs = { photo, zoom };
    if (!layTex) { layTex = dataTexture(lay); layATex = dataTexture(layAimg); }
    // the agreement weights are also read here, for click-to-focus
    const c = document.createElement('canvas'); c.width = layAimg.width; c.height = layAimg.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(layAimg, 0, 0);
    layA = { w: c.width, data: g.getImageData(0, 0, c.width, c.height).data };
    useLayers({ atlas: views, scene: lytroScene(), line: 'lytro' }, mode);
  }).catch(() => { Face.set('idle'); say('bad'); });
}
const sampleBtns = [...root.querySelectorAll('[data-sample-btn]')];
function pick(which) { sampleBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sampleBtn === which))); }
sampleBtns.forEach((b) => b.addEventListener('click', () => {
  Snd.ui(); pick(b.dataset.sampleBtn);
  if (b.dataset.sampleBtn === 'lytro') loadLytro('load'); else loadScene('load');
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
/* Browsers only allow audio after the visitor's first click, tap or key press. So, like the
   reference site, the robot first asks for a click and the story waits for it; the first gesture
   anywhere on the page starts the music and the story together. If the browser already allows
   sound, the story starts at once; if nobody clicks within a few seconds, it starts silently and
   the sound joins at the first click. A visitor who turns the sound off is remembered on this device. */
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
function beginStory() {
  if (!waiting || still) return;
  endWait(); opening(++token);
}
const GESTURES = ['pointerdown', 'keydown', 'touchend'];
function firstGesture(e) {
  if (e.target && e.target.closest && e.target.closest('[data-sound]')) return;
  GESTURES.forEach((t) => window.removeEventListener(t, firstGesture, true));
  startSound(); beginStory();
}
GESTURES.forEach((t) => window.addEventListener(t, firstGesture, true));
soundBtn.addEventListener('click', () => {
  wantSound = !wantSound;
  try { localStorage.setItem('lab-sound', wantSound ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
  if (wantSound) startSound(); else Snd.disable();
  soundUI(); beginStory();
});
soundUI();
/* moving content can be stopped (WCAG 2.2.2): the story stops and the scene stands still; steps and
   sliders still work, and the motion comes back on request */
const motionBtn = q('[data-motion]');
const motionText = { ko: ['움직임 멈춤', '움직임 다시 시작'], en: ['Pause motion', 'Resume motion'] }[lang];
if (motionBtn) motionBtn.addEventListener('click', () => {
  Snd.ui(); still = !still;
  motionBtn.setAttribute('aria-pressed', String(still)); motionBtn.textContent = motionText[still ? 1 : 0];
  if (still) { token++; running = false; lfZoom(false); Face.set('idle'); request(); } else start();
});

/* the Blender sample scene stands in front of the lens array */
setDepthUI(false);
start();
if (reduce) loadScene('still');
else if (wantSound && !Snd.autoplayOK()) {
  waiting = true; stage.classList.add('waiting');
  waitTimer = setTimeout(beginStory, 10000);
  loadScene('wait');
} else { startSound(); loadScene('opening'); }
})();
