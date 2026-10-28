import * as THREE from 'three';
import type { Building, DirNode } from '../layout/treemap.ts';
import { LONG_PRESS_MS, type Ring } from '../ui/ring.ts';
import type { City } from './city.ts';

export interface Actions {
  /** Mouse hover only (touch has no hover; a tap selects instead). */
  hover(b: Building | null, d: DirNode | null): void;
  tap(b: Building | null, d: DirNode | null): void;
  doubleTap(b: Building | null, d: DirNode | null): void;
  longPress(b: Building | null, d: DirNode | null): void;
}

interface Target {
  b: Building | null;
  d: DirNode | null;
}

const MOVE_TOL = 8;
const DOUBLE_MS = 320;
const DOUBLE_PX = 28;

/**
 * Pointer gestures on the canvas, identical for mouse and touch:
 * tap/click, double-tap/click, 600ms long-press (with a progress ring) and hover.
 * Orbit, pinch-zoom and two-finger pan are left to OrbitControls.
 */
export class Interaction {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointers = new Set<number>();
  private press: { id: number; x: number; y: number; target: Target; timer: number; fired: boolean } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private hoverAt: { x: number; y: number } | null = null;
  private multi = false;

  constructor(private city: City, private ring: Ring, private actions: Actions) {
    const canvas = city.world.canvas;
    const controls = city.world.controls;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', () => this.cancelPress(), { passive: true });

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      canvas.focus({ preventScroll: true });
      this.pointers.add(e.pointerId);
      if (this.pointers.size > 1) {
        this.multi = true;
        this.cancelPress();
        return;
      }
      const target = this.pick(e.clientX, e.clientY);
      const press = { id: e.pointerId, x: e.clientX, y: e.clientY, target, timer: 0, fired: false };
      this.press = press;
      if (target.b || target.d) {
        this.ring.start(e.clientX, e.clientY);
        press.timer = window.setTimeout(() => this.fire(), LONG_PRESS_MS);
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = this.press;
      if (p && p.id === e.pointerId && !p.fired) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOL) this.cancelPress();
        else this.ring.move(e.clientX, e.clientY);
      }
      if (e.pointerType === 'mouse' && !e.buttons) this.hoverAt = { x: e.clientX, y: e.clientY };
    });

    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      const p = this.press;
      if (p && p.id === e.pointerId) {
        const wasFired = p.fired;
        const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOL;
        this.cancelPress();
        if (wasFired) controls.enabled = true;
        else if (!moved && !this.multi && e.type === 'pointerup') this.tapped(e.clientX, e.clientY, p.target);
      }
      if (!this.pointers.size) {
        this.multi = false;
        controls.enabled = true;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        this.hoverAt = null;
        this.actions.hover(null, null);
      }
    });

    // hover is resolved once per frame, not per event
    city.world.onFrame(() => {
      if (!this.hoverAt || this.press) return;
      const t = this.pick(this.hoverAt.x, this.hoverAt.y);
      this.hoverAt = null;
      this.city.world.canvas.style.cursor = t.b ? 'pointer' : '';
      this.actions.hover(t.b, t.d);
    });
  }

  /** The building (and its district) under a screen point; falls back to the ground district. */
  pick(clientX: number, clientY: number): Target {
    const { city } = this;
    if (!city.index || city.buildings.uniforms.uT.value < 0.98) return { b: null, d: null };
    const r = city.world.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, city.world.camera);
    const hit = city.index.pick(this.ray.ray);
    if (hit) return { b: hit.building, d: hit.building.dir };
    const g = city.index.ground(this.ray.ray);
    return { b: null, d: g ? city.index.dirAt(g.x, g.z) : null };
  }

  private fire(): void {
    const p = this.press;
    if (!p) return;
    p.fired = true;
    // stop OrbitControls from turning the held press into a drag
    this.city.world.controls.enabled = false;
    this.ring.complete();
    navigator.vibrate?.(18);
    this.actions.longPress(p.target.b, p.target.d);
  }

  private cancelPress(): void {
    const p = this.press;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (!p.fired) this.ring.cancel();
    this.press = null;
  }

  private tapped(x: number, y: number, target: Target): void {
    const now = performance.now();
    const l = this.lastTap;
    if (now - l.t < DOUBLE_MS && Math.hypot(x - l.x, y - l.y) < DOUBLE_PX) {
      this.lastTap = { t: 0, x: 0, y: 0 };
      this.actions.doubleTap(target.b, target.d);
    } else {
      this.lastTap = { t: now, x, y };
      this.actions.tap(target.b, target.d);
    }
  }
}
