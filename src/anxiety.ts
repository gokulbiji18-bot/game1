import { audio } from './audio';
import { settings } from './settings';

/** THOUGHT SPIRAL: perceived social pressure, 0–100. Purely presentational — never a fail state. */
export class Anxiety {
  value = 0;
  display = 0;
  baseline = 5;
  peak = 0;
  focusT = 0;
  focusCd = 0;
  private warnCd = 0;
  private vignette = document.getElementById('vignette')!;
  private tint = document.getElementById('tint')!;
  private canvas: HTMLCanvasElement;
  onWarning: () => void = () => {};
  /** When the post-processing grade is active it handles desaturation instead of a CSS filter. */
  postActive = false;
  onFocus: () => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  reset() {
    this.value = this.display = 0;
    this.baseline = 5;
    this.peak = 0;
    this.focusT = this.focusCd = 0;
    this.warnCd = 0;
    this.apply(0);
  }

  add(n: number) {
    const mult = this.focusT > 0 ? 0.5 : 1;
    this.value = Math.max(0, Math.min(100, this.value + n * (n > 0 ? mult : 1)));
    this.peak = Math.max(this.peak, this.value);
  }

  get level(): 'low' | 'medium' | 'high' {
    return this.value > 70 ? 'high' : this.value > 30 ? 'medium' : 'low';
  }

  /** F: temporarily quiet the thoughts. Helps, but doesn't erase anything. */
  focus(): boolean {
    if (this.focusCd > 0) return false;
    this.focusT = 5;
    this.focusCd = 14;
    audio.sfx('focus');
    this.onFocus();
    return true;
  }

  update(dt: number) {
    if (this.focusCd > 0) this.focusCd -= dt;
    if (this.focusT > 0) {
      this.focusT -= dt;
      // drain toward a floor, never to zero
      const floor = Math.max(this.baseline, 12);
      if (this.value > floor) this.value = Math.max(floor, this.value - 7 * dt);
    }
    // relax toward the zone baseline
    if (this.value > this.baseline) this.value = Math.max(this.baseline, this.value - 2.2 * dt);
    else this.value = Math.min(this.baseline, this.value + 3 * dt);
    this.display += (this.value - this.display) * (1 - Math.exp(-dt * 4));
    if (this.warnCd > 0) this.warnCd -= dt;
    if (this.value > 82 && this.warnCd <= 0) {
      this.warnCd = 25;
      this.onWarning();
    }
    this.apply(dt);
  }

  private apply(_dt: number) {
    const scale = settings.reducedAnxiety ? 0.35 : 1;
    const focusDim = this.focusT > 0 ? 0.4 : 1;
    const k = Math.max(0, (this.display - 30) / 70) * scale * focusDim;
    this.vignette.style.opacity = String(Math.min(0.9, k * 1.1));
    this.canvas.style.filter = !this.postActive && k > 0.02 ? `saturate(${1 - k * 0.35}) contrast(${1 + k * 0.08})` : '';
    this.tint.style.opacity = this.focusT > 0 ? '1' : '0';
    audio.heartbeat = this.display > 35 ? ((this.display - 35) / 65) * (settings.reducedAnxiety ? 0.4 : 1) * focusDim : 0;
    audio.setMuffle(this.focusT > 0);
  }
}
