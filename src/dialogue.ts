import { audio } from './audio';
import { settings } from './settings';
import { Input } from './input';

export class Cancel extends Error {
  constructor() {
    super('cancelled');
  }
}

export type Speaker = 'logic' | 'anx' | 'aarav' | 'think' | 'system' | { name: string; color: string };

const SPEAKERS: Record<string, { label: string; cls: string }> = {
  logic: { label: 'LOGICAL BRAIN', cls: 'sp-logic' },
  anx: { label: 'ANXIOUS BRAIN', cls: 'sp-anx' },
  aarav: { label: 'AARAV', cls: 'sp-aarav' },
  think: { label: 'AARAV (thinking)', cls: 'sp-think' },
  system: { label: 'SYSTEM', cls: 'sp-system' },
};

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

interface Pending {
  reject: (e: Error) => void;
}

/** Blocking dialogue lines, untimed choices, and non-blocking ambient thoughts. */
export class Dialogue {
  private box = document.getElementById('dialogue')!;
  private choicesEl = document.getElementById('choices')!;
  private thoughts = document.getElementById('thoughts')!;
  private advanceFn: (() => void) | null = null;
  private chooseFn: ((i: number) => void) | null = null;
  private choiceCount = 0;
  private pending = new Set<Pending>();
  private history: HTMLElement[] = [];
  active = false;
  /** Called when choices open/close so the game can release pointer lock. */
  onChoicesOpen: (open: boolean) => void = () => {};
  /** Skip mode (cutscene skipping): lines resolve instantly. */
  skipping = false;

  constructor(input: Input) {
    input.addKeyHandler((code) => {
      if (this.chooseFn) {
        const m = /^(Digit|Numpad)([1-9])$/.exec(code);
        if (m) {
          const i = parseInt(m[2], 10) - 1;
          if (i < this.choiceCount) this.pick(i);
          return true;
        }
        return false;
      }
      if (this.advanceFn && (code === 'KeyE' || code === 'Space' || code === 'Enter')) {
        this.advanceFn();
        return true;
      }
      return false;
    });
    this.box.addEventListener('click', () => this.advanceFn?.());
  }

  private track<T>(p: Promise<T>, reject: (e: Error) => void): Promise<T> {
    const entry = { reject };
    this.pending.add(entry);
    return p.finally(() => this.pending.delete(entry));
  }

  /** Show a line and wait for the player to advance. */
  say(speaker: Speaker, text: string): Promise<void> {
    const sp = typeof speaker === 'string' ? SPEAKERS[speaker] : { label: speaker.name.toUpperCase(), cls: 'sp-npc' };
    const color = typeof speaker === 'string' ? '' : speaker.color;
    this.active = true;
    this.box.classList.add('show');
    // keep the last two lines visible for comedic back-and-forth
    this.history.forEach((h) => h.classList.add('old'));
    while (this.history.length > 2) this.history.shift()!.remove();
    const line = document.createElement('div');
    line.className = `line ${sp.cls}`;
    line.innerHTML = `<div class="who"${color ? ` style="color:${color}"` : ''}>${esc(sp.label)}</div><div class="txt"></div><div class="next">▸</div>`;
    this.box.appendChild(line);
    this.history.push(line);
    const txt = line.querySelector('.txt') as HTMLElement;
    if (speaker === 'anx') audio.sfx('pop', 0.4);
    else audio.sfx('click', 0.5);

    let reject!: (e: Error) => void;
    const p = new Promise<void>((resolve, rej) => {
      reject = rej;
      const instant = settings.reducedMotion || this.skipping;
      let shown = instant ? text.length : 0;
      let done = instant;
      const render = () => (txt.innerHTML = esc(text.slice(0, shown)) + (done ? '' : '<span class="caret">▌</span>'));
      render();
      let timer = 0;
      if (!instant) {
        timer = window.setInterval(() => {
          shown = Math.min(text.length, shown + 2);
          if (shown >= text.length) {
            done = true;
            clearInterval(timer);
            line.classList.add('ready');
          }
          render();
        }, 22);
      } else line.classList.add('ready');
      const minTime = performance.now() + (this.skipping ? 0 : 250);
      this.advanceFn = () => {
        if (!done) {
          shown = text.length;
          done = true;
          clearInterval(timer);
          line.classList.add('ready');
          render();
          return;
        }
        if (performance.now() < minTime) return;
        this.advanceFn = null;
        resolve();
      };
      if (this.skipping) this.advanceFn();
    });
    return this.track(p, reject);
  }

  /** Sequence of lines. */
  async lines(seq: Array<[Speaker, string]>) {
    for (const [s, t] of seq) await this.say(s, t);
  }

  /** Close the dialogue box. */
  close() {
    this.active = false;
    this.advanceFn = null;
    this.box.classList.remove('show');
    this.history.forEach((h) => h.remove());
    this.history = [];
  }

  /** Untimed choice panel. Resolves with the chosen index. */
  choose(title: string, options: string[]): Promise<number> {
    this.choiceCount = options.length;
    this.choicesEl.innerHTML = `<div class="ch-title">${esc(title)}</div>` + options.map((o, i) => `<button class="choice" data-i="${i}"><span class="key">${i + 1}</span>${esc(o)}</button>`).join('');
    this.choicesEl.classList.remove('hidden');
    this.box.classList.add('under-choice');
    this.onChoicesOpen(true);
    audio.sfx('select', 0.6);
    let reject!: (e: Error) => void;
    const p = new Promise<number>((resolve, rej) => {
      reject = rej;
      this.chooseFn = (i) => {
        this.chooseFn = null;
        this.choicesEl.classList.add('hidden');
        this.box.classList.remove('under-choice');
        this.onChoicesOpen(false);
        audio.sfx('click');
        resolve(i);
      };
      this.choicesEl.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.pick(parseInt((b as HTMLElement).dataset.i!, 10));
        }),
      );
    });
    return this.track(p, reject);
  }

  private pick(i: number) {
    const fn = this.chooseFn;
    if (!fn) return;
    const btn = this.choicesEl.querySelector(`button[data-i="${i}"]`);
    btn?.classList.add('picked');
    fn(i);
  }

  get choosing() {
    return !!this.chooseFn;
  }

  /** Non-blocking ambient thought bubble. */
  think(speaker: Speaker, text: string, dur?: number) {
    const sp = typeof speaker === 'string' ? SPEAKERS[speaker] : { label: speaker.name.toUpperCase(), cls: 'sp-npc' };
    const el = document.createElement('div');
    el.className = `thought ${sp.cls}`;
    el.innerHTML = `<b>${esc(sp.label)}</b> ${esc(text)}`;
    this.thoughts.appendChild(el);
    while (this.thoughts.children.length > 3) this.thoughts.firstElementChild!.remove();
    const ms = (dur ?? 2.6 + text.length * 0.05) * 1000;
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  clearThoughts() {
    this.thoughts.innerHTML = '';
  }

  /** Reject every pending promise (restart / main menu). */
  cancelAll() {
    this.pending.forEach((p) => p.reject(new Cancel()));
    this.pending.clear();
    this.chooseFn = null;
    this.choicesEl.classList.add('hidden');
    this.box.classList.remove('under-choice');
    this.onChoicesOpen(false);
    this.close();
    this.clearThoughts();
  }
}
