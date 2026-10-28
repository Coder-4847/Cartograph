import * as THREE from 'three';
import type { CityLayout } from '../layout/treemap.ts';
import { ACCENT, type ColorSets } from './palette.ts';
import { reducedMotion } from '../motion.ts';

const VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec4 aPosH;      // xyz target centre (base), w hotspot intensity
  attribute vec4 aFromPosD;  // xyz from centre, w stagger delay 0..1
  attribute vec3 aSize;
  attribute vec3 aFromSize;
  attribute vec3 aCol0;
  attribute vec3 aCol1;
  attribute vec3 aCol2;
  attribute vec3 aFromCol;
  attribute vec4 aState;     // x lift, y highlight, z dim membership, w phase
  uniform float uT;
  varying vec3 vN;
  varying vec3 vC0;
  varying vec3 vC1;
  varying vec3 vC2;
  varying float vLocalY;
  varying float vSizeY;
  varying float vHL;
  varying float vDim;
  varying float vHot;
  varying float vPhase;

  void main() {
    float e = clamp((uT - aFromPosD.w * 0.55) / 0.45, 0.0, 1.0);
    e = 1.0 - pow(1.0 - e, 4.0);
    vec3 size = mix(aFromSize, aSize, e);
    vec3 centre = mix(aFromPosD.xyz, aPosH.xyz, e);
    vec3 local = position * size;
    vec3 world = centre + local;
    world.y += aState.x * 0.7;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vN = normal;
    vLocalY = local.y;
    vSizeY = size.y;
    vC0 = mix(aFromCol, aCol0, e);
    vC1 = mix(aFromCol, aCol1, e);
    vC2 = mix(aFromCol, aCol2, e);
    vHL = aState.y;
    vDim = aState.z;
    vHot = aPosH.w;
    vPhase = aState.w;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uMode;
  uniform float uHot;
  uniform float uFocus;
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform vec3 uAccent;
  uniform vec3 uSun;
  varying vec3 vN;
  varying vec3 vC0;
  varying vec3 vC1;
  varying vec3 vC2;
  varying float vLocalY;
  varying float vSizeY;
  varying float vHL;
  varying float vDim;
  varying float vHot;
  varying float vPhase;

  void main() {
    vec3 base = uMode < 1.0 ? mix(vC0, vC1, uMode) : mix(vC1, vC2, uMode - 1.0);
    base *= 1.0 - 0.72 * vDim * uFocus;

    vec3 n = normalize(vN);
    float key = max(dot(n, uSun), 0.0);
    float hemi = n.y * 0.5 + 0.5;
    float side = 1.0 - abs(n.y);
    float contact = mix(0.5, 1.0, smoothstep(0.0, 2.5, vLocalY));
    float shade = 0.34 + 0.66 * key + 0.22 * hemi;
    vec3 col = base * shade * mix(1.0, contact, side);
    col += base * 0.3 * smoothstep(0.6, 1.0, n.y);

    // faint floor banding on tall facades
    float band = smoothstep(0.43, 0.5, abs(fract(vLocalY * 1.4) - 0.5));
    col *= 1.0 - 0.08 * band * side * step(2.5, vSizeY);

    // hover / selection / connection glow
    col += uAccent * vHL * (0.28 + 0.5 * smoothstep(0.5, 1.0, n.y) + 0.12 * side);

    // hotspot pulse
    float wave = uPulseSpeed > 0.0 ? 0.5 + 0.5 * sin(uTime * uPulseSpeed + vPhase * 6.2831) : 0.75;
    col += uAccent * vHot * uHot * wave * (0.25 + 0.55 * smoothstep(0.4, 1.0, n.y) + 0.2 * side);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function hash01(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type Attrs = {
  posH: Float32Array;
  fromPosD: Float32Array;
  size: Float32Array;
  fromSize: Float32Array;
  c0: Float32Array;
  c1: Float32Array;
  c2: Float32Array;
  fromCol: Float32Array;
  state: Float32Array;
};

const alloc = (n: number): Attrs => ({
  posH: new Float32Array(n * 4),
  fromPosD: new Float32Array(n * 4),
  size: new Float32Array(n * 3),
  fromSize: new Float32Array(n * 3),
  c0: new Float32Array(n * 3),
  c1: new Float32Array(n * 3),
  c2: new Float32Array(n * 3),
  fromCol: new Float32Array(n * 3),
  state: new Float32Array(n * 4),
});

const BOOT_COLOR = [0.012, 0.014, 0.022];

/**
 * All buildings in one draw call. Position, size, colour per mode and the rise/morph
 * animation live in instance attributes and are resolved in the vertex shader, so mode
 * switches and the intro cost nothing on the CPU.
 */
export class Buildings {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uT: { value: 1 },
    uMode: { value: 0 },
    uHot: { value: 0 },
    uFocus: { value: 0 },
    uTime: { value: 0 },
    uPulseSpeed: { value: reducedMotion() ? 0 : 2.4 },
    uAccent: { value: new THREE.Vector3(ACCENT.r, ACCENT.g, ACCENT.b) },
    uSun: { value: new THREE.Vector3(-0.45, 0.78, 0.42).normalize() },
  };
  private a: Attrs = alloc(0);
  private geo = new THREE.InstancedBufferGeometry();
  private box = (() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    g.deleteAttribute('uv');
    return g;
  })();
  private count = 0;
  private active = new Set<number>(); // instances whose lift is easing
  private liftTarget = new Float32Array(0);
  private hlTarget = new Float32Array(0);
  private dirty = false;

  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.uniforms]),
      fog: true,
    });
    // keep a handle to the merged uniform objects so tweens hit the live values
    Object.assign(this.uniforms, material.uniforms);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Values of instance i as currently drawn (used as the "from" of the next transition). */
  private current(i: number) {
    const a = this.a;
    const t = this.uniforms.uT.value;
    let e = Math.min(1, Math.max(0, (t - a.fromPosD[i * 4 + 3] * 0.55) / 0.45));
    e = 1 - Math.pow(1 - e, 4);
    const lerp = (x: number, y: number) => x + (y - x) * e;
    return {
      pos: [0, 1, 2].map((k) => lerp(a.fromPosD[i * 4 + k], a.posH[i * 4 + k])),
      size: [0, 1, 2].map((k) => lerp(a.fromSize[i * 3 + k], a.size[i * 3 + k])),
      col: [0, 1, 2].map((k) => lerp(a.fromCol[i * 3 + k], a.c0[i * 3 + k])),
    };
  }

  /**
   * Install a layout. `morph` carries the previous city's buildings over (i -> i) so they
   * reshape in place; otherwise buildings rise from nothing.
   */
  set(layout: CityLayout, colors: ColorSets, morph: boolean): void {
    const n = layout.buildings.length;
    const prevCount = this.count;
    const total = morph ? Math.max(n, prevCount) : n;
    const next = alloc(total);
    const cx = 0;
    const cz = 0;
    const R = Math.hypot(layout.width, layout.depth) / 2;

    for (let i = 0; i < total; i++) {
      const b = layout.buildings[i];
      const prev = morph && i < prevCount ? this.current(i) : null;
      if (b) {
        next.posH.set([b.x, b.y, b.z, colors.hot[i]], i * 4);
        next.size.set([b.w, b.h, b.d], i * 3);
        next.c0.set(colors.c0.subarray(i * 3, i * 3 + 3), i * 3);
        next.c1.set(colors.c1.subarray(i * 3, i * 3 + 3), i * 3);
        next.c2.set(colors.c2.subarray(i * 3, i * 3 + 3), i * 3);
        const dist = Math.hypot(b.x - cx, b.z - cz) / R;
        const delay = Math.min(1, dist * 0.8 + hash01(i) * 0.2);
        next.fromPosD.set(prev ? [...prev.pos, delay] : [b.x, b.y, b.z, delay], i * 4);
        next.fromSize.set(prev ? prev.size : [b.w, 0, b.d], i * 3);
        next.fromCol.set(prev ? prev.col : BOOT_COLOR, i * 3);
        next.state[i * 4 + 3] = hash01(i + 7);
      } else if (prev) {
        // surplus old building: sink where it stands
        next.posH.set([prev.pos[0], prev.pos[1], prev.pos[2], 0], i * 4);
        next.size.set([prev.size[0], 0, prev.size[2]], i * 3);
        next.fromPosD.set([...prev.pos, hash01(i) * 0.5], i * 4);
        next.fromSize.set(prev.size, i * 3);
        next.fromCol.set(prev.col, i * 3);
        next.c0.set(prev.col, i * 3);
        next.c1.set(prev.col, i * 3);
        next.c2.set(prev.col, i * 3);
      }
    }

    this.a = next;
    this.count = n;
    this.liftTarget = new Float32Array(total);
    this.hlTarget = new Float32Array(total);
    this.active.clear();

    this.geo.dispose();
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = this.box.index;
    this.geo.setAttribute('position', this.box.getAttribute('position'));
    this.geo.setAttribute('normal', this.box.getAttribute('normal'));
    const inst = (name: string, arr: Float32Array, size: number, dynamic = false) => {
      const attr = new THREE.InstancedBufferAttribute(arr, size);
      if (dynamic) attr.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, attr);
    };
    inst('aPosH', next.posH, 4);
    inst('aFromPosD', next.fromPosD, 4);
    inst('aSize', next.size, 3);
    inst('aFromSize', next.fromSize, 3);
    inst('aCol0', next.c0, 3);
    inst('aCol1', next.c1, 3);
    inst('aCol2', next.c2, 3);
    inst('aFromCol', next.fromCol, 3);
    inst('aState', next.state, 4, true);
    this.geo.instanceCount = total;
    this.mesh.geometry = this.geo;
    this.uniforms.uT.value = 0;
  }

  /** Ease an instance's hover lift / glow toward targets; call with 0 to release. */
  setHover(i: number, lift: number, glow: number): void {
    if (i < 0 || i >= this.count) return;
    this.liftTarget[i] = lift;
    this.hlTarget[i] = glow;
    this.active.add(i);
  }

  /** Mark membership for the focus dimmer: 1 = outside the focused district. */
  setDimMask(mask: ((i: number) => boolean) | null): void {
    const s = this.a.state;
    for (let i = 0; i < this.count; i++) s[i * 4 + 2] = mask && mask(i) ? 1 : 0;
    this.dirty = true;
  }

  update(dt: number, time: number): void {
    this.uniforms.uTime.value = time;
    if (this.active.size) {
      const k = 1 - Math.exp(-dt * 12);
      const s = this.a.state;
      for (const i of this.active) {
        const l = s[i * 4] + (this.liftTarget[i] - s[i * 4]) * k;
        const g = s[i * 4 + 1] + (this.hlTarget[i] - s[i * 4 + 1]) * k;
        const settled = Math.abs(l - this.liftTarget[i]) < 0.002 && Math.abs(g - this.hlTarget[i]) < 0.002;
        s[i * 4] = settled ? this.liftTarget[i] : l;
        s[i * 4 + 1] = settled ? this.hlTarget[i] : g;
        if (settled) this.active.delete(i);
      }
      this.dirty = true;
    }
    if (this.dirty) {
      (this.geo.getAttribute('aState') as THREE.InstancedBufferAttribute).needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.box.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
