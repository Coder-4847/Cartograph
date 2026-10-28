import * as THREE from 'three';
import type { RepoData } from '../types.ts';
import { buildLayout, type CityLayout } from '../layout/treemap.ts';
import { dur, gsap, reducedMotion } from '../motion.ts';
import { Buildings } from './buildings.ts';
import { Districts } from './districts.ts';
import { Ground } from './ground.ts';
import { Labels } from './labels.ts';
import { colorize, type ColorSets } from './palette.ts';
import type { World } from './world.ts';

/** Facade over the 3D city: layout, instanced buildings, districts and their animations. */
export class City {
  readonly buildings: Buildings;
  readonly districts: Districts;
  readonly ground: Ground;
  readonly labels: Labels;
  layout: CityLayout | null = null;
  data: RepoData | null = null;
  colors: ColorSets | null = null;
  home = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private introTween: gsap.core.Tween | null = null;

  constructor(readonly world: World) {
    this.ground = new Ground(world.scene);
    this.districts = new Districts(world.scene);
    this.buildings = new Buildings(world.scene);
    this.labels = new Labels(document.body, world.camera);
    world.onFrame((dt, t) => {
      this.buildings.update(dt, t);
      const el = world.canvas;
      this.labels.update(el.clientWidth, el.clientHeight);
    });
  }

  /**
   * Show a repository. With `morph`, the current buildings reshape into the new ones
   * instead of the city rising from the ground.
   */
  setData(data: RepoData, opts: { morph?: boolean; camera?: boolean } = {}): void {
    const morph = !!opts.morph && !!this.layout;
    this.data = data;
    const layout = buildLayout(data.files);
    this.layout = layout;
    this.colors = colorize(layout, data.churn);
    this.buildings.set(layout, this.colors, morph);
    this.districts.set(layout);
    this.labels.set(layout);
    this.ground.setRadius(Math.max(layout.width, layout.depth) * 0.5);

    const view = this.world.frame(layout.width, layout.depth, layout.maxH, false);
    this.home.position.copy(view.position);
    this.home.target.copy(view.target);
    this.play(morph, opts.camera !== false);
  }

  private play(morph: boolean, moveCamera: boolean): void {
    const { world } = this;
    const u = this.buildings.uniforms.uT;
    this.introTween?.kill();
    const reveal = { v: morph ? 1 : 0 };
    const apply = () => {
      this.districts.setReveal(reveal.v);
      this.ground.setReveal(reveal.v);
    };
    apply();
    if (reducedMotion()) {
      u.value = 1;
      reveal.v = 1;
      apply();
      if (moveCamera) this.goHome(true);
      return;
    }
    const tl = gsap.timeline();
    tl.to(u, { value: 1, duration: morph ? 1.8 : 2.6, ease: 'none' }, 0);
    if (!morph) tl.to(reveal, { v: 1, duration: 1.2, ease: 'power2.out', onUpdate: apply }, 0);
    if (moveCamera) {
      const from = this.home.position.clone().multiplyScalar(1.28);
      from.y *= 1.12;
      world.camera.position.copy(from);
      world.controls.target.copy(this.home.target);
      tl.to(world.camera.position, { x: this.home.position.x, y: this.home.position.y, z: this.home.position.z, duration: 3, ease: 'power3.out' }, 0);
    }
    this.introTween = tl as unknown as gsap.core.Tween;
  }

  goHome(instant = false): void {
    const { world } = this;
    gsap.killTweensOf(world.camera.position);
    gsap.killTweensOf(world.controls.target);
    const d = instant ? 0.001 : dur(1.2);
    gsap.to(world.camera.position, { ...this.home.position, duration: d, ease: 'power3.inOut' });
    gsap.to(world.controls.target, { ...this.home.target, duration: d, ease: 'power3.inOut' });
  }
}
