import * as THREE from 'three';
import { Humanoid, HumanoidOpts, Pose, Expr } from './characters';
import { Collision } from './collision';

export type NpcMode = 'idle' | 'route' | 'goto' | 'script';

export interface NpcDef {
  id: string;
  name: string;
  color: string;
  look: HumanoidOpts;
  pos: THREE.Vector3;
  yaw: number;
  route?: THREE.Vector3[];
  speed?: number;
  /** Radius in which this NPC may notice the player (0 = never). */
  aware?: number;
  pose?: Pose;
  /** Group the NPC belongs to for visibility (apartment vs outside). */
  zone: 'apt' | 'out';
  chatter?: string[];
  imagined?: string[];
  /** Starts hidden; a scene reveals it with show(). */
  hidden?: boolean;
}

export class NPC {
  model: Humanoid;
  pos = new THREE.Vector3();
  yaw = 0;
  mode: NpcMode = 'idle';
  speed = 1.2;
  route: THREE.Vector3[] = [];
  routeIdx = 0;
  waitT = 0;
  awareRadius = 0;
  /** Player is currently inside the awareness radius. */
  near = false;
  nearT = 0;
  noticed = false;
  /** Player came close but was never noticed (social stealth). */
  stealthAwarded = false;
  wasClose = false;
  lookAtPlayer = false;
  basePose: Pose = 'idle';
  enabled = true;
  gone = false;
  private gotoTarget: THREE.Vector3 | null = null;
  private gotoResolve: (() => void) | null = null;
  private lookYaw = 0;
  chatterT = 3 + Math.random() * 5;

  constructor(public def: NpcDef) {
    this.model = new Humanoid(def.look);
    this.reset();
  }

  get id() {
    return this.def.id;
  }

  reset() {
    const d = this.def;
    this.pos.copy(d.pos);
    this.yaw = d.yaw;
    this.route = d.route ?? [];
    this.routeIdx = 0;
    this.mode = this.route.length ? 'route' : 'idle';
    this.speed = d.speed ?? 1.2;
    this.awareRadius = d.aware ?? 0;
    this.near = false;
    this.nearT = 0;
    this.noticed = false;
    this.stealthAwarded = false;
    this.wasClose = false;
    this.lookAtPlayer = false;
    this.basePose = d.pose ?? 'idle';
    this.model.pose = this.basePose;
    this.model.expr = 'neutral';
    this.enabled = true;
    this.gone = false;
    this.model.root.visible = true;
    this.gotoTarget = null;
    this.gotoResolve = null;
    this.sync();
    if (d.hidden) this.hide();
  }

  show(at?: THREE.Vector3, yaw?: number) {
    this.gone = false;
    this.enabled = true;
    this.model.root.visible = true;
    if (at) this.pos.copy(at);
    if (yaw !== undefined) this.yaw = yaw;
    this.sync();
  }

  setPose(p: Pose, expr?: Expr) {
    this.basePose = p;
    this.model.pose = p;
    if (expr) this.model.expr = expr;
  }

  goto(target: THREE.Vector3, speed?: number): Promise<void> {
    this.gotoResolve?.();
    this.mode = 'goto';
    this.gotoTarget = target.clone();
    if (speed) this.speed = speed;
    return new Promise((r) => (this.gotoResolve = r));
  }

  face(p: THREE.Vector3) {
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  hide() {
    this.gone = true;
    this.enabled = false;
    this.model.root.visible = false;
  }

  update(dt: number, player: THREE.Vector3, col: Collision | null, far = false) {
    if (this.gone) return;
    let moving = false;
    if (this.mode === 'route' && this.route.length) {
      if (this.waitT > 0) {
        this.waitT -= dt;
      } else {
        const tgt = this.route[this.routeIdx];
        moving = this.stepToward(tgt, dt);
        if (!moving) {
          this.routeIdx = (this.routeIdx + 1) % this.route.length;
          this.waitT = 0.8 + Math.random() * 2.5;
        }
      }
    } else if (this.mode === 'goto' && this.gotoTarget) {
      moving = this.stepToward(this.gotoTarget, dt);
      if (!moving) {
        this.gotoTarget = null;
        this.mode = 'idle';
        const r = this.gotoResolve;
        this.gotoResolve = null;
        r?.();
      }
    }
    void col;
    // head turns toward the player
    let want = 0;
    if (this.lookAtPlayer || (this.near && !moving)) {
      const a = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
      let d = a - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      want = Math.max(-1.1, Math.min(1.1, d));
    }
    this.lookYaw += (want - this.lookYaw) * (1 - Math.exp(-dt * 5));
    this.model.lookYaw = this.lookYaw;
    this.model.speed = moving ? this.speed : 0;
    this.model.pose = this.basePose;
    if (!far) this.model.update(dt);
    this.sync();
  }

  private stepToward(tgt: THREE.Vector3, dt: number) {
    const dx = tgt.x - this.pos.x;
    const dz = tgt.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) return false;
    const step = Math.min(d, this.speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    const a = Math.atan2(dx, dz);
    let dy = a - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-dt * 10));
    return true;
  }

  sync() {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw;
  }
}

// ------------------------------------------------------------------ cast
const SKIN = [0xc68a5e, 0xa86b45, 0xd9a07a, 0x8d5a3b, 0xb97a56];

export function castDefs(apt: Record<string, THREE.Vector3>, out: Record<string, THREE.Vector3> | null): NpcDef[] {
  const defs: NpcDef[] = [
    {
      id: 'uncle', name: 'Sharma Uncle', color: '#ffb347', zone: 'apt', aware: 2.6,
      look: { skin: SKIN[1], top: 0xf1e3c8, topStyle: 'kurta', accent: 0xb08968, bottom: 0xf6f1e6, bottomStyle: 'pants', shoes: 0x6b4a35, hair: 0x9a9a9a, hairStyle: 'short', mustache: true, belly: 1.15, scale: 0.92 },
      pos: apt.neighborUncle, yaw: Math.PI / 2 + 0.3, pose: 'talk',
    },
    {
      id: 'aunty', name: 'Sharma Aunty', color: '#ff7eb6', zone: 'apt', aware: 2.2,
      look: { skin: SKIN[2], top: 0xd00062, topStyle: 'saree', accent: 0xffd166, bottom: 0xd00062, bottomStyle: 'skirt', shoes: 0x6b4a35, hair: 0x1b1516, hairStyle: 'bun', bindi: true, scale: 0.86 },
      pos: apt.neighborAunty, yaw: -Math.PI / 2 - 0.2, pose: 'idle',
    },
    {
      id: 'iyer', name: 'Mrs. Iyer (Flat 204)', color: '#c77dff', zone: 'apt', aware: 0, hidden: true,
      look: { skin: SKIN[2], top: 0x2a9d8f, topStyle: 'saree', accent: 0xe9c46a, bottom: 0x2a9d8f, bottomStyle: 'skirt', shoes: 0x6b4a35, hair: 0x8d8d8d, hairStyle: 'bun', glasses: true, bindi: true, scale: 0.84 },
      pos: apt.liftCarIyer, yaw: 0, pose: 'idle',
    },
  ];
  if (!out) return defs;
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  defs.push(
    {
      id: 'guard', name: 'Raju (Security)', color: '#8ecae6', zone: 'out', aware: 3.0,
      look: { skin: SKIN[3], top: 0x4a6fa5, topStyle: 'uniform', accent: 0x222222, bottom: 0x1d3557, bottomStyle: 'pants', shoes: 0x111111, hair: 0x1b1516, hairStyle: 'short', hat: 'guard', mustache: true, scale: 0.92 },
      pos: out.guard, yaw: -Math.PI / 2, pose: 'idle',
    },
    {
      id: 'tea', name: 'Anna (Tea Stall)', color: '#80ed99', zone: 'out', aware: 2.8,
      look: { skin: SKIN[3], top: 0xf8f9fa, topStyle: 'vest', accent: 0xf8f9fa, bottom: 0x2a9d8f, bottomStyle: 'pants', shoes: 0x333333, hair: 0x2b2b2b, hairStyle: 'short', mustache: true, belly: 1.1, scale: 0.9 },
      pos: out.teaVendor, yaw: Math.PI, pose: 'scan',
      chatter: ['Chai! Coffee! Bun!', 'Two by three, sir?', 'Strong chai, less sugar?'],
    },
    {
      id: 'cust1', name: 'Guy with chai', color: '#cdb4db', zone: 'out', aware: 0,
      look: { skin: SKIN[0], top: 0xef476f, topStyle: 'tshirt', bottom: 0x264653, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'short', scale: 0.88 },
      pos: out.teaCust1, yaw: Math.PI / 2, pose: 'talk',
      chatter: ['...and then the auto guy asked for fifty extra.', 'Bro, traffic on Outer Ring Road today...', 'Did you see the match?'],
      imagined: ['Look at that guy. Walking ALONE.', 'Nice hoodie... NOT.'],
    },
    {
      id: 'cust2', name: 'Other guy with chai', color: '#bde0fe', zone: 'out', aware: 0,
      look: { skin: SKIN[4], top: 0x118ab2, topStyle: 'shirt', accent: 0xffffff, bottom: 0x3d405b, bottomStyle: 'pants', shoes: 0x6b4a35, hair: 0x1b1516, hairStyle: 'short', glasses: true, scale: 0.9 },
      pos: out.teaCust2, yaw: -Math.PI / 2, pose: 'lean',
      chatter: ['Haan, same thing happened to me.', 'This chai is elite.', 'One more?'],
      imagined: ['Is he going to the store by himself?', 'Who wears shorts to buy groceries?'],
    },
    {
      id: 'walker1', name: 'Jogging aunty', color: '#ffd6a5', zone: 'out', aware: 0,
      look: { skin: SKIN[2], top: 0x9b5de5, topStyle: 'tshirt', bottom: 0x222222, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'ponytail', scale: 0.86 },
      pos: V(-20, -12.6), yaw: Math.PI / 2, speed: 1.6,
      route: [V(-20, -12.6), V(60, -12.6), V(120, -12.4), V(60, -12.4)],
      chatter: ['Ten thousand steps...', 'Hi! Hi!'],
      imagined: ['He looks lost.'],
    },
    {
      id: 'walker2', name: 'Phone call guy', color: '#caffbf', zone: 'out', aware: 0,
      look: { skin: SKIN[0], top: 0x52b788, topStyle: 'shirt', accent: 0xffffff, bottom: 0x6c584c, bottomStyle: 'pants', shoes: 0x333333, hair: 0x2b2b2b, hairStyle: 'short', scale: 0.9 },
      pos: V(40, -12.3), yaw: -Math.PI / 2, speed: 1.0, pose: 'phone',
      route: [V(40, -12.3), V(-15, -12.3), V(10, -12.2), V(90, -12.2)],
      chatter: ['Haan, haan, I am reaching in five minutes.', 'Network is very bad here.', 'Can you hear me? HELLO?'],
      imagined: ['(on phone) Yeah there is a weird guy here.'],
    },
    {
      id: 'walker3', name: 'Man with dog-less leash', color: '#ffc6ff', zone: 'out', aware: 0,
      look: { skin: SKIN[4], top: 0xffb703, topStyle: 'tshirt', bottom: 0x3a5a40, bottomStyle: 'shorts', shoes: 0xffffff, hair: 0x9a9a9a, hairStyle: 'short', mustache: true, scale: 0.9 },
      pos: V(-30, -1.2), yaw: Math.PI / 2, speed: 1.1,
      route: [V(-30, -1.6), V(-12, -1.8), V(5, -2.4), V(16, -2.4), V(-12, -1.6)],
      chatter: ['Evening walk is important.', 'Nice weather, no?'],
      imagined: ['Why is he walking like a side character?'],
    },
    {
      id: 'stranger', name: 'The Sidewalk Stranger', color: '#ff6b6b', zone: 'out', aware: 0,
      look: { skin: SKIN[1], top: 0x2b2d42, topStyle: 'shirt', accent: 0x8d99ae, bottom: 0x8d99ae, bottomStyle: 'pants', shoes: 0x111111, hair: 0x111111, hairStyle: 'short', glasses: true, scale: 0.9 },
      pos: out.danceStranger, yaw: -Math.PI / 2, pose: 'idle',
    },
    {
      id: 'priya', name: 'Priya (Store Staff)', color: '#90e0ef', zone: 'out', aware: 2.4,
      look: { skin: SKIN[2], top: 0x2d6a4f, topStyle: 'vest', accent: 0xffd166, bottom: 0x22223b, bottomStyle: 'pants', shoes: 0x333333, hair: 0x1b1516, hairStyle: 'ponytail', scale: 0.86 },
      pos: out.priya, yaw: Math.PI / 2, pose: 'scan',
    },
    {
      id: 'cashier', name: 'The Cashier', color: '#ff4d6d', zone: 'out', aware: 0,
      look: { skin: SKIN[0], top: 0x2d6a4f, topStyle: 'vest', accent: 0xffd166, bottom: 0x22223b, bottomStyle: 'pants', shoes: 0x333333, hair: 0x2b1d14, hairStyle: 'long', glasses: true, scale: 0.88 },
      pos: out.cashier, yaw: -Math.PI / 2, pose: 'idle',
    },
    {
      id: 'shopper1', name: 'Shopper', color: '#ffd166', zone: 'out', aware: 0,
      look: { skin: SKIN[3], top: 0xe76f51, topStyle: 'saree', accent: 0x2a9d8f, bottom: 0xe76f51, bottomStyle: 'skirt', shoes: 0x6b4a35, hair: 0x1b1516, hairStyle: 'bun', bindi: true, scale: 0.85 },
      pos: out.shopper1, yaw: -Math.PI / 2, speed: 0.6,
      route: [out.shopper1, V(101.2, 9.0), V(101.2, 13.5)],
      chatter: ['Why is everything so expensive...', 'Toor dal, toor dal...'],
      imagined: ['He touched the noodles and put them back. Suspicious.'],
    },
    // ---- errand shops
    {
      id: 'hardware', name: 'Venkatesh Uncle (Hardware)', color: '#ffd166', zone: 'out', aware: 2.4,
      look: { skin: SKIN[3], top: 0xe9edc9, topStyle: 'shirt', accent: 0x6c584c, bottom: 0x6c584c, bottomStyle: 'pants', shoes: 0x3b2a20, hair: 0xb0b0b0, hairStyle: 'short', glasses: true, mustache: true, belly: 1.1, scale: 0.9 },
      pos: V(0.6, -15.4), yaw: 0, pose: 'idle',
      chatter: ['Bolt, nut, screw, everything is there.', 'Paint? Which colour? Every colour is there.'],
    },
    {
      id: 'xerox', name: 'Manju (Xerox Shop)', color: '#a0c4ff', zone: 'out', aware: 2.4,
      look: { skin: SKIN[1], top: 0x3a86ff, topStyle: 'tshirt', bottom: 0x22223b, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x111111, hairStyle: 'messy', scale: 0.88 },
      pos: V(35.2, 1.45), yaw: Math.PI, pose: 'scan',
      chatter: ['Xerox, printout, lamination!', 'Spiral binding, two minutes!'],
    },
    // ---- lobby
    {
      id: 'mailman', name: "Mr. D'Souza (Flat 101)", color: '#f4a261', zone: 'out', aware: 2.2,
      look: { skin: SKIN[0], top: 0xf1faee, topStyle: 'shirt', accent: 0x457b9d, bottom: 0x6c584c, bottomStyle: 'pants', shoes: 0x3b2a20, hair: 0xb0b0b0, hairStyle: 'bald', glasses: true, belly: 1.15, scale: 0.9 },
      pos: V(5.2, 7.3), yaw: Math.PI / 2, pose: 'phone',
      chatter: ['Electricity bill again...', 'Who keeps taking my newspaper?'],
    },
    // ---- the bus-stop crowd (a "crowded space")
    {
      id: 'kid1', name: 'College group', color: '#ffadad', zone: 'out', aware: 0,
      look: { skin: SKIN[0], top: 0xffd166, topStyle: 'tshirt', bottom: 0x1d3557, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'messy', scale: 0.86 },
      pos: V(45.2, -1.35), yaw: 1.2, pose: 'talk',
      chatter: ['Bro the bus is NEVER on time.', 'Did you submit the assignment?', 'Let\'s just take an auto.'],
      imagined: ['Look, a guy walking alone. Iconic. Tragic.', 'Is he going to the store in SHORTS?'],
    },
    {
      id: 'kid2', name: 'College group', color: '#ffadad', zone: 'out', aware: 0,
      look: { skin: SKIN[2], top: 0x9b5de5, topStyle: 'hoodie', accent: 0xffffff, bottom: 0x8d99ae, bottomStyle: 'pants', shoes: 0x222222, hair: 0x1b1516, hairStyle: 'long', scale: 0.84 },
      pos: V(46.45, -0.85), yaw: -2.3, pose: 'idle',
      chatter: ['Hahaha NO WAY.', 'Send me the reel!'],
      imagined: ['Nice hoodie. Not.'],
    },
    {
      id: 'kid3', name: 'College group', color: '#ffadad', zone: 'out', aware: 0,
      look: { skin: SKIN[4], top: 0x06d6a0, topStyle: 'shirt', accent: 0xffffff, bottom: 0x3d405b, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x2b1d14, hairStyle: 'short', glasses: true, scale: 0.88 },
      pos: V(47.05, -1.85), yaw: -1.0, pose: 'phone',
      chatter: ['Uber is showing 18 minutes. Eighteen!'],
      imagined: ['(laughing) ...him? No, just a meme.'],
    },
    {
      id: 'kid4', name: 'College group', color: '#ffadad', zone: 'out', aware: 0,
      look: { skin: SKIN[1], top: 0xef476f, topStyle: 'tshirt', bottom: 0x264653, bottomStyle: 'shorts', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'ponytail', scale: 0.84 },
      pos: V(46.0, -2.05), yaw: 0.2, pose: 'sit',
      chatter: ['My feet hurt. Carry me.'],
    },
    // ---- street life
    {
      id: 'veggie', name: 'Vegetable vendor', color: '#80ed99', zone: 'out', aware: 2.4,
      look: { skin: SKIN[3], top: 0xf4a261, topStyle: 'vest', accent: 0xf4a261, bottom: 0x6d597a, bottomStyle: 'pants', shoes: 0x3b2a20, hair: 0x2b2b2b, hairStyle: 'short', mustache: true, scale: 0.88 },
      pos: V(89.0, -2.4), yaw: Math.PI / 2, pose: 'talk',
      chatter: ['Tomato! Onion! Fresh fresh!', 'Coriander, ten rupees!', 'Beans, carrot, beans!'],
    },
    {
      id: 'delivery', name: 'Delivery partner', color: '#ff8a3d', zone: 'out', aware: 0,
      look: { skin: SKIN[1], top: 0xff5c8a, topStyle: 'tshirt', bottom: 0x22223b, bottomStyle: 'pants', shoes: 0x222222, hair: 0x111111, hairStyle: 'short', hat: 'backcap', hatColor: 0xff5c8a, scale: 0.88 },
      pos: V(-5, -2.3), yaw: Math.PI / 2, speed: 1.9,
      route: [V(-5, -2.3), V(54, -2.1), V(95, -2.4), V(54, -2.1)],
      chatter: ['Order for... Ramesh? No? Okay.', 'Bhaiya, which building is Sunshine Enclave?'],
    },
    {
      id: 'couple1', name: 'Couple on a walk', color: '#ffc8dd', zone: 'out', aware: 0,
      look: { skin: SKIN[2], top: 0xffafcc, topStyle: 'kurta', accent: 0xcdb4db, bottom: 0xffffff, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'long', scale: 0.84 },
      pos: V(4, -12.0), yaw: Math.PI / 2, speed: 0.9,
      route: [V(4, -12.0), V(114, -12.0)],
      chatter: ['Should we get pani puri?', 'Your mom called me again.'],
      imagined: ['Look at him. Single and buying cat food.'],
    },
    {
      id: 'couple2', name: 'Couple on a walk', color: '#ffc8dd', zone: 'out', aware: 0,
      look: { skin: SKIN[0], top: 0x3a86ff, topStyle: 'shirt', accent: 0xffffff, bottom: 0x2b2d42, bottomStyle: 'pants', shoes: 0x3b2a20, hair: 0x1b1516, hairStyle: 'short', scale: 0.9 },
      pos: V(4, -12.75), yaw: Math.PI / 2, speed: 0.9,
      route: [V(4, -12.75), V(114, -12.75)],
      chatter: ['Yes, pani puri. Obviously.'],
    },
    {
      id: 'waver', name: 'Enthusiastic guy', color: '#ffd166', zone: 'out', aware: 0,
      look: { skin: SKIN[4], top: 0xfb5607, topStyle: 'tshirt', bottom: 0x3a5a40, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'messy', scale: 0.9 },
      pos: V(85.2, -1.3), yaw: -Math.PI / 2, pose: 'phone',
    },
    {
      id: 'waverFriend', name: 'His friend', color: '#ffd166', zone: 'out', aware: 0, hidden: true,
      look: { skin: SKIN[0], top: 0x118ab2, topStyle: 'hoodie', accent: 0xffffff, bottom: 0x2b2d42, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'short', scale: 0.9 },
      pos: V(70, -2.5), yaw: Math.PI / 2,
    },
    // ---- Namma Mart
    {
      id: 'rohan', name: 'Rohan (from college?)', color: '#ffbe0b', zone: 'out', aware: 2.5,
      look: { skin: SKIN[0], top: 0xe63946, topStyle: 'shirt', accent: 0xffffff, bottom: 0x1d3557, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x1b1516, hairStyle: 'messy', glasses: true, scale: 0.9 },
      pos: V(105.2, 13.8), yaw: Math.PI, speed: 0.65,
      route: [V(105.2, 13.8), V(105.2, 8.6), V(109.2, 8.6), V(109.2, 14.6), V(105.2, 14.6)],
    },
    {
      id: 'queueAunty', name: 'Aunty in the queue', color: '#e9c46a', zone: 'out', aware: 0,
      look: { skin: SKIN[3], top: 0x7b2cbf, topStyle: 'saree', accent: 0xffd166, bottom: 0x7b2cbf, bottomStyle: 'skirt', shoes: 0x6b4a35, hair: 0x1b1516, hairStyle: 'bun', bindi: true, belly: 1.1, scale: 0.86 },
      pos: V(103.4, 3.4), yaw: Math.PI / 2, pose: 'talk',
      chatter: ['Wait, wait, I have coupons.', 'This price is wrong. On the shelf it said less.'],
    },
    {
      id: 'cutter', name: 'Guy with one item', color: '#adb5bd', zone: 'out', aware: 0, hidden: true,
      look: { skin: SKIN[1], top: 0x495057, topStyle: 'tshirt', bottom: 0x212529, bottomStyle: 'shorts', shoes: 0xffffff, hair: 0x111111, hairStyle: 'short', scale: 0.9 },
      pos: V(101.2, 8), yaw: 0, pose: 'idle',
    },
    {
      id: 'dad', name: 'Dad on a mission', color: '#caffbf', zone: 'out', aware: 0,
      look: { skin: SKIN[3], top: 0x6c757d, topStyle: 'shirt', accent: 0xffffff, bottom: 0x343a40, bottomStyle: 'pants', shoes: 0x3b2a20, hair: 0x2b2b2b, hairStyle: 'short', mustache: true, belly: 1.1, scale: 0.92 },
      pos: V(101.2, 9.0), yaw: 0, speed: 0.6, pose: 'carry',
      route: [V(101.2, 9.0), V(101.2, 15.2), V(104.5, 15.8), V(101.2, 15.2)],
      chatter: ['Your mother said ONE packet of bread.', 'Don\'t touch that. Don\'t touch that either.'],
    },
    {
      id: 'kid', name: 'A small child', color: '#ffd6ff', zone: 'out', aware: 3.0,
      look: { skin: SKIN[2], top: 0xffd60a, topStyle: 'tshirt', bottom: 0xe63946, bottomStyle: 'shorts', shoes: 0xff006e, hair: 0x1b1516, hairStyle: 'short', scale: 0.58 },
      pos: V(101.8, 8.4), yaw: 0, speed: 0.6,
      route: [V(101.8, 8.4), V(101.8, 14.6), V(105.0, 15.2), V(101.8, 14.6)],
    },
    {
      id: 'shopper2', name: 'College kid', color: '#a0c4ff', zone: 'out', aware: 0,
      look: { skin: SKIN[0], top: 0x14213d, topStyle: 'hoodie', accent: 0xfca311, bottom: 0x8d99ae, bottomStyle: 'pants', shoes: 0xffffff, hair: 0x2b1d14, hairStyle: 'messy', scale: 0.86 },
      pos: out.shopper2, yaw: Math.PI, pose: 'phone',
      chatter: ['Bro which energy drink is the healthy one'],
      imagined: ['Same hoodie. He is copying me. Or I am copying him.'],
    },
  );
  return defs;
}
