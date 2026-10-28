import * as THREE from 'three';
import { plateTop, type CityLayout, type DirNode } from '../layout/treemap.ts';
import { ACCENT } from './palette.ts';

const THICK = 0.5;

/** District plates (one instanced mesh) plus hairline outlines (one line mesh). */
export class Districts {
  readonly group = new THREE.Group();
  private plates: THREE.InstancedMesh | null = null;
  private outline: THREE.LineSegments | null = null;
  private layout: CityLayout | null = null;
  private baseColors: THREE.Color[] = [];
  private tint = new Map<number, number>();
  private plateMat = new THREE.MeshBasicMaterial({ fog: true, transparent: true, opacity: 0 });
  private lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: true });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** Fade factor 0..1 for the whole layer (used by the intro). */
  setReveal(v: number): void {
    this.plateMat.opacity = v;
    this.lineMat.opacity = 0.13 * v;
  }

  set(layout: CityLayout): void {
    this.clear();
    this.layout = layout;
    const n = layout.dirs.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.plates = new THREE.InstancedMesh(geo, this.plateMat, n);
    this.plates.frustumCulled = false;
    const m = new THREE.Matrix4();
    const pos: number[] = [];
    this.baseColors = [];
    layout.dirs.forEach((d, i) => {
      const top = plateTop(d.depth, layout.maxDepth);
      m.compose(
        new THREE.Vector3(d.x + d.w / 2, top - THICK / 2, d.z + d.d / 2),
        new THREE.Quaternion(),
        new THREE.Vector3(d.w, THICK, d.d),
      );
      this.plates!.setMatrixAt(i, m);
      const c = new THREE.Color().setHSL(0.64, 0.14, 0.035 + Math.min(layout.maxDepth, d.depth) * 0.006);
      this.baseColors.push(c);
      this.plates!.setColorAt(i, c);
      if (d.depth > 0) {
        const y = top + 0.012;
        const [x0, x1, z0, z1] = [d.x, d.x + d.w, d.z, d.z + d.d];
        pos.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
      }
    });
    this.plates.instanceMatrix.needsUpdate = true;
    if (this.plates.instanceColor) this.plates.instanceColor.needsUpdate = true;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.outline = new THREE.LineSegments(lg, this.lineMat);
    this.outline.frustumCulled = false;
    this.group.add(this.plates, this.outline);
  }

  /** Tint a district toward the accent (hover / focus). 0 clears. */
  setTint(dir: DirNode, amount: number): void {
    if (!this.plates) return;
    if (amount > 0) this.tint.set(dir.id, amount);
    else this.tint.delete(dir.id);
    const c = this.baseColors[dir.id].clone().lerp(ACCENT, amount * 0.16);
    this.plates.setColorAt(dir.id, c);
    this.plates.instanceColor!.needsUpdate = true;
  }

  private clear(): void {
    for (const o of [this.plates, this.outline]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
    }
    this.plates?.dispose();
    this.plates = this.outline = null;
    this.tint.clear();
  }

  get current(): CityLayout | null {
    return this.layout;
  }
}
