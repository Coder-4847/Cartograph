import * as THREE from 'three';
import type { Building } from '../layout/treemap.ts';
import type { City } from './city.ts';

export interface InteractionEvents {
  hover?: (b: Building | null, x: number, y: number) => void;
}

/** Pointer handling for the canvas. Stage 3 covers hover; later stages add gestures. */
export class Interaction {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pending: { x: number; y: number } | null = null;

  constructor(private city: City, private events: InteractionEvents = {}) {
    const canvas = city.world.canvas;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      this.pending = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => {
      this.pending = null;
      this.setHover(null, 0, 0);
    });
    city.world.onFrame(() => {
      if (!this.pending) return;
      const { x, y } = this.pending;
      this.pending = null;
      this.setHover(this.pickBuilding(x, y), x, y);
    });
  }

  pickBuilding(clientX: number, clientY: number): Building | null {
    const { city } = this;
    if (!city.index || city.buildings.uniforms.uT.value < 0.98) return null;
    const r = city.world.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, city.world.camera);
    return city.index.pick(this.ray.ray)?.building ?? null;
  }

  private setHover(b: Building | null, x: number, y: number): void {
    this.city.setHovered(b);
    this.city.world.canvas.style.cursor = b ? 'pointer' : '';
    this.events.hover?.(b, x, y);
  }
}
