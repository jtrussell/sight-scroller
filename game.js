'use strict';

/* ================= helpers ================= */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  },
};

/* ================= music data ================= */

const LETTERS = 'CDEFGAB';
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// "E4" -> diatonic index (one step per line/space)
const dia = n => parseInt(n.slice(-1), 10) * 7 + LETTERS.indexOf(n[0]);
const diaToName = d => LETTERS[d % 7] + Math.floor(d / 7);
const freq = n => 440 * Math.pow(2, (12 * (parseInt(n.slice(-1), 10) + 1) + SEMITONES[n[0]] - 69) / 12);

const CLEFS = {
  treble: {
    glyph: '\u{1D11E}',       // 𝄞
    low: 'C4', high: 'C6',    // selectable range (with ledger lines)
    defLow: 'E4', defHigh: 'F5', // default pool: the staff itself
    bottomLine: dia('E4'),
    glyphSize: 5.4,           // in staff-line gaps
    glyphCenter: 2,           // staff steps above... center on middle of staff
  },
  bass: {
    glyph: '\u{1D122}',       // 𝄢
    low: 'E2', high: 'E4',
    defLow: 'G2', defHigh: 'A3',
    bottomLine: dia('G2'),
    glyphSize: 3.6,
    glyphCenter: 2.4,
  },
};

function noteList(clef) {
  const c = CLEFS[clef];
  const out = [];
  for (let d = dia(c.low); d <= dia(c.high); d++) out.push(diaToName(d));
  return out;
}

function defaultPool(clef) {
  const c = CLEFS[clef];
  const out = [];
  for (let d = dia(c.defLow); d <= dia(c.defHigh); d++) out.push(diaToName(d));
  return out;
}

// human label for the settings grid, e.g. "E4 — line 1", "C4 — below staff"
function posLabel(clef, name) {
  const step = dia(name) - CLEFS[clef].bottomLine;
  if (step < 0) return 'below staff';
  if (step > 8) return 'above staff';
  return step % 2 === 0 ? `line ${step / 2 + 1}` : `space ${(step + 1) / 2}`;
}

/* ================= settings ================= */

const SETTINGS_KEY = 'ss.settings';

function normalizeSettings(s) {
  const out = {
    clef: s && s.clef === 'bass' ? 'bass' : 'treble',
    sound: !s || s.sound !== false,
    spacing: clamp(Number(s && s.spacing) || 340, 220, 560),
    pools: { treble: defaultPool('treble'), bass: defaultPool('bass') },
  };
  if (s && s.pools) {
    for (const clef of ['treble', 'bass']) {
      const valid = new Set(noteList(clef));
      const pool = Array.isArray(s.pools[clef]) ? s.pools[clef].filter(n => valid.has(n)) : [];
      if (pool.length >= 2) out.pools[clef] = pool;
    }
  }
  return out;
}

let settings = normalizeSettings(store.get(SETTINGS_KEY, null));
const saveSettings = () => store.set(SETTINGS_KEY, settings);

/* ================= audio ================= */

let audioCtx = null;
function ac() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(f, dur = 0.2, delay = 0, type = 'square', vol = 0.1, slideTo = 0) {
  if (!settings.sound) return;
  const ctx = ac();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const sfx = {
  correct: note => tone(freq(note), 0.35, 0, 'square', 0.12),
  death: () => { tone(220, 0.5, 0, 'sawtooth', 0.12, 55); },
  heart: () => { tone(660, 0.08); tone(990, 0.14, 0.09); },
  speedUp: () => { tone(440, 0.07); tone(550, 0.07, 0.08); tone(660, 0.12, 0.16); },
  fanfare: () => { tone(523, 0.09); tone(659, 0.09, 0.09); tone(784, 0.09, 0.18); tone(1047, 0.25, 0.27); },
  click: () => tone(880, 0.04, 0, 'square', 0.05),
};

/* ================= sprites & themes ================= */

const THEMES = {
  light: { ink: '#111', paper: '#fff' },
  dark:  { ink: '#fff', paper: '#111' },
};

function buildSprite(rows, ink, paper, scale = 2) {
  const w = rows[0].length, h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const c = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      c.fillStyle = ch === 'o' ? paper : ink;
      c.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

const HEAD = [
  '....####....',
  '....#o##....',
  '....####....',
  '.....##.....',
];

const MAPS = {};

MAPS.RUN_A = [...HEAD,
  '..########..',
  '.#..####..#.',
  '.#..####..#.',
  '....####....',
  '....####....',
  '.....##.....',
  '....#..#....',
  '...##..##...',
  '...#....##..',
  '..##.....#..',
  '..#......##.',
  '.##.........',
];

MAPS.RUN_B = [...HEAD,
  '..########..',
  '.#..####..#.',
  '.#..####..#.',
  '....####....',
  '....####....',
  '.....##.....',
  '....#..#....',
  '....#..#....',
  '...##..##...',
  '...#....#...',
  '...#....#...',
  '...##...##..',
];

MAPS.JUMP = [...HEAD,
  '..########..',
  '#...####...#',
  '#...####...#',
  '....####....',
  '....####....',
  '.....##.....',
  '....#..#....',
  '...##..##...',
  '...#....#...',
  '...##..##...',
  '............',
  '............',
];

MAPS.HEART = [
  '.##..##.',
  '########',
  '########',
  '.######.',
  '..####..',
  '...##...',
];

MAPS.SUN = [
  '......#......',
  '..#...#...#..',
  '...#.....#...',
  '.....###.....',
  '....#####....',
  '...#######...',
  '#..#######..#',
  '...#######...',
  '....#####....',
  '.....###.....',
  '...#.....#...',
  '..#...#...#..',
  '......#......',
];

MAPS.MOON = [
  '...####...',
  '..####....',
  '.####.....',
  '#####.....',
  '#####.....',
  '#####.....',
  '#####.....',
  '.####.....',
  '..####....',
  '...####...',
];

MAPS.UFO = [
  '......####......',
  '.....######.....',
  '..############..',
  '.#o##o##o##o###.',
  '..############..',
  '....#......#....',
];

MAPS.WEED = [
  '..#.##.#..',
  '.#.#..#.#.',
  '#..#.#..##',
  '.#.#..#.#.',
  '#..#.#..#.',
  '.#..#..#.#',
  '#.#..#.#..',
  '.#.#.#..#.',
  '#...#..#..',
  '..#..##...',
];

MAPS.SHARK = [
  '.........##.........',
  '........####.......#',
  '...##########.....##',
  '.####o########..###.',
  '###.################',
  '.#############..##..',
  '...##..####.....#...',
];

const SPRITE_SCALES = { UFO: 3, SHARK: 3 };

function makeSpriteSet(themeName) {
  const t = THEMES[themeName];
  const out = {};
  for (const key of Object.keys(MAPS)) {
    out[key] = buildSprite(MAPS[key], t.ink, t.paper, SPRITE_SCALES[key] || 2);
  }
  return out;
}

const SPRITES = { light: makeSpriteSet('light'), dark: makeSpriteSet('dark') };

// rendered theme position between light (0) and dark (1); chases G.theme each frame
let themeU = 0;
const THEME_FADE_S = 0.8;

const grayHex = v => `#${v.toString(16).padStart(2, '0').repeat(3)}`;
const ink = () => grayHex(Math.round(17 + 238 * themeU));
const paper = () => grayHex(Math.round(255 - 238 * themeU));
const S = () => SPRITES[themeU >= 0.5 ? 'dark' : 'light'];

function setTheme(t) {
  G.theme = t;
  document.body.classList.toggle('dark', t === 'dark');
}

/* ================= game constants ================= */

const CVS_W = 960, CVS_H = 360;
const RUNNER_X = 140;
const LINE_GAP = 16;
const STAFF_TOP = 190;                         // top staff line
const STAFF_BOTTOM = STAFF_TOP + 4 * LINE_GAP; // bottom staff line
const TRACK_Y = STAFF_TOP - 44;                // the track floats above the staff
const OBSTACLE_TYPES = ['spike', 'hurdle', 'ditch'];

const MODES = {
  gym:      { label: 'GYM',      lives: 3, speed: 150, accelerates: false, hearts: true },
  virtuoso: { label: 'VIRTUOSO', lives: 1, speed: 160, accelerates: true,  hearts: false },
};
const MAX_LIVES = 9;
const SPEED_STEP = 1.12;      // virtuoso: speed multiplier applied every SPEED_EVERY points
const SPEED_EVERY = 10;
const JUMP_DUR = 0.6;         // seconds
const JUMP_HEIGHT = 66;       // px
const DIE_DUR = 1.3;          // seconds

/* ================= game state ================= */

const G = {
  state: 'menu',   // menu | playing | dying | paused | gameover
  mode: null,
  score: 0,
  lives: 0,
  speed: 0,
  speedLevel: 0,
  time: 0,
  dieT: 0,
  notes: [],       // {x, name, obstacle, status: pending|correct|missed, choices, jumped}
  hearts: [],      // {x, taken}
  floats: [],      // {x, y, text, t}
  jump: null,      // {t}
  deadNote: null,
  invulnNote: null,
  activeNote: null,
  theme: 'light',
  fx: [],          // active environmental effects
  fxCountdown: 0,  // notes until the next effect
  lastFx: null,
  celebrated: false, // confetti fired for this run
  bg: null,        // current "32-bit" background scene
  bgPrev: null,    // scene fading out during a crossfade
  bgFade: 1,       // 0..1 crossfade progress
  bgCountdown: 0,  // notes until the background changes
  scrollX: 0,      // total world distance scrolled (drives parallax)
};

function staffY(name) {
  return STAFF_BOTTOM - (dia(name) - CLEFS[settings.clef].bottomLine) * (LINE_GAP / 2);
}

function makeChoices(correct) {
  const others = shuffle(LETTERS.split('').filter(l => l !== correct)).slice(0, 2);
  return shuffle([correct, ...others]);
}

function spawnNote(x) {
  const pool = settings.pools[settings.clef];
  const prev = G.notes[G.notes.length - 1];
  let name = choice(pool);
  if (pool.length > 1 && prev && name === prev.name) name = choice(pool.filter(n => n !== prev.name));
  G.notes.push({
    x,
    name,
    obstacle: choice(OBSTACLE_TYPES),
    status: 'pending',
    choices: makeChoices(name[0]),
    jumped: false,
  });
  if (MODES[G.mode].hearts && Math.random() < 0.12) {
    G.hearts.push({ x: x - settings.spacing / 2, taken: false });
  }
}

function ensureSpawns() {
  let lastX = G.notes.length ? G.notes[G.notes.length - 1].x : RUNNER_X + 200;
  while (lastX < CVS_W + settings.spacing) {
    lastX += settings.spacing + rand(-30, 30);
    spawnNote(lastX);
  }
}

function startGame(mode) {
  const m = MODES[mode];
  G.state = 'playing';
  G.mode = mode;
  G.score = 0;
  G.lives = m.lives;
  G.speed = m.speed;
  G.speedLevel = 0;
  G.time = 0;
  G.notes = [];
  G.hearts = [];
  G.floats = [];
  G.jump = null;
  G.deadNote = null;
  G.invulnNote = null;
  G.activeNote = null;
  G.fx = [];
  G.fxCountdown = 5 + Math.floor(Math.random() * 6);
  G.lastFx = null;
  G.celebrated = false;
  G.scrollX = 0;
  G.bgCountdown = 18 + Math.floor(Math.random() * 5);
  switchBackground(null); // every run starts on plain paper
  ensureSpawns();
  showOverlay(null);
  updateButtons();
}

function currentActive() {
  return G.notes.find(n => n.status === 'pending' && n.x > RUNNER_X - 10) || null;
}

function buttonsEnabled() {
  return G.state === 'playing' && !G.invulnNote && !!G.activeNote;
}

function answer(idx) {
  if (!buttonsEnabled()) return;
  ac();
  const note = G.activeNote;
  const picked = note.choices[idx];
  if (picked === undefined) return;
  if (picked === note.name[0]) {
    note.status = 'correct';
    G.score++;
    sfx.correct(note.name);
    G.floats.push({ x: note.x, y: staffY(note.name) - 36, text: '+1', t: 0 });
    if (!G.celebrated && qualifies(G.mode, G.score)) {
      G.celebrated = true;
      launchConfetti();
      G.floats.push({ x: RUNNER_X + 60, y: TRACK_Y - 70, text: 'NEW HIGH SCORE!', t: 0, life: 2.5 });
      sfx.fanfare();
    }
    checkSpeedUp();
    noteResolved();
    G.activeNote = currentActive();
    updateButtons();
  } else {
    die(note);
  }
}

function die(note) {
  note.status = 'missed';
  G.deadNote = note;
  G.lives--;
  G.state = 'dying';
  G.dieT = 0;
  sfx.death();
  noteResolved();
  updateButtons();
}

function afterDeath() {
  if (G.lives <= 0) {
    endGame();
    return;
  }
  G.state = 'playing';
  G.invulnNote = G.deadNote;
  G.deadNote = null;
  updateButtons();
}

function checkSpeedUp() {
  if (!MODES[G.mode].accelerates) return;
  const level = Math.floor(G.score / SPEED_EVERY);
  if (level > G.speedLevel) {
    G.speedLevel = level;
    G.speed = MODES[G.mode].speed * Math.pow(SPEED_STEP, level);
    G.floats.push({ x: RUNNER_X + 40, y: TRACK_Y - 60, text: 'SPEED UP!', t: 0 });
    sfx.speedUp();
  }
}

/* ================= environmental effects ================= */

const FX_TYPES = ['daynight', 'ufo', 'tumbleweed', 'rain', 'shark'];

function noteResolved() {
  if (--G.bgCountdown <= 0) {
    switchBackground(choice(BG_TYPES.filter(n => n !== (G.bg && G.bg.name))));
    G.bgCountdown = 18 + Math.floor(Math.random() * 5); // every ~20 notes
  }
  if (--G.fxCountdown > 0) return;
  if (G.fx.length) { G.fxCountdown = 1; return; } // let the current effect finish first
  startEffect();
  G.fxCountdown = 5 + Math.floor(Math.random() * 6); // next one in 5–10 notes
}

function startEffect(forced) {
  const type = forced || choice(FX_TYPES.filter(t => t !== G.lastFx));
  G.lastFx = type;
  if (type === 'daynight') {
    G.fx.push({ type, t: 0, dur: 7, to: G.theme === 'light' ? 'dark' : 'light', flipped: false });
  } else if (type === 'ufo') {
    G.fx.push({ type, t: 0, dur: 5 });
  } else if (type === 'shark') {
    G.fx.push({ type, t: 0, dur: 8 });
  } else if (type === 'tumbleweed') {
    G.fx.push({ type, t: 0, x: CVS_W + 30 });
  } else { // rain
    G.fx.push({ type, t: 0, dur: 7, drops: [] });
  }
}

function updateFx(dt) {
  for (const f of G.fx) {
    f.t += dt;
    if (f.type === 'daynight') {
      if (!f.flipped && f.t / f.dur >= 0.5) {
        f.flipped = true;
        setTheme(f.to);
      }
    } else if (f.type === 'tumbleweed') {
      f.x -= G.speed * 1.6 * dt;
    } else if (f.type === 'rain') {
      if (f.t < f.dur - 1.5) {
        for (let i = 0; i < 3; i++) f.drops.push({ x: rand(0, CVS_W + 60), y: rand(-60, -8) });
      }
      for (const d of f.drops) { d.x -= 140 * dt; d.y += 430 * dt; }
      f.drops = f.drops.filter(d => d.y < TRACK_Y - 2);
    }
  }
  G.fx = G.fx.filter(f => {
    if (f.type === 'tumbleweed') return f.x > -40;
    if (f.type === 'rain') return f.t < f.dur || f.drops.length > 0;
    return f.t < f.dur;
  });
}

// hop height along the tumbleweed's path — boosted near the runner so it bounces over them
function weedHop(x) {
  const boost = 52 * Math.exp(-((x - RUNNER_X) ** 2) / (2 * 60 * 60));
  return (24 + boost) * Math.abs(Math.sin(x / 55));
}

function drawFxSky() {
  for (const f of G.fx) {
    if (f.type === 'daynight') {
      const u = clamp(f.t / f.dur, 0, 1);
      const spr = f.to === 'dark' ? S().MOON : S().SUN;
      const x = -30 + (CVS_W + 60) * u;
      const y = 122 - 88 * Math.sin(Math.PI * u);
      ctx.drawImage(spr, x - spr.width / 2, y - spr.height / 2);
    } else if (f.type === 'ufo') {
      const u = clamp(f.t / f.dur, 0, 1);
      const x = CVS_W + 40 - (CVS_W + 80) * u;
      const y = 62 + Math.sin(f.t * 5) * 14;
      ctx.drawImage(S().UFO, x - S().UFO.width / 2, y);
    } else if (f.type === 'shark') {
      const u = clamp(f.t / f.dur, 0, 1);
      const x = CVS_W + 50 - (CVS_W + 100) * u;
      const y = 88 + Math.sin(f.t * 2.2) * 9;
      ctx.drawImage(S().SHARK, x - S().SHARK.width / 2, y);
    }
  }
}

function drawFxFront() {
  for (const f of G.fx) {
    if (f.type === 'tumbleweed') {
      const spr = S().WEED;
      ctx.save();
      ctx.translate(f.x, TRACK_Y - spr.height / 2 - weedHop(f.x));
      ctx.rotate(-f.x / 14);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
    } else if (f.type === 'rain') {
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const d of f.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 3, d.y + 9);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/* ================= "32-bit" backgrounds ================= */

const BG_TYPES = ['forest', 'city', 'space', 'underwater', 'mountains'];
const BG_BASE = 344; // ground line the scenery stands on

// muted grays that sit firmly behind the ink, in both themes
const bgTone = () => grayHex(Math.round(208 - 148 * themeU));
function bgToneFar() {
  const tone = 208 - 148 * themeU, pap = 255 - 238 * themeU;
  return grayHex(Math.round(tone + (pap - tone) * 0.45));
}

function switchBackground(name) {
  if (!name && !G.bg && !G.bgPrev) return;
  G.bgPrev = G.bg; // current scene fades out
  G.bg = name ? makeBackground(name) : null;
  G.bgFade = 0;
}

function makeBackground(name) {
  const bg = { name, tileW: 480, parallax: 0.2 };
  if (name === 'forest') {
    bg.parallax = 0.25;
    bg.trees = [];
    for (let x = 16; x < bg.tileW - 16; x += 30 + rand(0, 26)) {
      bg.trees.push({ x, h: 70 + rand(0, 85), w: 26 + rand(0, 16) });
    }
  } else if (name === 'city') {
    bg.tileW = 520;
    bg.parallax = 0.15;
    bg.buildings = [];
    let x = 4;
    while (x + 76 < bg.tileW) {
      const w = 36 + rand(0, 38), h = 80 + rand(0, 160);
      const windows = [];
      for (let wy = 10; wy < h - 12; wy += 16) {
        for (let wx = 6; wx < w - 8; wx += 12) {
          if (Math.random() < 0.55) windows.push({ x: wx, y: wy });
        }
      }
      bg.buildings.push({ x, w, h, windows, antenna: Math.random() < 0.3 });
      x += w + 8 + rand(0, 14);
    }
  } else if (name === 'space') {
    bg.tileW = 960;
    bg.parallax = 0.05;
    bg.stars = [];
    for (let i = 0; i < 110; i++) {
      bg.stars.push({ x: rand(0, bg.tileW), y: 15 + rand(0, 320), s: Math.ceil(rand(1, 3)), plus: Math.random() < 0.12 });
    }
    bg.planet = { x: 60 + rand(0, bg.tileW - 120), y: 50 + rand(0, 70), r: 16 + rand(0, 14) };
  } else if (name === 'underwater') {
    bg.weeds = [];
    for (let x = 24; x < bg.tileW - 16; x += 60 + rand(0, 44)) {
      bg.weeds.push({ x, n: 6 + Math.floor(rand(0, 6)), amp: 5 + rand(0, 7), phase: rand(0, 6.28) });
    }
    bg.fish = [];
    for (let i = 0; i < 5; i++) {
      bg.fish.push({ x: rand(20, bg.tileW - 20), y: 60 + rand(0, 200), s: 7 + rand(0, 7), dir: Math.random() < 0.5 ? 1 : -1 });
    }
    bg.bubbles = [];
    for (let i = 0; i < 4; i++) bg.bubbles.push({ x: rand(0, bg.tileW), phase: rand(0, 300), r: 2 + rand(0, 3) });
  } else { // mountains
    bg.tileW = 560;
    bg.parallax = 0.1;
    bg.far = [];
    for (let x = 60; x < bg.tileW + 60; x += 170 + rand(0, 80)) bg.far.push({ x, h: 130 + rand(0, 80) });
    bg.near = [];
    for (let x = 100; x < bg.tileW + 40; x += 240 + rand(0, 100)) bg.near.push({ x, h: 80 + rand(0, 70) });
  }
  return bg;
}

function bgTri(cx, top, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx - w / 2, top + h);
  ctx.lineTo(cx + w / 2, top + h);
  ctx.closePath();
  ctx.fill();
}

function drawBackground(bg, alpha) {
  if (!bg || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const off = (G.scrollX * bg.parallax) % bg.tileW;
  for (let ox = Math.round(-off); ox < CVS_W; ox += bg.tileW) drawBgTile(bg, ox);
  ctx.restore();
}

function drawBgTile(bg, ox) {
  if (bg.name === 'forest') {
    ctx.fillStyle = bgTone();
    for (const tr of bg.trees) {
      const x = ox + tr.x;
      ctx.fillRect(x - 2, BG_BASE - 10, 4, 10);
      bgTri(x, BG_BASE - tr.h, tr.w * 0.55, tr.h * 0.38);
      bgTri(x, BG_BASE - tr.h * 0.78, tr.w * 0.8, tr.h * 0.4);
      bgTri(x, BG_BASE - tr.h * 0.55, tr.w, tr.h * 0.45);
    }
  } else if (bg.name === 'city') {
    for (const b of bg.buildings) {
      const x = ox + b.x;
      ctx.fillStyle = bgTone();
      ctx.fillRect(x, BG_BASE - b.h, b.w, b.h);
      if (b.antenna) ctx.fillRect(x + b.w / 2 - 1, BG_BASE - b.h - 16, 2, 16);
      ctx.fillStyle = paper();
      for (const w of b.windows) ctx.fillRect(x + w.x, BG_BASE - b.h + w.y, 4, 6);
    }
  } else if (bg.name === 'space') {
    ctx.fillStyle = bgTone();
    for (const s of bg.stars) {
      const x = ox + s.x;
      if (s.plus) {
        ctx.fillRect(x - 3, s.y - 1, 7, 2);
        ctx.fillRect(x - 1, s.y - 3, 2, 7);
      } else {
        ctx.fillRect(x, s.y, s.s, s.s);
      }
    }
    const p = bg.planet;
    ctx.beginPath();
    ctx.arc(ox + p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = bgTone();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ox + p.x, p.y, p.r * 1.8, p.r * 0.5, -0.3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (bg.name === 'underwater') {
    ctx.fillStyle = bgTone();
    for (const w of bg.weeds) {
      for (let i = 0; i < w.n; i++) {
        const sx = ox + w.x + Math.sin(G.time * 1.2 + w.phase + i * 0.6) * w.amp * (i / w.n);
        ctx.fillRect(sx - 3, BG_BASE - (i + 1) * 12, 6, 12);
      }
    }
    for (const f of bg.fish) {
      const x = ox + f.x;
      ctx.beginPath();
      ctx.ellipse(x, f.y, f.s, f.s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + f.s * f.dir, f.y);
      ctx.lineTo(x + f.s * 1.7 * f.dir, f.y - f.s * 0.6);
      ctx.lineTo(x + f.s * 1.7 * f.dir, f.y + f.s * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = bgTone();
    ctx.lineWidth = 2;
    for (const b of bg.bubbles) {
      for (let k = 0; k < 3; k++) {
        const by = BG_BASE - 4 - ((G.time * 22 + k * 100 + b.phase) % 310);
        ctx.beginPath();
        ctx.arc(ox + b.x + Math.sin(by * 0.05) * 4, by, b.r + k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else { // mountains
    ctx.fillStyle = bgToneFar();
    for (const m of bg.far) bgTri(ox + m.x, BG_BASE - m.h, 260, m.h);
    for (const m of bg.near) {
      ctx.fillStyle = bgTone();
      bgTri(ox + m.x, BG_BASE - m.h, 300, m.h);
      ctx.fillStyle = paper();
      bgTri(ox + m.x, BG_BASE - m.h, 300 * (26 / m.h), 26);
    }
  }
}

/* ================= update ================= */

function update(dt) {
  if (G.state === 'dying') {
    G.dieT += dt;
    if (G.dieT >= DIE_DUR) afterDeath();
    return;
  }
  if (G.state !== 'playing') return;

  G.time += dt;
  const dx = G.speed * dt;
  G.scrollX += dx;
  for (const n of G.notes) n.x -= dx;
  for (const h of G.hearts) h.x -= dx;
  G.notes = G.notes.filter(n => n.x > -100);
  G.hearts = G.hearts.filter(h => h.x > -60 && !h.taken);
  ensureSpawns();

  // start a jump over any correctly-answered obstacle coming up
  for (const n of G.notes) {
    if (n.status === 'correct' && !n.jumped && n.x - RUNNER_X < G.speed * (JUMP_DUR / 2)) {
      n.jumped = true;
      G.jump = { t: 0 };
    }
  }
  if (G.jump) {
    G.jump.t += dt;
    if (G.jump.t >= JUMP_DUR) G.jump = null;
  }

  // an unanswered note reaching the runner is a miss
  for (const n of G.notes) {
    if (n.status === 'pending' && n.x <= RUNNER_X + 6) {
      die(n);
      return;
    }
  }

  // hearts
  for (const h of G.hearts) {
    if (!h.taken && Math.abs(h.x - RUNNER_X) < 18) {
      h.taken = true;
      if (G.lives < MAX_LIVES) {
        G.lives++;
        G.floats.push({ x: h.x, y: TRACK_Y - 50, text: '+1UP', t: 0 });
      }
      sfx.heart();
    }
  }

  // invulnerability ends once the missed note is behind the runner
  if (G.invulnNote && (G.invulnNote.x < RUNNER_X - 40 || !G.notes.includes(G.invulnNote))) {
    G.invulnNote = null;
    updateButtons();
  }

  // keep the answer buttons pointed at the leftmost unanswered note
  const active = currentActive();
  if (active !== G.activeNote) {
    G.activeNote = active;
    updateButtons();
  }

  for (const f of G.floats) f.t += dt;
  G.floats = G.floats.filter(f => f.t < (f.life || 1));

  updateFx(dt);
}

/* ================= render ================= */

const cvs = $('#game');
const ctx = cvs.getContext('2d');
{
  const dpr = window.devicePixelRatio || 1;
  cvs.width = CVS_W * dpr;
  cvs.height = CVS_H * dpr;
  ctx.scale(dpr, dpr);
}

/* ---------- confetti: the game's only splash of color ---------- */

const ccvs = $('#confetti');
const cctx = ccvs.getContext('2d');
{
  const dpr = window.devicePixelRatio || 1;
  ccvs.width = CVS_W * dpr;
  ccvs.height = CVS_H * dpr;
  cctx.scale(dpr, dpr);
}

let confetti = [];

function launchConfetti() {
  for (let i = 0; i < 150; i++) {
    confetti.push({
      x: rand(0, CVS_W),
      y: rand(-CVS_H * 1.5, -10), // staggered start heights so it rains for a while
      vy: rand(80, 180),
      sway: rand(20, 70),
      freq: rand(2, 5),
      phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      spin: rand(-7, 7),
      w: rand(5, 9),
      h: rand(3, 6),
      color: `hsl(${Math.floor(rand(0, 360))}, 90%, ${Math.floor(rand(45, 65))}%)`,
      t: 0,
    });
  }
}

function updateConfetti(dt) {
  if (!confetti.length) return;
  for (const p of confetti) {
    p.t += dt;
    p.vy = Math.min(p.vy + 240 * dt, 330);
    p.y += p.vy * dt;
    p.x += Math.sin(p.t * p.freq + p.phase) * p.sway * dt;
    p.rot += p.spin * dt;
  }
  confetti = confetti.filter(p => p.y < CVS_H + 20);
}

function renderConfetti() {
  cctx.clearRect(0, 0, CVS_W, CVS_H);
  for (const p of confetti) {
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    cctx.restore();
  }
}

function render() {
  ctx.clearRect(0, 0, CVS_W, CVS_H);
  ctx.fillStyle = paper();
  ctx.fillRect(0, 0, CVS_W, CVS_H);
  if (G.bgPrev) drawBackground(G.bgPrev, 1 - G.bgFade);
  drawBackground(G.bg, G.bgFade);
  ctx.fillStyle = ink();
  ctx.strokeStyle = ink();

  drawFxSky();
  drawStaff();
  drawTrack();
  drawClef();
  for (const n of G.notes) drawObstacle(n);
  for (const n of G.notes) drawNote(n);
  for (const h of G.hearts) if (!h.taken) ctx.drawImage(S().HEART, h.x - S().HEART.width / 2, TRACK_Y - 26);
  drawRunner();
  drawFxFront();
  drawHUD();

  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    const u = f.t / (f.life || 1);
    ctx.globalAlpha = 1 - u;
    ctx.fillText(f.text, f.x, f.y - u * 24);
    ctx.globalAlpha = 1;
  }
}

function drawStaff() {
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.moveTo(0, STAFF_TOP + i * LINE_GAP);
    ctx.lineTo(CVS_W, STAFF_TOP + i * LINE_GAP);
  }
  ctx.stroke();
}

function drawTrack() {
  ctx.lineWidth = 2;
  // ditch obstacles cut a gap in the track
  const gaps = G.notes.filter(n => n.obstacle === 'ditch').map(n => n.x).sort((a, b) => a - b);
  ctx.beginPath();
  let x0 = 0;
  for (const gx of gaps) {
    ctx.moveTo(x0, TRACK_Y);
    ctx.lineTo(Math.max(x0, gx - 20), TRACK_Y);
    x0 = gx + 20;
  }
  ctx.moveTo(x0, TRACK_Y);
  ctx.lineTo(CVS_W, TRACK_Y);
  ctx.stroke();
}

function drawClef() {
  const c = CLEFS[settings.clef];
  ctx.font = `${Math.round(c.glyphSize * LINE_GAP)}px "Segoe UI Symbol", "Noto Music", serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.glyph, 10, STAFF_TOP + c.glyphCenter * LINE_GAP);
  ctx.textBaseline = 'alphabetic';
}

function drawObstacle(n) {
  const x = n.x;
  ctx.lineWidth = 2;
  if (n.obstacle === 'spike') {
    ctx.beginPath();
    ctx.moveTo(x - 12, TRACK_Y);
    ctx.lineTo(x, TRACK_Y - 20);
    ctx.lineTo(x + 12, TRACK_Y);
    ctx.closePath();
    ctx.fill();
  } else if (n.obstacle === 'hurdle') {
    ctx.fillRect(x - 9, TRACK_Y - 22, 18, 22);
    ctx.fillStyle = paper();
    ctx.fillRect(x - 5, TRACK_Y - 14, 10, 8);
    ctx.fillStyle = ink();
  } else { // ditch: jagged bottom under the gap in the track line
    ctx.beginPath();
    ctx.moveTo(x - 20, TRACK_Y);
    ctx.lineTo(x - 12, TRACK_Y + 9);
    ctx.lineTo(x - 4, TRACK_Y + 4);
    ctx.lineTo(x + 4, TRACK_Y + 10);
    ctx.lineTo(x + 12, TRACK_Y + 5);
    ctx.lineTo(x + 20, TRACK_Y);
    ctx.stroke();
  }
}

function drawNote(n) {
  const x = n.x;
  const y = staffY(n.name);
  const step = dia(n.name) - CLEFS[settings.clef].bottomLine;
  const active = n === G.activeNote;

  // ledger lines
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = -2; s >= step; s -= 2) {
    const ly = STAFF_BOTTOM - s * (LINE_GAP / 2);
    ctx.moveTo(x - 14, ly); ctx.lineTo(x + 14, ly);
  }
  for (let s = 10; s <= step; s += 2) {
    const ly = STAFF_BOTTOM - s * (LINE_GAP / 2);
    ctx.moveTo(x - 14, ly); ctx.lineTo(x + 14, ly);
  }
  ctx.stroke();

  const gray = n.status === 'missed';
  if (gray) { ctx.fillStyle = '#888'; ctx.strokeStyle = '#888'; }

  // note head (filled for active/resolved, hollow for waiting)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 6.5, 0, 0, Math.PI * 2);
  if (active || n.status !== 'pending') ctx.fill();
  else { ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.restore();

  // stem: up when the note sits low on the staff, down when high
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (step < 4) { ctx.moveTo(x + 8, y - 2); ctx.lineTo(x + 8, y - 3.2 * LINE_GAP); }
  else { ctx.moveTo(x - 8, y + 2); ctx.lineTo(x - 8, y + 3.2 * LINE_GAP); }
  ctx.stroke();

  // bobbing arrow over the note currently being asked
  if (active) {
    const ay = TRACK_Y - 40 + Math.sin(G.time * 6) * 3;
    ctx.fillRect(x - 7, ay, 14, 4);
    ctx.fillRect(x - 4, ay + 4, 8, 4);
    ctx.fillRect(x - 2, ay + 8, 4, 4);
  }

  // reveal the letter once the note is resolved
  if (n.status !== 'pending') {
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.name[0], x, TRACK_Y - 26);
  }

  if (gray) { ctx.fillStyle = ink(); ctx.strokeStyle = ink(); }
}

function drawRunner() {
  let sprite = Math.floor(G.time * 8) % 2 ? S().RUN_A : S().RUN_B;
  let yOff = 0;

  if (G.jump) {
    sprite = S().JUMP;
    const u = G.jump.t / JUMP_DUR;
    yOff = -JUMP_HEIGHT * 4 * u * (1 - u);
  }

  const x = RUNNER_X - sprite.width / 2;
  const y = TRACK_Y - sprite.height + yOff;

  if (G.state === 'dying') {
    // spin + flash in place
    if (Math.floor(G.dieT * 10) % 2) return;
    ctx.save();
    ctx.translate(RUNNER_X, TRACK_Y - sprite.height / 2);
    ctx.rotate(G.dieT * 9);
    ctx.drawImage(S().RUN_A, -sprite.width / 2, -sprite.height / 2);
    ctx.restore();
    return;
  }

  if (G.invulnNote && Math.floor(G.time * 8) % 2) ctx.globalAlpha = 0.3;
  ctx.drawImage(sprite, x, y);
  ctx.globalAlpha = 1;
}

function drawHUD() {
  if (G.state === 'menu') return;
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${String(G.score).padStart(3, '0')}`, 16, 34);
  ctx.font = 'bold 13px "Courier New", monospace';
  let label = MODES[G.mode].label;
  if (MODES[G.mode].accelerates) label += `  x${(G.speed / MODES[G.mode].speed).toFixed(2)}`;
  ctx.fillText(label, 16, 54);
  for (let i = 0; i < G.lives; i++) {
    ctx.drawImage(S().HEART, CVS_W - 26 - i * 22, 20);
  }
}

/* ================= UI ================= */

const overlays = ['menu', 'settings', 'leaderboard', 'gameover', 'paused'];
function showOverlay(id) {
  for (const o of overlays) $('#' + o).classList.toggle('hidden', o !== id);
}

const answerBtns = $$('.answer');

function updateButtons() {
  const enabled = buttonsEnabled();
  answerBtns.forEach((b, i) => {
    b.disabled = !enabled;
    b.textContent = G.activeNote && G.state !== 'menu' && G.state !== 'gameover'
      ? G.activeNote.choices[i] : '·';
  });
}

answerBtns.forEach((b, i) => b.addEventListener('click', () => {
  b.blur(); // drop focus so the button never lingers in a pressed/selected look
  answer(i);
}));

/* ---------- leaderboards ---------- */

const scoresKey = mode => `ss.scores.${mode}`;
const getScores = mode => store.get(scoresKey(mode), []);

function qualifies(mode, score) {
  if (score <= 0) return false;
  const scores = getScores(mode);
  return scores.length < 10 || score > scores[scores.length - 1].score;
}

function addScore(mode, initials, score) {
  const scores = getScores(mode);
  scores.push({ initials, score });
  scores.sort((a, b) => b.score - a.score);
  store.set(scoresKey(mode), scores.slice(0, 10));
}

function renderScores(listEl, mode) {
  const scores = getScores(mode);
  listEl.innerHTML = '';
  if (!scores.length) {
    listEl.innerHTML = '<li><span>no scores yet</span></li>';
    return;
  }
  scores.forEach((s, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${String(i + 1).padStart(2, ' ')}.`;
    const name = document.createElement('span');
    name.textContent = s.initials;
    const pts = document.createElement('span');
    pts.textContent = s.score;
    li.append(rank, name, pts);
    listEl.appendChild(li);
  });
}

let lbTab = 'gym';
function showLeaderboard() {
  $('#tab-gym').classList.toggle('active', lbTab === 'gym');
  $('#tab-virtuoso').classList.toggle('active', lbTab === 'virtuoso');
  renderScores($('#score-list'), lbTab);
  showOverlay('leaderboard');
}

/* ---------- game over ---------- */

function endGame() {
  G.state = 'gameover';
  updateButtons();
  $('#final-score').textContent = `SCORE: ${G.score}`;
  const q = qualifies(G.mode, G.score);
  $('#hs-entry').classList.toggle('hidden', !q);
  renderScores($('#go-score-list'), G.mode);
  showOverlay('gameover');
  if (q) {
    $('#initials').value = '';
    $('#initials').focus();
  }
}

function saveInitials() {
  const val = $('#initials').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'AAA';
  addScore(G.mode, val.slice(0, 3), G.score);
  $('#hs-entry').classList.add('hidden');
  renderScores($('#go-score-list'), G.mode);
  sfx.click();
}

/* ---------- settings screen ---------- */

let draft = null; // working copy while the settings screen is open

function openSettings() {
  draft = JSON.parse(JSON.stringify(settings));
  $$('#clef-row input[name=clef]').forEach(r => { r.checked = r.value === draft.clef; });
  $('#opt-sound').checked = draft.sound;
  $('#opt-spacing').value = draft.spacing;
  updateSpacingReadout();
  buildNoteGrid();
  showOverlay('settings');
}

function updateSpacingReadout() {
  // seconds between notes at the gym starting speed
  $('#spacing-readout').textContent = `~${(draft.spacing / MODES.gym.speed).toFixed(1)}s per note`;
}

function buildNoteGrid() {
  const grid = $('#note-grid');
  grid.innerHTML = '';
  const selected = new Set(draft.pools[draft.clef]);
  for (const name of noteList(draft.clef)) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(name);
    cb.addEventListener('change', () => {
      const pool = new Set(draft.pools[draft.clef]);
      cb.checked ? pool.add(name) : pool.delete(name);
      draft.pools[draft.clef] = noteList(draft.clef).filter(n => pool.has(n));
    });
    label.append(cb, ` ${name} — ${posLabel(draft.clef, name)}`);
    grid.appendChild(label);
  }
  $('#settings-warn').classList.add('hidden');
}

$$('#clef-row input[name=clef]').forEach(r =>
  r.addEventListener('change', () => { draft.clef = r.value; buildNoteGrid(); }));

$('#opt-sound').addEventListener('change', e => { draft.sound = e.target.checked; });

$('#opt-spacing').addEventListener('input', e => {
  draft.spacing = Number(e.target.value);
  updateSpacingReadout();
});

$('#btn-settings-defaults').addEventListener('click', () => {
  draft.pools[draft.clef] = defaultPool(draft.clef);
  buildNoteGrid();
});

$('#btn-settings-save').addEventListener('click', () => {
  if (draft.pools[draft.clef].length < 2) {
    $('#settings-warn').classList.remove('hidden');
    return;
  }
  settings = draft;
  saveSettings();
  sfx.click();
  showOverlay('menu');
});

$('#btn-settings-back').addEventListener('click', () => showOverlay('menu'));

/* ---------- wiring ---------- */

$('#btn-gym').addEventListener('click', () => { ac(); startGame('gym'); });
$('#btn-virtuoso').addEventListener('click', () => { ac(); startGame('virtuoso'); });
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-leaderboard').addEventListener('click', showLeaderboard);
$('#btn-leaderboard-back').addEventListener('click', () => showOverlay('menu'));
$('#tab-gym').addEventListener('click', () => { lbTab = 'gym'; showLeaderboard(); });
$('#tab-virtuoso').addEventListener('click', () => { lbTab = 'virtuoso'; showLeaderboard(); });
$('#btn-save-score').addEventListener('click', saveInitials);
$('#initials').addEventListener('keydown', e => { if (e.key === 'Enter') saveInitials(); });
$('#btn-retry').addEventListener('click', () => startGame(G.mode));
$('#btn-go-menu').addEventListener('click', quitToMenu);
$('#btn-resume').addEventListener('click', togglePause);
$('#btn-quit').addEventListener('click', quitToMenu);

function quitToMenu() {
  G.state = 'menu';
  G.notes = [];
  G.hearts = [];
  G.floats = [];
  G.fx = [];
  G.jump = null;
  G.activeNote = null;
  setTheme('light');      // back at the menu, night fades to day...
  switchBackground(null); // ...and the scenery fades back to plain paper
  updateButtons();
  showOverlay('menu');
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    showOverlay('paused');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    showOverlay(null);
  }
}

// touch devices have no P key: tapping the play field pauses
cvs.addEventListener('pointerdown', () => {
  if (G.state === 'playing') togglePause();
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '1' || e.key === '2' || e.key === '3') answer(Number(e.key) - 1);
  else if (e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 'm' || e.key === 'M') { settings.sound = !settings.sound; saveSettings(); }
  else if (e.key.length === 1) {
    // note-name keys: A–G answer directly when that letter is one of the choices
    const letter = e.key.toUpperCase();
    if (LETTERS.includes(letter) && G.activeNote) {
      const idx = G.activeNote.choices.indexOf(letter);
      if (idx !== -1) answer(idx);
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') togglePause();
});

/* ================= main loop ================= */

let lastT = performance.now();
function frame(t) {
  const dt = clamp((t - lastT) / 1000, 0, 0.05);
  lastT = t;
  const target = G.theme === 'dark' ? 1 : 0;
  const step = dt / THEME_FADE_S;
  themeU = Math.abs(target - themeU) <= step ? target : themeU + Math.sign(target - themeU) * step;
  if (G.bgFade < 1) {
    G.bgFade = Math.min(1, G.bgFade + dt / 1.2);
    if (G.bgFade >= 1) G.bgPrev = null;
  }
  update(dt);
  render();
  updateConfetti(dt);
  renderConfetti();
  requestAnimationFrame(frame);
}

updateButtons();
requestAnimationFrame(frame);
