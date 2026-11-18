import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Final colour grade, applied after tone mapping. The Thought Spiral feeds uAnx:
// it desaturates, adds contrast and a little chromatic fringing at the edges of the screen.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAnx: { value: 0 },
    uFocus: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAnx;
    uniform float uFocus;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float ca = 0.006 * uAnx * dot(c, c) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // cool, slightly violet shadows; warm highlights
      col *= mix(vec3(0.98, 0.98, 1.03), vec3(1.02, 1.0, 0.98), smoothstep(0.15, 0.85, l));
      col = mix(vec3(l), col, 1.04 - 0.45 * uAnx);
      col = (col - 0.5) * (1.0 + 0.1 * uAnx) + 0.5;
      float v = smoothstep(0.95, 0.3, length(c * vec2(1.0, 0.82)));
      col *= mix(0.78, 1.0, v);
      col = mix(col, col * vec3(0.9, 1.0, 1.1) + vec3(0.0, 0.01, 0.03), uFocus * 0.6);
      float n = fract(sin(dot(vUv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.012;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  private t = 0;

  gtao: GTAOPass | null = null;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, msaa: number, ao: boolean) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (ao) {
      // contact shadows in corners, under furniture and where props meet the ground
      this.gtao = new GTAOPass(scene, camera as THREE.PerspectiveCamera, size.x, size.y);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, distanceFallOff: 1 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.6;
      // only solid geometry should occlude: hide glows, beams, glass, sky and soft shadows from the AO pass
      const gtao = this.gtao as unknown as { overrideVisibility: () => void; _visibilityCache: Map<THREE.Object3D, boolean> };
      gtao.overrideVisibility = () => {
        const cache = gtao._visibilityCache;
        scene.traverse((o) => {
          cache.set(o, o.visible);
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) o.visible = false;
          else if (m && !Array.isArray(m) && (m.transparent || !m.depthWrite)) o.visible = false;
        });
      };
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    (this.grade.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  render(dt: number, anx: number, focus: number) {
    this.t = (this.t + dt) % 100;
    this.grade.uniforms.uAnx.value = anx;
    this.grade.uniforms.uFocus.value = focus;
    this.grade.uniforms.uTime.value = this.t;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
    this.gtao?.dispose();
  }
}
