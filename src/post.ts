import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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
      col *= mix(vec3(0.97, 0.95, 1.06), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.85, l));
      col = mix(vec3(l), col, 1.1 - 0.42 * uAnx);
      col = (col - 0.5) * (1.05 + 0.08 * uAnx) + 0.5;
      float v = smoothstep(0.95, 0.3, length(c * vec2(1.0, 0.82)));
      col *= mix(0.72, 1.0, v);
      col = mix(col, col * vec3(0.9, 1.0, 1.1) + vec3(0.0, 0.01, 0.03), uFocus * 0.6);
      float n = fract(sin(dot(vUv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.022;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  private t = 0;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, msaa: number) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.55, 0.88);
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
  }
}
