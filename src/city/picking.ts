import * as THREE from 'three';
import type { Building, CityLayout, DirNode } from '../layout/treemap.ts';

/**
 * Ray picking for buildings without touching the GPU or three's per-instance raycast.
 * Buildings never overlap in plan view (treemap), so a uniform 2D grid + DDA walk finds the
 * nearest hit in a handful of cell lookups even for 10k+ buildings.
 */
export class BuildingIndex {
  private cell: number;
  private cols: number;
  private rows: number;
  private x0: number;
  private z0: number;
  private cells: number[][];
  private seen: Uint32Array;
  private stamp = 0;

  constructor(private layout: CityLayout) {
    const n = layout.buildings.length;
    this.cell = Math.max(2, Math.sqrt((layout.width * layout.depth) / Math.max(1, n)) * 2.5);
    this.cols = Math.ceil(layout.width / this.cell) + 1;
    this.rows = Math.ceil(layout.depth / this.cell) + 1;
    this.x0 = -layout.width / 2;
    this.z0 = -layout.depth / 2;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.seen = new Uint32Array(n);
    for (const b of layout.buildings) {
      const [ax, az] = this.cellOf(b.x - b.w / 2, b.z - b.d / 2);
      const [bx, bz] = this.cellOf(b.x + b.w / 2, b.z + b.d / 2);
      for (let cz = az; cz <= bz; cz++) for (let cx = ax; cx <= bx; cx++) this.cells[cz * this.cols + cx].push(b.index);
    }
  }

  private cellOf(x: number, z: number): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell))),
      Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.z0) / this.cell))),
    ];
  }

  private hitBox(b: Building, o: THREE.Vector3, d: THREE.Vector3): number {
    let t0 = 0;
    let t1 = Infinity;
    const lo = [b.x - b.w / 2, b.y, b.z - b.d / 2];
    const hi = [b.x + b.w / 2, b.y + b.h, b.z + b.d / 2];
    const oo = [o.x, o.y, o.z];
    const dd = [d.x, d.y, d.z];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dd[k]) < 1e-9) {
        if (oo[k] < lo[k] || oo[k] > hi[k]) return -1;
        continue;
      }
      let a = (lo[k] - oo[k]) / dd[k];
      let c = (hi[k] - oo[k]) / dd[k];
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return -1;
    }
    return t0;
  }

  pick(ray: THREE.Ray): { building: Building; t: number; point: THREE.Vector3 } | null {
    const { origin: o, direction: d } = ray;
    const L = this.layout;
    // clip the ray's XZ projection to the city bounds
    let tEnter = 0;
    let tExit = d.y < 0 ? (-1 - o.y) / d.y : 1e9;
    const bounds = [
      [o.x, d.x, this.x0, this.x0 + this.cols * this.cell],
      [o.z, d.z, this.z0, this.z0 + this.rows * this.cell],
    ];
    for (const [oo, dd, lo, hi] of bounds) {
      if (Math.abs(dd) < 1e-9) {
        if (oo < lo || oo > hi) return null;
        continue;
      }
      let a = (lo - oo) / dd;
      let c = (hi - oo) / dd;
      if (a > c) [a, c] = [c, a];
      tEnter = Math.max(tEnter, a);
      tExit = Math.min(tExit, c);
    }
    if (tEnter > tExit) return null;

    const p = new THREE.Vector3().copy(d).multiplyScalar(tEnter + 1e-4).add(o);
    let cx = Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.x0) / this.cell)));
    let cz = Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.z0) / this.cell)));
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const nextX = this.x0 + (cx + (stepX > 0 ? 1 : 0)) * this.cell;
    const nextZ = this.z0 + (cz + (stepZ > 0 ? 1 : 0)) * this.cell;
    let tMaxX = Math.abs(d.x) < 1e-9 ? Infinity : (nextX - o.x) / d.x;
    let tMaxZ = Math.abs(d.z) < 1e-9 ? Infinity : (nextZ - o.z) / d.z;
    const tDX = Math.abs(d.x) < 1e-9 ? Infinity : this.cell / Math.abs(d.x);
    const tDZ = Math.abs(d.z) < 1e-9 ? Infinity : this.cell / Math.abs(d.z);

    this.stamp++;
    let best: Building | null = null;
    let bestT = Infinity;
    while (cx >= 0 && cx < this.cols && cz >= 0 && cz < this.rows) {
      for (const idx of this.cells[cz * this.cols + cx]) {
        if (this.seen[idx] === this.stamp) continue;
        this.seen[idx] = this.stamp;
        const t = this.hitBox(L.buildings[idx], o, d);
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = L.buildings[idx];
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (bestT <= tNext || tNext > tExit) break;
      if (tMaxX < tMaxZ) {
        cx += stepX;
        tMaxX += tDX;
      } else {
        cz += stepZ;
        tMaxZ += tDZ;
      }
    }
    return best ? { building: best, t: bestT, point: new THREE.Vector3().copy(d).multiplyScalar(bestT).add(o) } : null;
  }

  /** Where the ray meets the ground (y = 0), or null when it points at the sky. */
  ground(ray: THREE.Ray): THREE.Vector3 | null {
    if (ray.direction.y >= -1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    return new THREE.Vector3().copy(ray.direction).multiplyScalar(t).add(ray.origin);
  }

  /** Deepest district containing a ground point. */
  dirAt(x: number, z: number): DirNode | null {
    let node = this.layout.root;
    if (x < node.x || x > node.x + node.w || z < node.z || z > node.z + node.d) return null;
    for (;;) {
      const next = node.dirs.find((c) => x >= c.x && x <= c.x + c.w && z >= c.z && z <= c.z + c.d);
      if (!next) return node;
      node = next;
    }
  }
}
