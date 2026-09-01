const EMOJI_SET = ['🍇','🍉','🍋','🍓','🍒','🥝','🍍','🥥','🍑','🍌','🥑','🍈'];

const boardEl = document.getElementById('board');
const movesVal = document.getElementById('movesVal');
const timeVal = document.getElementById('timeVal');
const pairsVal = document.getElementById('pairsVal');
const bestVal = document.getElementById('bestVal');
const difficultySelect = document.getElementById('difficulty');
const restartBtn = document.getElementById('restartBtn');
const winBanner = document.getElementById('winBanner');
const winTitle = document.getElementById('winTitle');
const winDesc = document.getElementById('winDesc');
const soundBtn = document.getElementById('soundBtn');
const leaderboardBtn = document.getElementById('leaderboardBtn');
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTabs = document.getElementById('modalTabs');
const leaderboardList = document.getElementById('leaderboardList');
const nameEntry = document.getElementById('nameEntry');
const nameEntryLbl = document.getElementById('nameEntryLbl');
const nameInput = document.getElementById('nameInput');
const saveScoreBtn = document.getElementById('saveScoreBtn');
const confettiLayer = document.getElementById('confettiLayer');

let cols = 4, rows = 4;
let cards = [];
let flipped = [];
let matchedCount = 0;
let moves = 0;
let lockBoard = false;
let timerInterval = null;
let seconds = 0;
let gameStarted = false;
let soundOn = (localStorage.getItem('memory:sound') !== 'off');
let pendingRank = null; // index in leaderboard this run would occupy, if any
let activeModalDiff = '4x4';

// ---------- sound engine (WebAudio synth, no external files) ----------
let audioCtx = null;
function getCtx(){
  if (!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function tone(freq, start, dur, type='sine', gain=0.18){
  if (!soundOn) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}
const SFX = {
  flip:   () => tone(520, 0, 0.09, 'triangle', 0.12),
  match:  () => { tone(660, 0, 0.12, 'sine', 0.16); tone(880, 0.1, 0.16, 'sine', 0.16); },
  mismatch: () => { tone(220, 0, 0.16, 'sawtooth', 0.1); tone(160, 0.08, 0.18, 'sawtooth', 0.1); },
  win: () => { [523,659,784,1047].forEach((f,i) => tone(f, i*0.11, 0.22, 'triangle', 0.15)); }
};
function setSoundUI(){
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundBtn.classList.toggle('muted', !soundOn);
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('memory:sound', soundOn ? 'on' : 'off');
  setSoundUI();
  if (soundOn) tone(520, 0, 0.08, 'triangle', 0.12);
});
setSoundUI();

// ---------- confetti ----------
function fireConfetti(){
  const colors = ['#FBBF24','#34D399','#8B5CF6','#F472B6','#60A5FA'];
  const count = 60;
  for (let i = 0; i < count; i++){
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const size = 6 + Math.random() * 6;
    piece.style.width = size + 'px';
    piece.style.height = (size * 0.4) + 'px';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    const duration = 2.2 + Math.random() * 1.4;
    const delay = Math.random() * 0.4;
    piece.style.animationDuration = duration + 's';
    piece.style.animationDelay = delay + 's';
    confettiLayer.appendChild(piece);
    setTimeout(() => piece.remove(), (duration + delay) * 1000 + 100);
  }
}

// ---------- persistence: prefer window.storage (artifact sandbox), fall back to localStorage ----------
async function storageGet(key){
  try{
    if (window.storage && window.storage.get){
      const res = await window.storage.get(key, false);
      if (res && res.value) return JSON.parse(res.value);
      return null;
    }
  }catch(e){ /* fall through to localStorage */ }
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
async function storageSet(key, val){
  try{
    if (window.storage && window.storage.set){
      await window.storage.set(key, JSON.stringify(val), false);
      return;
    }
  }catch(e){ /* fall through to localStorage */ }
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ /* ignore */ }
}

async function loadBest(diff){
  return storageGet('memory:best:' + diff);
}
async function saveBest(diff, val){
  return storageSet('memory:best:' + diff, val);
}

// ---------- leaderboard (top 5 per difficulty) ----------
const LB_SIZE = 5;
async function loadLeaderboard(diff){
  const list = await storageGet('memory:leaderboard:' + diff);
  return Array.isArray(list) ? list : [];
}
async function saveLeaderboard(diff, list){
  return storageSet('memory:leaderboard:' + diff, list);
}
// Returns the rank (0-based) a score of {moves, seconds} would earn, or null if it doesn't make the top 5
function rankForScore(list, moves, seconds){
  const idx = list.findIndex(entry => moves < entry.moves || (moves === entry.moves && seconds < entry.seconds));
  if (list.length < LB_SIZE) return idx === -1 ? list.length : idx;
  return idx === -1 ? null : idx;
}
async function addToLeaderboard(diff, name, moves, seconds){
  const list = await loadLeaderboard(diff);
  list.push({ name: name || 'Anonymous', moves, seconds, date: Date.now() });
  list.sort((a, b) => a.moves - b.moves || a.seconds - b.seconds);
  const trimmed = list.slice(0, LB_SIZE);
  await saveLeaderboard(diff, trimmed);
  return trimmed;
}

function diffLabel(diff){
  return { '4x3': 'Easy', '4x4': 'Medium', '6x4': 'Hard' }[diff] || diff;
}

async function renderLeaderboard(diff){
  activeModalDiff = diff;
  [...modalTabs.children].forEach(btn => btn.classList.toggle('active', btn.dataset.diff === diff));
  const list = await loadLeaderboard(diff);
  if (!list.length){
    leaderboardList.innerHTML = `<div class="empty">No scores yet for ${diffLabel(diff)}. Be the first! 🥇</div>`;
    return;
  }
  leaderboardList.innerHTML = list.map((entry, i) => `
    <li>
      <span class="rank">${i + 1}</span>
      <span class="lb-name">${escapeHtml(entry.name)}</span>
      <span class="lb-score">${entry.moves} moves · ${formatTime(entry.seconds)}</span>
    </li>
  `).join('');
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseDifficulty(val){
  const [c, r] = val.split('x').map(Number);
  return { c, r };
}

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(s){
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function stopTimer(){
  clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer(){
  stopTimer();
  seconds = 0;
  timeVal.textContent = formatTime(seconds);
  timerInterval = setInterval(() => {
    seconds++;
    timeVal.textContent = formatTime(seconds);
  }, 1000);
}

// ---------- board setup ----------
async function buildBoard(){
  stopTimer();
  winBanner.classList.remove('show');
  nameEntry.classList.remove('show');
  pendingRank = null;
  lockBoard = false;
  flipped = [];
  matchedCount = 0;
  moves = 0;
  seconds = 0;
  gameStarted = false;
  movesVal.textContent = '0';
  timeVal.textContent = '0:00';

  const diffVal = difficultySelect.value;
  const { c, r } = parseDifficulty(diffVal);
  cols = c; rows = r;
  const totalCards = cols * rows;
  const pairCount = totalCards / 2;

  pairsVal.textContent = `0/${pairCount}`;

  const best = await loadBest(diffVal);
  bestVal.textContent = best ? best.moves : '–';

  const chosenEmoji = shuffle(EMOJI_SET.slice()).slice(0, pairCount);
  const deck = shuffle([...chosenEmoji, ...chosenEmoji]);

  cards = deck.map((symbol, idx) => ({ id: idx, symbol, matched: false }));

  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardEl.innerHTML = '';

  cards.forEach(card => {
    const el = document.createElement('div');
    el.className = 'card';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Hidden card');
    el.dataset.id = card.id;
    el.style.animationDelay = (card.id * 0.03) + 's';
    el.innerHTML = `
      <div class="face back"></div>
      <div class="face front">${card.symbol}</div>
    `;
    el.addEventListener('click', () => handleFlip(card.id, el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        handleFlip(card.id, el);
      }
    });
    boardEl.appendChild(el);
  });
}

// ---------- gameplay ----------
function handleFlip(id, el){
  if (lockBoard) return;
  if (el.classList.contains('flipped') || el.classList.contains('matched')) return;
  if (flipped.length === 2) return;

  if (!gameStarted){
    gameStarted = true;
    startTimer();
  }

  el.classList.add('flipped');
  SFX.flip();
  flipped.push({ id, el });

  if (flipped.length === 2){
    moves++;
    movesVal.textContent = moves;
    lockBoard = true;
    const [a, b] = flipped;
    const cardA = cards.find(c => c.id === a.id);
    const cardB = cards.find(c => c.id === b.id);

    if (cardA.symbol === cardB.symbol){
      setTimeout(() => {
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        SFX.match();
        matchedCount += 2;
        pairsVal.textContent = `${matchedCount/2}/${cards.length/2}`;
        flipped = [];
        lockBoard = false;
        if (matchedCount === cards.length){
          finishGame();
        }
      }, 350);
    } else {
      a.el.classList.add('mismatch');
      b.el.classList.add('mismatch');
      SFX.mismatch();
      setTimeout(() => {
        a.el.classList.remove('flipped', 'mismatch');
        b.el.classList.remove('flipped', 'mismatch');
        flipped = [];
        lockBoard = false;
      }, 700);
    }
  }
}

async function finishGame(){
  stopTimer();
  SFX.win();
  fireConfetti();
  const diffVal = difficultySelect.value;
  const best = await loadBest(diffVal);
  let newBest = false;
  if (!best || moves < best.moves){
    await saveBest(diffVal, { moves, seconds });
    bestVal.textContent = moves;
    newBest = true;
  }
  winTitle.textContent = newBest ? '🏆 New best score!' : '🎉 You matched them all!';
  winDesc.textContent = `${moves} moves · ${formatTime(seconds)}`;
  winBanner.classList.add('show');

  const lb = await loadLeaderboard(diffVal);
  pendingRank = rankForScore(lb, moves, seconds);
  if (pendingRank !== null){
    nameEntryLbl.textContent = pendingRank === 0
      ? `🥇 #1 on the ${diffLabel(diffVal)} leaderboard! Enter your name:`
      : `🏅 Top ${LB_SIZE} score! Enter your name:`;
    nameEntry.classList.add('show');
    nameInput.value = '';
    saveScoreBtn.disabled = false;
    setTimeout(() => nameInput.focus(), 200);
  } else {
    nameEntry.classList.remove('show');
  }
}

saveScoreBtn.addEventListener('click', async () => {
  if (pendingRank === null) return;
  saveScoreBtn.disabled = true;
  const diffVal = difficultySelect.value;
  await addToLeaderboard(diffVal, nameInput.value.trim(), moves, seconds);
  pendingRank = null;
  nameEntry.classList.remove('show');
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveScoreBtn.click();
});

// ---------- leaderboard modal events ----------
leaderboardBtn.addEventListener('click', () => {
  modalOverlay.classList.add('show');
  renderLeaderboard(difficultySelect.value);
});
closeModalBtn.addEventListener('click', () => modalOverlay.classList.remove('show'));
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('show');
});
modalTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) renderLeaderboard(btn.dataset.diff);
});

// ---------- events ----------
restartBtn.addEventListener('click', buildBoard);
difficultySelect.addEventListener('change', buildBoard);

// ---------- init ----------
buildBoard();
