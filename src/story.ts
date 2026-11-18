import * as THREE from 'three';
import type { Game, MissionState, Zone } from './game';
import type { NPC } from './npc';
import type { OutsideRefs } from './world/outside';
import { APT_O, drawLiftDisplay } from './world/apartment';
import { drawTV } from './world/textures';
import { audio } from './audio';
import { Speaker } from './dialogue';
import { sidewalkDance, payment, tween } from './minigames';
import { computeEnding, recordEnding, resultsHtml, ENDINGS } from './endings';
import { Interactable } from './interaction';

const W = (x: number, y: number, z: number) => new THREE.Vector3(x + APT_O.x, y, z + APT_O.z);
const MISO: Speaker = { name: 'Miso', color: '#ffb347' };
const AMMA: Speaker = { name: 'Amma (Mom)', color: '#ff8fab' };
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Mission manager + every scripted moment. The world is normal; Aarav's brain is not. */
export class Story {
  cutsceneSkippable = false;
  private homeSeen = new Set<string>();
  private hintsShown = new Set<string>();
  private thoughtCd = 0;
  private unpaidCd = 0;
  private wanderWarned = false;
  private waveOpen = false;
  private objKey = '';
  private inCrowd = false;

  constructor(private g: Game) {}

  // ---------------------------------------------------------------- tiny script helpers
  private get d() {
    return this.g.dlg;
  }
  private say(s: Speaker, t: string) {
    return this.g.dlg.say(s, t);
  }
  private async lines(seq: Array<[Speaker, string]>) {
    for (const [s, t] of seq) await this.g.dlg.say(s, t);
  }
  private npcSpeaker(id: string): Speaker {
    const n = this.g.npcs.get(id)!;
    return { name: n.def.name, color: n.def.color };
  }
  private head(n: NPC) {
    return () => n.pos.clone().add(new THREE.Vector3(0, 2.15, 0));
  }
  private bubble(id: string, text: string, dur = 2.8) {
    const n = this.g.npcs.get(id);
    if (n) this.g.ui.worldBubble(text, 'npc', this.head(n), dur, n.def.name);
  }
  private social(title = 'SOCIAL XP +20', body = 'Spoke to a human without spontaneously combusting.') {
    this.g.stats.conversations++;
    this.g.ui.toast('social', title, body);
  }
  private stealth(body = 'Successfully avoided unnecessary small talk.') {
    this.g.stats.avoided++;
    this.g.ui.toast('stealth', 'STEALTH +10', body);
  }
  private awkward() {
    this.g.stats.awkward++;
    this.g.anx.add(12);
  }
  private beginCutscene(skippable: boolean) {
    this.cutsceneSkippable = skippable;
    this.g.ui.skipHint(skippable);
    this.g.ui.letterbox(true);
    document.body.classList.add('cine');
  }
  private endCutscene() {
    this.cutsceneSkippable = false;
    this.g.skipping = false;
    this.g.dlg.skipping = false;
    this.g.ui.skipHint(false);
    this.g.ui.letterbox(false);
    this.g.cam.clearShot();
    document.body.classList.remove('cine');
  }
  private shot(pos: THREE.Vector3, look: THREE.Vector3, dur = 1.2) {
    return this.g.cam.setShot(pos, look, this.g.skipping ? 0 : dur);
  }
  private async fadeOut(text = '', dur = 0.45) {
    this.g.ui.fadeText(text);
    await this.g.ui.fade(true, this.g.skipping ? 0.05 : dur);
  }
  private async fadeIn(dur = 0.45) {
    await this.g.ui.fade(false, this.g.skipping ? 0.05 : dur);
    this.g.ui.fadeText('');
  }
  private faceCamBehind() {
    this.g.cam.faceBehind(this.g.player.yaw);
  }

  // ---------------------------------------------------------------- setup: apartment
  setupApartment() {
    const g = this.g;
    const a = g.apt.anchors;
    const home = (id: string, pos: THREE.Vector3, label: string, fn: () => Promise<void> | void, extra: Partial<Interactable> = {}) =>
      g.inter.add({
        id, pos, radius: 1.9, label: () => label, hint: true,
        enabled: () => g.state === 'HOME_EXPLORATION' || g.state === 'LEAVE_APARTMENT' || g.state === 'FEED_CAT',
        action: () => {
          g.run(async () => {
            await fn();
          });
          this.homeTouch(id);
        },
        ...extra,
      });
    const look = (lines: Array<[Speaker, string]>) => () => this.lines(lines);

    home('tv', a.tv, 'Inspect TV', look([['think', 'STARFALL RONIN. Season finale. Eight o\'clock. I have prepared snacks, a blanket, and zero plans for human contact.']]));
    let pcCount = 0;
    home('pc', a.pc, 'Inspect PC', async () => {
      pcCount++;
      if (pcCount === 1) await this.say('think', '16 browser tabs, three unfinished games, one functional brain cell.');
      else await this.say('think', 'Tab 12: "how to sound normal on the phone". Watched nine times. Still not normal.');
    });
    home('poster0', a.poster0, 'Inspect poster', async () => {
      await this.lines([
        ['think', 'Starfall Ronin. Episode 1: he can barely lift a sword.'],
        ['think', 'Episode 40: he punches the moon. The moon explodes.'],
        ['logic', 'The power scaling in this show makes no sense.'],
        ['anx', 'The moon had it coming.'],
      ]);
      g.secret('poster', 'Power Scaling', 'Fictional anime math is the only math you trust.');
    });
    home('poster1', a.poster1, 'Inspect poster', look([['think', 'Neon Catboy Z. Peak fiction. Do not look it up. Do NOT look it up.']]));
    home('poster2', a.poster2, 'Inspect poster', look([['think', 'My Roommate Is a Dragon God, Season 4. Relatable. My roommate is a cat, and the cat is the god.']]));
    home('fridge', a.fridge, 'Open fridge', look([['think', 'One lemon. Half a bottle of ketchup. A sense of disappointment, chilled to 4°C.']]));
    home('plant', a.plant, 'Inspect plant', look([['think', 'We both haven\'t seen sunlight in days. At least you have an excuse.']]));
    let mirror = 0;
    home('mirror', a.mirror, 'Look in mirror', async () => {
      mirror++;
      if (mirror === 1) await this.say('think', 'Today\'s outfit: unemployed protagonist with excellent character design.');
      else {
        await this.lines([
          ['think', 'Backward cap: aerodynamic. Hoodie: emotional armour, +10 defence. Shorts: optimism.'],
          ['anx', 'And the face?'],
          ['logic', 'The face is... doing its best.'],
        ]);
        g.secret('mirror', 'Character Design', 'You checked twice. The outfit held up.');
      }
    });
    home('bookshelf', a.bookshelf, 'Inspect manga shelf', look([['think', 'Manga collection, sorted by emotional damage. Top shelf: "cried twice".']]));
    home('figurines', a.figurines, 'Inspect figurines', look([['think', 'My figurines. They stand in silence and never ask how the job search is going. Perfect friends.']]));
    home('bed', a.bed, 'Inspect bed', look([['think', 'The bed is calling. The bed always calls. The bed is the only one who calls.']]));
    home('window', a.window, 'Look outside', look([['think', 'Bengaluru at night. Eleven million people out there.'], ['anx', 'Statistically, at least four of them are judging us right now.']]));
    home('kitchen', a.kitchen, 'Inspect kitchen', look([['think', 'I can cook exactly three things: Maggi, toast, and excuses.']]));
    home('table', a.coffeeTable, 'Inspect snacks', look([['think', 'Snack inventory: one packet of crumbs. Fine. The finale is short. (It\'s a double episode.)']]));
    g.inter.add({
      id: 'jar', pos: a.catFoodJar, radius: 1.8, hint: true,
      label: () => 'Inspect cat food jar',
      enabled: () => g.state === 'HOME_EXPLORATION' || g.state === 'LEAVE_APARTMENT',
      action: () => {
        this.homeTouch('jar');
        g.run(() => (g.state === 'HOME_EXPLORATION' ? this.say('think', 'Miso\'s food jar. Looks... light. That\'s future Aarav\'s problem.') : this.say('think', 'Still empty. It did not refill itself out of pity.')));
      },
    });
    // Miso: live position reference
    g.inter.add({
      id: 'miso', pos: g.misoPos, radius: 1.5,
      label: () => 'Pet Miso',
      enabled: () => g.state !== 'CAT_FOOD_INCIDENT' && g.state !== 'ENDING' && g.state !== 'FEED_CAT',
      action: () => {
        this.homeTouch('miso');
        audio.sfx('purr');
        const lines = g.state === 'HOME_EXPLORATION'
          ? ['Miso. Five kilos of cat, ten kilos of judgement.', 'Miso blinks slowly. In cat, that means "I love you". Or "I\'m plotting".']
          : ['I\'m going, I\'m going. Stop looking at me like that.', 'Miso stares at the door. Then at me. Then at the door.'];
        g.run(() => this.say('think', lines[Math.floor(Math.random() * lines.length)]));
      },
    });
    // the sofa: the clear way to trigger the incident
    g.inter.add({
      id: 'sofa', pos: a.sofaSeat.clone().setY(0.6), radius: 1.9, hint: true,
      label: () => (g.state === 'HOME_EXPLORATION' ? 'Sit down & watch the finale' : 'Sit on sofa'),
      enabled: () => g.state === 'HOME_EXPLORATION',
      action: () => this.incident(),
    });
    // front door
    g.inter.add({
      id: 'door', pos: a.door, radius: 1.8, hint: true,
      label: () => (this.doorOpen ? 'Close the door' : g.state === 'RETURN_HOME' ? 'Open the door (home!)' : 'Open the door'),
      enabled: () => g.state !== 'CAT_FOOD_INCIDENT' && g.state !== 'ENDING' && !(this.doorOpen && g.state === 'LEAVE_APARTMENT'),
      action: () => this.door(),
    });
    // corridor: lift + stairs
    g.inter.add({
      id: 'lift', pos: a.lift, radius: 2.0, label: () => (g.state === 'LEAVE_APARTMENT' ? 'Call the lift' : 'Lift'),
      enabled: () => g.zone === 'corridor',
      action: () => this.takeLiftDown(false),
    });
    g.inter.add({
      id: 'stairs', pos: a.stairs, radius: 2.0, label: () => 'Take the stairs',
      enabled: () => g.zone === 'corridor',
      action: () => this.takeLiftDown(true),
    });
    // bowl
    g.inter.add({
      id: 'bowl', pos: a.bowl, radius: 1.7, label: () => 'Feed Miso',
      enabled: () => g.state === 'FEED_CAT',
      action: () => this.feed(),
    });
  }

  private doorOpen = false;
  private setDoor(open: boolean, instant = false) {
    const g = this.g;
    this.doorOpen = open;
    g.apt.doorBox.enabled = !open;
    g.apt.doorOpenBox.enabled = open;
    const from = g.apt.door.rotation.y;
    const to = open ? -Math.PI / 2 : 0;
    if (instant) {
      g.apt.door.rotation.y = to;
      return Promise.resolve();
    }
    audio.sfx('door');
    return tween(g, 0.6, (k) => (g.apt.door.rotation.y = from + (to - from) * (1 - Math.pow(1 - k, 3)))).catch(() => {});
  }

  private door() {
    const g = this.g;
    if (g.state === 'HOME_EXPLORATION') {
      this.homeTouch('door');
      g.run(() => this.lines([['think', 'This door leads to the multiplayer server.'], ['think', 'I hate multiplayer.']]));
      return;
    }
    if (this.doorOpen) {
      this.setDoor(false);
      return;
    }
    if (g.state === 'LEAVE_APARTMENT') {
      g.run(async () => {
        await this.say('think', 'Okay. Okay okay okay. It\'s just a door.');
        await this.setDoor(true);
        g.dlg.think('anx', 'The door is open. The OUTSIDE can see in now.');
      });
      return;
    }
    if (g.state === 'RETURN_HOME' || g.state === 'FEED_CAT') {
      this.setDoor(true);
      return;
    }
    g.run(() => this.say('think', 'Not now.'));
  }

  private homeTouch(id: string) {
    const g = this.g;
    if (g.state !== 'HOME_EXPLORATION' || this.homeSeen.has(id)) return;
    this.homeSeen.add(id);
    const n = this.homeSeen.size;
    if (n === 2 && !g.flags.has('sofaHint')) {
      g.flags.add('sofaHint');
      g.ui.setObjective('Absolutely nothing.', 'Okay, one thing: the finale starts at 8. Sit on the sofa [E].');
      g.dlg.think('think', 'It\'s almost 8. Sofa time.');
    }
    if (n === 4) {
      g.misoTarget = W(-0.8, 0, 1.2);
      audio.sfx('meow');
      g.dlg.think(MISO, 'Meow. (Miso is giving you The Look.)');
    }
  }

  // ---------------------------------------------------------------- setup: outside
  setupOutside(out: OutsideRefs) {
    const g = this.g;
    const a = out.anchors;
    const outbound = () => g.state === 'TRAVEL_TO_STORE' || g.state === 'FIND_CAT_FOOD' || g.state === 'CHECKOUT';

    g.inter.add({
      id: 'lobbyLift', pos: a.lobbyLift, radius: 2.0, label: () => (g.state === 'RETURN_HOME' ? 'Take the lift home' : 'Lift'),
      enabled: () => g.zone === 'lobby',
      action: () => this.liftHome(),
    });
    g.inter.add({
      id: 'notice', pos: a.noticeboard, radius: 1.9, hint: true, label: () => 'Read the noticeboard',
      action: () =>
        g.run(async () => {
          await this.lines([
            ['system', 'NOTICE: Residents are requested NOT to dry clothes in the lift. — RWA Secretary'],
            ['system', 'ALSO: Whoever is feeding the pigeons Maggi, please stop. They are getting ideas.'],
            ['anx', '...It was one time.'],
          ]);
          g.secret('notice', 'Society Announcement', 'The pigeons know your name now.');
        }),
    });
    // NPC conversations (live positions)
    const talk = (id: string, fn: () => Promise<void>, label: string, enabled: () => boolean = () => true) => {
      const n = g.npcs.get(id)!;
      g.inter.add({ id: 'talk-' + id, pos: n.pos, radius: 2.3, label: () => label, enabled: () => !n.gone && enabled(), action: () => g.run(fn) });
    };
    talk('guard', () => this.talkGuard(), 'Talk to Raju (Security)');
    talk('tea', () => this.talkTea(), 'Talk to Anna (Tea Stall)');
    talk('priya', () => this.talkPriya(), 'Talk to Priya (Store Staff)');
    talk('cust1', () => this.lines([[this.npcSpeaker('cust1'), 'Hm? Oh, no, bro, I\'m just here for the chai.'], ['anx', 'He called us bro. Are we bros now?']]), 'Say hi');
    talk('stranger', () => this.lines([[this.npcSpeaker('stranger'), 'Ha! Sidewalk buddy! Take care, bhai.'], ['logic', 'Look at that. A recurring character.']]), 'Wave at the Sidewalk Stranger', () => g.flags.has('danceDone'));

    talk('mailman', () => this.talkMailman(), "Talk to Mr. D'Souza");
    talk('veggie', () => this.talkVeggie(), 'Talk to the vegetable vendor');
    talk('hardware', () => this.talkHardware(), 'Ask Venkatesh Uncle for batteries');
    talk('xerox', () => this.talkXerox(), 'Ask Manju for a printout');
    g.inter.trigger({
      id: 'wave', minX: 77, maxX: 79.5, minZ: -3.2, maxZ: 0,
      enabled: () => g.state === 'TRAVEL_TO_STORE' && !g.flags.has('waveDone') && !g.locked,
      onEnter: () => this.theWave(),
    });
    g.inter.add({
      id: 'waveBack', pos: g.player.pos, radius: 99, label: () => 'Wave back!',
      enabled: () => this.waveOpen,
      action: () => {
        this.waveOpen = false;
        g.flags.add('wavedBack');
        g.player.poseOverride = 'wave';
        audio.sfx('hello');
      },
    });

    // street cat (secret)
    g.inter.add({
      id: 'streetcat', pos: a.streetCat.clone().setY(0.3), radius: 1.6, hint: true, label: () => 'Pet the street cat',
      action: () =>
        g.run(async () => {
          g.streetCat.pose = 'lookup';
          audio.sfx('purr');
          await this.lines([
            ['think', 'A cat who doesn\'t need anything from me.'],
            ['think', 'Finally, a healthy relationship.'],
            ['logic', 'Miso would be furious.'],
            ['anx', 'Miso can NEVER know.'],
          ]);
          g.streetCat.pose = 'loaf';
          g.secret('streetcat', 'Street Cat', 'Petted a stranger. A furry one. Counts.');
        }),
    });
    // touch grass
    g.inter.add({
      id: 'grass', pos: a.grass, radius: 2.2, hint: true, label: () => 'Touch grass',
      action: () =>
        g.run(async () => {
          g.player.poseOverride = 'feed';
          await g.wait(0.6);
          await this.lines([['think', '...'], ['anx', 'It\'s wet. Why is it WET?'], ['logic', 'Dew. It\'s called dew.']]);
          g.player.poseOverride = null;
          if (!g.flags.has('grass')) {
            g.flags.add('grass');
            g.stats.hidden++;
            g.ui.toast('achievement', 'ACHIEVEMENT: LITERALLY TOUCHED GRASS', 'Operation: Touch Grass, taken very literally.');
          }
        }),
    });

    // store items
    const item = (id: string, label: string, lines: Array<[Speaker, string]>, take?: { icon: string; name: string; line: string }) => {
      const mesh = out.items[id];
      let seen = false;
      g.inter.add({
        id: 'item-' + id, pos: a['item_' + id], radius: 1.5, hint: true,
        label: () => (take && seen ? `Add ${take.name} to basket` : label),
        enabled: () => mesh.visible && (g.state === 'FIND_CAT_FOOD' || g.state === 'CHECKOUT' || (!!take && g.state === 'TRAVEL_TO_STORE')),
        action: () =>
          g.run(async () => {
            if (take && seen) {
              mesh.visible = false;
              g.addItem(id, take.icon, take.name);
              g.stats.extras.push(take.name);
              g.ui.toast('item', `${take.name.toUpperCase()} +1`, 'Not on the list. Now in the basket.');
              await this.say('anx', take.line);
              return;
            }
            seen = true;
            await this.lines(lines);
          }),
      });
    };
    item('noodles', 'Inspect instant noodles', [['think', 'Instant noodles. Emergency supplies for a future emotional collapse.']], { icon: '🍜', name: 'Noodles', line: 'Future us will thank present us. Or blame us. Either way.' });
    item('chips', 'Inspect chips', [['think', 'Masala chips. For strategic reasons. The strategy is eating them.']], { icon: '🥔', name: 'Chips', line: 'We are now someone who buys chips. Society will notice.' });
    item('choco', 'Inspect chocolate milk', [['think', 'Chocolate milk. An adult beverage for people with unresolved childhood happiness.']], { icon: '🥛', name: 'Chocolate milk', line: 'This is self-care. Don\'t look at me.' });
    item('energy', 'Inspect energy drink', [['think', 'Liquid confidence. Side effects include talking to the cashier at three times normal speed.']]);
    item('pickle', 'Inspect pickle', [['think', 'Avakai pickle, extra hot. Aunty-grade spice. My stomach has not been cleared for this mission.']]);
    item('detergent', 'Inspect detergent', [['think', '"Removes tough stains." Can it remove the memory of me saying "you too" to a waiter in 2019?']]);
    item('dogfood', 'Inspect dog food', [['think', 'Dog food.'], ['logic', 'Wrong species. Do not improvise.'], ['anx', 'Miso would never forgive us. She\'d tell the other cats.']]);
    g.inter.add({
      id: 'item-catfood', pos: a.item_catfood, radius: 1.6, hint: true, label: () => 'Take the cat food',
      enabled: () => out.items.catfood.visible && g.state === 'FIND_CAT_FOOD',
      action: () => g.run(() => this.gotCatFood()),
    });
    g.inter.add({
      id: 'discount', pos: a.discountBin, radius: 1.7, hint: true, label: () => 'Read the MEGA OFFER',
      action: () =>
        g.run(async () => {
          await this.lines([
            ['system', 'MEGA OFFER: Buy 2 kg onions, get 1 EXISTENTIAL CRISIS absolutely FREE!'],
            ['system', '*Crisis non-refundable. Limit one per customer.'],
            ['anx', 'We already have ours. Can we return it?'],
          ]);
          g.secret('discount', 'Mega Offer', 'Read the fine print. The fine print read you back.');
        }),
    });

    // triggers
    g.inter.trigger({ id: 'lobbyExit', minX: -1.6, maxX: 1.6, minZ: -2.4, maxZ: -0.2, onEnter: () => this.firstStreet() });
    g.inter.trigger({
      id: 'dance', minX: 57.5, maxX: 59.5, minZ: -14, maxZ: 0,
      enabled: () => g.state === 'TRAVEL_TO_STORE' && !g.flags.has('danceDone'),
      onEnter: () => this.dance(),
    });
    g.inter.trigger({
      id: 'storeFront', minX: 96.5, maxX: 105, minZ: -4, maxZ: -0.2,
      enabled: () => g.state === 'TRAVEL_TO_STORE',
      onEnter: () => this.storeFront(),
    });
    g.inter.trigger({
      id: 'boss', minX: 101.4, maxX: 104.2, minZ: 2.0, maxZ: 6.6,
      enabled: () => g.state === 'CHECKOUT' || g.state === 'FIND_CAT_FOOD',
      onEnter: () => {
        if (g.state === 'CHECKOUT') this.cashier();
        else if (g.hasUnpaid()) this.bubble('cashier', 'Anything else? ...No cat food?');
        else this.bubble('cashier', 'Next customer, please!');
      },
    });
    g.inter.trigger({
      id: 'unpaid', minX: 98.8, maxX: 102.2, minZ: 0.0, maxZ: 1.1,
      enabled: () => g.hasUnpaid(),
      onEnter: () => {
        if (this.unpaidCd > 0) return;
        this.unpaidCd = 6;
        g.dlg.think('logic', 'Leaving without paying is a different, much worse game.');
      },
    });
  }

  // ---------------------------------------------------------------- lifecycle
  reset() {
    const g = this.g;
    this.homeSeen.clear();
    this.hintsShown.clear();
    this.thoughtCd = 0;
    this.wanderWarned = false;
    this.waveOpen = false;
    this.inCrowd = false;
    this.objKey = '';
    g.ui.setErrands(null);
    this.cutsceneSkippable = false;
    this.setDoor(false, true);
    g.apt.bowlFood.visible = false;
    g.apt.snackPile.visible = false;
    g.apt.snackPile.clear();
    g.apt.tv.redraw((c, w, h) => drawTV(c, w, h, 'menu'));
    g.player.teleport(g.apt.anchors.spawn, Math.PI);
    g.cam.faceBehind(Math.PI);
    g.cam.pitch = 0.3;
    g.misoPos.copy(g.apt.anchors.catBed).setY(0.05);
    g.misoYaw = -2.4;
    g.miso.pose = 'loaf';
    g.miso.root.visible = true;
    g.streetCat.pose = 'loaf';
    if (g.out) for (const m of Object.values(g.out.items)) m.visible = true;
    g.setMarker(null);
    g.state = 'MENU';
    g.setZone('apartment', true);
  }

  menuScene() {
    const g = this.g;
    g.player.teleport(g.apt.anchors.sofaSeat, Math.PI);
    g.player.poseOverride = 'sit';
    g.misoPos.copy(W(-0.1, 0.45, 2.35));
    g.misoYaw = Math.PI;
    g.miso.pose = 'loaf';
  }

  begin() {
    const g = this.g;
    g.player.poseOverride = null;
    g.player.teleport(g.apt.anchors.spawn, Math.PI);
    g.misoPos.copy(g.apt.anchors.catBed).setY(0.05);
    g.setState('HOME_EXPLORATION');
    g.run(async () => {
      this.beginCutscene(true);
      await this.shot(W(0.8, 2.5, 3.8), W(-5, 1.2, -2.8), 0);
      await this.shot(W(-1.5, 2.3, 3.6), W(-4.5, 1.1, -3.0), 3.2);
      await this.shot(W(-4.6, 2.2, 2.4), W(2.5, 0.9, -1.5), 3.2);
      await this.shot(W(-2.6, 2.2, 3.5), W(-2.6, 1.3, 0.6), 2.2);
      this.endCutscene();
      this.faceCamBehind();
      g.ui.card('<div class="k">SATURDAY | 7:42 PM</div><h1>CURRENT OBJECTIVE:</h1><h2>Absolutely nothing.</h2><div class="hint">WASD to move · Mouse to look · E to interact</div>', '', 3.4);
      g.dlg.think('think', 'Saturday night. Zero plans. Perfect.');
    });
  }

  onState(s: MissionState) {
    const g = this.g;
    const obj: Partial<Record<MissionState, [string, string]>> = {
      HOME_EXPLORATION: ['Absolutely nothing.', 'Explore the apartment. Or don\'t. (The finale airs at 8.)'],
      CAT_FOOD_INCIDENT: ['Watch the finale.', 'Nothing can go wrong.'],
      LEAVE_APARTMENT: ['Leave the apartment.', 'Step 1 of 6. The hardest one, allegedly.'],
      TRAVEL_TO_STORE: ['Run the errands.', 'Three stops, any order. Follow the diamond.'],
      FIND_CAT_FOOD: ['FIND: CAT FOOD', 'Check the aisle signs. Or ask the staff (if you dare).'],
      CHECKOUT: ['Pay the cashier.', 'The billing counter, by the entrance. The final boss awaits.'],
      RETURN_HOME: ['Return home.', 'Miso is waiting. Miso is always waiting.'],
      FEED_CAT: ['Feed Miso.', 'The bowl is by the fridge.'],
      ENDING: ['Mission complete.', ''],
    };
    const o = obj[s];
    if (o) g.ui.setObjective(o[0], o[1]);
  }

  onZone(z: Zone, prev: Zone) {
    const g = this.g;
    if (z === 'corridor' && prev === 'apartment' && g.state === 'LEAVE_APARTMENT' && !g.flags.has('corridorIntro')) this.corridorIntro();
    if (z === 'apartment' && prev === 'corridor' && g.state === 'RETURN_HOME') this.homeAgain();
    if (z === 'store' && !g.flags.has('storeIn') && (g.state === 'FIND_CAT_FOOD' || g.state === 'TRAVEL_TO_STORE')) {
      g.flags.add('storeIn');
      g.anx.add(8);
      g.dlg.think('anx', 'It\'s so bright in here. Everyone can see everything.');
      setTimeout(() => g.dlg.think('logic', 'That\'s... how stores work. Signs are above the aisles.'), 2600);
    }
    if (prev === 'store' && z === 'street' && g.state === 'RETURN_HOME' && !g.flags.has('returnStreet')) {
      g.flags.add('returnStreet');
      g.run(async () => {
        await g.wait(1.2);
        g.dlg.think('logic', 'Hey. Notice anything?');
        await g.wait(2.6);
        g.dlg.think('anx', '...It\'s quieter.');
        await g.wait(2.6);
        g.dlg.think('logic', 'Nothing out here changed. We did.');
        await g.wait(2.8);
        g.dlg.think('anx', 'Don\'t make it weird.');
      }, { lock: false });
    }
  }

  onFocus() {
    const lines = [
      'Breathe in for four. Out for four. Nobody is looking at you as much as you think.',
      'Feet on the ground. Name three things you can see. Cat food is not one of them. Yet.',
      'You\'re allowed to feel weird and still do the thing.',
    ];
    this.g.dlg.think('logic', lines[Math.floor(Math.random() * lines.length)], 4);
  }

  onNotice(n: NPC) {
    const g = this.g;
    const ret = g.state === 'RETURN_HOME' || g.state === 'FEED_CAT';
    switch (n.id) {
      case 'uncle':
      case 'aunty':
        if (g.state === 'LEAVE_APARTMENT' && !g.flags.has('neighborsDone')) this.neighbors();
        else if (ret && !g.flags.has('neighborsBye')) {
          g.flags.add('neighborsBye');
          if (g.flags.has('corianderBought')) {
            this.bubble('aunty', 'You got the coriander?! Such a good boy!', 3.2);
            setTimeout(() => this.social('SIDE QUEST COMPLETE', 'Delivered one (1) bunch of coriander to Sharma Aunty.'), 1600);
            setTimeout(() => g.dlg.think('anx', 'She called us a good boy. We are twenty-two. We will take it.'), 3000);
          } else if (g.flags.has('coriander')) {
            this.bubble('aunty', 'Back already! Did you get the coriander?', 3.2);
            setTimeout(() => g.dlg.think('anx', 'SIDE QUEST FAILED.'), 1800);
            setTimeout(() => g.dlg.think('logic', 'It\'s coriander. She\'ll survive.'), 4200);
          } else this.bubble('uncle', 'Back so fast! Good boy.', 3);
        }
        break;
      case 'guard':
        if (ret) {
          this.bubble('guard', 'Welcome back, sir! Got everything?');
          setTimeout(() => g.ui.worldBubble('Yep! Thanks, Raju anna.', 'aarav', () => g.player.pos.clone().add(new THREE.Vector3(0, 2.1, 0)), 2.4), 1500);
        } else {
          n.setPose('salute');
          setTimeout(() => n.setPose('idle'), 2200);
          this.bubble('guard', 'Good evening, sir!');
          g.anx.add(8);
          setTimeout(() => g.dlg.think('anx', 'SIR?! I\'m twenty-two.'), 900);
          setTimeout(() => g.dlg.think('logic', 'He calls everyone sir. He called the plumber sir.'), 3200);
        }
        break;
      case 'tea':
        if (ret) this.bubble('tea', 'Got everything, sir? Chai on the way back?');
        else {
          this.bubble('tea', 'Chai, sir? Fresh one!');
          g.anx.add(6);
          setTimeout(() => g.dlg.think('anx', 'He offered us chai. Now we have to decline. OUT LOUD.'), 1000);
        }
        break;
      case 'hardware':
        if (!g.flags.has('gotBatteries') && this.errandsOpen()) {
          this.bubble('hardware', 'Haan, what you want? Tell.');
          g.anx.add(4);
        }
        break;
      case 'xerox':
        if (!g.flags.has('gotPrintout') && this.errandsOpen()) {
          this.bubble('xerox', 'Xerox? Printout? Come, come!');
          g.anx.add(4);
        }
        break;
      case 'mailman':
        if (ret) this.bubble('mailman', 'Good night, Aarav!');
        else {
          this.bubble('mailman', 'Arre, Aarav! Outside? Rare sighting!', 3);
          g.anx.add(9);
          setTimeout(() => g.dlg.think('anx', 'RARE SIGHTING. The building TRACKS us. There is a spreadsheet.'), 1100);
        }
        break;
      case 'veggie':
        this.bubble('veggie', g.flags.has('coriander') && !g.flags.has('corianderBought') ? 'Coriander! Fresh coriander, ten rupees!' : 'Tomato, onion, beta? Fresh fresh!');
        g.anx.add(5);
        if (g.flags.has('coriander') && !g.flags.has('corianderBought')) setTimeout(() => g.dlg.think('logic', 'Coriander. Aunty\'s side quest. It is RIGHT THERE.'), 1200);
        break;
      case 'kid':
        n.lookAtPlayer = true;
        g.anx.add(6);
        g.dlg.think('anx', 'A child is staring at us. Children can see into your SOUL.');
        setTimeout(() => g.dlg.think('logic', 'He is four. He is staring at the chips behind you.'), 2600);
        setTimeout(() => (n.lookAtPlayer = false), 5000);
        break;
      case 'rohan':
        if ((g.state === 'FIND_CAT_FOOD' || g.state === 'CHECKOUT') && !g.flags.has('rohanDone')) this.rohan();
        break;
      case 'priya':
        if (g.state === 'FIND_CAT_FOOD' && !g.flags.has('priyaTalked')) {
          this.bubble('priya', 'Need help finding anything?');
          g.anx.add(8);
          setTimeout(() => g.dlg.think('anx', 'She\'s offering HELP. Help leads to conversation. Conversation leads to suffering.'), 1000);
        } else this.bubble('priya', 'Thank you, come again!');
        break;
    }
  }

  onAvoid(n: NPC) {
    const g = this.g;
    if (g.state === 'RETURN_HOME' || g.state === 'FEED_CAT') return;
    if ((n.id === 'uncle' || n.id === 'aunty') && g.state === 'LEAVE_APARTMENT' && !g.flags.has('neighborsDone')) {
      if (g.flags.has('neighborsAvoided')) return;
      g.flags.add('neighborsAvoided');
      g.flags.add('neighborsDone');
      this.stealth('Slipped past the Sharmas. They\'re still discussing parking.');
      return;
    }
    if (n.id === 'guard') this.stealth('Slipped past security. Not that you were doing anything wrong.');
    if (n.id === 'tea') this.stealth('Avoided the chai upsell. Your wallet thanks you.');
    if (n.id === 'priya' && g.state !== 'TRAVEL_TO_STORE') this.stealth();
    if (n.id === 'mailman') this.stealth('Slipped past Mr. D\'Souza. The building spreadsheet stays un-updated.');
    if (n.id === 'rohan' && !g.flags.has('rohanDone') && g.state !== 'TRAVEL_TO_STORE') {
      g.flags.add('rohanDone');
      this.stealth('Dodged someone from college. The calculator remains unreturned.');
    }
  }

  update(dt: number) {
    const g = this.g;
    if (this.unpaidCd > 0) this.unpaidCd -= dt;
    this.thoughtCd -= dt;
    const a = g.apt.anchors;
    const o = g.out?.anchors;
    const z = g.zone;
    const pp = g.player.pos;
    const outbound = g.state === 'TRAVEL_TO_STORE' || g.state === 'FIND_CAT_FOOD' || g.state === 'CHECKOUT';
    if (z === 'street' && !g.locked) {
      // the bus-stop crowd is a "crowded space": standing in it winds the spiral up
      const crowd = outbound && pp.x > 43.2 && pp.x < 49.8 && pp.z > -3.1 && pp.z < 0.1;
      if (crowd) {
        g.anx.add(7 * dt);
        if (!this.inCrowd && !g.flags.has('crowdThought')) {
          g.flags.add('crowdThought');
          g.dlg.think('anx', 'A GROUP. Groups have a collective opinion. And it is about US.');
          setTimeout(() => g.dlg.think('logic', 'Or walk on the road side. Or just... walk faster.'), 2600);
        }
      } else if (this.inCrowd && !g.flags.has('crowdPassed') && outbound) {
        g.flags.add('crowdPassed');
        g.ui.toast('stealth', 'CROWD CLEARED', 'Walked past a group of strangers. Nobody turned around.');
      }
      this.inCrowd = crowd;
      const del = g.npcs.get('delivery');
      if (del && !g.flags.has('deliverySeen') && del.pos.distanceTo(pp) < 4) {
        g.flags.add('deliverySeen');
        g.dlg.think('anx', 'A delivery partner. So they DO exist. They just won\'t deliver to US.');
      }
      if (g.state === 'TRAVEL_TO_STORE' && pp.x > 33 && pp.x < 56 && !g.flags.has('momCalled')) this.momCall();
    }
    let m: THREE.Vector3 | null = null;
    switch (g.state) {
      case 'HOME_EXPLORATION':
        if (g.flags.has('sofaHint')) m = a.sofaSeat;
        if (g.stateTime > 45 && !g.flags.has('sofaHint')) {
          g.flags.add('sofaHint');
          g.ui.setObjective('Absolutely nothing.', 'Okay, one thing: the finale starts at 8. Sit on the sofa [E].');
          g.dlg.think('think', 'It\'s almost 8. Sofa time.');
        }
        if (g.stateTime > 150 && !g.locked) this.incident();
        break;
      case 'LEAVE_APARTMENT':
        m = z === 'apartment' ? a.door : g.flags.has('planStairs') ? a.stairs : a.lift;
        break;
      case 'TRAVEL_TO_STORE':
        if (o) m = z === 'lobby' ? o.lobbyExit : this.nearestErrand(true);
        if (z === 'street' && g.player.pos.x < -22 && !this.wanderWarned) {
          this.wanderWarned = true;
          g.dlg.think('logic', 'The supermarket is the other way. East. Toward the scary bright lights.');
        }
        break;
      case 'FIND_CAT_FOOD':
        if (o) m = z !== 'store' ? o.storeEntrance : g.flags.has('catHint') ? o.item_catfood : null;
        if (z === 'store' && g.stateTime > 75 && !g.flags.has('catHint')) {
          g.flags.add('catHint');
          g.dlg.think('logic', 'Aisle 3 says PET CARE. Purple paw prints on the floor. I\'m just saying.');
        }
        break;
      case 'CHECKOUT':
        if (o) m = z === 'store' ? o.checkoutSpot : o.storeEntrance;
        break;
      case 'RETURN_HOME':
        if (o) m = z === 'store' || z === 'street' ? this.nearestErrand(false) ?? o.lobbyExit : z === 'lobby' ? o.lobbyLift : null;
        if (z === 'corridor') m = a.door;
        break;
      case 'FEED_CAT':
        m = a.bowl;
        break;
    }
    g.setMarker(m);
    // errand checklist + the return objective follow the list
    const showList = !['MENU', 'HOME_EXPLORATION', 'CAT_FOOD_INCIDENT'].includes(g.state);
    g.ui.setErrands(showList ? this.errandList() : null);
    if (g.state === 'RETURN_HOME') {
      const left = this.errandList().filter((e) => !e.done);
      const key = left.map((e) => e.id).join(',');
      if (key !== this.objKey) {
        this.objKey = key;
        if (left.length) g.ui.setObjective('Finish your errands.', `Still on the list: ${left.map((e) => e.short).join(' and ')}.`);
        else g.ui.setObjective('Return home.', 'Miso is waiting. Miso is always waiting.');
      }
    }
    // general "where am I going" nudge
    if (!g.locked && g.stateTime > 60 && this.thoughtCd <= 0 && g.state !== 'HOME_EXPLORATION' && g.state !== 'ENDING') {
      this.thoughtCd = 45;
      const hint: Partial<Record<MissionState, string>> = {
        LEAVE_APARTMENT: 'The door. Then the lift. Or the stairs. Follow the little diamond.',
        TRAVEL_TO_STORE: 'Batteries across the road, the xerox shop down the street, cat food at Namma Mart. Follow the diamond.',
        CHECKOUT: 'The cashier is by the entrance. We can do this. Probably.',
        RETURN_HOME: 'Home is back west. The building with the SUNSHINE ENCLAVE sign.',
        FEED_CAT: 'The bowl. By the fridge. Miso is staring holes into us.',
      };
      const h = hint[g.state];
      if (h) g.dlg.think('logic', h);
    }
  }

  // ---------------------------------------------------------------- THE INCIDENT
  incident() {
    const g = this.g;
    if (g.state !== 'HOME_EXPLORATION') return;
    g.setState('CAT_FOOD_INCIDENT');
    const a = g.apt.anchors;
    g.run(async () => {
      this.beginCutscene(true);
      await this.fadeOut();
      g.player.teleport(a.sofaSeat, Math.PI);
      g.player.poseOverride = 'sit';
      g.misoPos.copy(W(0.7, 0, 0.9));
      g.misoYaw = -Math.PI / 2;
      g.miso.pose = 'sit';
      await this.shot(W(-2.3, 2.25, 4.05), W(-0.4, 1.0, -3.5), 0);
      await this.fadeIn();
      await this.say('aarav', 'Snacks: ready. Blanket: deployed. Phone: on silent.');
      await this.say('aarav', 'Nothing can ruin this.');
      // the remote dies
      await this.say('aarav', 'Okay. Play.');
      audio.sfx('click');
      await g.wait(0.7);
      audio.sfx('click');
      await g.wait(0.25);
      audio.sfx('click');
      await this.say('aarav', '...Play.');
      await this.say('think', 'The remote is dead. The batteries have chosen violence.');
      await this.say('logic', 'The TV has buttons.');
      await this.say('anx', 'On the BACK. Nobody in human history has found them.');
      // Miso jumps onto the coffee table
      audio.sfx('meow');
      const from = g.misoPos.clone();
      const to = W(-0.75, 0.42, 0.3);
      await tween(g, 0.55, (k) => {
        g.misoPos.lerpVectors(from, to, k);
        g.misoPos.y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 0.5;
        g.misoYaw = Math.PI * 0.6;
      });
      g.misoYaw = Math.PI * 0.1;
      g.miso.pose = 'meow';
      await this.shot(W(0.4, 1.0, 1.6), W(-0.75, 0.65, 0.3), 0.8);
      audio.sfx('meow');
      await this.say(MISO, 'Meow.');
      audio.sfx('meow');
      await g.wait(0.4);
      audio.sfx('meow2');
      await this.say(MISO, 'Meow. Meow. MEOW.');
      await this.shot(W(-1.4, 1.5, 1.0), W(-1, 1.0, 2.4), 0.6);
      await this.say('aarav', 'Miso. It\'s the finale. Whatever it is, it can wait.');
      audio.sfx('meow2');
      g.miso.pose = 'meow';
      await this.say(MISO, 'MEOOOOOOW.');
      await this.say('think', '...That\'s her "the food situation is critical" meow.');
      // kitchen: the jar
      await this.fadeOut();
      g.player.poseOverride = null;
      g.player.teleport(W(2.35, 0, 3.15), 0);
      g.misoPos.copy(W(3.2, 0, 2.6));
      g.misoYaw = -Math.PI / 2;
      g.miso.pose = 'lookup';
      await this.shot(W(3.5, 1.65, 2.3), W(2.3, 1.05, 4.0), 0);
      await this.fadeIn();
      g.player.poseOverride = 'lean';
      await this.say('system', 'MISO FOOD: 0 / 1 SERVINGS');
      await this.say('think', 'Empty. Completely empty. Not even a crumb for lore.');
      await this.say('think', 'Okay. No panic. This is what apps are for.');
      // phone sequence
      g.player.poseOverride = 'phone';
      await this.shot(W(2.9, 1.9, 2.5), W(2.35, 1.2, 3.2), 0.6);
      const app = (name: string, color: string, body: string) => g.ui.phone(`<div class="app-head" style="background:${color}">${name}</div><div class="app-body">${body}</div>`);
      app('DashBasket', '#ff5c8a', '<div class="app-spin"></div><div class="app-big">Finding a delivery partner near you…</div>');
      audio.sfx('buzz');
      await g.wait(1.3);
      app('DashBasket', '#ff5c8a', '<div style="font-size:46px">😿</div><div class="app-big">NO DELIVERY PARTNERS AVAILABLE.</div><div class="app-small">They\'re all busy delivering to people who can\'t go outside either.</div>');
      await this.say('aarav', 'No.');
      app('Instacrate', '#3a86ff', '<div class="app-small">Cat food • 1 item</div><div class="app-big">NEXT DELIVERY:<br/>TOMORROW, 7:00 AM</div><div class="app-btn">↻ Refresh</div>');
      await this.say('aarav', 'Tomorrow?!');
      audio.sfx('click');
      app('Instacrate', '#3a86ff', '<div class="app-spin"></div><div class="app-small">Refreshing…</div>');
      await g.wait(0.8);
      app('Instacrate', '#3a86ff', '<div class="app-big">STILL TOMORROW.</div><div class="app-btn">↻ Refresh</div>');
      await this.say('think', 'Refresh.');
      audio.sfx('click');
      app('Instacrate', '#3a86ff', '<div class="app-spin"></div><div class="app-small">Refreshing…</div>');
      await g.wait(0.9);
      g.setMusic('none');
      audio.sfx('scratch');
      app('Instacrate', '#14111c', '<div class="app-big" style="font-size:26px">PLEASE GO OUTSIDE.</div>');
      g.anx.add(30);
      await g.wait(0.8);
      await this.say('anx', 'Did the app just... bully us?');
      audio.sfx('buzz');
      app('Mail', '#2d6a4f', '<div class="app-small">Pixel &amp; Paws Studio · just now</div><div class="app-big">Interview confirmed: TOMORROW, 10:00 AM</div><div class="app-small">Please bring a <b>printed copy</b> of your resume.</div>');
      g.anx.add(15);
      await this.say('anx', 'PRINTED? On PAPER? Like a PIONEER?');
      await this.say('logic', 'We don\'t own a printer.');
      await this.say('anx', 'We own a printer. It hasn\'t worked since 2021. It is a shelf now.');
      g.ui.phone(null);
      g.player.poseOverride = null;
      // dramatic silence, slow push toward the front door
      g.player.yaw = Math.PI * 1.25;
      g.player.sync();
      await this.shot(W(2.2, 1.7, 1.5), W(4, 1.2, -4.5), 0.4);
      await g.wait(1.0);
      g.setMusic('epic');
      g.player.model.expr = 'shock';
      await this.shot(W(3.6, 1.5, -2.2), W(4, 1.2, -4.5), 3.5);
      await this.say('think', 'No.');
      await this.say('think', 'Absolutely not.');
      await this.say('think', 'There must be another way.');
      await this.say('logic', 'There isn\'t.');
      await this.say('anx', 'We could fake our own death.');
      await this.say('logic', 'For cat food?');
      // Miso
      g.misoPos.copy(W(2.8, 0, 2.2));
      g.misoYaw = Math.PI;
      g.miso.pose = 'lookup';
      await this.shot(W(2.4, 0.7, 1.0), W(2.8, 0.35, 2.2), 0.8);
      audio.sfx('meow');
      await this.say(MISO, '...meow?');
      g.player.model.expr = 'determined';
      await this.shot(W(1.4, 1.6, 0.6), W(2.35, 1.5, 3.15), 0.8);
      await this.say('aarav', '...Fine.');
      await this.say('aarav', 'For the cat.');
      await this.say('think', '...And the remote. And, apparently, my entire career.');
      audio.sfx('quest');
      g.cam.shake = 0.4;
      const card = g.ui.card(
        `<div class="k">MAIN QUEST UNLOCKED</div><h1>OPERATION: TOUCH GRASS</h1>
        <ol><li>Leave the apartment.</li><li>Buy cat food at Namma Mart.</li><li>Buy batteries at the hardware shop.</li><li>Print the resume at the xerox shop.</li><li>Return home.</li><li>Feed Miso. Watch the finale.</li></ol>
        <div class="stats">DIFFICULTY: <b>Emotionally Impossible</b><br/>RECOMMENDED LEVEL: <b>99</b> · CURRENT LEVEL: <b>2</b></div><div class="hint">Space to continue</div>`,
        '',
        g.skipping ? 2.5 : 7,
      );
      this.endCutscene();
      await card;
      g.player.model.expr = 'neutral';
      g.miso.pose = 'sit';
      g.misoFollow = false;
      g.setMusic(null);
      g.setState('LEAVE_APARTMENT');
      this.faceCamBehind();
      g.dlg.think('logic', 'Tip: press F to Focus when the thoughts get loud. Q to pretend to check your phone.', 5);
    });
  }

  // ---------------------------------------------------------------- corridor
  private corridorIntro() {
    const g = this.g;
    g.flags.add('corridorIntro');
    const a = g.apt.anchors;
    g.run(async () => {
      g.player.teleport(a.corridorEntry, Math.PI);
      g.anx.add(22);
      g.ui.warning('⚠ WARNING: HUMANS DETECTED');
      g.cam.shake = 0.3;
      await this.shot(W(2.3, 2.5, -5.35), W(9.8, 1.2, -6.6), 0.8);
      this.bubble('uncle', '...and I told him, that is NOT how you park a car!', 2.6);
      await g.wait(1.4);
      this.bubble('aunty', 'Exactly! These people!', 2.2);
      await g.wait(1.0);
      await this.say('think', 'Two enemies. One corridor. No respawn point.');
      await this.say('logic', 'It\'s the Sharmas. From 304.');
      await this.say('anx', 'They\'ve seen us take out the trash in pajamas. They have INTEL.');
      const c = await g.dlg.choose('TACTICAL OPTIONS', ['Walk past confidently.', 'Pretend to look at my phone.', 'Wait until they move.', 'Take the stairs.']);
      if (c === 0) {
        await this.say('think', 'Confidence. I am a confident person. I walk like... a person.');
      } else if (c === 1) {
        g.player.phoneOut = true;
        await this.say('system', 'PHONE SHIELD: ACTIVE. Nearby humans will notice you less. (Q to toggle)');
        await this.say('logic', 'Nobody bothers a guy who\'s looking at his phone.');
        await this.say('anx', 'Unless he looks at it too hard. Look at it a normal amount.');
      } else if (c === 2) {
        await this.fadeOut('Four minutes of pretending to tie a shoelace in the doorway later...', 0.6);
        await g.wait(2.2);
        g.npcs.get('uncle')!.hide();
        g.npcs.get('aunty')!.hide();
        g.flags.add('neighborsDone');
        g.flags.add('neighborsGone');
        await this.fadeIn(0.6);
        this.stealth('Waited out the small talk. Patience is a stealth stat.');
        await this.say('think', 'They\'re gone. The corridor is mine.');
      } else {
        g.flags.add('planStairs');
        await this.say('think', 'Stairs. Three floors of zero eye contact. West end of the corridor.');
      }
      g.cam.clearShot();
      g.player.yaw = Math.PI / 2;
      g.player.sync();
      g.cam.faceBehind(Math.PI / 2);
      void a;
    });
  }

  private neighbors() {
    const g = this.g;
    g.flags.add('neighborsDone');
    const uncle = g.npcs.get('uncle')!;
    const aunty = g.npcs.get('aunty')!;
    const U = this.npcSpeaker('uncle');
    const A = this.npcSpeaker('aunty');
    if (g.player.phoneOut) {
      g.run(async () => {
        this.bubble('uncle', 'Arre Aarav! Always on the phone, these youngsters!', 2.8);
        await g.wait(1.6);
        this.bubble('aunty', 'Let him be, he\'s busy.', 2.4);
        await g.wait(1.0);
        g.dlg.think('anx', 'He saw through the disguise.');
        await g.wait(2.2);
        g.dlg.think('logic', 'He said one sentence and went back to discussing parking.');
        this.stealth('Phone shield absorbed 90% of the small talk.');
      }, { lock: false });
      return;
    }
    g.run(async () => {
      uncle.lookAtPlayer = aunty.lookAtPlayer = true;
      uncle.face(g.player.pos);
      g.player.yaw = Math.atan2(uncle.pos.x - g.player.pos.x, uncle.pos.z - g.player.pos.z);
      g.player.sync();
      g.player.model.expr = 'shock';
      const mid = uncle.pos.clone().lerp(g.player.pos, 0.5);
      await this.shot(new THREE.Vector3(mid.x - 2.4, 1.8, -4.95), new THREE.Vector3(mid.x + 0.3, 1.35, mid.z), 0.6);
      uncle.setPose('wave');
      await this.say(U, 'Arre Aarav, going somewhere?');
      uncle.setPose('idle');
      await this.say('logic', 'Just answer the question.');
      await this.say('anx', 'There are FOUR possible answers and three of them are WRONG.');
      g.player.model.expr = 'nervous';
      const c = await g.dlg.choose('SHARMA UNCLE ASKS: "Going somewhere?"', ['"Yeah, just getting groceries."', '"No."', '"You too."', '"It\'s classified."']);
      if (c === 0) {
        uncle.setPose('talk');
        await this.say(U, 'Good, good! Get some fresh air also. Looking very pale, beta.');
        aunty.setPose('talk');
        await this.say(A, 'If you see coriander, bring one bunch, okay?');
        await this.say('aarav', '...Okay, aunty.');
        await this.say('logic', 'That was a perfectly normal exchange.');
        await this.say('anx', 'She gave us a SIDE QUEST. We can barely handle the MAIN quest.');
        g.flags.add('coriander');
        this.social();
      } else if (c === 1) {
        g.cam.shake = 0.2;
        await g.wait(0.8);
        await this.say(U, '...Okay?');
        await this.say(A, '(whispering) Kids these days.');
        await this.say('anx', 'We said "no" while visibly walking to the lift. With shoes on.');
        await this.say('logic', 'Bold strategy.');
        this.awkward();
      } else if (c === 2) {
        await this.say(U, 'Me too? I\'m not going anywhere, beta. I live here.');
        await this.say('logic', 'He asked a question.');
        await this.say('anx', 'And we answered a completely different one. Confidently.');
        this.awkward();
      } else {
        uncle.setPose('celebrate');
        await this.say(U, 'Ha! James Bond is going to buy milk!');
        uncle.setPose('talk');
        await this.say(A, 'Very funny boy, this one.');
        await this.say('anx', 'He thinks we\'re funny. Now we have to be funny FOREVER.');
        this.awkward();
        this.social('SOCIAL XP +10', 'Made a joke. It landed. Somehow.');
      }
      uncle.setPose('talk');
      await this.say(U, 'Okay, okay, go. Lift is working today, by the way.');
      uncle.lookAtPlayer = aunty.lookAtPlayer = false;
      uncle.setPose('talk');
      aunty.setPose('idle');
      g.player.model.expr = 'neutral';
    });
  }

  private takeLiftDown(stairs: boolean) {
    const g = this.g;
    if (g.state === 'RETURN_HOME') {
      g.run(() => this.say('think', 'Home is right there. Door 302. I can see it.'));
      return;
    }
    if (g.state !== 'LEAVE_APARTMENT') {
      g.run(() => this.say('think', 'Not going back out. Absolutely not. Achievement: Knows Limits.'));
      return;
    }
    g.run(async () => {
      if (!stairs) await this.liftRide();
      const text = stairs
        ? 'Three floors down. Roughly six hundred steps (estimated). Your knees file a formal complaint.'
        : '';
      await this.fadeOut(text, stairs ? 0.6 : 0.3);
      const out = await g.outReady;
      g.check(g.gen);
      await g.wait(stairs ? 2.6 : 2.4);
      this.setDoor(false, true);
      g.player.phoneOut = false;
      g.player.teleport(stairs ? out.anchors.lobbyStairsArrive : out.anchors.lobbyLiftArrive, Math.PI);
      g.cam.faceBehind(Math.PI);
      g.setZone('lobby');
      g.setState('TRAVEL_TO_STORE');
      if (stairs) this.stealth('Took the stairs. Zero eye contact achieved. Cardio unintentionally achieved.');
      await this.fadeIn(0.6);
      g.dlg.think('think', 'Ground floor. The lobby. The final barrier between me and... outside.');
    });
  }

  // ---------------------------------------------------------------- lobby & street
  private async talkGuard() {
    const g = this.g;
    const R = this.npcSpeaker('guard');
    const n = g.npcs.get('guard')!;
    n.lookAtPlayer = true;
    if (g.flags.has('guardTalked')) {
      await this.say(R, g.state === 'RETURN_HOME' ? 'Good night, sir! Rest well!' : 'All okay, sir? Careful on the road!');
      n.lookAtPlayer = false;
      return;
    }
    g.flags.add('guardTalked');
    const c = await g.dlg.choose('RAJU THE SECURITY GUARD', ['"Good evening, Raju anna!"', '*nod silently*', '"Sir? I\'m twenty-two."']);
    if (c === 0) {
      await this.say(R, 'Good evening, sir! Going for a walk? Very good, very good. Fresh air!');
      await this.say('logic', 'Look at us. Greeting people. By name.');
      this.social();
    } else if (c === 1) {
      n.setPose('salute');
      await this.say('system', 'Raju nods back. You both nod. The nod is returned. A perfect exchange.');
      await this.say('anx', 'No words. Elite communication.');
      n.setPose('idle');
      this.g.stats.avoided++;
    } else {
      await this.say(R, '(laughing) Okay, sir.');
      await this.say('anx', 'He said sir AGAIN.');
      this.awkward();
      this.g.stats.conversations++;
    }
    n.lookAtPlayer = false;
  }

  private firstStreet() {
    const g = this.g;
    if (g.state !== 'TRAVEL_TO_STORE' || g.flags.has('firstStreet')) return;
    g.flags.add('firstStreet');
    g.anx.add(14);
    g.run(async () => {
      g.dlg.think('anx', 'The outside. It\'s so... big. And full of people with opinions.');
      await g.wait(3.2);
      g.dlg.think('logic', 'It\'s 7:50 PM. It\'s dark. Nobody can even see us.');
      await g.wait(3.2);
      g.dlg.think('anx', 'Then why does it feel like a spotlight?');
    }, { lock: false });
  }

  private async talkTea() {
    const g = this.g;
    const T = this.npcSpeaker('tea');
    const n = g.npcs.get('tea')!;
    if (g.flags.has('teaTalked')) {
      await this.say(T, g.state === 'RETURN_HOME' ? 'Come tomorrow, sir! Fresh batch at six!' : 'Chai is always here, sir.');
      return;
    }
    g.flags.add('teaTalked');
    n.setPose('talk');
    await this.say(T, 'Chai, coffee, bun — what do you want, sir?');
    const c = await g.dlg.choose("ANNA'S TEA STALL", ['"One chai, please."', '"Not today, anna."', '*panic-point at a biscuit*']);
    if (c === 0) {
      await this.say(T, 'Ten rupees. Strong one for you, sir.');
      g.player.poseOverride = 'phone';
      await g.wait(0.6);
      g.player.poseOverride = null;
      await this.say('aarav', '...This is the best chai I\'ve ever had.');
      await this.say('logic', 'You\'ve been indoors for four days. Everything is the best.');
      this.social();
    } else if (c === 1) {
      await this.say(T, 'Okay sir, next time!');
      await this.say('logic', 'Polite rejection. Handled by us. Out loud.');
      this.social('SOCIAL XP +15', 'Said "no" to a human. Nobody exploded.');
    } else {
      await this.say(T, 'Osmania biscuit? Five rupees.');
      await this.say('anx', 'We now own a biscuit. We did not want a biscuit.');
      g.stats.extras.push('Osmania biscuit');
      g.addItem('biscuit', '🍪', 'Osmania biscuit', true);
      this.awkward();
    }
    n.setPose('scan');
  }

  private dance() {
    const g = this.g;
    g.flags.add('danceDone');
    const st = g.npcs.get('stranger')!;
    const S = this.npcSpeaker('stranger');
    g.run(async () => {
      g.player.phoneOut = false;
      // set the stage on the narrow sidewalk by the construction site
      g.player.teleport(new THREE.Vector3(61.2, 0, -2.3), Math.PI / 2);
      st.pos.set(68, 0, -2.3);
      st.yaw = -Math.PI / 2;
      st.mode = 'script';
      st.sync();
      await this.shot(new THREE.Vector3(63.5, 2.0, -6.2), new THREE.Vector3(64, 1.1, -2.2), 0);
      await this.say('think', 'Oh no. A pedestrian. Walking straight at us.');
      // walk toward each other
      const p0 = g.player.pos.clone();
      const s0 = st.pos.clone();
      await tween(g, 1.4, (k) => {
        g.player.pos.x = p0.x + (62.9 - p0.x) * k;
        st.pos.x = s0.x + (64.6 - s0.x) * k;
        g.player.model.speed = 1.6;
        st.model.speed = 1.6;
        g.player.sync();
        st.sync();
      });
      g.player.model.speed = 0;
      st.model.speed = 0;
      // the mirror demo: left, left, right, right
      for (const dz of [-0.45, 0.45, 0]) {
        await tween(g, 0.35, (k) => {
          g.player.pos.z += (-2.3 + dz - g.player.pos.z) * k;
          st.pos.z += (-2.3 + dz - st.pos.z) * k;
          g.player.sync();
          st.sync();
        });
        audio.sfx('bump', 0.5);
        await g.wait(0.15);
      }
      g.setMusic('dance');
      audio.sfx('boss');
      g.player.model.expr = 'shock';
      await this.shot(new THREE.Vector3(63.7, 1.6, -4.6), new THREE.Vector3(63.7, 1.3, -2.3), 0.5);
      await g.ui.card('<div class="k">MINI BOSS</div><h1>THE SIDEWALK STRANGER</h1><h2>SPECIAL ABILITY: PERFECT MIRROR</h2>', 'boss', 2.6);
      g.anx.add(15);
      const res = await sidewalkDance(g);
      g.stats.danceFails = res.fails;
      g.setMusic('none');
      audio.sfx('scratch');
      if (!res.auto) {
        // slip past
        const p1 = g.player.pos.clone();
        await tween(g, 0.7, (k) => {
          g.player.pos.x = p1.x + 2.4 * k;
          g.player.model.speed = 2.5;
          g.player.sync();
        });
        g.player.model.speed = 0;
      } else {
        st.setPose('shrug');
        await tween(g, 0.5, (k) => {
          st.pos.z = -2.3 + 0.55 * k;
          st.sync();
        });
      }
      await this.say(S, 'Sorry, bhai.');
      st.setPose('idle');
      if (res.auto) {
        await this.say('anx', 'We\'ve developed a bond. I\'ll miss him.');
        await this.say('logic', 'He said sorry. He was never an enemy.');
      } else {
        await this.say('logic', 'He said sorry. He was never an enemy.');
        await this.say('anx', '...I\'ll allow it.');
        if (res.fails === 0) g.ui.toast('achievement', 'FLAWLESS', 'Read the Perfect Mirror on the first try.');
      }
      g.player.model.expr = 'neutral';
      g.setMusic(null);
      // he wanders off west and becomes a regular pedestrian
      st.route = [new THREE.Vector3(40, 0, -2.2), new THREE.Vector3(14, 0, -2.4), new THREE.Vector3(52, 0, -2.2)];
      st.routeIdx = 0;
      st.mode = 'route';
      st.speed = 1.2;
      st.pos.z = -2.3;
      if (res.auto) {
        g.player.pos.set(66, 0, -2.3);
        g.player.sync();
      }
      st.pos.x = Math.min(st.pos.x, g.player.pos.x - 1.2);
      this.faceCamBehind();
    });
  }

  private storeFront() {
    const g = this.g;
    const o = g.out!.anchors;
    g.setState('FIND_CAT_FOOD');
    g.run(async () => {
      g.player.phoneOut = false;
      await this.shot(new THREE.Vector3(100.5, 1.6, -6.5), o.storeSignLook, 0.9);
      g.player.model.expr = 'happy';
      await this.say('think', 'We made it.');
      g.player.model.expr = 'neutral';
      await this.say('logic', 'Now buy the food.');
      await this.say('anx', 'What if we go in and they don\'t have it?');
      await this.say('logic', 'Then we ask.');
      await this.say('anx', 'You are no longer authorized to speak.');
      this.faceCamBehind();
    });
  }

  // ---------------------------------------------------------------- store
  private async talkPriya() {
    const g = this.g;
    const P = this.npcSpeaker('priya');
    const n = g.npcs.get('priya')!;
    n.lookAtPlayer = true;
    n.setPose('idle');
    if (g.flags.has('priyaTalked') || g.state !== 'FIND_CAT_FOOD') {
      await this.say(P, g.state === 'FIND_CAT_FOOD' ? 'Aisle 3, bottom shelf!' : 'Have a good night!');
      n.setPose('scan');
      n.lookAtPlayer = false;
      return;
    }
    g.flags.add('priyaTalked');
    await this.say(P, 'Hi! Looking for something?');
    const c = await g.dlg.choose('PRIYA (STORE STAFF)', ['"Where\'s the cat food?"', '"Just looking, thanks!"', '"Do you have... courage? In a jar?"']);
    if (c === 0) {
      await this.say(P, 'Aisle 3, bottom shelf, right next to the dog food!');
      await this.say('aarav', 'Thank you!');
      await this.say('logic', 'Asked a stranger for help. Received help. Nobody died.');
      g.flags.add('catHint');
      this.social();
    } else if (c === 1) {
      await this.say(P, 'Sure! Shout if you need anything.');
      await this.say('logic', 'A clean, polite exit. Textbook.');
      this.stealth('Deflected customer service like a professional.');
    } else {
      await this.say(P, '(laughing) Aisle 3 has energy drinks... close enough? Cat food\'s there too. Bottom shelf.');
      await this.say('anx', 'She LAUGHED. Was it a with-us laugh or an at-us laugh?');
      await this.say('logic', 'It was a nice laugh. And she gave us directions.');
      g.flags.add('catHint');
      this.awkward();
      this.g.stats.conversations++;
    }
    n.setPose('scan');
    n.lookAtPlayer = false;
  }

  private async gotCatFood() {
    const g = this.g;
    g.out!.items.catfood.visible = false;
    g.addItem('catfood', '🐟', 'Meow Meal 1.2kg');
    audio.sfx('quest');
    g.player.model.expr = 'happy';
    g.player.poseOverride = 'celebrate';
    g.ui.toast('item', 'LEGENDARY ITEM ACQUIRED', 'MEOW MEAL — Ocean Fish, 1.2 kg. Miso\'s favourite.');
    await this.say('think', 'Legendary item acquired.');
    g.player.poseOverride = null;
    await this.say('anx', 'Now we have to... pay for it. At the counter. With the person.');
    g.player.model.expr = 'neutral';
    g.setState('CHECKOUT');
  }

  private cashier() {
    const g = this.g;
    if (g.flags.has('bossStarted')) return;
    g.flags.add('bossStarted');
    const o = g.out!.anchors;
    const cash = g.npcs.get('cashier')!;
    const C = this.npcSpeaker('cashier');
    g.run(async () => {
      g.player.phoneOut = false;
      await this.queue();
      g.player.teleport(o.checkoutSpot, Math.PI / 2);
      cash.face(g.player.pos);
      cash.lookAtPlayer = true;
      g.setMusic('tension');
      await this.shot(new THREE.Vector3(103.6, 1.9, 6.6), new THREE.Vector3(104.8, 1.3, 3.5), 0.8);
      await g.wait(0.5);
      g.setMusic('boss');
      audio.sfx('boss');
      g.cam.shake = 0.4;
      await g.ui.card('<div class="k">FINAL BOSS</div><h1>THE CASHIER</h1><h2>LEVEL: UNKNOWN</h2><div class="stats">SPECIAL ATTACK: <b>NORMAL CONVERSATION</b></div>', 'boss', 3);
      g.ui.bossBar(true, 'THE CASHIER', 'SPECIAL ATTACK: NORMAL CONVERSATION', 1);
      // scan the items
      cash.setPose('scan');
      const unpaid = g.inventory.filter((i) => !i.paid);
      for (let i = 0; i < unpaid.length; i++) {
        audio.sfx('beep');
        await g.wait(0.45);
      }
      cash.setPose('idle');
      await this.shot(new THREE.Vector3(102.6, 1.75, 4.6), new THREE.Vector3(106, 1.55, 3.5), 0.5);
      await this.say(C, 'Do you want a bag?');
      // time slows
      audio.sfx('slowmo');
      audio.setDuck(0.35);
      g.anx.add(25);
      g.player.model.expr = 'shock';
      await this.shot(new THREE.Vector3(103.0, 1.7, 3.9), new THREE.Vector3(103.6, 1.62, 3.55), 0.9);
      await this.say('anx', 'THIS IS IT.');
      await this.say('anx', 'THE QUESTION.');
      await this.say('logic', '...We trained for this.');
      await this.shot(new THREE.Vector3(102.6, 1.75, 4.6), new THREE.Vector3(106, 1.55, 3.5), 0.4);
      const c = await g.dlg.choose('THE CASHIER ASKS: "Do you want a bag?"', ['"Yes, please."', '"No, thank you."', '"You too."', '"I already have emotional baggage."']);
      audio.setDuck(1);
      g.player.model.expr = 'nervous';
      let bag = false;
      if (c === 0) {
        bag = true;
        await this.say(C, 'That\'s five rupees extra for the bag.');
        await this.say('anx', 'A HIDDEN FEE. IT WAS A TRAP ALL ALONG.');
        await this.say('logic', 'It\'s five rupees.');
        g.ui.bossBar(true, 'THE CASHIER', 'COMPOSURE CHECK: PASSED', 0.6);
      } else if (c === 1) {
        cash.setPose('idle', 'happy');
        await this.say(C, 'Okay!');
        await this.say('logic', 'Clean. Efficient. Textbook.');
        await this.say('anx', '...But then how do we carry it?');
        await this.say('logic', 'In our hands. Like a person.');
        g.ui.bossBar(true, 'THE CASHIER', 'CRITICAL HIT: POLITENESS', 0.55);
      } else if (c === 2) {
        cash.setPose('idle', 'deadpan');
        g.setMusic('none');
        await g.wait(1.1);
        await this.say('think', 'Delete my save file.');
        await g.wait(0.6);
        g.setMusic('boss');
        await this.say(C, '...Okay! No bag then.');
        await this.say('logic', 'She just... continued. Like it never happened.');
        this.awkward();
        g.ui.bossBar(true, 'THE CASHIER', 'SHE SIMPLY CONTINUED', 0.6);
      } else {
        cash.setPose('idle', 'happy');
        await this.say(C, '...Haha. Same, honestly.');
        await this.say('anx', 'SHE RELATED TO US. WHAT DO WE DO WITH THIS INFORMATION.');
        this.awkward();
        g.ui.bossBar(true, 'THE CASHIER', 'UNEXPECTED SOLIDARITY', 0.5);
      }
      cash.model.expr = 'neutral';
      await this.loyalty();
      const prices: Record<string, number> = { catfood: 185, chips: 20, choco: 35, noodles: 14 };
      const total = unpaid.reduce((s, i) => s + (prices[i.id] ?? 0), 0) + (bag ? 5 : 0);
      await this.say(C, `That'll be ₹${total}. UPI, card or cash?`);
      g.dlg.close();
      await this.shot(new THREE.Vector3(102.9, 1.9, 2.2), new THREE.Vector3(104.4, 1.1, 4.5), 0.5);
      const method = await payment(g, total);
      g.stats.pay = method;
      g.inventory.forEach((i) => (i.paid = true));
      g.refreshInventory();
      g.ui.bossBar(true, 'THE CASHIER', 'PAYMENT RECEIVED', 0.05);
      await this.shot(new THREE.Vector3(102.6, 1.75, 4.6), new THREE.Vector3(106, 1.55, 3.5), 0.5);
      cash.setPose('wave', 'happy');
      await this.say(C, 'Thanks, have a nice day!');
      await this.say('aarav', 'You too.');
      g.setMusic('none');
      await g.wait(0.9);
      await this.say('logic', '...That was actually correct.');
      g.player.model.expr = 'happy';
      g.player.poseOverride = 'celebrate';
      await this.say('anx', 'WE DID IT.');
      audio.sfx('victory');
      g.ui.bossBar(false);
      g.cam.shake = 0.3;
      await g.ui.card('<div class="k">BOSS DEFEATED</div><h1>CAT FOOD ACQUIRED</h1><div class="stats">SOCIAL DAMAGE: <b>47</b><br/>ACTUAL DANGER: <b>0</b></div>', 'win', 4);
      g.player.poseOverride = null;
      g.player.model.expr = 'neutral';
      cash.setPose('idle');
      cash.lookAtPlayer = false;
      const b = g.player.model.bag!;
      b.visible = true;
      ((b.children[0] as THREE.Mesh).material as THREE.MeshToonMaterial).color.setHex(bag ? 0xf2efe6 : 0xff8a3d);
      g.setMusic(null);
      g.setState('RETURN_HOME');
      this.faceCamBehind();
      g.dlg.think('think', 'Okay. Home. Before anything else happens.');
    });
  }

  // ---------------------------------------------------------------- return
  private liftHome() {
    const g = this.g;
    if (g.state !== 'RETURN_HOME') {
      g.run(() => this.say('think', 'We\'re not going back up empty-handed. Miso is counting on us.'));
      return;
    }
    const left = this.errandList().filter((e) => !e.done);
    if (left.length) {
      g.run(() => this.say('think', `Not yet. Still need ${left.map((e) => e.short).join(' and ')}. We are NOT doing this trip twice.`));
      return;
    }
    g.run(async () => {
      audio.sfx('ding');
      await this.fadeOut('The lift ride home. You hum the lift music. Nobody hears. Victory.', 0.6);
      await g.wait(2.2);
      g.player.teleport(g.apt.anchors.liftArrive, 0);
      g.cam.faceBehind(-Math.PI / 2);
      g.setZone('corridor');
      // neighbors are still chatting unless they went inside
      if (!g.flags.has('neighborsGone')) {
        const u = g.npcs.get('uncle')!;
        const a = g.npcs.get('aunty')!;
        u.noticed = a.noticed = false;
        u.nearT = a.nearT = 0;
      }
      g.player.yaw = -Math.PI / 2;
      g.player.sync();
      g.cam.faceBehind(-Math.PI / 2);
      await this.fadeIn(0.6);
    });
  }

  private homeAgain() {
    const g = this.g;
    g.setState('FEED_CAT');
    g.misoTarget = g.player.pos.clone().add(new THREE.Vector3(0, 0, 1.2));
    g.miso.pose = 'lookup';
    audio.sfx('meow');
    g.run(async () => {
      await g.wait(0.6);
      audio.sfx('meow2');
      g.dlg.think(MISO, 'MEOW! (Translation: "Where have you BEEN.")');
      await g.wait(2.6);
      g.dlg.think('think', 'I have returned from the war, Miso. I bring tribute.');
    }, { lock: false });
  }

  private feed() {
    const g = this.g;
    const a = g.apt.anchors;
    g.setState('ENDING');
    g.run(async () => {
      this.beginCutscene(false);
      g.player.teleport(a.bowlStand, 0);
      g.player.poseOverride = 'feed';
      g.misoFollow = false;
      g.misoTarget = null;
      g.misoPos.copy(W(4.6, 0, 2.2));
      g.misoYaw = -Math.PI / 2;
      await this.shot(W(2.6, 1.3, 1.2), W(3.9, 0.3, 2.4), 0.8);
      audio.sfx('kaching', 0.4);
      await g.wait(0.6);
      g.apt.bowlFood.visible = true;
      g.player.model.bag!.visible = false;
      audio.sfx('meow2');
      g.misoTarget = W(4.25, 0, 2.6);
      await g.wait(0.8);
      g.misoYaw = -Math.PI / 2;
      g.miso.pose = 'eat';
      audio.sfx('eat');
      audio.sfx('purr');
      g.player.poseOverride = null;
      g.player.model.expr = 'happy';
      await this.say('think', 'There you go, Miso. Ocean Fish. Your favourite.');
      await this.ending();
    });
  }

  private async ending() {
    const g = this.g;
    const a = g.apt.anchors;
    const id = computeEnding(g.stats);
    g.setMusic('cozy');
    await this.fadeOut('', 0.5);
    g.apt.tv.redraw((c, w, h) => drawTV(c, w, h, 'menu'));
    g.player.teleport(a.sofaSeat, Math.PI);
    g.player.poseOverride = 'sit';
    g.player.model.expr = 'happy';
    g.misoPos.copy(W(3.9 + 0.35, 0, 2.6));
    if (id === 'C') {
      // everything he never intended to buy, on the table
      const pile = g.apt.snackPile;
      pile.clear();
      const cols = [0x3a86ff, 0x6f4518, 0xffd60a, 0xd4a373, 0xff8a3d];
      g.stats.extras.forEach((_, i) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: cols[i % cols.length] }));
        m.position.set(-0.4 + i * 0.22, 0.11, (i % 2) * 0.12);
        m.rotation.y = i * 0.5;
        pile.add(m);
      });
      pile.visible = true;
    }
    // the remote lives again
    await this.shot(W(-2.3, 2.25, 4.05), W(-0.4, 1.0, -3.5), 0);
    await this.fadeIn(0.6);
    await this.say('think', 'New batteries. Moment of truth.');
    if (g.flags.has('battAAA')) await this.say('think', 'They\'re... too small. AAA. Of course.');
    if (g.flags.has('battAAA')) await this.say('think', 'Folded paper behind them. Engineering.');
    audio.sfx('click');
    await g.wait(0.4);
    g.apt.tv.redraw((c, w, h) => drawTV(c, w, h, 'finale'));
    audio.sfx('ding');
    await this.say('aarav', 'IT WORKS.');
    await this.shot(W(0.6, 1.6, -0.6), W(-1, 0.9, 2.3), 0.9);
    if (id === 'A') {
      await this.say('aarav', 'That wasn\'t so bad.');
      await g.wait(0.8);
      await this.say('aarav', 'Okay, it was bad.');
      await this.say('aarav', 'But I did it.');
      audio.sfx('purr');
      await this.say('system', 'From the kitchen: the unmistakable sound of a cat purring with her mouth full.');
    } else if (id === 'B') {
      await this.say('aarav', 'Wait.');
      await this.say('aarav', 'Did I just make small talk?');
      g.player.model.expr = 'shock';
      await this.say('aarav', 'Voluntarily?');
      await this.shot(W(-1, 1.6, 0.6), W(-1, 1.45, 2.3), 2.2);
      g.player.model.expr = 'determined';
      await this.say('think', '(staring meaningfully into the distance)');
      await this.say('aarav', 'Character development.');
    } else {
      const ex = g.stats.extras.map((e) => e.toLowerCase());
      const list = ex.length > 1 ? `${ex.slice(0, -1).join(', ')} and ${ex[ex.length - 1]}` : ex[0] ?? 'nothing extra, somehow';
      const memories = Math.max(3, g.stats.awkward + 4);
      await this.say('aarav', 'I went outside for cat food, batteries and one printout.');
      await this.say('aarav', `I have returned with ${list}, and ${memories} new embarrassing memories.`);
      audio.sfx('eat');
      await this.say('system', 'Miso, eating happily, could not care less.');
    }
    await this.say('think', 'Tomorrow: an interview. With a printed resume. Tomorrow\'s Aarav can panic about that.');
    await this.say('think', 'Tonight: the finale.');
    const e = ENDINGS[id];
    audio.sfx('victory');
    await g.ui.card(`<div class="k">${e.kicker}</div><h1>${id === 'B' ? e.achievement : e.achievement}</h1><h2>ENDING ${id}: ${e.name}</h2>`, 'win', 4);
    g.dlg.close();
    this.endCutscene();
    const found = recordEnding(id);
    g.releaseMouse();
    g.ui.showHUD(false);
    g.ui.showEnding(resultsHtml(id, g.stats, g.anx.peak, found));
  }

  // ================================================================ extra anxiety scenes
  /** The lift stops at 2. Mrs. Iyer gets in. She asks The Question. */
  private async liftRide() {
    const g = this.g;
    const a = g.apt.anchors;
    const disp = (f: string, arrow = '▼') => g.apt.liftDisplay.redraw((c, w, h) => drawLiftDisplay(c, w, h, f, arrow));
    audio.sfx('ding');
    await this.fadeOut('', 0.35);
    g.player.phoneOut = false;
    g.player.teleport(a.liftCarAarav, 0);
    disp('3');
    this.beginCutscene(false);
    await this.shot(a.liftCarCam, a.liftCarLook, 0);
    g.setMusic('none');
    await this.fadeIn(0.35);
    await this.say('think', 'An empty lift. Perfect. Three floors of total peace.');
    await g.wait(0.8);
    disp('2');
    audio.sfx('ding');
    g.player.model.expr = 'shock';
    await this.say('anx', '...Why did it ding. Why are we STOPPING. WHY ARE WE STOPPING.');
    await this.fadeOut('', 0.2);
    const iyer = g.npcs.get('iyer')!;
    iyer.show(a.liftCarIyer, 0);
    iyer.setPose('idle', 'happy');
    iyer.lookAtPlayer = true;
    await this.fadeIn(0.2);
    g.anx.add(22);
    g.setMusic('tension');
    g.cam.shake = 0.25;
    await g.ui.card('<div class="k">SOCIAL ENCOUNTER</div><h1>CONFINED SPACE</h1><h2>ESCAPE ROUTES: 0</h2>', 'boss', 2.2);
    const I = this.npcSpeaker('iyer');
    await this.say(I, 'Oh! Aarav! Hello beta. Going out? Wonderful!');
    await this.say(I, 'So... what are you doing nowadays?');
    g.player.model.expr = 'nervous';
    await this.say('anx', 'THE QUESTION. Not the bag question. The OTHER question.');
    await this.say('logic', 'Two floors left. About eight seconds. Say anything.');
    const c = await g.dlg.choose('MRS. IYER ASKS: "What are you doing nowadays?"', ['"Preparing for... things."', '"Freelancing."', '"I\'m working on a startup."', '*stare at the floor numbers like they\'re a thriller*']);
    if (c === 0) {
      await this.say(I, 'Things! Very good. My nephew was also preparing for things. Now he is in Canada.');
      await this.say('anx', 'Now we have to move to Canada.');
      await this.say('logic', 'Nobody is moving to Canada.');
      this.social('SOCIAL XP +15', 'Survived The Question. In a lift.');
    } else if (c === 1) {
      await this.say(I, 'Oh nice! What kind of freelancing?');
      await this.say('logic', 'She asked a follow-up.');
      await this.say('anx', 'WE DON\'T HAVE A FOLLOW-UP.');
      const f = await g.dlg.choose('A FOLLOW-UP QUESTION APPEARS', ['"Design. And... stuff."', '*cough until the lift arrives*']);
      if (f === 0) {
        await this.say(I, 'Design! Then you can design my grandson\'s birthday card!');
        await this.say('anx', 'We have been hired. Unpaid.');
        this.social('SOCIAL XP +15', 'Survived The Question AND a follow-up.');
      } else {
        audio.sfx('thud', 0.5);
        await g.wait(0.3);
        audio.sfx('thud', 0.5);
        await this.say(I, 'Arre, drink warm water, beta. With turmeric.');
        this.awkward();
      }
    } else if (c === 2) {
      await this.say(I, 'Startup! What does it do?');
      await this.say('aarav', 'It\'s... an app. For... cats.');
      await this.say(I, 'Like Uber, but for cats?');
      await this.say('aarav', '...Yes.');
      await this.say(I, 'Wah! I will tell Mr. Iyer to invest.');
      await this.say('logic', 'We have accidentally pitched a fake startup to the building WhatsApp group.');
      g.flags.add('iyerStartup');
      this.awkward();
      this.g.stats.conversations++;
    } else {
      disp('2', '');
      await this.say('system', '(The silence is so loud it has its own echo.)');
      await g.wait(1.0);
      disp('1');
      await this.say(I, '...Okay. I will ask your mother.');
      await this.say('anx', 'SHE WILL ASK OUR MOTHER.');
      g.flags.add('iyerSilent');
      g.anx.add(15);
      this.stealth('Avoided The Question. Your mother will not.');
    }
    disp('1');
    await g.wait(0.6);
    disp('G', '');
    audio.sfx('ding');
    await this.say(I, 'Okay beta, bye! Eat properly, you\'re looking thin.');
    iyer.lookAtPlayer = false;
    g.player.model.expr = 'neutral';
    g.setMusic(null);
    this.endCutscene();
    await this.fadeOut('', 0.3);
    iyer.hide();
  }

  /** Amma calls. In public. */
  private momCall() {
    const g = this.g;
    g.flags.add('momCalled');
    g.run(async () => {
      g.player.phoneOut = false;
      const ring = (who = 'AMMA ❤️') =>
        g.ui.phone(`<div class="app-head" style="background:#ff5c8a">Incoming call</div><div class="app-body"><div style="font-size:54px">👩</div><div class="app-big">${who}</div><div class="app-small">mobile · ringing…</div></div>`);
      ring();
      audio.sfx('buzz');
      g.anx.add(16);
      g.player.model.expr = 'shock';
      await this.say('anx', 'The phone. It\'s RINGING. Out loud. In PUBLIC.');
      audio.sfx('buzz');
      const c = await g.dlg.choose('📞 AMMA IS CALLING', ['Answer.', 'Decline.', 'Let it ring and stare at it.']);
      g.player.model.expr = 'nervous';
      if (c === 0) {
        g.ui.phone(null);
        g.player.poseOverride = 'phone';
        await this.say(AMMA, 'Aarav? Where are you? Why is there traffic noise?');
        await this.say('aarav', 'I\'m... outside, Amma.');
        await this.say(AMMA, 'OUTSIDE? What happened? Are you okay? Is there a fire?');
        await this.say('aarav', 'Miso\'s food ran out.');
        if (g.flags.has('iyerStartup')) {
          await this.say(AMMA, 'Also, Mrs. Iyer messaged me. She says you have a STARTUP? For CATS?');
          await this.say('aarav', '...It\'s complicated.');
        } else if (g.flags.has('iyerSilent')) {
          await this.say(AMMA, 'Also, Mrs. Iyer says you didn\'t talk to her in the lift. Why are you like this?');
          await this.say('anx', 'She asked our mother. Within MINUTES.');
        }
        await this.say(AMMA, 'Did you eat? Eat something. You sound thin.');
        await this.say('anx', 'How does a person SOUND thin.');
        await this.say(AMMA, 'Okay, go. Wear a jacket. Call me when you reach home. Love you.');
        await this.say('aarav', 'Love you too, Amma. Bye.');
        g.player.poseOverride = null;
        g.anx.add(8);
        await this.say('think', 'The man walking past definitely heard "love you too, Amma".');
        this.social('SOCIAL XP +20', 'Took a phone call in public. Legendary.');
      } else if (c === 1) {
        audio.sfx('click');
        g.ui.phone(`<div class="app-head" style="background:#14111c">Messages</div><div class="app-body"><div class="app-small">AMMA ❤️</div><div class="app-big">Call me back. URGENT.</div></div>`);
        audio.sfx('buzz');
        g.anx.add(20);
        await this.say('anx', 'URGENT?! What happened? Is someone in hospital? Is it US?');
        await g.wait(1.0);
        audio.sfx('buzz');
        g.ui.phone(`<div class="app-head" style="background:#14111c">Messages</div><div class="app-body"><div class="app-small">AMMA ❤️</div><div class="app-big">Not urgent. Just wanted to know if you ate. 🙂</div></div>`);
        await this.say('logic', 'Classic.');
        g.ui.phone(null);
        this.stealth('Declined a call. Received a guilt trip by text instead.');
      } else {
        for (let i = 0; i < 3; i++) {
          audio.sfx('buzz');
          await g.wait(0.7);
        }
        await this.say('system', '(It rings. And rings. A passing uncle looks at you. Then at your phone. Then back at you.)');
        g.anx.add(12);
        g.ui.phone(`<div class="app-head" style="background:#14111c">Messages</div><div class="app-body"><div class="app-small">AMMA ❤️</div><div style="font-size:64px">👍</div></div>`);
        await this.say('logic', 'A single thumbs-up from Amma. The most terrifying emoji in existence.');
        g.ui.phone(null);
        this.awkward();
      }
      g.player.model.expr = 'neutral';
    });
  }

  /** Someone waves enthusiastically. At you? (No.) */
  private theWave() {
    const g = this.g;
    g.flags.add('waveDone');
    const waver = g.npcs.get('waver')!;
    const friend = g.npcs.get('waverFriend')!;
    waver.setPose('wave', 'happy');
    waver.face(g.player.pos);
    this.bubble('waver', 'HEYYYY! OVER HERE!', 2.6);
    audio.sfx('hello');
    g.anx.add(10);
    friend.show(V3(g.player.pos.x - 4.5, 0, -2.0), Math.PI / 2);
    const arrive = friend.goto(V3(waver.pos.x - 0.85, 0, -1.45), 2.2);
    this.waveOpen = true;
    g.dlg.think('anx', 'Someone is waving. At US?! Wave back? WAVE BACK?', 2.6);
    g.run(async () => {
      await g.wait(2.6);
      this.waveOpen = false;
      await arrive;
      friend.face(waver.pos);
      waver.face(friend.pos);
      waver.setPose('celebrate');
      friend.setPose('celebrate');
      this.bubble('waver', 'MACHA! Long time, da!', 2.6);
      if (g.flags.has('wavedBack')) {
        g.player.poseOverride = 'facepalm';
        g.anx.add(18);
        g.dlg.think('anx', 'ABORT WAVE. ABORT WAVE.');
        await g.wait(1.6);
        g.dlg.think('logic', 'Turn it into a hair fix. Smooth. Nobody saw.');
        await g.wait(1.4);
        g.dlg.think('anx', 'EVERYBODY saw.');
        g.player.poseOverride = null;
        this.awkward();
        g.ui.toast('achievement', 'ACHIEVEMENT: WAVED AT A STRANGER\'S FRIEND', 'The wave was not for you. It never is.');
      } else {
        g.dlg.think('logic', 'See? It wasn\'t for us. Good call.');
        this.stealth('Didn\'t wave back at a wave meant for someone else. Elite awareness.');
      }
      await g.wait(1.5);
      waver.setPose('talk');
      friend.setPose('talk', 'happy');
    }, { lock: false });
  }

  /** Rohan. From college. Possibly. */
  private rohan() {
    const g = this.g;
    g.flags.add('rohanDone');
    const r = g.npcs.get('rohan')!;
    const R = this.npcSpeaker('rohan');
    g.run(async () => {
      g.player.phoneOut = false;
      r.mode = 'idle';
      r.face(g.player.pos);
      r.lookAtPlayer = true;
      r.setPose('wave', 'happy');
      g.player.yaw = Math.atan2(r.pos.x - g.player.pos.x, r.pos.z - g.player.pos.z);
      g.player.sync();
      g.player.model.expr = 'shock';
      // side-on two-shot, perpendicular to the line between them (lifted over the shelves)
      const mid = r.pos.clone().lerp(g.player.pos, 0.5);
      const dx = g.player.pos.x - r.pos.x, dz = g.player.pos.z - r.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      await this.shot(V3(mid.x - (dz / len) * 1.9, 2.55, mid.z + (dx / len) * 1.9), V3(mid.x, 1.3, mid.z), 0.6);
      await this.say(R, 'Wait... AARAV? BRO! It\'s me! Rohan! From college!');
      r.setPose('talk', 'happy');
      g.anx.add(18);
      await this.say('anx', 'WHO.');
      await this.say('logic', 'Second year. Borrowed our calculator. Never returned it.');
      await this.say('anx', 'He\'s going to ask what we\'re doing these days. EVERYONE asks what we\'re doing these days.');
      const c = await g.dlg.choose('ROHAN FROM COLLEGE', ['"ROHAN! Hey man!" (no memory of him whatsoever)', '"Sorry... do I know you?"', '"I\'m actually... not Aarav."', '"Bro, I\'m on a call." *point at ear*']);
      if (c === 0) {
        await this.say(R, 'Bro! What are you doing these days?');
        await this.say('aarav', 'Oh, you know. Stuff. Things. Cat food.');
        await this.say(R, 'Haha, same, bro. Same.');
        await this.say('logic', 'He is also doing nothing. We are the same.');
        this.social();
      } else if (c === 1) {
        await this.say(R, 'Bro, ROHAN! Your calculator! I still have it, man!');
        await this.say('anx', 'THE CALCULATOR. HE ADMITTED IT.');
        this.awkward();
      } else if (c === 2) {
        await this.say(R, '...Hahaha! Bro, you haven\'t changed at all. Same weird humour.');
        await this.say('anx', 'He thinks it\'s a bit. Let him think it\'s a bit.');
        this.awkward();
      } else {
        g.player.poseOverride = 'phone';
        await this.say(R, '(whispering) Oh, sorry sorry! Text me!');
        await this.say('logic', 'There was no call. There was never a call.');
        g.player.poseOverride = null;
        this.stealth('Escaped via imaginary phone call.');
      }
      if (c !== 3) {
        await this.say(R, 'We should TOTALLY catch up sometime!');
        await this.say('aarav', 'Definitely!');
        await this.say('logic', 'Neither of you will ever text.');
        await this.say('anx', 'This is how friendships end. With "definitely".');
      }
      r.lookAtPlayer = false;
      r.setPose('idle', 'neutral');
      r.mode = 'route';
      g.player.model.expr = 'neutral';
    });
  }

  /** The checkout queue, an aunty with coupons, and a guy with ONE item. */
  private async queue() {
    const g = this.g;
    const aunty = g.npcs.get('queueAunty')!;
    const cutter = g.npcs.get('cutter')!;
    const cash = g.npcs.get('cashier')!;
    if (aunty.gone) return;
    const A = this.npcSpeaker('queueAunty');
    const K = this.npcSpeaker('cutter');
    g.player.teleport(V3(103.4, 0, 4.95), Math.PI);
    cash.setPose('scan');
    await this.shot(V3(101.2, 2.0, 6.6), V3(103.6, 1.2, 3.9), 0.7);
    await this.say('think', 'A queue. Okay. Queues are easy. You just... stand.');
    await this.say(A, 'Wait, wait. I have coupons. Somewhere in this bag.');
    await this.say('anx', 'She has COUPONS. We will be here until the heat death of the universe.');
    cutter.show(V3(101.0, 0, 6.6), Math.PI / 2);
    cutter.setPose('carry');
    await cutter.goto(V3(103.4, 0, 4.15), 1.7);
    cutter.yaw = Math.PI;
    cutter.setPose('idle');
    g.ui.warning('⚠ LINE CUTTER DETECTED');
    g.anx.add(16);
    g.cam.shake = 0.25;
    await this.say(K, 'Just one thing, bro.');
    await this.say('anx', 'He CUT. In front of US. With ONE ITEM.');
    await this.say('logic', 'This is a test. Of character.');
    const q = await g.dlg.choose('SOMEONE CUT THE QUEUE', ['"Excuse me, I think I was next."', 'Let it go. Die a little inside.', 'Cough. Passive-aggressively.', 'Stare at the back of his head with the power of a thousand suns.']);
    let ahead = true;
    if (q === 0) {
      cutter.yaw = 0;
      await this.say(K, 'Oh! Sorry bro, didn\'t see you.');
      await cutter.goto(V3(102.3, 0, 5.9), 1.4);
      await this.say('logic', 'We... stood up for ourselves?');
      await this.say('anx', 'I feel POWERFUL. I also feel ILL.');
      this.social('ASSERTIVENESS +1', 'Politely said "I was next". Out loud. Historic.');
      ahead = false;
    } else if (q === 1) {
      g.anx.add(10);
      await this.say('logic', 'It\'s one packet. It costs us forty seconds.');
      await this.say('anx', 'We will think about this at 3 AM for the next six years.');
    } else if (q === 2) {
      audio.sfx('thud', 0.5);
      await g.wait(0.25);
      audio.sfx('thud', 0.6);
      cutter.yaw = 0;
      await this.say(K, '...You okay, bro? Need water?');
      await this.say('aarav', 'N-no. I\'m fine. Go ahead.');
      cutter.yaw = Math.PI;
      this.awkward();
    } else {
      await g.wait(1.4);
      cutter.yaw = 0;
      await this.say(K, '...Bro. You want to go first?');
      await this.say('aarav', 'Yes. Thank you.');
      await this.say('anx', 'The stare WORKS. We have a stare now.');
      await cutter.goto(V3(102.3, 0, 5.9), 1.4);
      ahead = false;
    }
    await this.say(A, 'Found it! ...Expired. Okay, never mind.');
    audio.sfx('kaching', 0.6);
    await aunty.goto(V3(101.6, 0, 1.2), 1.3);
    aunty.hide();
    if (ahead) {
      await cutter.goto(V3(103.4, 0, 3.5), 1.4);
      cutter.yaw = Math.PI / 2;
      audio.sfx('beep');
      await g.wait(0.6);
      audio.sfx('kaching', 0.6);
      await this.say(K, 'Thanks!');
      await cutter.goto(V3(101.4, 0, 1.0), 1.6);
      cutter.hide();
    }
    cash.setPose('idle');
  }

  /** Boss phase 2: the loyalty programme wants your phone number. Out loud. */
  private async loyalty() {
    const g = this.g;
    const C = this.npcSpeaker('cashier');
    await this.say(C, 'Do you have a Namma Rewards card? Just tell your phone number.');
    g.anx.add(14);
    g.ui.bossBar(true, 'THE CASHIER', 'PHASE 2: "PHONE NUMBER?"', 0.5);
    await this.say('anx', 'OUR NUMBER? OUT LOUD? In front of THE QUEUE?');
    const ph = await g.dlg.choose('PHASE 2: "PHONE NUMBER?"', ['Recite it calmly.', 'Recite it, panic, restart twice.', '"No, thank you."', 'Forget your own phone number.']);
    if (ph === 0) {
      await this.say('aarav', 'Nine-eight-four-five... ...two-one.');
      await this.say(C, 'Got it! Twelve points added.');
      await this.say('logic', 'In one go. No restarts. Who ARE we?');
      g.ui.toast('achievement', '+12 NAMMA POINTS', 'Redeemable for absolutely nothing.');
    } else if (ph === 1) {
      await this.say('aarav', 'Nine-eight-four... no wait. Nine-eight-four-five-six— no. Sorry. Nine...');
      await this.say(C, 'Take your time!');
      await this.say('anx', 'She said "take your time". Time is the ONE thing we cannot take.');
      this.awkward();
    } else if (ph === 2) {
      await this.say(C, 'No problem!');
      await this.say('logic', 'Three words. Zero digits. Efficient.');
    } else {
      await this.say('aarav', 'It\'s... nine... it\'s... hold on.');
      g.player.poseOverride = 'phone';
      await g.wait(0.8);
      await this.say('aarav', 'It\'s on my phone. Reading my own number. Off my own phone.');
      g.player.poseOverride = null;
      await this.say(C, 'Happens to everyone!');
      await this.say('anx', 'It does NOT happen to everyone.');
      this.awkward();
    }
    g.ui.bossBar(true, 'THE CASHIER', 'PHASE 2: CLEARED', 0.35);
  }

  private async talkMailman() {
    const g = this.g;
    const D = this.npcSpeaker('mailman');
    if (g.flags.has('mailTalked')) {
      await this.say(D, g.state === 'RETURN_HOME' ? 'Good night, Aarav!' : 'Careful on the road!');
      return;
    }
    g.flags.add('mailTalked');
    await this.say(D, 'Going to the shop? Can you check if they have Marie biscuits? They never do.');
    const c = await g.dlg.choose("MR. D'SOUZA", ['"Sure, uncle!"', '"...I\'ll look." *will not look*']);
    if (c === 0) {
      await this.say(D, 'God bless you, son.');
      this.social();
    } else {
      await this.say('anx', 'We will not look. We will feel guilty about not looking.');
      this.g.stats.conversations++;
    }
  }

  private async talkVeggie() {
    const g = this.g;
    const V = this.npcSpeaker('veggie');
    if (g.flags.has('coriander') && !g.flags.has('corianderBought')) {
      await this.say('aarav', 'One bunch of coriander, please.');
      await this.say(V, 'Ten rupees. Take, take. Fresh one.');
      g.flags.add('corianderBought');
      g.addItem('coriander', '🌿', 'Coriander (for Aunty)', true);
      audio.sfx('kaching', 0.5);
      await this.say('logic', 'Side quest progressed. Bought vegetables. From a person. With words.');
      this.social('SOCIAL XP +20', 'Bought coriander for Sharma Aunty. Deliver it on the way back.');
      return;
    }
    await this.say(V, 'Beta, onion is forty today. Very cheap. Take two kilo!');
    await this.say('anx', 'Two KILO? What would we DO with two kilo of onion?');
  }

  // ================================================================ errands: batteries + printout
  private errandList() {
    const g = this.g;
    const catDone = g.state === 'RETURN_HOME' || g.state === 'FEED_CAT' || g.state === 'ENDING';
    return [
      { id: 'cat', label: 'Cat food · Namma Mart', short: 'cat food', done: catDone },
      { id: 'batt', label: 'Batteries · hardware shop', short: 'batteries', done: g.flags.has('gotBatteries') },
      { id: 'print', label: 'Resume printout · xerox shop', short: 'the printout', done: g.flags.has('gotPrintout') },
    ];
  }

  private errandsOpen() {
    const s = this.g.state;
    return s === 'TRAVEL_TO_STORE' || s === 'FIND_CAT_FOOD' || s === 'CHECKOUT' || s === 'RETURN_HOME';
  }

  /** Closest unfinished stop (optionally including Namma Mart). */
  private nearestErrand(includeStore: boolean): THREE.Vector3 | null {
    const g = this.g;
    const o = g.out?.anchors;
    if (!o) return null;
    const t: THREE.Vector3[] = [];
    if (!g.flags.has('gotBatteries')) t.push(o.errandHardware);
    if (!g.flags.has('gotPrintout')) t.push(o.errandXerox);
    if (includeStore) t.push(o.storeEntrance);
    if (!t.length) return null;
    const p = g.player.pos;
    return t.reduce((a, b) => (a.distanceTo(p) <= b.distanceTo(p) ? a : b));
  }

  private errandDoneThought() {
    const left = this.errandList().filter((e) => !e.done);
    if (!left.length) this.g.dlg.think('logic', 'That\'s everything. Home. Now. Before anyone else talks to us.');
    else this.g.dlg.think('logic', `One down. Still need ${left.map((e) => e.short).join(' and ')}.`);
  }

  /** The Dead Remote: the battery-size interrogation, and an upsell. */
  private async talkHardware() {
    const g = this.g;
    const H = this.npcSpeaker('hardware');
    const n = g.npcs.get('hardware')!;
    n.lookAtPlayer = true;
    if (g.flags.has('gotBatteries') || !this.errandsOpen()) {
      await this.say(H, g.flags.has('gotBatteries') ? 'Batteries working? If not, come back, I will exchange.' : 'Bolt, nut, screw, everything is there.');
      n.lookAtPlayer = false;
      return;
    }
    g.player.phoneOut = false;
    g.player.yaw = Math.PI;
    g.player.sync();
    await this.shot(V3(n.pos.x + 2.6, 1.95, -11.6), V3(n.pos.x - 0.3, 1.25, -14.4), 0.6);
    n.setPose('talk');
    await this.say(H, 'Haan, tell.');
    await this.say('anx', '"Tell." Tell WHAT? Our life story? Our fears?');
    await this.say('aarav', 'Batteries, please. For a TV remote.');
    await this.say(H, 'Which size? AA, AAA, C, D, nine-volt, button cell?');
    g.anx.add(14);
    g.player.model.expr = 'shock';
    await this.say('anx', 'THERE ARE SIZES?');
    await this.say('logic', 'The remote is at home. We did not bring the remote. We did not even LOOK at the remote.');
    g.player.model.expr = 'nervous';
    const c = await g.dlg.choose('WHICH BATTERY?', ['"The normal ones."', '"The small normal ones."', '*mime a battery with your fingers*', '"...All of them?"']);
    if (c === 0) {
      await this.say(H, 'Normal means AA. Everybody says normal.');
      await this.say('logic', 'We said a vague thing and it was correct. Rare.');
      this.social('SOCIAL XP +15', 'Bought batteries using only the word "normal".');
    } else if (c === 1) {
      await this.say(H, 'Small normal is AAA. Okay.');
      await this.say('anx', 'Wait. Is the remote AA or AAA?');
      await this.say('logic', 'We will find out at home. In the worst possible way.');
      g.flags.add('battAAA');
      g.stats.conversations++;
    } else if (c === 2) {
      g.player.poseOverride = 'talk';
      await g.wait(1.0);
      await this.say(H, '...Pencil?');
      await this.say('aarav', 'Battery.');
      await this.say(H, 'Ah! AA. Two pieces?');
      g.player.poseOverride = null;
      this.awkward();
    } else {
      await this.say(H, 'All? ...Okay! Full set. Good customer.');
      await this.say('anx', 'We now own a nine-volt battery. We have never owned anything that takes a nine-volt battery.');
      g.stats.extras.push('Every battery size');
      this.awkward();
    }
    await this.say(H, 'Remote cover also? Plastic. Keeps the remote new for ten years.');
    await this.say('anx', 'An upsell. We are physically incapable of saying no to upsells.');
    const u = await g.dlg.choose('THE UPSELL', ['"No, thank you."', '"...Yes?"']);
    if (u === 1) {
      await this.say(H, 'Very good. Ten rupees extra.');
      await this.say('logic', 'The remote will now outlive us.');
      g.stats.extras.push('Remote cover');
      g.addItem('cover', '🛡️', 'Remote cover', true);
    } else {
      await this.say(H, 'Okay, okay.');
      await this.say('logic', 'We said no. To a shopkeeper. Out loud.');
    }
    audio.sfx('kaching', 0.6);
    g.flags.add('gotBatteries');
    g.addItem('batteries', '🔋', c === 3 ? 'Every battery size' : c === 1 ? 'AAA batteries' : 'AA batteries', true);
    g.ui.toast('item', 'ERRAND DONE: BATTERIES', 'The remote will live again.');
    n.setPose('idle');
    n.lookAtPlayer = false;
    g.player.model.expr = 'neutral';
    this.errandDoneThought();
  }

  /** The Printout: no pen drive, a typo'd email, a resume read aloud, and an unexpected "all the best". */
  private async talkXerox() {
    const g = this.g;
    const X = this.npcSpeaker('xerox');
    const n = g.npcs.get('xerox')!;
    n.lookAtPlayer = true;
    if (g.flags.has('gotPrintout') || !this.errandsOpen()) {
      await this.say(X, g.flags.has('gotPrintout') ? 'All the best for tomorrow, sir!' : 'Xerox, printout, lamination!');
      n.lookAtPlayer = false;
      return;
    }
    g.player.phoneOut = false;
    g.player.yaw = 0;
    g.player.sync();
    await this.shot(V3(n.pos.x + 2.4, 1.9, -2.7), V3(n.pos.x - 0.3, 1.2, 0.7), 0.6);
    n.setPose('talk');
    await this.say(X, 'Xerox, printout, lamination, spiral binding. What?');
    await this.say('aarav', 'One printout, please. My resume.');
    await this.say(X, 'Pen drive?');
    g.anx.add(10);
    await this.say('anx', 'A PEN DRIVE? It is 2026. Who carries a PEN DRIVE?');
    await this.say('logic', 'We have email. We have... email.');
    await this.say(X, 'Okay, send to shop email. Written on that paper.');
    await this.say('system', 'The sticky note says: manju.xerox.printout.lamination.1998@ ... it continues onto a second sticky note.');
    const c = await g.dlg.choose('SEND THE FILE', ['Type it carefully, letter by letter.', 'Type it fast and confidently.']);
    g.player.poseOverride = 'phone';
    await g.wait(0.8);
    if (c === 1) {
      await this.say(X, 'Not come, sir.');
      await this.say('anx', 'NOT COME.');
      await this.say('logic', 'We typed "lamintion". He is watching us retype it.');
      this.awkward();
      await g.wait(0.8);
    }
    g.player.poseOverride = null;
    await this.say(X, 'Came. Opening.');
    n.setPose('scan');
    await this.say(X, '(reading the screen) "Aarav. Skills: MS Office, teamwork, problem-solving... anime."');
    g.anx.add(16);
    g.player.model.expr = 'shock';
    await this.say('anx', 'WHY DID WE WRITE ANIME.');
    await this.say('logic', 'It was 3 AM. We thought it showed personality.');
    await this.say(X, '"Hobbies: cats." Nice. I also like cats.');
    g.player.model.expr = 'nervous';
    await this.say(X, 'Black and white or colour?');
    const k = await g.dlg.choose('PRINT SETTINGS', ['"Black and white."', '"Colour. It\'s an important day."', '"Colour, and... laminate it."']);
    if (k === 1) await this.say(X, 'Colour, ten rupees. Good choice. Interview?');
    else if (k === 2) {
      await this.say(X, 'Laminated! Very professional. Waterproof also.');
      await this.say('anx', 'Our resume is now waterproof. We are not.');
      g.stats.extras.push('Laminated resume');
    } else await this.say(X, 'Two rupees. Interview?');
    audio.sfx('beep');
    await g.wait(0.5);
    audio.sfx('beep');
    await g.wait(0.5);
    audio.sfx('kaching', 0.6);
    if (k === 2) await this.say(X, 'Interview?');
    await this.say('aarav', '...Yeah. Tomorrow.');
    n.setPose('idle', 'happy');
    await this.say(X, 'All the best, sir. You will get it.');
    g.player.model.expr = 'happy';
    await g.wait(0.6);
    await this.say('aarav', '...Thanks. Really.');
    await this.say('logic', 'A stranger just wished us luck. And meant it.');
    await this.say('anx', '...I am not crying. It is the toner.');
    this.social('SOCIAL XP +20', 'A stranger wished you luck. You said thanks. Both of you meant it.');
    g.flags.add('gotPrintout');
    g.addItem('resume', '📄', k === 2 ? 'Laminated resume' : 'Resume (printed)', true);
    g.ui.toast('item', 'ERRAND DONE: RESUME PRINTOUT', 'Printed. On paper. Like a pioneer.');
    n.setPose('scan', 'neutral');
    n.lookAtPlayer = false;
    g.player.model.expr = 'neutral';
    this.errandDoneThought();
  }
}
