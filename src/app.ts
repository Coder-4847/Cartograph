import * as THREE from 'three';
import { githubUrl, loadDeps, loadRepo, loadSample, parseRepo, repoName } from './api/index.ts';
import { Rig } from './city/camera.ts';
import { City } from './city/city.ts';
import { Interaction } from './city/interaction.ts';
import { World } from './city/world.ts';
import type { Building, DirNode } from './layout/treemap.ts';
import { dur, gsap } from './motion.ts';
import { FetchError, type RepoData, type RepoRef } from './types.ts';
import { Breadcrumb } from './ui/breadcrumb.ts';
import { ErrorCard } from './ui/errors.ts';
import { Hud } from './ui/hud.ts';
import { Loader } from './ui/loader.ts';
import { Minimap } from './ui/minimap.ts';
import { ModeControl } from './ui/modes.ts';
import { Panel } from './ui/panel.ts';
import { Ring } from './ui/ring.ts';
import { Search } from './ui/search.ts';
import { Settings } from './ui/settings.ts';
import { Shortcuts } from './ui/shortcuts.ts';
import { toast } from './ui/toast.ts';
import { Tooltip } from './ui/tooltip.ts';

/** Wires data -> city -> UI. The landing page drives it through `open` / `openDemo`. */
export class App {
  readonly world: World;
  readonly city: City;
  readonly rig: Rig;
  readonly loader: Loader;
  readonly hud: Hud;
  readonly modes: ModeControl;
  readonly errors: ErrorCard;
  readonly settings = new Settings();
  readonly shortcuts = new Shortcuts();
  readonly tooltip = new Tooltip();
  readonly panel: Panel;
  readonly search: Search;
  readonly minimap: Minimap;
  readonly crumbs: Breadcrumb;
  private depsAbort: AbortController | null = null;
  private job = 0;
  private active = false;
  private crumbClock = 0;
  private proj = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', '3D city of the repository. Drag to orbit, scroll to zoom, arrow keys pan. Press ? for shortcuts.');
    this.world = new World(canvas);
    this.city = new City(this.world);
    this.rig = new Rig(this.world);
    this.loader = new Loader(document.body);
    this.errors = new ErrorCard(document.body);
    this.hud = new Hud({ settings: () => this.settings.open(), help: () => this.shortcuts.toggle() });
    this.crumbs = new Breadcrumb((d) => this.pickCrumb(d));
    this.hud.info.append(this.crumbs.el);
    this.modes = new ModeControl((m) => {
      this.city.setMode(m);
      this.minimap.setMode(m);
    });
    this.modes.el.hidden = true;
    document.body.append(this.modes.el);
    this.panel = new Panel({
      close: () => this.closePanel(),
      openFile: (b) => void this.openFile(b),
      openDir: (d) => void this.openDir(d),
    });
    this.search = new Search({ pickFile: (b) => void this.openFile(b), pickDir: (d) => void this.openDir(d) });
    this.minimap = new Minimap(this.world.camera, (x, z, drag) => this.navigateTo(x, z, drag));
    this.minimap.el.hidden = true;

    const ring = new Ring();
    new Interaction(this.city, ring, {
      hover: (b, d) => {
        this.city.setHovered(b);
        this.city.districts.mark('hover', b ? null : d && d.depth > 0 && d !== this.city.focused ? d : null);
      },
      tap: (b) => this.tapBuilding(b),
      doubleTap: (b, d) => void this.zoomInto(b ? b.dir : d),
      longPress: (b, d) => (b ? void this.openFile(b) : d && void this.openDir(d)),
    });

    this.world.controls.listenToKeyEvents(canvas);
    this.world.controls.keyPanSpeed = 18;
    this.world.controls.zoomToCursor = true;
    this.world.onFrame((dt) => this.frame(dt));
    window.addEventListener('keydown', (e) => this.keydown(e));
    this.world.start();
  }

  // ------------------------------------------------------------------- loading

  /** Fetch a repository from GitHub and show its city. */
  async open(input: string | RepoRef): Promise<boolean> {
    const job = ++this.job;
    this.errors.hide();
    this.loader.show('Resolving repository…');
    try {
      const ref = typeof input === 'string' ? parseRepo(input) : input;
      const data = await loadRepo(ref, { onProgress: (p) => job === this.job && this.loader.update(p) });
      if (job !== this.job) return false;
      this.present(data);
      void this.mapDeps(data, job);
      return true;
    } catch (e) {
      if (job !== this.job) return false;
      this.loader.hide();
      this.errors.show(e instanceof FetchError ? e : new FetchError('unknown', 'Something went wrong.'), {
        retry: () => void this.open(input),
        demo: () => void this.openDemo(),
        settings: () => this.settings.open(),
      });
      return false;
    }
  }

  async openDemo(): Promise<void> {
    const job = ++this.job;
    this.errors.hide();
    const data = await loadSample();
    if (job !== this.job) return;
    this.present(data);
  }

  private present(data: RepoData): void {
    this.depsAbort?.abort();
    this.resetSelection();
    this.loader.update({ stage: 'layout', message: 'Laying out the city…', fraction: 0.5 });
    this.city.setData(data);
    const L = this.city.layout!;
    this.search.setData(L, data.churn);
    this.minimap.set(L, this.city.colors!);
    this.minimap.setMode(this.modes.current);
    this.hud.setRepo(data);
    this.hud.show();
    this.modes.el.hidden = false;
    this.minimap.el.hidden = false;
    this.modes.layout();
    this.hud.endDeps();
    this.loader.hide();
    this.active = true;
    this.crumbClock = 0;
  }

  private async mapDeps(data: RepoData, job: number): Promise<void> {
    const ctl = (this.depsAbort = new AbortController());
    this.hud.setDepsProgress(0, 1);
    try {
      const res = await loadDeps(data, {
        signal: ctl.signal,
        onProgress: (p) => {
          if (job === this.job) this.hud.setDepsProgress(Math.round((p.fraction ?? 0) * 300), 300);
        },
      });
      if (job !== this.job || ctl.signal.aborted) return;
      data.depsAnalyzed = res.analyzed;
      this.city.setDeps(res.deps);
      this.hud.setRepo(data);
      if (res.deps.length) toast(`Mapped ${res.deps.length.toLocaleString()} imports. Hover a building to see its roads.`);
    } finally {
      if (job === this.job) this.hud.endDeps();
    }
  }

  // ------------------------------------------------------------------- actions

  private tapBuilding(b: Building | null): void {
    this.city.setSelected(b);
    if (b && this.panel.isOpen) void this.openFile(b);
  }

  /** Select a file, fly to it and open the details panel. */
  async openFile(b: Building): Promise<void> {
    this.city.setSelected(b);
    this.city.setHovered(null);
    const data = this.city.data!;
    const deps = this.city.depsOf(b);
    this.rig.save();
    this.panel.showFile(b, {
      ref: data.ref,
      churn: data.churn[b.path],
      commitsAnalyzed: data.commitsAnalyzed,
      imports: deps.out,
      importedBy: deps.in,
    });
    const f = this.city.focused;
    if (f && !b.path.startsWith(f.path + '/')) this.city.focusDir(null);
    this.applyInset();
    await this.rig.fly(this.rig.viewForBuilding(b), 1.15);
  }

  /** Open a folder: fly in, dim the rest of the city and show its summary. */
  async openDir(d: DirNode): Promise<void> {
    if (!d.path) return this.closePanel();
    const data = this.city.data!;
    const files = this.city.layout!.buildings.filter((b) => b.path.startsWith(d.path + '/'));
    this.city.setSelected(null);
    this.city.focusDir(d);
    this.rig.save();
    this.panel.showDir(d, { ref: data.ref, files, churn: data.churn, commitsAnalyzed: data.commitsAnalyzed });
    this.applyInset();
    await this.rig.fly(this.rig.viewForDir(d, this.city.layout!.maxH * 0.5), 1.2);
  }

  /** Double-tap: fly into a district without opening the panel. */
  private async zoomInto(d: DirNode | null): Promise<void> {
    if (!d || !this.city.layout) return;
    if (!d.path || d === this.city.focused) {
      // double-tapping the root, or the district you're in, steps back out
      this.city.focusDir(d?.parent ?? null);
      return void this.rig.fly(d?.parent && d.parent.path ? this.rig.viewForDir(d.parent, this.city.layout.maxH * 0.5) : this.homeView(), 1.1);
    }
    this.city.focusDir(d);
    await this.rig.flyToDir(d, this.city.layout.maxH * 0.5);
  }

  private pickCrumb(d: DirNode): void {
    if (!d.path) return this.goHome();
    this.city.focusDir(d);
    void this.rig.fly(this.rig.viewForDir(d, this.city.layout!.maxH * 0.5), 1.1);
  }

  private homeView() {
    return { target: this.city.home.target.clone(), position: this.city.home.position.clone() };
  }

  goHome(): void {
    this.closePanel(false);
    this.city.focusDir(null);
    this.rig.forgetSaved();
    void this.rig.fly(this.homeView(), 1.2);
  }

  /** Close the panel; the camera eases back to where it was before anything was opened. */
  closePanel(restore = true): void {
    const wasOpen = this.panel.isOpen;
    this.panel.hide();
    this.city.setSelected(null);
    this.city.focusDir(null);
    this.applyInset();
    if (restore && (wasOpen || this.rig.hasSaved)) void this.rig.restore(1.1);
  }

  private resetSelection(): void {
    this.panel.hide();
    this.rig.forgetSaved();
    this.world.shift.x = this.world.shift.y = 0;
    this.tooltip.hide();
  }

  /** Slide the viewport centre so the focused thing isn't hidden behind the panel. */
  private applyInset(): void {
    // panel animates in; measure on next frame so offsetWidth/Height are final
    requestAnimationFrame(() => {
      const inset = this.panel.inset;
      gsap.to(this.world.shift, { x: inset.x / 2, y: inset.y / 2, duration: dur(0.7), ease: 'power3.out' });
    });
  }

  private navigateTo(x: number, z: number, drag: boolean): void {
    const { controls, camera } = this.world;
    this.rig.stop();
    const dx = x - controls.target.x;
    const dz = z - controls.target.z;
    const apply = (k: number, ax: number, az: number) => {
      controls.target.x += ax * k;
      controls.target.z += az * k;
      camera.position.x += ax * k;
      camera.position.z += az * k;
    };
    if (drag) return apply(1, dx, dz);
    const p = { k: 0 };
    let last = 0;
    gsap.to(p, { k: 1, duration: dur(0.5), ease: 'power3.out', onUpdate: () => { apply(p.k - last, dx, dz); last = p.k; } });
  }

  // ----------------------------------------------------------------- per frame

  private frame(dt: number): void {
    if (!this.active) return;
    this.minimap.update();
    this.updateTooltip();
    this.crumbClock += dt;
    if (this.crumbClock > 0.15) {
      this.crumbClock = 0;
      this.updateCrumbs();
    }
  }

  private updateTooltip(): void {
    const b = this.panel.isOpen ? null : this.city.hovered ?? this.city.selected;
    if (!b) return this.tooltip.hide();
    const data = this.city.data!;
    this.tooltip.show(b, data.churn[b.path], data.commitsAnalyzed);
    const lift = this.city.hovered === b || this.city.selected === b ? 0.7 : 0;
    this.proj.set(b.x, b.y + b.h + lift, b.z).project(this.world.camera);
    const el = this.world.canvas;
    this.tooltip.place((this.proj.x * 0.5 + 0.5) * el.clientWidth, (-this.proj.y * 0.5 + 0.5) * el.clientHeight);
  }

  /** Current district: the focused one, else the deepest that fills most of the screen. */
  private updateCrumbs(): void {
    const L = this.city.layout;
    if (!L) return;
    let node: DirNode;
    if (this.city.focused) node = this.city.focused;
    else {
      const { camera, controls, canvas } = this.world;
      const dist = camera.position.distanceTo(controls.target);
      const px = (canvas.clientHeight / 2 / Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, dist);
      node = L.root;
      for (;;) {
        const next = node.dirs.find((c) => controls.target.x >= c.x && controls.target.x <= c.x + c.w && controls.target.z >= c.z && controls.target.z <= c.z + c.d);
        if (!next || Math.max(next.w, next.d) * px < Math.min(canvas.clientWidth, canvas.clientHeight) * 0.7) break;
        node = next;
      }
    }
    const chain: DirNode[] = [];
    for (let n: DirNode | null = node; n; n = n.parent) chain.unshift(n);
    this.crumbs.update(chain, repoName(this.city.data!.ref));
  }

  // ------------------------------------------------------------------ keyboard

  private keydown(e: KeyboardEvent): void {
    const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (this.active) this.search.isOpen ? this.search.close() : this.search.open();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !this.active) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      if (this.shortcuts.isOpen) this.shortcuts.close();
      else if (this.panel.isOpen || this.rig.hasSaved) this.closePanel();
      else if (this.city.focused) this.zoomInto(this.city.focused);
      else if (this.city.selected) this.city.setSelected(null);
      return;
    }
    if (e.key === '?') return this.shortcuts.toggle();
    if (this.modes.setKey(e.key)) return;
    const sel = this.city.selected;
    if (e.key === 'h' || e.key === 'H') this.goHome();
    else if (e.key === 'Enter' && sel && !this.panel.isOpen && (e.target as HTMLElement).tagName === 'CANVAS') void this.openFile(sel);
    else if ((e.key === 'o' || e.key === 'O') && sel) window.open(githubUrl(this.city.data!.ref, sel.path, false), '_blank', 'noopener');
  }
}
