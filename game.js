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
  click: () => tone(880, 0.04, 0, 'square', 0.05),
};

/* ================= sprites ================= */

function buildSprite(rows, scale = 2) {
  const w = rows[0].length, h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const c = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      c.fillStyle = ch === 'o' ? '#fff' : '#111';
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

const RUN_A = buildSprite([...HEAD,
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
]);

const RUN_B = buildSprite([...HEAD,
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
]);

const JUMP = buildSprite([...HEAD,
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
]);

const HEART = buildSprite([
  '.##..##.',
  '########',
  '########',
  '.######.',
  '..####..',
  '...##...',
], 2);

/* ================= game constants ================= */

const CVS_W = 960, CVS_H = 360;
const RUNNER_X = 140;
const LINE_GAP = 16;
const STAFF_TOP = 190;                         // top staff line = the track
const STAFF_BOTTOM = STAFF_TOP + 4 * LINE_GAP; // bottom staff line
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
    checkSpeedUp();
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
    G.floats.push({ x: RUNNER_X + 40, y: STAFF_TOP - 90, text: 'SPEED UP!', t: 0 });
    sfx.speedUp();
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
        G.floats.push({ x: h.x, y: STAFF_TOP - 60, text: '+1UP', t: 0 });
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
  G.floats = G.floats.filter(f => f.t < 1);
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

function render() {
  ctx.clearRect(0, 0, CVS_W, CVS_H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CVS_W, CVS_H);
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#111';

  drawStaff();
  drawClef();
  for (const n of G.notes) drawObstacle(n);
  for (const n of G.notes) drawNote(n);
  for (const h of G.hearts) if (!h.taken) ctx.drawImage(HEART, h.x - HEART.width / 2, STAFF_TOP - 26);
  drawRunner();
  drawHUD();

  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = 1 - f.t;
    ctx.fillText(f.text, f.x, f.y - f.t * 24);
    ctx.globalAlpha = 1;
  }
}

function drawStaff() {
  ctx.lineWidth = 2;
  // ditch obstacles cut a gap in the top line (the track)
  const gaps = G.notes.filter(n => n.obstacle === 'ditch').map(n => n.x);
  ctx.beginPath();
  let x0 = 0;
  for (const gx of gaps.sort((a, b) => a - b)) {
    ctx.moveTo(x0, STAFF_TOP);
    ctx.lineTo(Math.max(x0, gx - 20), STAFF_TOP);
    x0 = gx + 20;
  }
  ctx.moveTo(x0, STAFF_TOP);
  ctx.lineTo(CVS_W, STAFF_TOP);
  for (let i = 1; i < 5; i++) {
    ctx.moveTo(0, STAFF_TOP + i * LINE_GAP);
    ctx.lineTo(CVS_W, STAFF_TOP + i * LINE_GAP);
  }
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
    ctx.moveTo(x - 12, STAFF_TOP);
    ctx.lineTo(x, STAFF_TOP - 20);
    ctx.lineTo(x + 12, STAFF_TOP);
    ctx.closePath();
    ctx.fill();
  } else if (n.obstacle === 'hurdle') {
    ctx.fillRect(x - 9, STAFF_TOP - 22, 18, 22);
    ctx.clearRect(x - 5, STAFF_TOP - 14, 10, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 5, STAFF_TOP - 14, 10, 8);
    ctx.fillStyle = '#111';
  } else { // ditch: jagged bottom under the gap in the track line
    ctx.beginPath();
    ctx.moveTo(x - 20, STAFF_TOP);
    ctx.lineTo(x - 12, STAFF_TOP + 9);
    ctx.lineTo(x - 4, STAFF_TOP + 4);
    ctx.lineTo(x + 4, STAFF_TOP + 10);
    ctx.lineTo(x + 12, STAFF_TOP + 5);
    ctx.lineTo(x + 20, STAFF_TOP);
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
  if (gray) { ctx.fillStyle = '#999'; ctx.strokeStyle = '#999'; }

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

  // reveal the letter once the note is resolved
  if (n.status !== 'pending') {
    ctx.font = 'bold 15px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.name[0], x, Math.min(y, STAFF_TOP) - 30);
  }

  if (gray) { ctx.fillStyle = '#111'; ctx.strokeStyle = '#111'; }
}

function drawRunner() {
  let sprite = Math.floor(G.time * 8) % 2 ? RUN_A : RUN_B;
  let yOff = 0;

  if (G.jump) {
    sprite = JUMP;
    const u = G.jump.t / JUMP_DUR;
    yOff = -JUMP_HEIGHT * 4 * u * (1 - u);
  }

  const x = RUNNER_X - sprite.width / 2;
  const y = STAFF_TOP - sprite.height + yOff;

  if (G.state === 'dying') {
    // spin + flash in place
    if (Math.floor(G.dieT * 10) % 2) return;
    ctx.save();
    ctx.translate(RUNNER_X, STAFF_TOP - sprite.height / 2);
    ctx.rotate(G.dieT * 9);
    ctx.drawImage(RUN_A, -sprite.width / 2, -sprite.height / 2);
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
    ctx.drawImage(HEART, CVS_W - 26 - i * 22, 20);
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

answerBtns.forEach((b, i) => b.addEventListener('click', () => answer(i)));

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
  G.jump = null;
  G.activeNote = null;
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
  update(dt);
  render();
  requestAnimationFrame(frame);
}

updateButtons();
requestAnimationFrame(frame);
