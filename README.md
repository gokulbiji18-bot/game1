# OUTSIDE.EXE

*The outside world has too many NPCs.*

A small third-person 3D comedy game for desktop browsers. Aarav, 22, has to leave his apartment in a Bengaluru-style neighbourhood, buy cat food, and come home. That's it. His brain treats it like a boss rush.

- **Playtime:** 5–10 minutes
- **Engine:** Three.js + TypeScript + Vite. No other runtime dependencies.
- **Assets:** none to download. Geometry is procedural low-poly, signs and posters are drawn on canvases at runtime, and all music and sound effects are synthesized with WebAudio.
- **Size:** about 207 KB gzipped on first load, plus an 11 KB chunk for the outside world that loads lazily after the apartment.
- **Look:** cel-shaded characters with anime-style outlines and soft contact shadows; on Medium/High quality a post-processing pass adds bloom on signs, lamps and LED strips, plus a colour grade that the Thought Spiral pushes toward desaturation and chromatic fringing.

## Run it

Requires Node 18+.

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Production build

```bash
npm run build
```

This type-checks, then writes a static site to `dist/`. To preview the build locally:

```bash
npm run preview
```

## Deploy

`dist/` is a plain static site with relative asset paths (`base: './'`), so it works from any static host or subfolder. No server, no environment variables.

- **Netlify:** build command `npm run build`, publish directory `dist` (already set in `netlify.toml`). You can also drag the `dist/` folder onto app.netlify.com/drop.
- **Vercel:** import the repo. Vercel detects Vite and uses `npm run build` with output directory `dist`.
- **GitHub Pages / any static host:** upload the contents of `dist/`.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Rotate the camera (click to lock the pointer, or click-drag) |
| Shift | Walk faster |
| E | Interact / advance dialogue |
| F | Focus: quiet the thoughts for a few seconds |
| Q | Pretend to check your phone (NPCs notice you less) |
| 1–4 | Choose a dialogue option (clicking also works) |
| Tab | Skip a cutscene |
| M | Mute |
| Esc | Pause |

## What's in the game

**The route:** apartment → corridor → lift or stairs → lobby → street → three errands in any order → back home → feed Miso.

**Three errands, one trip.** The opening sets up all of them: the TV remote dies seconds before the finale, Miso's food jar is empty, and an email confirms a job interview tomorrow that needs a printed resume. A checklist under the objective tracks them, the diamond marker points to the nearest unfinished stop, and the lift home stays locked until all three are done.
- **Cat food** at Namma Mart (the original mission, ending with the cashier boss).
- **Batteries** at Sri Venkateshwara Hardware, across the road from the building. "Which size? AA, AAA, C, D, nine-volt?" Pick the wrong size and you'll fix it at home with folded paper. Then he tries to sell you a remote cover.
- **Resume printout** at the xerox shop. No pen drive, a 40-character shop email to type, the shopkeeper reading your resume out loud ("Skills: ... anime"), and a sincere "All the best, sir" at the end.

At home, the batteries go in, the TV comes on, and the finale finally plays.

**Mission states:** `HOME_EXPLORATION → CAT_FOOD_INCIDENT → LEAVE_APARTMENT → TRAVEL_TO_STORE → FIND_CAT_FOOD → CHECKOUT → RETURN_HOME → FEED_CAT → ENDING`. Story beats only fire in the right state. You can't check out without the cat food, can't leave the store with unpaid items, and can't trigger the ending before you get home.

**Systems:**
- **Thought Spiral:** a 0–100 meter. Encounters, greetings, honks and awkward replies raise it. It drives a vignette, a slight desaturation, a camera tighten, a heartbeat, a sweat drop, imagined NPC lines, and the "SOCIAL BATTERY CRITICAL" warning. It's never a fail state. **Focus (F)** calms it for a moment but never empties it.
- **Inner monologue:** the Logical Brain and the Anxious Brain argue in comic-style lines. Ambient thoughts pop up without stopping play.
- **Social stealth:** some NPCs have awareness radii, and the phone shield (Q) halves them. Slipping past without being noticed gives *STEALTH +10*. Choosing to talk gives *SOCIAL XP*.
- **Imagined vs. real dialogue:** when the meter is high, nearby NPCs seem to say judgemental things (marked IMAGINED). What they actually said appears right after.

**Key encounters (in route order):**
1. **The corridor:** four tactics (walk past confidently, phone shield, wait them out, take the stairs), and Sharma Uncle's "Going somewhere?" with four replies. Answer nicely and Aunty gives you a coriander side quest.
2. **The lift ride:** the lift stops at floor 2 and Mrs. Iyer gets in. "So... what are you doing nowadays?" Two floors to answer. The stairs skip this.
3. **The lobby:** Mr. D'Souza at the mailboxes and Raju the guard both notice you unless you hug the far wall.
4. **Amma calls:** your phone rings in public. Answer, decline (and get a guilt-trip text), or let it ring. What you said to Mrs. Iyer has already reached her.
5. **The bus-stop crowd:** a group of college kids. Standing in the crowd keeps winding the Thought Spiral up; walking on the road side avoids it (and gets you honked at).
6. **The Sidewalk Stranger (mini-boss):** he mirrors every sidestep except when he glances at his phone. If you're bumped three times or wait about 15 seconds, it resolves on its own.
7. **The wave:** a guy ahead waves enthusiastically. You get about 2.5 seconds to press E and wave back. It was for his friend behind you.
8. **The vegetable cart:** buy the coriander for Aunty and she thanks you on the way home.
9. **Rohan from college (maybe):** wanders the store aisles. Avoid him, or face "We should TOTALLY catch up!"
10. **The queue:** an aunty with expired coupons, then a guy with one item cuts in front of you. Speak up, cough, stare, or let it go.
11. **The Cashier (final boss):** "Do you want a bag?", then Phase 2: "Just tell your phone number" (out loud, in front of the queue), then a payment mini-game (UPI QR scan, card, or cash). Every payment path succeeds; if you miss the QR three times, the cashier holds the stand still for you.

**The cast:** 31 NPCs, including the neighbours, Mrs. Iyer, the guard, Mr. D'Souza, Anna and her customers, a bus-stop crowd, a delivery partner, a couple on a walk, joggers, a vegetable vendor, store staff, shoppers, a dad and his staring child, and the queue. Faraway NPCs keep walking but aren't drawn, and lose their outlines at mid distance, so the bigger cast costs fewer draw calls than the original smaller one.

**Three endings**, using deterministic rules (`src/endings.ts`):
- **C: Chaotic Success** if you bought 2 or more unnecessary items, or gave 4 or more awkward replies.
- **B: The Social Butterfly (Almost)** if you completed 4 or more conversations.
- **A: Quiet Victory** otherwise.

Endings you've found are remembered in localStorage, and the results screen hints at the ones you haven't.

**Five secrets:** the Starfall Ronin poster, looking in the mirror twice, the lobby noticeboard, the street cat in the alley, and the MEGA OFFER bin. There's also an achievement in the park for literally touching grass.

## Settings and accessibility

Master, music and effects volume, mouse sensitivity, invert Y, graphics quality (Low/Medium/High), Reduced Motion (no camera FOV pulses or shake, instant text, minimal UI animation), Reduced Anxiety Effects (softer vignette and heartbeat), and Mute. Dialogue never auto-advances and choices are untimed. Cutscenes can be skipped, and nothing flashes or strobes. If the frame rate drops below 40 FPS during the first few seconds, the game lowers its quality setting automatically.

## Project layout

```
index.html            HUD/menu markup + inline loading screen
src/main.ts           boot, WebGL check, loading screen
src/game.ts           renderer, zones, lighting, main loop, run lifecycle
src/story.ts          mission manager + every scripted scene and interaction
src/player.ts         player controller
src/camera.ts         third-person camera (collision, ceilings, cinematic shots)
src/characters.ts     procedural cel-shaded humans + cats, pose animation
src/npc.ts            NPC behaviour + the cast
src/dialogue.ts       dialogue lines, choices, ambient thoughts
src/anxiety.ts        Thought Spiral + Focus
src/interaction.ts    interactables, triggers, hint sparkles
src/minigames.ts      sidewalk dance, payment
src/post.ts           bloom + colour grade (Medium/High quality)
src/endings.ts        ending rules + results screen
src/audio.ts          WebAudio music sequencer + synthesized SFX
src/ui.ts             HUD, cards, toasts, menus, world-space bubbles
src/vehicles.ts       the auto-rickshaw and delivery scooter
src/world/            apartment+corridor (startup), lobby+street+store (lazy chunk), batching, canvas textures
```

All anime titles, shops, apps and characters are fictional.
