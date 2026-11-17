// Keyboard + mouse input with pointer-lock and click-drag camera fallback.
type KeyHandler = (code: string, e: KeyboardEvent) => boolean | void;

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  mdx = 0;
  mdy = 0;
  locked = false;
  private dragging = false;
  private handlers: KeyHandler[] = [];
  onLockChange: (locked: boolean) => void = () => {};
  /** When false, clicking the canvas will not request pointer lock (menus, dialogue choices). */
  allowLock = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      for (const h of this.handlers) if (h(e.code, e)) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.allowLock && !this.locked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          if (p && typeof p.catch === 'function') p.catch(() => (this.dragging = true));
        } catch {
          this.dragging = true;
        }
      }
      this.dragging = true;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.dragging = false;
      this.onLockChange(this.locked);
    });
  }

  /** Handlers run before the key reaches the game; return true to swallow it. */
  addKeyHandler(h: KeyHandler) {
    this.handlers.unshift(h);
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.pressed.clear();
    this.mdx = 0;
    this.mdy = 0;
  }
}
