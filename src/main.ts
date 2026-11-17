import './style.css';
import { Game } from './game';

const fill = document.getElementById('load-fill')!;
const msg = document.getElementById('load-msg')!;
const loading = document.getElementById('loading')!;

const MESSAGES = [
  'Preparing for human interaction...',
  'Loading social anxiety...',
  'Rehearsing how to say hello...',
  'Checking if the neighbors are outside...',
  'Generating 47 worst-case scenarios...',
];
let mi = 0;
const cycle = setInterval(() => {
  mi = (mi + 1) % MESSAGES.length;
  msg.textContent = MESSAGES[mi];
}, 900);

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function boot() {
  if (!webglOK()) {
    clearInterval(cycle);
    msg.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'err';
    err.textContent =
      'OUTSIDE.EXE needs WebGL, and this browser or device doesn\'t seem to support it. Try a recent desktop Chrome, Edge, Firefox or Safari with hardware acceleration turned on.';
    loading.appendChild(err);
    return;
  }
  const t0 = performance.now();
  const game = new Game();
  (window as unknown as { __game: Game }).__game = game;
  await game.init((p, m) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    if (m) msg.textContent = m;
  });
  game.toMenu();
  const ms = Math.round(performance.now() - t0);
  console.info(`[OUTSIDE.EXE] playable in ${ms} ms (scene build ${Math.round(game.buildMs)} ms)`);
  clearInterval(cycle);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
}

boot().catch((e) => {
  console.error(e);
  clearInterval(cycle);
  msg.textContent = 'Something went wrong while loading. Please refresh. (Even the game is anxious.)';
});
