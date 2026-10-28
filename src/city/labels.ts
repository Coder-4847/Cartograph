import * as THREE from 'three';
import type { CityLayout, DirNode } from '../layout/treemap.ts';

const POOL = 40;
const MIN_PX = 86;

/**
 * DOM district labels, level-of-detail style: a district is named only when it is wide enough
 * on screen and none of its sub-districts is, so zooming in swaps names like a map does.
 */
export class Labels {
  private root = document.createElement('div');
  private els: HTMLDivElement[] = [];
  private layout: CityLayout | null = null;
  private v = new THREE.Vector3();
  private enabled = true;

  constructor(host: HTMLElement, private camera: THREE.PerspectiveCamera) {
    this.root.className = 'labels';
    this.root.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'label';
      el.style.display = 'none';
      this.root.append(el);
      this.els.push(el);
    }
    host.append(this.root);
  }

  set(layout: CityLayout): void {
    this.layout = layout;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.style.opacity = on ? '1' : '0';
  }

  update(width: number, height: number): void {
    const layout = this.layout;
    if (!layout || !this.enabled) return;
    const focal = height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const shown: { d: DirNode; px: number; x: number; y: number }[] = [];

    const visit = (d: DirNode): boolean => {
      this.v.set(d.x + d.w / 2, 0, d.z + d.d / 2).applyMatrix4(this.camera.matrixWorldInverse);
      const depth = -this.v.z;
      let childShown = false;
      for (const c of d.dirs) if (visit(c)) childShown = true;
      if (depth <= 0.1 || d.depth === 0) return childShown;
      const px = (Math.max(d.w, d.d) * focal) / depth;
      if (px < MIN_PX) return childShown;
      if (!childShown) {
        this.v.set(d.x + d.w / 2, 0, d.z + d.d / 2).project(this.camera);
        const x = (this.v.x * 0.5 + 0.5) * width;
        const y = (-this.v.y * 0.5 + 0.5) * height;
        if (x > -50 && x < width + 50 && y > -30 && y < height + 30 && this.v.z < 1) shown.push({ d, px, x, y });
      }
      return true;
    };
    visit(layout.root);

    shown.sort((a, b) => b.px - a.px);
    this.els.forEach((el, i) => {
      const s = shown[i];
      if (!s) {
        el.style.display = 'none';
        return;
      }
      const name = s.d.name;
      if (el.dataset.id !== String(s.d.id)) {
        el.textContent = name.length > 26 ? '…' + name.slice(-25) : name;
        el.dataset.id = String(s.d.id);
      }
      el.style.display = '';
      el.style.opacity = String(Math.min(1, (s.px - MIN_PX) / 50));
      el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    });
  }
}
