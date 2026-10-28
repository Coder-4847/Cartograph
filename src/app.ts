import { loadDeps, loadRepo, loadSample, parseRepo } from './api/index.ts';
import { City } from './city/city.ts';
import { Interaction } from './city/interaction.ts';
import { World } from './city/world.ts';
import { FetchError, type RepoData, type RepoRef } from './types.ts';
import { ErrorCard } from './ui/errors.ts';
import { Hud } from './ui/hud.ts';
import { Loader } from './ui/loader.ts';
import { ModeControl } from './ui/modes.ts';
import { Settings } from './ui/settings.ts';
import { toast } from './ui/toast.ts';

/** Wires data -> city -> UI. The landing page (stage 5) drives it through `open`/`openDemo`. */
export class App {
  readonly world: World;
  readonly city: City;
  readonly loader: Loader;
  readonly hud: Hud;
  readonly modes: ModeControl;
  readonly errors: ErrorCard;
  readonly settings = new Settings();
  private depsAbort: AbortController | null = null;
  private job = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.world = new World(canvas);
    this.city = new City(this.world);
    this.loader = new Loader(document.body);
    this.errors = new ErrorCard(document.body);
    this.hud = new Hud({ settings: () => this.settings.open(), help: () => toast('Shortcuts arrive in the next step.') });
    this.modes = new ModeControl((m) => this.city.setMode(m));
    this.modes.el.hidden = true;
    document.body.append(this.modes.el);
    new Interaction(this.city);
    this.world.start();
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, dialog')) return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey) this.modes.setKey(e.key);
    });
  }

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
    this.loader.update({ stage: 'layout', message: 'Laying out the city…', fraction: 0.5 });
    this.city.setData(data);
    this.hud.setRepo(data);
    this.hud.show();
    this.modes.el.hidden = false;
    this.modes.layout();
    this.hud.endDeps();
    this.loader.hide();
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
}
