import * as THREE from 'three';

// All textures are drawn at runtime on small canvases: zero image downloads.
function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
const KANNADA = '"Kannada Sangam MN", "Noto Sans Kannada", "Tunga", sans-serif';

export interface SignOpts {
  bg?: string;
  fg?: string;
  sub?: string;
  subFg?: string;
  border?: string;
  font?: string;
  w?: number;
  h?: number;
  kannada?: string;
  glow?: boolean;
}

export function signTexture(text: string, o: SignOpts = {}) {
  const w = o.w ?? 512;
  const h = o.h ?? 128;
  const [c, g] = canvas(w, h);
  g.fillStyle = o.bg ?? '#1d1b2e';
  g.fillRect(0, 0, w, h);
  if (o.border) {
    g.strokeStyle = o.border;
    g.lineWidth = h * 0.06;
    g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (o.glow) {
    g.shadowColor = o.fg ?? '#fff';
    g.shadowBlur = h * 0.12;
  }
  const lines = [text, o.kannada, o.sub].filter(Boolean).length;
  const mainSize = lines > 1 ? h * 0.42 : h * 0.55;
  g.fillStyle = o.fg ?? '#fff';
  g.font = `800 ${mainSize}px ${o.font ?? FONT}`;
  fitText(g, text, w * 0.9, mainSize, o.font ?? FONT, 800);
  const yMain = lines > 1 ? h * 0.36 : h * 0.52;
  g.fillText(text, w / 2, yMain);
  let y = h * 0.76;
  if (o.kannada) {
    g.font = `700 ${h * 0.26}px ${KANNADA}`;
    g.fillStyle = o.subFg ?? o.fg ?? '#fff';
    g.fillText(o.kannada, w / 2, y);
    y += h * 0.2;
  }
  if (o.sub) {
    g.shadowBlur = 0;
    g.font = `600 ${h * 0.2}px ${FONT}`;
    g.fillStyle = o.subFg ?? '#ddd';
    g.fillText(o.sub, w / 2, o.kannada ? h * 0.9 : h * 0.76);
  }
  return tex(c);
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string, weight: number) {
  let s = size;
  g.font = `${weight} ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 8) {
    s *= 0.92;
    g.font = `${weight} ${s}px ${font}`;
  }
}

/** Original fictional anime posters. */
export function posterTexture(kind: 0 | 1 | 2) {
  const [c, g] = canvas(256, 360);
  const pal = [
    ['#2b1055', '#d53369', '#ffe29f', 'STARFALL', 'RONIN'],
    ['#0f2027', '#00c6ff', '#f9f871', 'NEON', 'CATBOY Z'],
    ['#3a1c71', '#ffaf7b', '#ffffff', 'MY ROOMMATE IS', 'A DRAGON GOD 4'],
  ][kind];
  const grd = g.createLinearGradient(0, 0, 0, 360);
  grd.addColorStop(0, pal[0]);
  grd.addColorStop(1, pal[1]);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 360);
  // speed lines
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    g.beginPath();
    g.moveTo(128, 150);
    g.lineTo(128 + Math.cos(a) * 300, 150 + Math.sin(a) * 300);
    g.stroke();
  }
  g.fillStyle = pal[2];
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(128, 135, kind === 1 ? 70 : 82, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  // hero silhouette
  g.fillStyle = '#120a1c';
  g.beginPath();
  g.ellipse(128, 150, 26, 30, 0, 0, Math.PI * 2);
  g.fill();
  if (kind === 1) {
    g.beginPath();
    g.moveTo(104, 132); g.lineTo(110, 98); g.lineTo(124, 124);
    g.moveTo(152, 132); g.lineTo(146, 98); g.lineTo(132, 124);
    g.fill();
  }
  if (kind === 2) {
    g.beginPath();
    g.moveTo(110, 128); g.lineTo(96, 96); g.lineTo(120, 122);
    g.moveTo(146, 128); g.lineTo(160, 96); g.lineTo(136, 122);
    g.fill();
  }
  g.beginPath();
  g.moveTo(70, 360);
  g.quadraticCurveTo(80, 200, 128, 178);
  g.quadraticCurveTo(176, 200, 186, 360);
  g.fill();
  if (kind === 0) {
    g.save();
    g.translate(128, 210);
    g.rotate(-0.7);
    g.fillStyle = '#e8e8f0';
    g.fillRect(-4, -150, 8, 190);
    g.restore();
  }
  // eyes glint
  g.fillStyle = pal[1];
  g.fillRect(114, 146, 8, 3);
  g.fillRect(134, 146, 8, 3);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.shadowColor = '#000';
  g.shadowBlur = 8;
  g.font = `900 ${kind === 2 ? 22 : 40}px ${FONT}`;
  g.fillText(pal[3], 128, 285);
  g.font = `900 ${kind === 2 ? 26 : 34}px ${FONT}`;
  g.fillStyle = pal[2];
  g.fillText(pal[4], 128, 322);
  g.shadowBlur = 0;
  g.font = `600 12px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(kind === 0 ? 'FINAL SEASON • TONIGHT 8PM' : kind === 1 ? 'NOW STREAMING' : 'THE MOVIE (NOT CANON)', 128, 348);
  return tex(c);
}

/** Night skyline seen through apartment windows. */
export function skylineTexture() {
  const [c, g] = canvas(1024, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#141a3d');
  grd.addColorStop(0.55, '#3c2f6b');
  grd.addColorStop(0.8, '#c0607a');
  grd.addColorStop(1, '#f2a65a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 1024, Math.random() * 200, 2, 2);
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < 1024) {
      const bw = 40 + Math.random() * 90;
      const bh = (layer ? 160 : 90) + Math.random() * (layer ? 200 : 140);
      g.fillStyle = layer ? '#151229' : '#2b2450';
      g.fillRect(x, 512 - bh, bw, bh);
      for (let wy = 512 - bh + 10; wy < 500; wy += 16) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
          if (Math.random() < (layer ? 0.32 : 0.18)) {
            g.fillStyle = Math.random() < 0.7 ? '#ffcf7a' : '#9fd8ff';
            g.globalAlpha = layer ? 0.9 : 0.5;
            g.fillRect(wx, wy, 6, 8);
            g.globalAlpha = 1;
          }
        }
      }
      x += bw + (layer ? 2 : 10);
    }
  }
  return tex(c);
}

/** Radial light pool used under lamps (cheap fake lighting). */
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function rangoliTexture() {
  const [c, g] = canvas(256, 256);
  g.translate(128, 128);
  const cols = ['#ff4f81', '#ffd23f', '#3bceac', '#ee6c4d', '#7b2cbf', '#ffffff'];
  for (let r = 6; r > 0; r--) {
    g.fillStyle = cols[r % cols.length];
    const n = 8;
    for (let i = 0; i < n; i++) {
      g.save();
      g.rotate((i / n) * Math.PI * 2 + r * 0.2);
      g.beginPath();
      g.ellipse(0, r * 16, 8 + r * 2, r * 7, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(0, 0, 14, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** Screens: TV, monitors. Returns a texture plus a redraw helper. */
export function screenTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 144) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = tex(c);
  return {
    texture: t,
    redraw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
      fn(g, w, h);
      t.needsUpdate = true;
    },
  };
}

export function drawTV(g: CanvasRenderingContext2D, w: number, h: number, mode: 'menu' | 'finale' | 'paused' | 'credits') {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#24124a');
  grd.addColorStop(1, '#d53369');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,226,159,0.85)';
  g.beginPath();
  g.arc(w * 0.72, h * 0.42, h * 0.28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.font = `900 ${h * 0.16}px ${FONT}`;
  g.fillText('STARFALL RONIN', w * 0.06, h * 0.3);
  g.font = `700 ${h * 0.09}px ${FONT}`;
  const sub = {
    menu: 'Ep. 24 — SEASON FINALE  ▶ 8:00 PM',
    finale: '▶ PLAY: "The Last Sunset"',
    paused: '❚❚ PAUSED — feed the cat first',
    credits: '▶ Up next: Season 2 announced?!',
  }[mode];
  g.fillText(sub, w * 0.06, h * 0.46);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(0, h * 0.86, w, h * 0.14);
  g.fillStyle = '#ffd23f';
  g.fillRect(0, h * 0.86, w * (mode === 'menu' ? 0.02 : 0.4), h * 0.03);
}

export function drawMonitor(g: CanvasRenderingContext2D, w: number, h: number, kind: 0 | 1) {
  g.fillStyle = kind ? '#10131c' : '#1a1b26';
  g.fillRect(0, 0, w, h);
  if (kind === 0) {
    // browser tab chaos
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i === 3 ? '#3b3f58' : '#262838';
      g.fillRect(2 + i * (w / 16), 2, w / 16 - 2, 10);
    }
    g.fillStyle = '#ff0033';
    g.fillRect(10, 22, w * 0.6, h * 0.45);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(10 + w * 0.27, 40);
    g.lineTo(10 + w * 0.27, 70);
    g.lineTo(10 + w * 0.36, 55);
    g.fill();
    g.fillStyle = '#9aa';
    for (let i = 0; i < 4; i++) g.fillRect(w * 0.68, 24 + i * 22, w * 0.28, 14);
  } else {
    const cols = ['#7aa2f7', '#9ece6a', '#bb9af7', '#e0af68', '#f7768e'];
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect(10 + (i % 3) * 12, 10 + i * 10, 20 + ((i * 37) % 120), 5);
    }
  }
}

export function noticeTexture() {
  const [c, g] = canvas(384, 256);
  g.fillStyle = '#7a5230';
  g.fillRect(0, 0, 384, 256);
  g.fillStyle = '#a77b4f';
  g.fillRect(8, 8, 368, 240);
  const notes: Array<[number, number, number, number, string, string]> = [
    [20, 18, 170, 120, '#fffbe6', 'NOTICE\nNo drying clothes\nin the lift.\n— RWA Secretary'],
    [200, 22, 160, 100, '#d9f2ff', 'YOGA CLASS\nSun 6AM\nTerrace\n(sleepers exempt)'],
    [30, 150, 150, 90, '#ffe1ec', 'LOST: one slipper\n(left). Reward:\nthe other one.'],
    [196, 136, 168, 104, '#e8ffd9', 'WATER CUT\nTue 10AM–4PM\nPlan baths\nstrategically.'],
  ];
  for (const [x, y, w, h, col, txt] of notes) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 3, y + 3, w, h);
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
    g.fillStyle = '#d33';
    g.beginPath();
    g.arc(x + w / 2, y + 6, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    txt.split('\n').forEach((l, i) => {
      g.font = `${i === 0 ? 800 : 500} ${i === 0 ? 16 : 13}px ${FONT}`;
      g.fillText(l, x + 8, y + 26 + i * 18);
    });
  }
  return tex(c);
}

export function catFoodTexture() {
  const [c, g] = canvas(128, 160);
  const grd = g.createLinearGradient(0, 0, 0, 160);
  grd.addColorStop(0, '#ff8a3d');
  grd.addColorStop(1, '#e8505b');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = `900 22px ${FONT}`;
  g.fillText('MEOW', 64, 30);
  g.fillText('MEAL', 64, 52);
  // cat face
  g.fillStyle = '#fff4e0';
  g.beginPath();
  g.arc(64, 98, 30, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(38, 84); g.lineTo(42, 58); g.lineTo(58, 74);
  g.moveTo(90, 84); g.lineTo(86, 58); g.lineTo(70, 74);
  g.fill();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(53, 94, 4, 0, Math.PI * 2);
  g.arc(75, 94, 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f48fb1';
  g.beginPath();
  g.arc(64, 104, 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `700 12px ${FONT}`;
  g.fillText('OCEAN FISH • 1.2kg', 64, 148);
  return tex(c);
}

export function labelTexture(text: string, bg: string, fg = '#fff', sub = '') {
  const [c, g] = canvas(128, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = `900 24px ${FONT}`;
  text.split('\n').forEach((l, i) => g.fillText(l, 64, 46 + i * 26));
  if (sub) {
    g.font = `600 13px ${FONT}`;
    g.fillText(sub, 64, 112);
  }
  return tex(c);
}

export function sparkleTexture() {
  const [c, g] = canvas(64, 64);
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.shadowColor = '#ffd27a';
  g.shadowBlur = 10;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 22 : 6;
    const a = (i / 8) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}
