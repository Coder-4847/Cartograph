import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const BG = 0x07080a;
/** Resting field of view. Transitions punch it up and back; framing always uses this one. */
export const BASE_FOV = 38;

/** Owns the renderer, camera, controls and the frame loop. One instance for the whole page. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 4000);
  readonly controls: OrbitControls;
  readonly clock = new THREE.Clock();
  /** Pixel offset of the scene's centre (used to keep a building clear of the side panel). */
  readonly shift = { x: 0, y: 0 };
  private appliedShift = { x: 0, y: 0 };
  private frameCbs = new Set<(dt: number, t: number) => void>();
  private raf = 0;
  /** Upper bound for the pixel ratio; the adaptive loop never exceeds it. */
  private maxPR = Math.min(window.devicePixelRatio || 1, 2);
  private pr = this.maxPR;
  private slow = 0;
  private fast = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(BG, 1);
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.FogExp2(BG, 0.006);

    this.camera.position.set(60, 55, 80);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 900;
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  onFrame(cb: (dt: number, t: number) => void): () => void {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  start(): void {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      this.adapt(dt);
      this.controls.update();
      if (this.shift.x !== this.appliedShift.x || this.shift.y !== this.appliedShift.y) this.applyShift();
      this.frameCbs.forEach((cb) => cb(dt, t));
      this.renderer.render(this.scene, this.camera);
    };
    cancelAnimationFrame(this.raf);
    tick();
  }

  /** Trade resolution for smoothness: sustained slow frames lower the pixel ratio, fast ones restore it. */
  private adapt(dt: number): void {
    if (dt > 1 / 30) {
      this.slow++;
      this.fast = 0;
    } else if (dt < 1 / 50) {
      this.fast++;
      this.slow = 0;
    }
    if (this.slow > 20 && this.pr > 0.55) {
      this.pr = Math.max(0.55, this.pr * 0.8);
      this.slow = 0;
      this.resize();
    } else if (this.fast > 240 && this.pr < this.maxPR) {
      this.pr = Math.min(this.maxPR, this.pr * 1.15);
      this.fast = 0;
      this.resize();
    }
  }

  resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.appliedShift = { x: NaN, y: NaN };
  }

  private applyShift(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.appliedShift = { ...this.shift };
    if (Math.abs(this.shift.x) < 0.5 && Math.abs(this.shift.y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, this.shift.x, this.shift.y, w, h);
  }

  /** Place the camera so a w×d city fits the view. */
  frame(width: number, depth: number, maxH = 16, apply = true): { position: THREE.Vector3; target: THREE.Vector3; dist: number } {
    const r = Math.hypot(width, depth) * 0.5 + maxH * 0.5;
    const tanV = Math.tan((BASE_FOV * Math.PI) / 360);
    // fit both ways so portrait phones see the whole city too
    const dist = Math.max((r / tanV) * 0.92, (r / (tanV * this.camera.aspect)) * 0.8);
    const position = new THREE.Vector3(dist * 0.5, dist * 0.6, dist * 0.8);
    const target = new THREE.Vector3(0, 0, 0);
    (this.scene.fog as THREE.FogExp2).density = 1.05 / (dist * 2.6);
    this.controls.maxDistance = dist * 2.4;
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    if (apply) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    }
    return { position, target, dist };
  }
}
