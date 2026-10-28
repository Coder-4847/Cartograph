import * as THREE from 'three';
import type { RepoData } from '../types.ts';
import { flatLayout } from '../layout/flat.ts';
import type { World } from './world.ts';

/** Stage 1: files as flat blocks. Later stages swap in the treemap and shader. */
export class City {
  private mesh: THREE.InstancedMesh | null = null;

  constructor(private world: World) {}

  setData(data: RepoData): void {
    if (this.mesh) {
      this.world.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    const { blocks, width, depth } = flatLayout(data.files);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geo, mat, blocks.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    blocks.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      c.setHSL(0.64, 0.45, 0.42 + Math.min(0.35, b.h / 30));
      mesh.setColorAt(i, c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.mesh = mesh;
    this.world.scene.add(mesh);
    this.world.frame(width, depth);
  }
}
