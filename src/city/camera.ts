import * as THREE from 'three';
import type { Building, DirNode } from '../layout/treemap.ts';
import { dur, gsap } from '../motion.ts';
import type { World } from './world.ts';

export interface View {
  target: THREE.Vector3;
  position: THREE.Vector3;
}

const TAU = Math.PI * 2;

/** Cinematic camera moves layered on OrbitControls: fly-to, focus helpers, and "ease back". */
export class Rig {
  private tween: gsap.core.Tween | null = null;
  private saved: View | null = null;

  constructor(private world: World) {
    // any manual orbit/zoom/pan takes over immediately
    world.controls.addEventListener('start', () => this.stop());
  }

  stop(): void {
    this.tween?.kill();
    this.tween = null;
  }

  get view(): View {
    return { target: this.world.controls.target.clone(), position: this.world.camera.position.clone() };
  }

  /** Remember the current view the first time something is opened, so closing can return to it. */
  save(): void {
    this.saved ??= this.view;
  }

  restore(duration = 1.1): Promise<void> {
    const v = this.saved;
    this.saved = null;
    return v ? this.fly(v, duration) : Promise.resolve();
  }

  forgetSaved(): void {
    this.saved = null;
  }

  get hasSaved(): boolean {
    return this.saved !== null;
  }

  /** Orbit-style flight: target slides, distance changes exponentially, angles take the short way. */
  fly(view: View, duration = 1.15): Promise<void> {
    this.stop();
    const { camera, controls } = this.world;
    const t0 = controls.target.clone();
    const s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t0));
    const s1 = new THREE.Spherical().setFromVector3(view.position.clone().sub(view.target));
    let dTheta = (s1.theta - s0.theta) % TAU;
    if (dTheta > Math.PI) dTheta -= TAU;
    if (dTheta < -Math.PI) dTheta += TAU;
    const p = { t: 0 };
    const tmp = new THREE.Vector3();
    return new Promise((resolve) => {
      this.tween = gsap.to(p, {
        t: 1,
        duration: dur(duration),
        ease: 'power3.inOut',
        onUpdate: () => {
          const e = p.t;
          controls.target.lerpVectors(t0, view.target, e);
          const r = s0.radius * Math.pow(s1.radius / s0.radius, e);
          const phi = s0.phi + (s1.phi - s0.phi) * e;
          const theta = s0.theta + dTheta * e;
          tmp.setFromSpherical(new THREE.Spherical(r, phi, theta));
          camera.position.copy(controls.target).add(tmp);
        },
        onComplete: () => {
          this.tween = null;
          resolve();
        },
        onInterrupt: () => resolve(),
      });
    });
  }

  private basis(): { theta: number; phi: number } {
    const { camera, controls } = this.world;
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    return { theta: s.theta, phi: Math.min(1.15, Math.max(0.5, s.phi)) };
  }

  private viewAt(target: THREE.Vector3, dist: number): View {
    const { theta, phi } = this.basis();
    const position = target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(dist, phi, theta)));
    return { target, position };
  }

  viewForDir(d: DirNode, tallest = 0): View {
    const { camera } = this.world;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * Math.min(1.6, camera.aspect);
    const dist = Math.max((d.w / 2) / tanH, (d.d / 2) / (tanV * 1.15)) * 1.2 + tallest * 0.9;
    return this.viewAt(new THREE.Vector3(d.x + d.w / 2, 0, d.z + d.d / 2), Math.max(14, dist));
  }

  viewForBuilding(b: Building): View {
    const dist = Math.max(30, b.h * 2.8, Math.max(b.w, b.d) * 6);
    return this.viewAt(new THREE.Vector3(b.x, b.y + b.h * 0.45, b.z), dist);
  }

  flyToDir(d: DirNode, tallest = 0): Promise<void> {
    this.save();
    return this.fly(this.viewForDir(d, tallest), 1.25);
  }

  flyToBuilding(b: Building): Promise<void> {
    this.save();
    return this.fly(this.viewForBuilding(b), 1.15);
  }
}
