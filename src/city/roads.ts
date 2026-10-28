import * as THREE from 'three';
import type { Building } from '../layout/treemap.ts';
import { ACCENT } from './palette.ts';
import { reducedMotion } from '../motion.ts';

const SEG = 48;
const MAX_ARCS = 64;

const VERT = /* glsl */ `
  attribute float aT;
  attribute float aSide;
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec2 aMeta; // x: 0 outgoing / 1 incoming, y: stagger delay
  uniform float uTime;
  uniform float uBirth;
  uniform float uPx;
  varying float vT;
  varying float vSide;
  varying float vKind;
  varying float vGrow;

  void main() {
    vec3 mid = (aA + aB) * 0.5;
    float len = distance(aA, aB);
    vec3 c = mid + vec3(0.0, 4.0 + len * 0.32, 0.0);
    float t = aT;
    float it = 1.0 - t;
    vec3 p = it * it * aA + 2.0 * it * t * c + t * t * aB;
    vec3 tan = normalize(2.0 * it * (c - aA) + 2.0 * t * (aB - c));
    vec3 toCam = cameraPosition - p;
    vec3 side = normalize(cross(tan, toCam));
    float w = uPx * length(toCam) * 1.6;
    p += side * aSide * w;
    vT = t;
    vSide = aSide;
    vKind = aMeta.x;
    vGrow = clamp((uTime - uBirth - aMeta.y) / 0.75, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uFlow;
  uniform vec3 uAccent;
  varying float vT;
  varying float vSide;
  varying float vKind;
  varying float vGrow;

  void main() {
    float grow = 1.0 - pow(1.0 - vGrow, 3.0);
    if (vT > grow) discard;
    float dir = vKind > 0.5 ? -1.0 : 1.0;
    float dash = fract(vT * 9.0 - uTime * 0.55 * dir * uFlow);
    float pulse = 0.4 + 0.6 * smoothstep(0.0, 0.35, dash) * (1.0 - smoothstep(0.55, 1.0, dash));
    float across = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
    float ends = smoothstep(0.0, 0.05, vT) * (1.0 - smoothstep(0.93, 1.0, vT));
    float head = smoothstep(grow - 0.1, grow, vT) * (1.0 - vGrow);
    vec3 col = vKind > 0.5 ? mix(uAccent, vec3(1.0), 0.3) : uAccent;
    float a = across * ends * pulse * uFade * 0.5 + head * across * uFade * 0.8;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

/** Animated dependency arcs: one instanced ribbon mesh, shown for one building at a time. */
export class Roads {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private a = new Float32Array(MAX_ARCS * 3);
  private b = new Float32Array(MAX_ARCS * 3);
  private meta = new Float32Array(MAX_ARCS * 2);
  private uniforms = {
    uTime: { value: 0 },
    uBirth: { value: 0 },
    uPx: { value: 0.001 },
    uFade: { value: 0 },
    uFlow: { value: reducedMotion() ? 0 : 1 },
    uAccent: { value: new THREE.Color(ACCENT) },
  };
  private fade = { target: 0 };

  constructor(scene: THREE.Scene) {
    const t: number[] = [];
    const side: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      t.push(i / SEG, i / SEG);
      side.push(-1, 1);
      if (i < SEG) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEG + 1) * 6), 3));
    this.geo.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    this.geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    this.geo.setIndex(index);
    const dyn = (arr: Float32Array, n: number) => new THREE.InstancedBufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aA', dyn(this.a, 3));
    this.geo.setAttribute('aB', dyn(this.b, 3));
    this.geo.setAttribute('aMeta', dyn(this.meta, 2));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** Draw arcs from `from` to each `out`, and from each `incoming` to `from`. */
  show(from: Building, out: Building[], incoming: Building[], time: number): void {
    const top = (b: Building, k: number) => [b.x, b.y + b.h + 0.05, b.z][k];
    let n = 0;
    const put = (s: Building, e: Building, kind: number, order: number) => {
      if (n >= MAX_ARCS) return;
      for (let k = 0; k < 3; k++) {
        this.a[n * 3 + k] = top(s, k);
        this.b[n * 3 + k] = top(e, k);
      }
      this.meta[n * 2] = kind;
      this.meta[n * 2 + 1] = Math.min(0.5, order * 0.025);
      n++;
    };
    out.slice(0, 32).forEach((b, i) => put(from, b, 0, i));
    incoming.slice(0, 32).forEach((b, i) => put(b, from, 1, i));
    this.geo.instanceCount = n;
    for (const name of ['aA', 'aB', 'aMeta']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    this.uniforms.uBirth.value = time;
    this.fade.target = 1;
  }

  hide(): void {
    this.fade.target = 0;
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, viewportH: number): void {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / viewportH;
    u.uFade.value += (this.fade.target - u.uFade.value) * (1 - Math.exp(-dt * (this.fade.target ? 14 : 9)));
    if (this.fade.target === 0 && u.uFade.value < 0.003) {
      u.uFade.value = 0;
      this.geo.instanceCount = 0;
    }
    this.mesh.visible = this.geo.instanceCount > 0;
  }
}
