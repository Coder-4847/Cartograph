import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const BG = 0x07080a;

/** Owns the renderer, camera, controls and the frame loop. One instance for the whole page. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 4000);
  readonly controls: OrbitControls;
  readonly clock = new THREE.Clock();
  private frameCbs = new Set<(dt: number, t: number) => void>();
  private raf = 0;

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

    this.scene.add(new THREE.HemisphereLight(0xb4bcff, 0x202430, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-60, 90, 40);
    this.scene.add(sun);

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
      this.controls.update();
      this.frameCbs.forEach((cb) => cb(dt, t));
      this.renderer.render(this.scene, this.camera);
    };
    cancelAnimationFrame(this.raf);
    tick();
  }

  resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Place the camera so a w×d city fits the view. */
  frame(width: number, depth: number, maxH = 16): void {
    const r = Math.max(width, depth) * 0.5 + maxH;
    const dist = r / Math.tan((this.camera.fov * Math.PI) / 360) * 0.95;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(dist * 0.55, dist * 0.62, dist * 0.78);
    this.controls.maxDistance = dist * 3;
    this.camera.far = dist * 8;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
}
