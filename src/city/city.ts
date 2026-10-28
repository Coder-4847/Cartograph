import * as THREE from 'three';
import type { RepoData } from '../types.ts';
import { buildLayout, type Building, type CityLayout, type DirNode } from '../layout/treemap.ts';
import { dur, gsap, reducedMotion } from '../motion.ts';
import { Buildings } from './buildings.ts';
import { Districts } from './districts.ts';
import { Ground } from './ground.ts';
import { Labels } from './labels.ts';
import { colorize, type ColorSets } from './palette.ts';
import { BuildingIndex } from './picking.ts';
import { Roads } from './roads.ts';
import type { Mode } from '../ui/modes.ts';
import type { World } from './world.ts';

/** Facade over the 3D city: layout, instanced buildings, districts and their animations. */
export class City {
  readonly buildings: Buildings;
  readonly districts: Districts;
  readonly ground: Ground;
  readonly labels: Labels;
  readonly roads: Roads;
  index: BuildingIndex | null = null;
  hovered: Building | null = null;
  selected: Building | null = null;
  focused: DirNode | null = null;
  mode: Mode = 'overview';
  private out: number[][] = [];
  private inn: number[][] = [];
  private lit = new Set<number>();
  private modeTween: gsap.core.Tween | null = null;
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
    this.roads = new Roads(world.scene);
    world.onFrame((dt, t) => {
      this.buildings.update(dt, t);
      this.roads.update(dt, t, world.camera, world.canvas.clientHeight);
      const el = world.canvas;
      this.labels.update(el.clientWidth, el.clientHeight);
    });
  }

  /**
   * Show a repository. With `morph`, the current buildings reshape into the new ones
   * instead of the city rising from the ground.
   */
  setData(
    data: RepoData,
    opts: { morph?: boolean; camera?: boolean; tweakHome?: (home: City['home']) => void } = {},
  ): void {
    const morph = !!opts.morph && !!this.layout;
    this.data = data;
    const layout = buildLayout(data.files);
    this.layout = layout;
    this.colors = colorize(layout, data.churn);
    this.buildings.set(layout, this.colors, morph);
    this.districts.set(layout);
    this.labels.set(layout);
    this.index = new BuildingIndex(layout);
    this.hovered = this.selected = this.focused = null;
    this.buildings.setDimMask(null);
    this.buildings.uniforms.uFocus.value = 0;
    this.roads.hide();
    this.setDeps(data.deps);
    this.applyMode(this.mode, false);
    this.ground.setRadius(Math.max(layout.width, layout.depth) * 0.5);

    const view = this.world.frame(layout.width, layout.depth, layout.maxH, false);
    this.home.position.copy(view.position);
    this.home.target.copy(view.target);
    opts.tweakHome?.(this.home);
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

  // ------------------------------------------------------------- dependencies

  /** Index import edges by building so arcs can be drawn per building on demand. */
  setDeps(deps: [string, string][]): void {
    const layout = this.layout;
    if (!layout) return;
    this.out = layout.buildings.map(() => []);
    this.inn = layout.buildings.map(() => []);
    for (const [a, b] of deps) {
      const from = layout.buildingByPath.get(a);
      const to = layout.buildingByPath.get(b);
      if (from && to && from !== to) {
        this.out[from.index].push(to.index);
        this.inn[to.index].push(from.index);
      }
    }
    if (this.data) this.data.deps = deps;
    this.refresh();
  }

  depsOf(b: Building): { out: Building[]; in: Building[] } {
    const L = this.layout!.buildings;
    return { out: (this.out[b.index] ?? []).map((i) => L[i]), in: (this.inn[b.index] ?? []).map((i) => L[i]) };
  }

  // -------------------------------------------------------------------- modes

  setMode(mode: Mode, animate = true): void {
    this.mode = mode;
    this.applyMode(mode, animate);
  }

  private applyMode(mode: Mode, animate: boolean): void {
    const u = this.buildings.uniforms;
    const to = mode === 'overview' ? 0 : mode === 'churn' ? 1 : 2;
    this.modeTween?.kill();
    this.modeTween = gsap.to(u.uMode, { value: to, duration: animate ? dur(0.9) : 0.001, ease: 'power2.inOut' });
    gsap.to(u.uHot, { value: mode === 'hotspots' ? 1 : 0, duration: animate ? dur(1.1) : 0.001, ease: 'power2.inOut' });
  }

  // -------------------------------------------------------------- interaction

  /** Enter a district: everything outside it recedes. `null` leaves. */
  focusDir(d: DirNode | null): void {
    if (d && !d.path) d = null; // the root is "everything"
    this.focused = d;
    const u = this.buildings.uniforms.uFocus;
    if (d) {
      const prefix = d.path + '/';
      const b = this.layout!.buildings;
      this.buildings.setDimMask((i) => !b[i].path.startsWith(prefix));
      gsap.to(u, { value: 1, duration: dur(0.7), ease: 'power2.out' });
    } else {
      gsap.to(u, { value: 0, duration: dur(0.6), ease: 'power2.out', onComplete: () => this.buildings.setDimMask(null) });
    }
    this.districts.mark('focus', d);
  }

  setHovered(b: Building | null): void {
    if (b === this.hovered) return;
    this.hovered = b;
    this.refresh();
  }

  setSelected(b: Building | null): void {
    this.selected = b;
    this.refresh();
  }

  /** Re-derive lift/glow and the dependency arcs from hovered + selected. */
  private refresh(): void {
    const want = new Map<number, [number, number]>();
    const focus = this.hovered ?? this.selected;
    if (this.selected) want.set(this.selected.index, [1, 0.75]);
    if (this.hovered) want.set(this.hovered.index, [1, 0.95]);
    if (focus) {
      const { out, in: inc } = this.depsOf(focus);
      for (const b of [...out, ...inc]) if (!want.has(b.index)) want.set(b.index, [0.15, 0.5]);
      if (out.length || inc.length) this.roads.show(focus, out, inc, this.world.clock.elapsedTime);
      else this.roads.hide();
    } else this.roads.hide();
    for (const i of this.lit) if (!want.has(i)) this.buildings.setHover(i, 0, 0);
    for (const [i, [lift, glow]] of want) this.buildings.setHover(i, lift, glow);
    this.lit = new Set(want.keys());
  }
}
