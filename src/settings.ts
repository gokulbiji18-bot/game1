export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  quality: Quality;
  reducedMotion: boolean;
  reducedAnxiety: boolean;
  muted: boolean;
  invertY: boolean;
}

const KEY = 'outside-exe-settings-v1';

const defaults: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  sensitivity: 1,
  quality: 'high',
  reducedMotion: false,
  reducedAnxiety: false,
  muted: false,
  invertY: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* storage may be unavailable */
  }
  return { ...defaults };
}

export const settings: Settings = load();

const listeners: Array<() => void> = [];
export function onSettingsChange(fn: () => void) {
  listeners.push(fn);
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn());
}
