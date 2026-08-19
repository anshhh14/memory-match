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

let cols = 4, rows = 4;
let cards = [];
let flipped = [];
let matchedCount = 0;
let moves = 0;
let lockBoard = false;
let timerInterval = null;
let seconds = 0;
let gameStarted = false;

// ---------- best score persistence (falls back gracefully if storage is unavailable) ----------
async function loadBest(diff){
  try{
    if (window.storage && window.storage.get){
      const res = await window.storage.get('memory:best:' + diff, false);
      if (res && res.value) return JSON.parse(res.value);
    }
  }catch(e){ /* no best score saved yet */ }
  return null;
}

async function saveBest(diff, val){
  try{
    if (window.storage && window.storage.set){
      await window.storage.set('memory:best:' + diff, JSON.stringify(val), false);
    }
  }catch(e){ /* ignore save errors */ }
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
}

// ---------- events ----------
restartBtn.addEventListener('click', buildBoard);
difficultySelect.addEventListener('change', buildBoard);

// ---------- init ----------
buildBoard();
