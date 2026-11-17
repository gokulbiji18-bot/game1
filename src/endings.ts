import type { Stats } from './game';

export type EndingId = 'A' | 'B' | 'C';

export const ENDINGS: Record<EndingId, { name: string; achievement: string; kicker: string; quote: string }> = {
  A: { name: 'QUIET VICTORY', achievement: 'ACHIEVEMENT: LEFT THE HOUSE', kicker: 'MISSION COMPLETE', quote: '"That wasn\'t so bad. Okay, it was bad. But I did it."' },
  B: { name: 'THE SOCIAL BUTTERFLY (ALMOST)', achievement: 'FUNCTIONING MEMBER OF SOCIETY', kicker: 'ACHIEVEMENT UNLOCKED', quote: '"Wait. Did I just make small talk? Voluntarily? ...Character development."' },
  C: { name: 'CHAOTIC SUCCESS', achievement: 'FINANCIAL DAMAGE: UNNECESSARY', kicker: 'MISSION COMPLETE', quote: '"I went outside for one packet of cat food."' },
};

/** Deterministic rules so every ending is reachable on purpose. */
export function computeEnding(s: Stats): EndingId {
  if (s.extras.length >= 2 || s.awkward >= 4) return 'C';
  if (s.conversations >= 4) return 'B';
  return 'A';
}

const KEY = 'outside-exe-endings';
export function recordEnding(id: EndingId): EndingId[] {
  let found: EndingId[] = [];
  try {
    found = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    /* ignore */
  }
  if (!found.includes(id)) found.push(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* ignore */
  }
  return found;
}

export function resultsHtml(id: EndingId, s: Stats, peak: number, found: EndingId[]) {
  const e = ENDINGS[id];
  const secs = Math.round((performance.now() - s.start) / 1000);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const missing = (['A', 'B', 'C'] as EndingId[]).filter((x) => !found.includes(x));
  const hints: Record<EndingId, string> = {
    A: 'keep it simple — take the stairs, skip the calls, fewer than four chats',
    B: 'talk to at least four people, nicely',
    C: 'say four weird things, or buy two things you don\'t need',
  };
  const hint = missing.length ? `Still hidden: ${missing.map((m) => `Ending ${m} (${hints[m]})`).join(' · ')}` : 'All three endings found. You are now, technically, a well-rounded person.';
  return `<div class="k">${e.kicker}</div>
  <h1>${e.name}</h1>
  <h3>${e.achievement}</h3>
  <div class="quote">${e.quote}</div>
  <div class="results">
    <div><b>${time}</b>Time outside the comfort zone</div>
    <div><b>${s.conversations}</b>Conversations completed</div>
    <div><b>${s.avoided}</b>Small talks stealthily avoided</div>
    <div><b>${s.awkward}</b>Awkward replies (logged forever)</div>
    <div><b>${s.extras.length ? s.extras.join(', ') : 'None'}</b>Unnecessary purchases</div>
    <div><b>${s.secrets.size} / 5</b>Secrets discovered</div>
    <div><b>${Math.round(peak)}%</b>Peak Thought Spiral</div>
    <div><b>${s.danceFails === 0 ? 'Flawless' : s.danceFails + ' bump' + (s.danceFails > 1 ? 's' : '')}</b>Sidewalk dance</div>
  </div>
  <div class="moral">You don't have to stop feeling anxious to accomplish something.<br/>Sometimes surviving the outside world means buying one packet of cat food and coming home.<br/>And sometimes that deserves an achievement.</div>
  <div class="endings-found">ENDINGS FOUND: ${found.length} / 3 — ${hint}</div>`;
}
