import * as THREE from 'three';
import type { ColorSets } from '../city/palette.ts';
import type { CityLayout } from '../layout/treemap.ts';
import type { Mode } from './modes.ts';
import { h } from './dom.ts';

const W = 168;
const H = 112;
const PAD = 6;

const toCss = (r: number, g: number, b: number) =>
  `rgb(${Math.round(Math.pow(r, 1 / 2.2) * 255)},${Math.round(Math.pow(g, 1 / 2.2) * 255)},${Math.round(Math.pow(b, 1 / 2.2) * 255)})`;

/** Top-down map with the camera's footprint; click or drag to move the camera there. */
export class Minimap {
  readonly el = h('div', { class: 'minimap', role: 'img', 'aria-label': 'Minimap. Click or drag to move the camera.' });
  private canvas = h('canvas');
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement('canvas');
  private layout: CityLayout | null = null;
  private colors: ColorSets | null = null;
  private mode: Mode = 'overview';
  private scale = 1;
  private ox = 0;
  private oz = 0;
  private ray = new THREE.Raycaster();
  private v = new THREE.Vector2();
  private frame = 0;

  constructor(private camera: THREE.PerspectiveCamera, private onNavigate: (x: number, z: number, drag: boolean) => void) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.base]) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.el.append(this.canvas);
    let dragging = false;
    const move = (e: PointerEvent, drag: boolean) => {
      if (!this.layout) return;
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) - this.ox) / this.scale + this.layout.root.x;
      const z = ((e.clientY - r.top) - this.oz) / this.scale + this.layout.root.z;
      this.onNavigate(x, z, drag);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      move(e, false);
    });
    this.canvas.addEventListener('pointermove', (e) => dragging && move(e, true));
    const end = () => (dragging = false);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    document.body.append(this.el);
  }

  set(layout: CityLayout, colors: ColorSets): void {
    this.layout = layout;
    this.colors = colors;
    this.scale = Math.min((W - PAD * 2) / layout.width, (H - PAD * 2) / layout.depth);
    this.ox = (W - layout.width * this.scale) / 2;
    this.oz = (H - layout.depth * this.scale) / 2;
    this.drawBase();
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.drawBase();
  }

  private drawBase(): void {
    const L = this.layout;
    const c = this.colors;
    if (!L || !c) return;
    const dpr = this.base.width / W;
    const g = this.base.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const s = this.scale;
    const X = (x: number) => this.ox + (x - L.root.x) * s;
    const Z = (z: number) => this.oz + (z - L.root.z) * s;
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(X(L.root.x), Z(L.root.z), L.width * s, L.depth * s);
    const arr = this.mode === 'overview' ? c.c0 : this.mode === 'churn' ? c.c1 : c.c2;
    for (const b of L.buildings) {
      const i = b.index * 3;
      g.fillStyle = toCss(arr[i], arr[i + 1], arr[i + 2]);
      g.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), Math.max(0.8, b.w * s), Math.max(0.8, b.d * s));
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 0.5;
    for (const d of L.dirs) if (d.depth > 0 && d.depth <= 2) g.strokeRect(X(d.x), Z(d.z), d.w * s, d.d * s);
  }

  /** Redraw the camera footprint. Cheap, but throttled to every other frame. */
  update(): void {
    if (!this.layout || (this.frame++ & 1)) return;
    const L = this.layout;
    const dpr = this.canvas.width / W;
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.drawImage(this.base, 0, 0, W, H);

    const pts: [number, number][] = [];
    const far = Math.hypot(L.width, L.depth) * 2;
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.v.set(nx, ny);
      this.ray.setFromCamera(this.v, this.camera);
      const { origin: o, direction: d } = this.ray.ray;
      let t = d.y < -0.02 ? -o.y / d.y : far;
      t = Math.min(t, far);
      pts.push([this.ox + (o.x + d.x * t - L.root.x) * this.scale, this.oz + (o.z + d.z * t - L.root.z) * this.scale]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = 'rgba(123,131,255,0.14)';
    g.strokeStyle = 'rgba(123,131,255,0.95)';
    g.lineWidth = 1.2;
    g.fill();
    g.stroke();
  }
}
