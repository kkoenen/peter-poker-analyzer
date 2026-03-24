'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
// UI rank → treys rank char
const TO_TREYS = { A:'A', K:'K', Q:'Q', J:'J', '10':'T', 9:'9', 8:'8', 7:'7', 6:'6', 5:'5', 4:'4', 3:'3', 2:'2' };
const SUIT_SYM = { s:'♠', h:'♥', d:'♦', c:'♣' };
const RED_SUITS = new Set(['h', 'd']);
const GROUP_LABEL = { hole:'Hole Card', flop:'Flop Card', turn:'Turn Card', river:'River Card' };

// ─── State ────────────────────────────────────────────────────────────────────
let cfg = { min_players:2, max_players:9, default_players:2, rag_green:55, rag_amber:33 };

let state = {
  numPlayers: 2,
  holeCards:  [null, null],
  flopCards:  [null, null, null],
  turnCard:   null,
  riverCard:  null,
  // picker
  pendingSlot: null,   // { group, index }
  pickerSuit:  null,
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const scrollTo = el => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

function toTreys(rank, suit) {
  return TO_TREYS[rank] + suit;
}

function usedCards() {
  return [...state.holeCards, ...state.flopCards, state.turnCard, state.riverCard].filter(Boolean);
}

function isUsed(rank, suit) {
  return usedCards().includes(toTreys(rank, suit));
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiOdds(communityCards) {
  const res = await fetch('/api/odds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hole_cards:       state.holeCards,
      community_cards:  communityCards,
      num_players:      state.numPlayers,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── RAG ──────────────────────────────────────────────────────────────────────
function ragClass(pct) {
  if (pct >= cfg.rag_green) return 'rag-green';
  if (pct >= cfg.rag_amber) return 'rag-amber';
  return 'rag-red';
}

// ─── Card rendering ───────────────────────────────────────────────────────────
function renderSlot(slot, cardStr) {
  if (!cardStr) {
    slot.className = 'card-slot';
    slot.innerHTML = '<span class="card-plus">+</span>';
    return;
  }
  const suit     = cardStr.slice(-1);
  const tRank    = cardStr.slice(0, -1);
  const dispRank = tRank === 'T' ? '10' : tRank;
  const sym      = SUIT_SYM[suit];
  const isRed    = RED_SUITS.has(suit);

  slot.className = `card-slot filled${isRed ? ' red' : ''}`;
  slot.innerHTML = `
    <span class="c-rank-tl">${dispRank}</span>
    <span class="c-suit-mid">${sym}</span>
    <span class="c-rank-br">${dispRank}</span>
  `;
}

function refreshAllSlots() {
  document.querySelectorAll('[data-group="hole"]').forEach((s, i) => renderSlot(s, state.holeCards[i]));
  document.querySelectorAll('[data-group="flop"]').forEach((s, i) => renderSlot(s, state.flopCards[i]));
  const t = document.querySelector('[data-group="turn"]');
  if (t) renderSlot(t, state.turnCard);
  const r = document.querySelector('[data-group="river"]');
  if (r) renderSlot(r, state.riverCard);
}

// ─── Calc-button visibility ───────────────────────────────────────────────────
function updateCalcButtons() {
  if (state.holeCards.every(Boolean))  show($('calc-preflop-btn'));
  if (state.flopCards.every(Boolean))  show($('calc-flop-btn'));
  if (state.turnCard)                  show($('calc-turn-btn'));
  if (state.riverCard)                 show($('calc-river-btn'));
}

// ─── Odds panel ───────────────────────────────────────────────────────────────
function showLoading(panelId) {
  const el = $(panelId);
  el.className = 'odds-panel rag-loading';
  el.innerHTML = `<div class="loading-row"><div class="spinner"></div> Calculating…</div>`;
  show(el);
}

function renderOdds(panelId, odds, nextLabel, onNext) {
  const el  = $(panelId);
  const rag = ragClass(odds.win_pct);
  el.className = `odds-panel ${rag}`;

  el.innerHTML = `
    <div class="odds-pct">${odds.win_pct}<span style="font-size:2rem;letter-spacing:0">%</span></div>
    <div class="odds-sub">Win probability</div>
    <div class="odds-action">${odds.action}</div>
    <div class="odds-reason">${odds.reason}</div>
    ${odds.tie_pct > 0.5 ? `<div class="odds-tie">Tie chance: ${odds.tie_pct}%</div>` : ''}
    ${nextLabel ? `<button class="odds-next" id="${panelId}-next">${nextLabel}</button>` : ''}
  `;

  show(el);
  scrollTo(el);

  if (nextLabel && onNext) {
    $(`${panelId}-next`).addEventListener('click', onNext);
  }
}

function renderError(panelId, msg) {
  const el = $(panelId);
  el.className = 'odds-panel rag-red';
  el.innerHTML = `<div class="odds-reason">${msg}</div>`;
  show(el);
}

// ─── Stage flow ───────────────────────────────────────────────────────────────
function isVisible(id) {
  return !$(id).classList.contains('hidden');
}

async function calcPreflop() {
  hide($('calc-preflop-btn'));
  showLoading('preflop-odds');
  try {
    const odds = await apiOdds([]);
    renderOdds('preflop-odds', odds, 'Deal Flop →', revealFlop);
  } catch { renderError('preflop-odds', 'Calculation failed — check your connection.'); }
}

function revealFlop() {
  show($('flop-section'));
  scrollTo($('flop-section'));
}

async function calcFlop() {
  hide($('calc-flop-btn'));
  showLoading('postflop-odds');
  try {
    const odds = await apiOdds(state.flopCards);
    renderOdds('postflop-odds', odds, 'Deal Turn →', revealTurn);
    show($('recalc-flop-btn'));
  } catch { renderError('postflop-odds', 'Calculation failed — check your connection.'); }
}

function revealTurn() {
  show($('turn-section'));
  scrollTo($('turn-section'));
}

async function calcTurn() {
  hide($('calc-turn-btn'));
  showLoading('postturn-odds');
  try {
    const odds = await apiOdds([...state.flopCards, state.turnCard]);
    renderOdds('postturn-odds', odds, 'Deal River →', revealRiver);
    show($('recalc-turn-btn'));
  } catch { renderError('postturn-odds', 'Calculation failed — check your connection.'); }
}

function revealRiver() {
  show($('river-section'));
  scrollTo($('river-section'));
}

async function calcRiver() {
  hide($('calc-river-btn'));
  showLoading('river-odds');
  try {
    const odds = await apiOdds([...state.flopCards, state.turnCard, state.riverCard]);
    renderOdds('river-odds', odds, null, null);
    show($('recalc-river-btn'));
    show($('new-hand-section'));
    scrollTo($('new-hand-section'));
  } catch { renderError('river-odds', 'Calculation failed — check your connection.'); }
}

// ─── Recalculate ──────────────────────────────────────────────────────────────
async function recalcRiver() {
  showLoading('river-odds');
  try {
    const odds = await apiOdds([...state.flopCards, state.turnCard, state.riverCard]);
    renderOdds('river-odds', odds, null, null);
    show($('recalc-river-btn'));
  } catch { renderError('river-odds', 'Calculation failed — check your connection.'); }
}

async function recalcTurn() {
  showLoading('postturn-odds');
  try {
    const odds = await apiOdds([...state.flopCards, state.turnCard]);
    renderOdds('postturn-odds', odds, isVisible('river-section') ? null : 'Deal River →', isVisible('river-section') ? null : revealRiver);
    show($('recalc-turn-btn'));
  } catch { renderError('postturn-odds', 'Calculation failed — check your connection.'); return; }
  if (isVisible('river-section') && state.riverCard) {
    refreshPlayerDisplay();
    await recalcRiver();
  }
}

async function recalcFlop() {
  showLoading('postflop-odds');
  try {
    const odds = await apiOdds(state.flopCards);
    renderOdds('postflop-odds', odds, isVisible('turn-section') ? null : 'Deal Turn →', isVisible('turn-section') ? null : revealTurn);
    show($('recalc-flop-btn'));
  } catch { renderError('postflop-odds', 'Calculation failed — check your connection.'); return; }
  if (isVisible('turn-section') && state.turnCard) {
    refreshPlayerDisplay();
    await recalcTurn();
  }
}

// ─── Card picker ──────────────────────────────────────────────────────────────
function openPicker(group, index) {
  state.pendingSlot = { group, index };
  state.pickerSuit  = null;

  // Reset to suit step
  show($('suit-step'));
  hide($('rank-step'));
  $('picker-title').textContent = `${GROUP_LABEL[group]} ${index + 1}`;

  show($('picker-overlay'));
}

function closePicker() {
  hide($('picker-overlay'));
  state.pendingSlot = null;
  state.pickerSuit  = null;
}

function pickSuit(suit) {
  state.pickerSuit = suit;

  const { group, index } = state.pendingSlot;
  $('picker-title').textContent = `${SUIT_SYM[suit]} ${GROUP_LABEL[group]} ${index + 1}`;
  $('rank-step-label').textContent = `Choose rank`;

  // Build rank buttons, disabling already-used cards
  $('rank-grid').innerHTML = RANKS.map(r => {
    const disabled = isUsed(r, suit) ? 'disabled' : '';
    return `<button class="rank-btn" data-rank="${r}" ${disabled}>${r}</button>`;
  }).join('');

  $('rank-grid').querySelectorAll('.rank-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => pickRank(btn.dataset.rank));
  });

  hide($('suit-step'));
  show($('rank-step'));
}

function pickRank(rank) {
  const { group, index } = state.pendingSlot;
  const card = toTreys(rank, state.pickerSuit);

  if (group === 'hole')       state.holeCards[index] = card;
  else if (group === 'flop')  state.flopCards[index] = card;
  else if (group === 'turn')  state.turnCard = card;
  else if (group === 'river') state.riverCard = card;

  closePicker();
  refreshAllSlots();
  updateCalcButtons();

  // Auto-open picker for hole card 2 after hole card 1 is picked
  if (group === 'hole' && index === 0 && !state.holeCards[1]) {
    openPicker('hole', 1);
  }
}

// ─── New hand ─────────────────────────────────────────────────────────────────
function newHand() {
  state.holeCards  = [null, null];
  state.flopCards  = [null, null, null];
  state.turnCard   = null;
  state.riverCard  = null;

  const toHide = [
    'hole-section','calc-preflop-btn','preflop-odds',
    'flop-section','calc-flop-btn','postflop-odds','recalc-flop-btn',
    'turn-section','calc-turn-btn','postturn-odds','recalc-turn-btn',
    'river-section','calc-river-btn','river-odds','recalc-river-btn',
    'new-hand-section',
  ];
  toHide.forEach(id => hide($(id)));

  show($('setup-section'));
  refreshAllSlots();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Setup ────────────────────────────────────────────────────────────────────
function refreshPlayerDisplay() {
  const atMin = state.numPlayers <= cfg.min_players;
  const atMax = state.numPlayers >= cfg.max_players;

  $('players-display').textContent = state.numPlayers;
  $('players-minus').disabled = atMin;
  $('players-plus').disabled  = atMax;

  for (const street of ['flop', 'turn', 'river']) {
    $(`players-display-${street}`).textContent = state.numPlayers;
    $(`players-minus-${street}`).disabled = atMin;
    $(`players-plus-${street}`).disabled  = atMax;
  }
}

function startHand() {
  hide($('setup-section'));
  $('game-badge').textContent = `${state.numPlayers} players`;
  show($('game-badge'));
  show($('hole-section'));
  refreshAllSlots();
  scrollTo($('hole-section'));
  openPicker('hole', 0);
}

// ─── Wire events ─────────────────────────────────────────────────────────────
function wireEvents() {
  // Player counters (setup + per-street)
  const adjustPlayers = delta => {
    const next = state.numPlayers + delta;
    if (next >= cfg.min_players && next <= cfg.max_players) {
      state.numPlayers = next;
      refreshPlayerDisplay();
    }
  };
  $('players-minus').addEventListener('click', () => adjustPlayers(-1));
  $('players-plus').addEventListener('click',  () => adjustPlayers(+1));
  for (const street of ['flop', 'turn', 'river']) {
    $(`players-minus-${street}`).addEventListener('click', () => adjustPlayers(-1));
    $(`players-plus-${street}`).addEventListener('click',  () => adjustPlayers(+1));
  }

  // Start
  $('start-btn').addEventListener('click', startHand);

  // Card slot taps (event delegation on main)
  document.querySelector('.main-content').addEventListener('click', e => {
    const slot = e.target.closest('.card-slot');
    if (slot) openPicker(slot.dataset.group, +slot.dataset.index);
  });

  // Suit buttons
  document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.addEventListener('click', () => pickSuit(btn.dataset.suit));
  });

  // Picker back
  $('picker-back').addEventListener('click', () => {
    state.pickerSuit = null;
    hide($('rank-step'));
    show($('suit-step'));
    const { group, index } = state.pendingSlot;
    $('picker-title').textContent = `${GROUP_LABEL[group]} ${index + 1}`;
  });

  // Close picker on backdrop tap
  $('picker-overlay').addEventListener('click', e => {
    if (e.target === $('picker-overlay')) closePicker();
  });

  // Calc buttons
  $('calc-preflop-btn').addEventListener('click', calcPreflop);
  $('calc-flop-btn').addEventListener('click', calcFlop);
  $('calc-turn-btn').addEventListener('click', calcTurn);
  $('calc-river-btn').addEventListener('click', calcRiver);

  // Recalc buttons
  $('recalc-flop-btn').addEventListener('click', recalcFlop);
  $('recalc-turn-btn').addEventListener('click', recalcTurn);
  $('recalc-river-btn').addEventListener('click', recalcRiver);

  // New hand
  $('new-hand-btn').addEventListener('click', newHand);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    cfg = await (await fetch('/api/config')).json();
  } catch { /* use defaults */ }

  state.numPlayers = cfg.default_players;
  refreshPlayerDisplay();
  wireEvents();
}

document.addEventListener('DOMContentLoaded', init);
