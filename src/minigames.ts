import * as THREE from 'three';
import { audio } from './audio';
import { settings } from './settings';
import type { Game } from './game';
import { Cancel } from './dialogue';

const mg = () => document.getElementById('minigame')!;

/**
 * THE SIDEWALK DANCE. The stranger mirrors every sidestep, except when he glances at his phone.
 * Sidestep (A/D) during that window to slip past. Auto-resolves after 3 bumps or ~14 seconds.
 */
export function sidewalkDance(game: Game, strangerId = 'stranger'): Promise<{ fails: number; auto: boolean }> {
  const st = game.npcs.get(strangerId)!;
  const player = game.player;
  const gen = game.gen;
  const centerZ = -2.3;
  const laneOff = 0.45;
  const thoughts = ['WHY ARE WE SYNCHRONIZED?', 'WE\'VE DEVELOPED A BOND.', 'THIS IS MY LIFE NOW.', 'He is reading my mind. I am an open book. A bad one.'];
  return new Promise((resolve, reject) => {
    let fails = 0;
    let attnT = 1.6 + Math.random() * 0.8;
    let open = false;
    let openT = 0;
    let busy = 0; // animation lock
    let total = 0;
    let finished = false;
    let pZ = centerZ, sZ = centerZ; // lateral targets
    const openDur = settings.reducedMotion ? 1.3 : 1.0;
    const el = mg();
    el.classList.remove('hidden');
    el.innerHTML = `<div class="mg-panel"><div class="mg-title">MINI BOSS · THE SIDEWALK STRANGER</div>
      <div class="mg-text">He mirrors everything you do. Wait until he <b>glances at his phone</b>, then sidestep with <span class="key">A</span> or <span class="key">D</span>.</div>
      <div class="mg-attn"><div class="fill"></div><div class="lbl">ATTENTION: LOCKED ON YOU</div></div>
      <div class="mg-tries">BUMPS: 0 / 3</div></div>`;
    const attn = el.querySelector('.mg-attn') as HTMLElement;
    const lbl = el.querySelector('.lbl') as HTMLElement;
    const tries = el.querySelector('.mg-tries') as HTMLElement;
    const fill = el.querySelector('.fill') as HTMLElement;

    const finish = (auto: boolean) => {
      if (finished) return;
      finished = true;
      game.tickers.delete(tick);
      window.removeEventListener('keydown', key, true);
      el.classList.add('hidden');
      el.innerHTML = '';
      st.model.pose = 'idle';
      resolve({ fails, auto });
    };

    const sidestep = (dir: number) => {
      if (busy > 0 || finished) return;
      if (open) {
        // success: slip past while he's distracted
        audio.sfx('whoosh');
        pZ = centerZ + dir * laneOff * 1.6;
        busy = 99;
        setTimeout(() => finish(false), 50);
        return;
      }
      // mirrored! both step to the same side of the sidewalk
      fails++;
      pZ = centerZ + dir * laneOff;
      sZ = centerZ + dir * laneOff;
      busy = 0.9;
      audio.sfx('bump');
      game.anx.add(9);
      game.cam.shake = 0.3;
      player.model.expr = 'shock';
      game.dlg.think('anx', thoughts[Math.min(fails - 1, thoughts.length - 1)], 2.4);
      tries.textContent = `BUMPS: ${fails} / 3`;
      if (fails >= 3) setTimeout(() => finish(true), 900);
    };

    const key = (e: KeyboardEvent) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') sidestep(1);
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') sidestep(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);

    const tick = (dt: number) => {
      if (game.gen !== gen) {
        game.tickers.delete(tick);
        window.removeEventListener('keydown', key, true);
        el.classList.add('hidden');
        reject(new Cancel());
        return;
      }
      total += dt;
      if (busy > 0 && busy < 50) {
        busy -= dt;
        if (busy <= 0) {
          pZ = centerZ;
          sZ = centerZ;
          player.model.expr = 'nervous';
        }
      }
      // attention cycle
      if (open) {
        openT -= dt;
        if (openT <= 0) {
          open = false;
          attnT = 1.3 + Math.random() * 1.2;
        }
      } else {
        attnT -= dt;
        if (attnT <= 0 && busy <= 0) {
          open = true;
          openT = openDur;
          audio.sfx('buzz', 0.5);
        }
      }
      attn.classList.toggle('open', open);
      lbl.textContent = open ? 'DISTRACTED — GO NOW!' : 'ATTENTION: LOCKED ON YOU';
      fill.style.width = open ? `${(openT / openDur) * 100}%` : '100%';
      st.model.pose = open ? 'phone' : 'hesitate';
      st.model.expr = open ? 'neutral' : 'nervous';
      // lateral sway mirroring (idle shuffle)
      const sway = busy > 0 ? 0 : Math.sin(total * 2.2) * 0.08;
      const k = 1 - Math.exp(-dt * 10);
      player.pos.z += (pZ + sway - player.pos.z) * k;
      st.pos.z += (sZ + sway - st.pos.z) * k;
      player.sync();
      st.sync();
      if (total > 15 && !finished && busy <= 0) finish(true);
    };
    game.tickers.add(tick);
  });
}

function qrDataUrl() {
  const c = document.createElement('canvas');
  c.width = c.height = 29;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 29, 29);
  g.fillStyle = '#000';
  for (let y = 0; y < 29; y++) for (let x = 0; x < 29; x++) if (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1 > 0.1) g.fillRect(x, y, 1, 1);
  const finder = (x: number, y: number) => {
    g.fillStyle = '#000';
    g.fillRect(x, y, 7, 7);
    g.fillStyle = '#fff';
    g.fillRect(x + 1, y + 1, 5, 5);
    g.fillStyle = '#000';
    g.fillRect(x + 2, y + 2, 3, 3);
  };
  finder(0, 0);
  finder(22, 0);
  finder(0, 22);
  return c.toDataURL();
}

/** Checkout payment. Every path succeeds; the only question is how dramatically. */
export function payment(game: Game, total: number): Promise<'upi' | 'card' | 'cash'> {
  const el = mg();
  const gen = game.gen;
  return new Promise((resolve, reject) => {
    let done = false;
    let cleanup: () => void = () => {};
    const end = (m: 'upi' | 'card' | 'cash') => {
      if (done) return;
      done = true;
      cleanup();
      el.classList.add('hidden');
      el.innerHTML = '';
      game.input.allowLock = game.playing && !game.paused;
      resolve(m);
    };
    const guard = () => {
      if (game.gen !== gen) {
        done = true;
        cleanup();
        el.classList.add('hidden');
        reject(new Cancel());
        return false;
      }
      return true;
    };
    el.classList.remove('hidden');
    game.releaseMouse();
    el.innerHTML = `<div class="mg-panel"><div class="mg-title">PAYMENT · ₹${total}</div>
      <div class="mg-text">How will you pay?</div>
      <div class="pay-opts"><button data-m="upi"><span class="key">1</span>UPI (scan QR)</button><button data-m="card"><span class="key">2</span>Card (tap)</button><button data-m="cash"><span class="key">3</span>Cash</button></div></div>`;
    const choose = (m: 'upi' | 'card' | 'cash') => {
      window.removeEventListener('keydown', pickKey, true);
      audio.sfx('select');
      if (m === 'upi') upi();
      else if (m === 'card') {
        el.innerHTML = `<div class="mg-panel"><div class="mg-title">CARD</div><div class="mg-text">You tap the card. The machine thinks about it. For one full second, so do you.</div><div class="app-spin" style="margin:0 auto"></div></div>`;
        setTimeout(() => {
          if (!guard()) return;
          audio.sfx('beep');
          el.innerHTML = `<div class="mg-panel"><div class="mg-title" style="color:var(--green)">APPROVED ✓</div><div class="mg-text">Beep. Approved. The most beautiful sound in the world.</div></div>`;
          setTimeout(() => guard() && end('card'), 1300);
        }, 1400);
      } else {
        el.innerHTML = `<div class="mg-panel"><div class="mg-title">CASH</div><div class="mg-text">You hand over a ₹500 note for a ₹${total} purchase. The cashier counts change for what feels like forty business years.</div><div class="app-spin" style="margin:0 auto"></div></div>`;
        setTimeout(() => {
          if (!guard()) return;
          audio.sfx('kaching');
          el.innerHTML = `<div class="mg-panel"><div class="mg-title" style="color:var(--green)">PAID ✓</div><div class="mg-text">₹${500 - total} change. You don't count it. Counting it would be confrontational.</div></div>`;
          setTimeout(() => guard() && end('cash'), 1500);
        }, 1700);
      }
    };
    const pickKey = (e: KeyboardEvent) => {
      const m = { Digit1: 'upi', Digit2: 'card', Digit3: 'cash', Numpad1: 'upi', Numpad2: 'card', Numpad3: 'cash' }[e.code] as 'upi' | 'card' | 'cash' | undefined;
      if (m) {
        e.preventDefault();
        e.stopPropagation();
        choose(m);
      }
    };
    window.addEventListener('keydown', pickKey, true);
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => choose((b as HTMLElement).dataset.m as 'upi')));
    cleanup = () => window.removeEventListener('keydown', pickKey, true);

    function upi() {
      let misses = 0;
      let t = 0;
      let raf = 0;
      let last = performance.now();
      let locked = false;
      el.innerHTML = `<div class="mg-panel"><div class="mg-title">SCAN THE QR</div>
        <div class="mg-text">Your hands are shaking a little. Press <span class="key">Space</span> when the QR code is inside the frame.</div>
        <div class="qr-wrap"><div class="qr-code"></div><div class="qr-reticle"></div></div>
        <div class="mg-tries">MISSES: 0 / 3</div></div>`;
      const qr = el.querySelector('.qr-code') as HTMLElement;
      const ret = el.querySelector('.qr-reticle') as HTMLElement;
      const tries = el.querySelector('.mg-tries') as HTMLElement;
      const wrap = el.querySelector('.qr-wrap') as HTMLElement;
      qr.style.backgroundImage = `url(${qrDataUrl()})`;
      const amp = () => (locked ? 0 : 70 + Math.min(1, game.anx.value / 100) * 70);
      let offset = 0;
      const frame = () => {
        if (!guard()) return;
        const now = performance.now();
        t += (now - last) / 1000;
        last = now;
        offset = Math.sin(t * 2.6) * amp() + Math.sin(t * 7.1) * (locked ? 0 : 8);
        qr.style.left = `${wrap.clientWidth / 2 - 60 + offset}px`;
        ret.classList.toggle('hit', Math.abs(offset) < 22);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      const press = () => {
        if (Math.abs(offset) < 24) success();
        else {
          misses++;
          audio.sfx('bump', 0.6);
          game.anx.add(5);
          tries.textContent = `MISSES: ${misses} / 3`;
          if (misses >= 3) {
            locked = true;
            tries.textContent = 'The cashier gently holds the QR stand still for you. Press Space.';
          }
        }
      };
      const key = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          press();
        }
      };
      wrap.addEventListener('click', press);
      window.addEventListener('keydown', key, true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', key, true);
      };
      function success() {
        cleanup();
        cleanup = () => {};
        audio.sfx('beep');
        game.ui.phone(`<div class="app-head" style="background:#5a2ca0">QuickPay UPI</div><div class="app-body"><div class="app-spin"></div><div class="app-big">Paying ₹${total}<br/>to NAMMA MART</div><div class="app-small">Please do not refresh. Please do not breathe.</div></div>`);
        el.classList.add('hidden');
        setTimeout(() => {
          if (!guard()) return;
          audio.sfx('kaching');
          game.ui.phone(`<div class="app-head" style="background:#2d6a4f">Payment</div><div class="app-body"><div style="font-size:54px">✓</div><div class="app-big">₹${total} paid</div><div class="app-small">to NAMMA MART · just now</div></div>`);
          setTimeout(() => {
            game.ui.phone(null);
            if (guard()) end('upi');
          }, 1300);
        }, 1500);
      }
    }
  });
}

/** Little helper to tween a value over time inside the game loop. */
export function tween(game: Game, dur: number, fn: (k: number) => void): Promise<void> {
  const gen = game.gen;
  if (dur <= 0 || game.skipping) {
    fn(1);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let t = 0;
    const tick = (dt: number) => {
      if (game.gen !== gen) {
        game.tickers.delete(tick);
        reject(new Cancel());
        return;
      }
      t = Math.min(1, t + dt / dur);
      fn(t);
      if (t >= 1) {
        game.tickers.delete(tick);
        resolve();
      }
    };
    game.tickers.add(tick);
  });
}

export const lerpV = (a: THREE.Vector3, b: THREE.Vector3, k: number) => new THREE.Vector3().lerpVectors(a, b, k);
