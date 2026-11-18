import * as THREE from 'three';
import { settings, saveSettings, Quality } from './settings';
import { audio, Track } from './audio';
import { Input } from './input';
import { Collision } from './collision';
import { CameraRig } from './camera';
import { Player } from './player';
import { Interactions } from './interaction';
import { UI } from './ui';
import { Dialogue, Cancel } from './dialogue';
import { Anxiety } from './anxiety';
import { NPC, castDefs } from './npc';
import { Cat } from './characters';
import { LightPool, LightDef, setGlowBoost } from './world/builder';
import { Post } from './post';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { setCharacterRim } from './characters';
import { buildApartment, AptRefs } from './world/apartment';
import type { OutsideRefs } from './world/outside';
import { Vehicle, makeAuto, makeScooter, PATHS } from './vehicles';
import { Story } from './story';

export type MissionState =
  | 'MENU' | 'HOME_EXPLORATION' | 'CAT_FOOD_INCIDENT' | 'LEAVE_APARTMENT' | 'TRAVEL_TO_STORE'
  | 'FIND_CAT_FOOD' | 'CHECKOUT' | 'RETURN_HOME' | 'FEED_CAT' | 'ENDING';
export type Zone = 'apartment' | 'corridor' | 'lobby' | 'street' | 'store';

export interface Stats {
  conversations: number;
  avoided: number;
  awkward: number;
  extras: string[];
  secrets: Set<string>;
  hidden: number;
  start: number;
  danceFails: number;
  pay: string;
}

export interface InvItem {
  id: string;
  icon: string;
  name: string;
  paid: boolean;
}

interface ZonePreset {
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  dir: number;
  dirColor: number;
  dirOffset: [number, number, number];
  bg: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
}

// Bright, clean evening: strong coloured fill so shadows stay soft and violet instead of black,
// a low warm "last light" key outside, and lifted exposure everywhere.
const PRESETS: Record<Zone, ZonePreset> = {
  apartment: { hemiSky: 0xffe6cc, hemiGround: 0x7a6090, hemi: 1.55, dir: 1.1, dirColor: 0xffd6a8, dirOffset: [-3, 9, 2], bg: 0x241a33, fog: 0x241a33, fogNear: 60, fogFar: 300, exposure: 1.12 },
  corridor: { hemiSky: 0xf0f6ff, hemiGround: 0x7c8a8a, hemi: 1.6, dir: 0.7, dirColor: 0xf0f4ff, dirOffset: [2, 9, 1], bg: 0x1d2028, fog: 0x1d2028, fogNear: 60, fogFar: 300, exposure: 1.1 },
  lobby: { hemiSky: 0xfff3e0, hemiGround: 0x8a7458, hemi: 1.65, dir: 0.8, dirColor: 0xfff0d0, dirOffset: [-2, 9, 2], bg: 0x5a4a8a, fog: 0x5a4a8a, fogNear: 40, fogFar: 200, exposure: 1.1 },
  street: { hemiSky: 0xb3a8ff, hemiGround: 0x8a5a78, hemi: 1.55, dir: 1.55, dirColor: 0xffb089, dirOffset: [-14, 9, 6], bg: 0x5a4a8a, fog: 0x8a6fa8, fogNear: 35, fogFar: 140, exposure: 1.18 },
  store: { hemiSky: 0xfff8ee, hemiGround: 0x9a958a, hemi: 1.15, dir: 0.75, dirColor: 0xffffff, dirOffset: [-2, 10, 3], bg: 0x5a4a8a, fog: 0x8a6fa8, fogNear: 60, fogFar: 300, exposure: 0.92 },
};

const CEILING: Record<Zone, number | null> = { apartment: 3.0, corridor: 3.0, lobby: 3.4, store: 4.2, street: null };

export class Game {
  canvas = document.getElementById('c') as HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam = new CameraRig();
  input = new Input(this.canvas);
  col = new Collision();
  player = new Player();
  inter = new Interactions(this.scene);
  ui!: UI;
  dlg!: Dialogue;
  anx = new Anxiety(this.canvas);
  story!: Story;
  apt!: AptRefs;
  out: OutsideRefs | null = null;
  outReady!: Promise<OutsideRefs>;
  npcs = new Map<string, NPC>();
  miso = new Cat(0xf4a259, 0xfff1e0, 0xd9822b);
  misoPos = new THREE.Vector3();
  misoYaw = 0;
  misoTarget: THREE.Vector3 | null = null;
  misoFollow = false;
  streetCat = new Cat(0x8d8d99, 0xdcdce4, 0x5e5e6a);
  vehicles: Vehicle[] = [];
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  dir = new THREE.DirectionalLight(0xffffff, 1);
  pool!: LightPool;
  post: Post | null = null;
  marker = new THREE.Group();
  markerTarget: THREE.Vector3 | null = null;

  state: MissionState = 'MENU';
  zone: Zone = 'apartment';
  flags = new Set<string>();
  stats!: Stats;
  inventory: InvItem[] = [];
  gen = 0;
  locks = 0;
  paused = false;
  playing = false;
  skipping = false;
  musicOverride: Track | null = null;
  tickers = new Set<(dt: number) => void>();
  clockMin = 0;
  stateTime = 0;
  private lastT = performance.now();
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsChecks = 0;
  private menuT = 0;
  private imaginedCd = 6;
  private chatterCd = 4;
  private pauseOpenedAt = 0;
  private aptGroup!: THREE.Group;

  async init(progress: (p: number, msg?: string) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQuality(settings.quality, false);
    this.scene.fog = new THREE.Fog(0x000000, 60, 300);
    this.scene.add(this.hemi, this.dir, this.dir.target);
    this.dir.castShadow = true;
    this.dir.shadow.camera.left = -14;
    this.dir.shadow.camera.right = 14;
    this.dir.shadow.camera.top = 14;
    this.dir.shadow.camera.bottom = -14;
    this.dir.shadow.camera.near = 1;
    this.dir.shadow.camera.far = 40;
    this.dir.shadow.bias = -0.0006;
    this.dir.shadow.normalBias = 0.03;
    this.pool = new LightPool(this.scene, 6);
    // image-based ambient light so glossy floors and asphalt have something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    progress(0.25, 'Loading social anxiety...');
    await frame();

    this.ui = new UI({
      start: () => this.startGame(),
      resume: () => this.setPaused(false),
      restart: () => this.restart(),
      mainMenu: () => this.toMenu(),
      qualityChanged: (q) => this.applyQuality(q, true),
    });
    this.dlg = new Dialogue(this.input);
    this.dlg.onChoicesOpen = (open) => {
      if (open) this.releaseMouse();
      else this.input.allowLock = this.playing && !this.paused;
    };

    // Apartment first: the only thing needed to start playing.
    const tb = performance.now();
    this.apt = buildApartment(this.col);
    this.buildMs = performance.now() - tb;
    this.aptGroup = this.apt.group;
    this.scene.add(this.aptGroup);
    progress(0.6, 'Rehearsing how to say hello...');
    await frame();
    this.scene.add(this.player.model.root);
    this.aptGroup.add(this.miso.root);
    this.marker.add(makeMarker());
    this.scene.add(this.marker);
    for (const d of castDefs(this.apt.anchors, null)) this.addNpc(new NPC(d));

    this.story = new Story(this);
    this.story.setupApartment();
    this.resetRun();

    // Pause on pointer-lock loss, keyboard shortcuts.
    this.input.onLockChange = (locked) => {
      if (!locked && this.expectUnlock) this.expectUnlock = false;
      else if (!locked && this.playing && !this.paused && !this.dlg.choosing && this.ui.menuOpen === null) this.setPaused(true);
      document.getElementById('click-hint')!.style.opacity = locked ? '0' : '1';
    };
    this.input.addKeyHandler((code) => {
      if (code === 'Escape') {
        if (!this.playing || this.ui.menuOpen === 'ending') return true;
        if (performance.now() - this.pauseOpenedAt < 250) return true;
        this.setPaused(!this.paused);
        return true;
      }
      if (code === 'KeyM') {
        settings.muted = !settings.muted;
        saveSettings();
        audio.applyVolumes();
        this.ui.syncSettings();
        this.ui.toast('info', settings.muted ? 'AUDIO MUTED' : 'AUDIO ON', 'Press M to toggle');
        return true;
      }
      if (code === 'Tab') {
        if (this.story.cutsceneSkippable && !this.skipping) {
          this.skipping = true;
          this.dlg.skipping = true;
          this.ui.skipHint(false);
        }
        return true;
      }
      return false;
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();

    progress(0.85, 'Checking if the neighbors are outside...');
    // Show the menu with the apartment rendered behind it.
    this.setZone('apartment', true);
    this.renderer.compile(this.scene, this.cam.cam);
    progress(1, 'Generating 47 worst-case scenarios...');
    requestAnimationFrame(() => this.loop());

    // Outside world loads progressively in its own chunk, after the first frame.
    this.outReady = new Promise((resolve) => {
      setTimeout(async () => {
        const mod = await import('./world/outside');
        const tb2 = performance.now();
        const out = mod.buildOutside(this.col);
        this.outsideBuildMs = performance.now() - tb2;
        out.group.visible = false;
        this.scene.add(out.group);
        this.out = out;
        this.groundY = mod.groundY;
        this.setupOutside(out);
        resolve(out);
      }, 300);
    });
  }

  groundY: (x: number, z: number) => number = () => 0;
  buildMs = 0;
  outsideBuildMs = 0;
  private expectUnlock = false;

  /** Free the mouse for UI (choices, payment) without opening the pause menu. */
  releaseMouse() {
    this.input.allowLock = false;
    if (this.input.locked) {
      this.expectUnlock = true;
      this.input.unlock();
    }
  }

  private setupOutside(out: OutsideRefs) {
    for (const d of castDefs(this.apt.anchors, out.anchors)) if (d.zone === 'out') this.addNpc(new NPC(d));
    out.group.add(this.streetCat.root);
    this.streetCat.root.position.copy(out.anchors.streetCat);
    this.streetCat.root.rotation.y = -Math.PI / 2;
    this.streetCat.pose = 'loaf';
    const a = makeAuto();
    const s = makeScooter();
    out.group.add(a.group, s.group);
    this.vehicles.push(new Vehicle(a.group, a.rider, PATHS.east, 6.5, 1));
    this.vehicles.push(new Vehicle(s.group, s.rider, PATHS.west, 8.5, 1));
    this.story.setupOutside(out);
    // warm up shaders for the outside so the first lift ride doesn't hitch
    const v = out.group.visible;
    out.group.visible = true;
    this.renderer.compile(this.scene, this.cam.cam);
    out.group.visible = v;
  }

  private addNpc(n: NPC) {
    this.npcs.set(n.id, n);
    (n.def.zone === 'apt' ? this.aptGroup : this.out!.group).add(n.model.root);
  }

  // ------------------------------------------------------------------ quality
  applyQuality(q: Quality, notify: boolean) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'ultra' ? Math.min(dpr, 2) : q === 'high' ? Math.min(dpr, 1.75) : q === 'medium' ? Math.min(dpr, 1.25) : 1);
    // bloom + grading pipeline on medium/high; plain forward render on low
    this.post?.dispose();
    this.post = null;
    if (q !== 'low') this.post = new Post(this.renderer, this.scene, this.cam.cam, q === 'high' || q === 'ultra' ? 4 : 0, q === 'ultra');
    setGlowBoost(!!this.post);
    this.anx.postActive = !!this.post;
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
      });
    }
    const size = q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024;
    if (this.dir.shadow.mapSize.x !== size) {
      this.dir.shadow.mapSize.set(size, size);
      this.dir.shadow.map?.dispose();
      this.dir.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.resize();
    if (notify) this.ui.toast('info', `GRAPHICS: ${q.toUpperCase()}`);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.cam.setAspect(w / h);
  }

  // ------------------------------------------------------------------ run lifecycle
  resetRun() {
    this.gen++;
    this.dlg.cancelAll();
    this.tickers.clear();
    this.ui.clearCards();
    this.ui.clearBubbles();
    this.ui.bossBar(false);
    this.ui.phone(null);
    this.ui.letterbox(false);
    this.ui.skipHint(false);
    this.ui.prompt(null);
    document.body.classList.remove('cine');
    document.getElementById('minigame')!.classList.add('hidden');
    this.ui.fade(false, 0.01);
    this.locks = 0;
    this.skipping = false;
    this.dlg.skipping = false;
    this.musicOverride = null;
    this.flags.clear();
    this.inventory = [];
    this.stats = { conversations: 0, avoided: 0, awkward: 0, extras: [], secrets: new Set(), hidden: 0, start: performance.now(), danceFails: 0, pay: '' };
    this.anx.reset();
    this.clockMin = 0;
    this.player.phoneOut = false;
    this.player.poseOverride = null;
    this.player.nervous = false;
    this.player.model.expr = 'neutral';
    this.player.model.bag!.visible = false;
    this.player.model.root.visible = true;
    this.npcs.forEach((n) => n.reset());
    this.cam.clearShot();
    this.cam.fovOffset = 0;
    this.inter.resetHints();
    this.misoTarget = null;
    this.misoFollow = false;
    this.story.reset();
    this.refreshInventory();
    this.ui.setSecrets(0, 5);
  }

  startGame() {
    this.ui.showMenu(null);
    this.ui.hideEnding();
    this.playing = true;
    this.paused = false;
    this.ui.showHUD(true);
    this.input.allowLock = true;
    this.story.begin();
  }

  restart() {
    this.ui.hideEnding();
    this.resetRun();
    this.startGame();
  }

  toMenu() {
    this.ui.hideEnding();
    this.resetRun();
    this.playing = false;
    this.paused = false;
    this.input.allowLock = false;
    this.input.unlock();
    this.ui.showHUD(false);
    this.ui.showMenu('main');
    this.state = 'MENU';
    this.story.menuScene();
    this.updateMusic();
  }

  setPaused(p: boolean) {
    if (!this.playing) return;
    this.paused = p;
    this.ui.showMenu(p ? 'pause' : null);
    if (p) {
      this.pauseOpenedAt = performance.now();
      this.input.unlock();
      this.input.allowLock = false;
    } else {
      this.input.allowLock = !this.dlg.choosing;
      audio.init();
    }
  }

  // ------------------------------------------------------------------ helpers for story scripts
  /** Run a script; locks player control while it runs; swallows cancellation on restart. */
  async run(fn: () => Promise<void>, opts: { lock?: boolean } = { lock: true }) {
    const gen = this.gen;
    const lock = opts.lock !== false;
    if (lock) this.locks++;
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Cancel)) console.error(e);
    } finally {
      if (gen === this.gen) {
        if (lock) this.locks = Math.max(0, this.locks - 1);
        if (lock && this.locks === 0) {
          this.dlg.close();
          if (this.cam.inShot) {
            this.cam.clearShot();
            this.cam.faceBehind(this.player.yaw);
          }
        }
      }
    }
  }

  get locked() {
    return this.locks > 0;
  }

  wait(sec: number): Promise<void> {
    const gen = this.gen;
    if (this.skipping) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let t = 0;
      const tick = (dt: number) => {
        if (this.gen !== gen) {
          this.tickers.delete(tick);
          reject(new Cancel());
          return;
        }
        t += dt;
        if (t >= sec || this.skipping) {
          this.tickers.delete(tick);
          resolve();
        }
      };
      this.tickers.add(tick);
    });
  }

  check(gen: number) {
    if (gen !== this.gen) throw new Cancel();
  }

  setState(s: MissionState) {
    this.state = s;
    this.stateTime = 0;
    this.story.onState(s);
    this.updateMusic();
    this.updateBaseline();
  }

  addItem(id: string, icon: string, name: string, paid = false) {
    if (this.inventory.some((i) => i.id === id)) return false;
    this.inventory.push({ id, icon, name, paid });
    this.refreshInventory();
    return true;
  }

  hasItem(id: string) {
    return this.inventory.some((i) => i.id === id);
  }

  hasUnpaid() {
    return this.inventory.some((i) => !i.paid);
  }

  refreshInventory() {
    this.ui.setInventory(this.inventory.map((i) => ({ icon: i.icon, name: i.name + (i.paid ? '' : ' (unpaid)') })));
  }

  secret(id: string, title: string, body: string) {
    if (this.stats.secrets.has(id)) return;
    this.stats.secrets.add(id);
    this.stats.hidden++;
    this.ui.toast('secret', `SECRET FOUND (${this.stats.secrets.size}/5)`, `${title} — ${body}`);
    this.ui.setSecrets(this.stats.secrets.size, 5);
  }

  setMarker(v: THREE.Vector3 | null) {
    this.markerTarget = v;
  }

  setMusic(t: Track | null) {
    this.musicOverride = t;
    this.updateMusic();
  }

  updateMusic() {
    if (this.musicOverride) {
      audio.play(this.musicOverride);
      return;
    }
    const s = this.state;
    const z = this.zone;
    let t: Track = 'cozy';
    if (s === 'MENU' || s === 'HOME_EXPLORATION' || s === 'ENDING') t = 'cozy';
    else if (s === 'CAT_FOOD_INCIDENT') t = 'cozy';
    else if (s === 'LEAVE_APARTMENT') t = 'tension';
    else if (s === 'TRAVEL_TO_STORE') t = z === 'street' ? 'street' : z === 'store' ? 'store' : 'tension';
    else if (s === 'FIND_CAT_FOOD' || s === 'CHECKOUT') t = z === 'store' ? 'store' : 'street';
    else if (s === 'RETURN_HOME' || s === 'FEED_CAT') t = z === 'store' ? 'store' : 'calm';
    audio.play(t);
  }

  updateBaseline() {
    const ret = this.state === 'RETURN_HOME' || this.state === 'FEED_CAT' || this.state === 'ENDING';
    const pre = this.state === 'HOME_EXPLORATION' || this.state === 'MENU' || this.state === 'CAT_FOOD_INCIDENT';
    const base: Record<Zone, number> = ret
      ? { apartment: 3, corridor: 10, lobby: 8, street: 12, store: 14 }
      : { apartment: pre ? 4 : 18, corridor: 28, lobby: 24, street: 30, store: 34 };
    this.anx.baseline = base[this.zone];
  }

  zoneAt(x: number, z: number): Zone {
    if (x < -150) return z < -4.55 ? 'corridor' : 'apartment';
    if (x > -6.2 && x < 6.2 && z > 0.15 && z < 10.2) return 'lobby';
    if (x > 96 && x < 118 && z > 0.12 && z < 18) return 'store';
    return 'street';
  }

  setZone(z: Zone, force = false) {
    if (z === this.zone && !force) return;
    const prev = this.zone;
    this.zone = z;
    const p = PRESETS[z];
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemi;
    this.dir.intensity = p.dir;
    this.dir.color.setHex(p.dirColor);
    this.scene.background = new THREE.Color(p.bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(p.fog);
    fog.near = p.fogNear;
    fog.far = p.fogFar;
    this.renderer.toneMappingExposure = p.exposure;
    this.cam.distance = { apartment: 3.7, corridor: 3.3, lobby: 3.8, street: 4.8, store: 4.3 }[z];
    this.scene.environmentIntensity = { apartment: 0.22, corridor: 0.3, lobby: 0.3, street: 0.07, store: 0.12 }[z];
    const rim = { apartment: [0xb08cff, 0.35], corridor: [0xcfe0ff, 0.25], lobby: [0xffe2b8, 0.25], street: [0x7f95ff, 0.45], store: [0xffffff, 0.2] }[z];
    setCharacterRim(rim[0], rim[1]);
    const inApt = z === 'apartment' || z === 'corridor';
    this.aptGroup.visible = inApt;
    if (this.out) this.out.group.visible = !inApt;
    const defs: LightDef[] =
      z === 'apartment' ? this.apt.lights : z === 'corridor' ? this.apt.corridorLights : z === 'lobby' ? this.out?.lobbyLights ?? [] : z === 'store' ? this.out?.storeLights ?? [] : this.out?.streetLights ?? [];
    // the apartment door is visible from the corridor: share lights
    this.pool.defs = z === 'apartment' || z === 'corridor' ? [...defs, ...(z === 'apartment' ? [] : this.apt.lights.slice(0, 1))] : defs;
    this.pool.update(0, this.player.pos.x, this.player.pos.z, true);
    audio.setAmbience(z === 'apartment' ? 'apartment' : z === 'corridor' || z === 'lobby' ? 'corridor' : z === 'store' ? 'store' : 'street');
    this.updateMusic();
    this.updateBaseline();
    if (!force && this.playing) this.story.onZone(z, prev);
  }

  // ------------------------------------------------------------------ main loop
  private loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.1) dt = 0.1;
    if (!this.paused) this.update(dt);
    this.draw(dt);
    this.autoQuality(dt);
  }

  draw(dt = 1 / 60) {
    if (this.post) {
      const k = settings.reducedAnxiety ? 0.35 : 1;
      const anx = Math.max(0, (this.anx.display - 30) / 70) * k * (this.anx.focusT > 0 ? 0.4 : 1);
      this.post.render(dt, anx, this.anx.focusT > 0 ? 1 : 0);
    } else this.renderer.render(this.scene, this.cam.cam);
  }

  private autoQuality(dt: number) {
    if (!this.playing || this.paused || this.fpsChecks > 6) return;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 4) {
      const fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.fpsChecks++;
      if (fps < 40 && settings.quality !== 'low') {
        settings.quality = ({ ultra: 'high', high: 'medium', medium: 'low', low: 'low' } as const)[settings.quality];
        saveSettings();
        this.ui.syncSettings();
        this.applyQuality(settings.quality, false);
        this.ui.toast('info', 'PERFORMANCE MODE', `Running at ${Math.round(fps)} FPS — switched graphics to ${settings.quality.toUpperCase()}.`);
      }
    }
  }

  private update(dt: number) {
    const p = this.player;
    this.tickers.forEach((t) => t(dt));

    if (!this.playing) {
      this.menuUpdate(dt);
      return;
    }
    this.stateTime += dt;
    // clock: one in-game minute every 8 seconds
    this.clockMin += dt / 8;
    const total = 19 * 60 + 42 + Math.floor(this.clockMin);
    const hh = Math.floor(total / 60) % 12 || 12;
    this.ui.setClock(`SATURDAY | ${hh}:${String(total % 60).padStart(2, '0')} PM`);

    const ctrl = !this.locked && !this.dlg.choosing;
    if (ctrl) {
      p.update(dt, this.input, this.cam.yaw, this.col, this.groundY);
      // gentle push away from NPCs
      this.npcs.forEach((n) => {
        if (n.gone || !n.model.root.parent?.visible) return;
        const dx = p.pos.x - n.pos.x, dz = p.pos.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.55 && d > 0.001) {
          p.pos.x = n.pos.x + (dx / d) * 0.55;
          p.pos.z = n.pos.z + (dz / d) * 0.55;
        }
      });
      p.sync();
    } else {
      p.idle(dt);
    }
    this.ui.setPhoneIndicator(p.phoneOut);
    if (ctrl && this.input.wasPressed('KeyF')) {
      if (this.anx.focus()) this.story.onFocus();
      else this.ui.toast('info', 'FOCUS RECHARGING', 'Breathing takes practice.');
    }

    const z = this.zoneAt(p.pos.x, p.pos.z);
    if (z !== this.zone) this.setZone(z);

    // NPCs + social awareness
    this.npcs.forEach((n) => {
      const visible = n.model.root.parent?.visible;
      if (!visible || n.gone) return;
      // distance culling keeps a big cast cheap: far NPCs keep walking but aren't drawn
      const d = Math.hypot(p.pos.x - n.pos.x, p.pos.z - n.pos.z);
      n.model.root.visible = d < 52;
      n.model.setDetail(d < 22);
      n.update(dt, p.pos, this.col, d > 52);
      if (!ctrl || n.awareRadius <= 0 || !n.enabled) return;
      const r = n.awareRadius * (p.phoneOut ? 0.5 : 1);
      n.near = d < n.awareRadius * 1.6;
      if (d < r) {
        n.nearT += dt;
        if (n.nearT > 0.45 && !n.noticed) {
          n.noticed = true;
          this.story.onNotice(n);
        }
      } else n.nearT = 0;
      if (d < n.awareRadius * 1.6) n.wasClose = true;
      if (n.wasClose && d > n.awareRadius * 1.9 && !n.noticed && !n.stealthAwarded) {
        n.stealthAwarded = true;
        this.story.onAvoid(n);
      }
    });
    this.ambientChatter(dt);

    this.updateMiso(dt);
    if (this.out && this.out.group.visible) {
      const onRoad = this.groundY(p.pos.x, p.pos.z) < -0.05;
      for (const v of this.vehicles) {
        if (v.update(dt, p.pos, onRoad)) {
          audio.sfx('honk');
          this.anx.add(8);
          if (Math.random() < 0.6) this.dlg.think('anx', ['HONK = personal attack.', 'The auto uncle hates us specifically.', 'Sidewalks exist for a reason, Aarav.'][Math.floor(Math.random() * 3)]);
        }
      }
      this.streetCat.update(dt);
      // store doors slide open
      const near = Math.hypot(p.pos.x - 100.5, p.pos.z) < 3.2;
      for (const d of this.out.storeDoors) {
        const target = d.userData.home + (near ? d.userData.side * 1.3 : 0);
        d.position.x += (target - d.position.x) * (1 - Math.exp(-dt * 6));
      }
      this.out.unpaidBarrier.enabled = this.hasUnpaid();
      this.out.sky.position.set(p.pos.x, 0, p.pos.z);
    }

    // interactions
    this.inter.update(dt, p.pos, p.yaw, !ctrl);
    const cur = this.inter.current;
    this.ui.prompt(cur && ctrl ? cur.label() : null);
    if (ctrl && cur && this.input.wasPressed('KeyE')) {
      audio.sfx('click', 0.6);
      this.inter.activate();
    }

    // anxiety & presentation
    this.anx.update(dt);
    p.nervous = this.anx.value > 55;
    p.model.sweat = this.anx.value > 65 && !settings.reducedAnxiety ? 1 : 0;
    if (!this.locked && p.model.expr !== 'happy') p.model.expr = this.anx.value > 60 ? 'nervous' : 'neutral';
    this.cam.fovOffset = -Math.max(0, this.anx.display - 30) / 70 * 6 * (settings.reducedAnxiety ? 0.3 : 1) + (this.anx.focusT > 0 ? 2 : 0);
    this.ui.setMeter(this.anx.display, this.anx.level, this.anx.focusCd <= 0, this.anx.focusT > 0, this.anx.focusCd);

    this.cam.update(dt, p.pos, ctrl ? this.input : null, this.col, CEILING[this.zone]);
    // don't render characters the camera is standing inside of
    const cp = this.cam.cam.position;
    this.npcs.forEach((n) => {
      if (n.gone || !n.model.root.visible) return;
      if (Math.hypot(cp.x - n.pos.x, cp.z - n.pos.z) < 0.75 && cp.y < n.pos.y + 2.1) n.model.root.visible = false;
    });
    this.pool.update(dt, p.pos.x, p.pos.z);
    // shadow light follows the player
    const o = PRESETS[this.zone].dirOffset;
    this.dir.position.set(p.pos.x + o[0], o[1], p.pos.z + o[2]);
    this.dir.target.position.set(p.pos.x, 0, p.pos.z);

    this.updateMarker(dt);
    this.story.update(dt);
    this.ui.updateBubbles(this.cam.cam, window.innerWidth, window.innerHeight);
    this.input.endFrame();
  }

  private menuUpdate(dt: number) {
    this.menuT += dt;
    const a = this.apt.anchors;
    const c = a.sofaSeat;
    const t = this.menuT * 0.08;
    this.cam.cam.position.set(c.x + 2.4 + Math.sin(t) * 0.5, 1.75 + Math.sin(t * 0.7) * 0.1, c.z - 3.1 + Math.cos(t) * 0.3);
    this.cam.cam.lookAt(c.x + 1.0, 0.95, c.z + 0.7);
    this.player.idle(dt);
    this.updateMiso(dt);
    this.pool.update(dt, c.x, c.z);
    this.input.endFrame();
  }

  private ambientChatter(dt: number) {
    this.imaginedCd -= dt;
    this.chatterCd -= dt;
    const p = this.player.pos;
    let nearest: NPC | null = null;
    let nd = 7;
    this.npcs.forEach((n) => {
      if (n.gone || !n.model.root.parent?.visible || !(n.def.chatter || n.def.imagined)) return;
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d < nd) {
        nd = d;
        nearest = n;
      }
    });
    if (!nearest || this.locked) return;
    const n = nearest as NPC;
    const head = () => n.pos.clone().add(new THREE.Vector3(0, 2.15, 0));
    const ret = this.state === 'RETURN_HOME' || this.state === 'FEED_CAT';
    if (!ret && this.anx.value > 32 && n.def.imagined && this.imaginedCd <= 0) {
      this.imaginedCd = 11;
      this.chatterCd = 3.5;
      const line = n.def.imagined[Math.floor(Math.random() * n.def.imagined.length)];
      this.ui.worldBubble(line, 'imagined', head, 2.8);
      this.anx.add(4);
      // reality check right after
      const real = n.def.chatter?.[Math.floor(Math.random() * (n.def.chatter?.length ?? 1))];
      if (real) setTimeout(() => this.ui.worldBubble(real, 'npc', head, 2.6, 'ACTUALLY SAID'), 3000);
      return;
    }
    if (this.chatterCd <= 0 && n.def.chatter) {
      this.chatterCd = 6 + Math.random() * 4;
      this.ui.worldBubble(n.def.chatter[Math.floor(Math.random() * n.def.chatter.length)], 'npc', head, 2.8, n.def.name);
    }
  }

  private updateMiso(dt: number) {
    const m = this.miso;
    let speed = 0;
    let tgt = this.misoTarget;
    if (this.misoFollow) {
      const p = this.player.pos;
      const d = Math.hypot(p.x - this.misoPos.x, p.z - this.misoPos.z);
      if (d > 1.6) tgt = p;
      else tgt = null;
    }
    if (tgt) {
      const dx = tgt.x - this.misoPos.x, dz = tgt.z - this.misoPos.z;
      const d = Math.hypot(dx, dz);
      const stopAt = this.misoFollow ? 1.2 : 0.06;
      if (d > stopAt) {
        speed = Math.min(2.2, d * 2);
        const step = Math.min(d - stopAt * 0.5, speed * dt);
        this.misoPos.x += (dx / d) * step;
        this.misoPos.z += (dz / d) * step;
        const a = Math.atan2(dx, dz);
        let dy = a - this.misoYaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.misoYaw += dy * (1 - Math.exp(-dt * 10));
      } else if (!this.misoFollow) {
        this.misoTarget = null;
      }
    }
    m.speed = speed;
    m.update(dt);
    m.root.position.copy(this.misoPos);
    m.root.rotation.y = this.misoYaw;
  }

  private markerT = 0;
  private updateMarker(dt: number) {
    this.markerT += dt;
    const t = this.markerTarget;
    const show = !!t && !this.locked && this.zoneGroupOf(t) === this.zoneGroupOf(this.player.pos);
    this.marker.visible = show;
    if (show && t) {
      this.marker.position.set(t.x, t.y + 1.1 + Math.sin(this.markerT * 2.5) * 0.12, t.z);
      this.marker.rotation.y += dt * 1.6;
      const d = t.distanceTo(this.player.pos);
      this.marker.scale.setScalar(Math.min(2.4, Math.max(0.7, d / 8)));
    }
  }

  private zoneGroupOf(v: THREE.Vector3) {
    return v.x < -150 ? 'apt' : 'out';
  }
}

/** Yield to the browser (falls back to a timeout when the tab is in the background). */
function frame() {
  return new Promise<void>((r) => {
    requestAnimationFrame(() => r());
    setTimeout(r, 50);
  });
}

function makeMarker() {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
  gem.scale.y = 1.5;
  g.add(gem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffe0a8, toneMapped: false, transparent: true, opacity: 0.7 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}
