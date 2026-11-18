import * as THREE from 'three';
import { settings, saveSettings, Quality } from './settings';
import { audio } from './audio';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

interface Bubble {
  el: HTMLElement;
  pos: () => THREE.Vector3;
  until: number;
}

export interface MenuHandlers {
  start: () => void;
  resume: () => void;
  restart: () => void;
  mainMenu: () => void;
  qualityChanged: (q: Quality) => void;
}

export class UI {
  private hud = $('hud');
  private bubbles: Bubble[] = [];
  private bubbleRoot = $('world-bubbles');
  private tmp = new THREE.Vector3();
  private cardQueue: Promise<void> = Promise.resolve();
  menuOpen: 'main' | 'pause' | 'ending' | null = 'main';

  constructor(private h: MenuHandlers) {
    this.buildMenus();
  }

  // ---------------------------------------------------------------- HUD
  showHUD(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
  }

  setObjective(title: string, sub = '') {
    const el = $('objective');
    el.querySelector('.obj-text')!.textContent = title;
    el.querySelector('.obj-sub')!.textContent = sub;
    el.classList.remove('flash');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('flash');
  }

  private errandsKey = '';
  /** The shopping list under the objective. Pass null to hide it. */
  setErrands(items: Array<{ label: string; done: boolean }> | null) {
    const key = items ? items.map((i) => `${i.label}${i.done}`).join('|') : '';
    if (key === this.errandsKey) return;
    const el = $('errands');
    const newlyDone = items && this.errandsKey && items.some((i, k) => i.done && !this.errandsKey.split('|')[k]?.endsWith('true'));
    this.errandsKey = key;
    el.hidden = !items;
    if (!items) return;
    el.innerHTML = items.map((i) => `<li class="${i.done ? 'done' : ''}"><span class="box">${i.done ? '✓' : ''}</span>${esc(i.label)}</li>`).join('');
    if (newlyDone) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  setClock(t: string) {
    $('clock').textContent = t;
  }

  setMeter(v: number, level: string, focusReady: boolean, focusActive: boolean, cd: number) {
    const fill = $('meter-fill');
    fill.style.width = `${v.toFixed(1)}%`;
    const m = $('meter');
    m.dataset.level = level;
    $('meter-label').textContent = level === 'high' ? 'SPIRALING' : level === 'medium' ? 'UNEASY' : 'CALM-ISH';
    const f = $('focus');
    f.classList.toggle('ready', focusReady);
    f.classList.toggle('active', focusActive);
    f.querySelector('.f-cd')!.textContent = focusActive ? 'BREATHE…' : focusReady ? 'READY' : `${Math.ceil(cd)}s`;
  }

  setInventory(items: Array<{ icon: string; name: string }>) {
    const el = $('inventory');
    el.innerHTML = items.length
      ? `<div class="inv-title">BAG</div>` + items.map((i) => `<div class="inv-item"><span>${i.icon}</span>${esc(i.name)}</div>`).join('')
      : `<div class="inv-title">BAG</div><div class="inv-empty">empty (like my social calendar)</div>`;
  }

  setSecrets(n: number, total: number) {
    $('secrets').textContent = `SECRETS ${n}/${total}`;
  }

  setPhoneIndicator(on: boolean) {
    $('phone-ind').classList.toggle('on', on);
  }

  prompt(text: string | null) {
    const el = $('prompt');
    if (!text) {
      el.classList.remove('show');
      return;
    }
    el.innerHTML = `<span class="key">E</span>${esc(text)}`;
    el.classList.add('show');
  }

  toast(kind: 'stealth' | 'social' | 'secret' | 'achievement' | 'info' | 'item', title: string, body = '') {
    const el = document.createElement('div');
    el.className = `toast t-${kind}`;
    el.innerHTML = `<div class="t-title">${esc(title)}</div>${body ? `<div class="t-body">${esc(body)}</div>` : ''}`;
    $('toasts').appendChild(el);
    audio.sfx(kind === 'secret' ? 'secret' : 'toast', 0.8);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 500);
    }, 3800);
  }

  /** Big centered title card (quest unlocked, boss intro...). Queued, auto-dismiss. */
  card(html: string, cls = '', dur = 3.2): Promise<void> {
    const run = () =>
      new Promise<void>((resolve) => {
        const el = document.createElement('div');
        el.className = `card ${cls}`;
        el.innerHTML = html;
        $('cards').appendChild(el);
        requestAnimationFrame(() => el.classList.add('in'));
        const done = () => {
          window.removeEventListener('keydown', key);
          el.classList.remove('in');
          el.classList.add('out');
          setTimeout(() => el.remove(), 450);
          resolve();
        };
        const key = (e: KeyboardEvent) => {
          if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
            clearTimeout(tm);
            done();
          }
        };
        const tm = setTimeout(done, dur * 1000);
        setTimeout(() => window.addEventListener('keydown', key), 500);
      });
    this.cardQueue = this.cardQueue.then(run);
    return this.cardQueue;
  }

  clearCards() {
    $('cards').innerHTML = '';
    this.cardQueue = Promise.resolve();
  }

  warning(text: string) {
    const el = $('warning');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    audio.sfx('warning', 0.7);
  }

  fade(on: boolean, dur = 0.5): Promise<void> {
    const el = $('fade');
    el.style.transitionDuration = `${dur}s`;
    el.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, dur * 1000 + 30));
  }

  fadeText(text: string) {
    $('fade-text').textContent = text;
  }

  letterbox(on: boolean) {
    $('letterbox').classList.toggle('on', on);
  }

  skipHint(on: boolean) {
    $('skip').classList.toggle('show', on);
  }

  bossBar(show: boolean, name = '', sub = '', hp = 1) {
    const el = $('bossbar');
    el.classList.toggle('show', show);
    if (show) {
      el.querySelector('.b-name')!.textContent = name;
      el.querySelector('.b-sub')!.textContent = sub;
      (el.querySelector('.b-fill') as HTMLElement).style.width = `${Math.max(0, hp) * 100}%`;
    }
  }

  // ---------------------------------------------------------------- phone overlay
  phone(html: string | null) {
    const el = $('phone');
    if (html === null) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.querySelector('.screen')!.innerHTML = html;
  }

  // ---------------------------------------------------------------- world bubbles
  worldBubble(text: string, kind: 'npc' | 'imagined' | 'aarav', pos: () => THREE.Vector3, dur = 3, name = '') {
    const el = document.createElement('div');
    el.className = `wb wb-${kind}`;
    el.innerHTML = (kind === 'imagined' ? '<span class="tag">IMAGINED</span>' : name ? `<span class="tag">${esc(name)}</span>` : '') + esc(text);
    this.bubbleRoot.appendChild(el);
    this.bubbles.push({ el, pos, until: performance.now() + dur * 1000 });
    requestAnimationFrame(() => el.classList.add('in'));
  }

  clearBubbles() {
    this.bubbles.forEach((b) => b.el.remove());
    this.bubbles = [];
  }

  updateBubbles(cam: THREE.Camera, w: number, h: number) {
    const now = performance.now();
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.el.classList.remove('in');
        setTimeout(() => b.el.remove(), 300);
        return false;
      }
      this.tmp.copy(b.pos());
      this.tmp.project(cam);
      const vis = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
      b.el.style.display = vis ? '' : 'none';
      if (vis) b.el.style.transform = `translate(${((this.tmp.x + 1) / 2) * w}px, ${((1 - this.tmp.y) / 2) * h}px) translate(-50%, -100%)`;
      return true;
    });
  }

  // ---------------------------------------------------------------- menus
  showMenu(which: 'main' | 'pause' | null) {
    this.menuOpen = which;
    $('menu').classList.toggle('hidden', which !== 'main');
    $('pause').classList.toggle('hidden', which !== 'pause');
    this.closePanels();
  }

  private closePanels() {
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  }

  private openPanel(id: string) {
    this.closePanels();
    $(id).classList.remove('hidden');
    audio.sfx('click');
  }

  showEnding(html: string) {
    this.menuOpen = 'ending';
    const el = $('ending');
    el.querySelector('.ending-body')!.innerHTML = html;
    el.classList.remove('hidden');
  }

  hideEnding() {
    $('ending').classList.add('hidden');
  }

  private buildMenus() {
    const h = this.h;
    $('btn-start').addEventListener('click', () => {
      audio.init();
      audio.sfx('select');
      h.start();
    });
    $('btn-controls').addEventListener('click', () => this.openPanel('panel-controls'));
    $('btn-settings').addEventListener('click', () => this.openPanel('panel-settings'));
    $('btn-credits').addEventListener('click', () => this.openPanel('panel-credits'));
    $('p-resume').addEventListener('click', () => h.resume());
    $('p-settings').addEventListener('click', () => this.openPanel('panel-settings'));
    $('p-controls').addEventListener('click', () => this.openPanel('panel-controls'));
    $('p-restart').addEventListener('click', () => h.restart());
    $('p-menu').addEventListener('click', () => h.mainMenu());
    $('e-replay').addEventListener('click', () => h.restart());
    $('e-menu').addEventListener('click', () => h.mainMenu());
    document.querySelectorAll('.panel .close').forEach((b) => b.addEventListener('click', () => this.closePanels()));

    // settings bindings
    const bindRange = (id: string, key: 'master' | 'music' | 'sfx' | 'sensitivity') => {
      const el = $(id) as HTMLInputElement;
      el.value = String(settings[key]);
      el.addEventListener('input', () => {
        settings[key] = parseFloat(el.value);
        saveSettings();
        audio.applyVolumes();
      });
    };
    bindRange('s-master', 'master');
    bindRange('s-music', 'music');
    bindRange('s-sfx', 'sfx');
    bindRange('s-sens', 'sensitivity');
    const bindCheck = (id: string, key: 'reducedMotion' | 'reducedAnxiety' | 'muted' | 'invertY') => {
      const el = $(id) as HTMLInputElement;
      el.checked = settings[key];
      el.addEventListener('change', () => {
        settings[key] = el.checked;
        saveSettings();
        audio.applyVolumes();
        document.body.classList.toggle('reduced-motion', settings.reducedMotion);
      });
    };
    bindCheck('s-motion', 'reducedMotion');
    bindCheck('s-anx', 'reducedAnxiety');
    bindCheck('s-mute', 'muted');
    bindCheck('s-invert', 'invertY');
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    const q = $('s-quality') as HTMLSelectElement;
    q.value = settings.quality;
    q.addEventListener('change', () => {
      settings.quality = q.value as Quality;
      saveSettings();
      h.qualityChanged(settings.quality);
    });
  }

  syncSettings() {
    ($('s-mute') as HTMLInputElement).checked = settings.muted;
    ($('s-quality') as HTMLSelectElement).value = settings.quality;
  }
}
