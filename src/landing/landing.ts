import * as THREE from 'three';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { parseRepo } from '../api/index.ts';
import type { App, Router } from '../app.ts';
import { dur, gsap, reducedMotion } from '../motion.ts';
import { FetchError, type RepoRef } from '../types.ts';
import { BASE_FOV } from '../city/world.ts';
import { generateHeroRepo } from './procedural.ts';

gsap.registerPlugin(ScrollTrigger);

type Phase = 'landing' | 'diving' | 'app';
type View = { position: THREE.Vector3; target: THREE.Vector3 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The landing experience: a procedural city orbiting behind the hero, scroll choreography
 * (GSAP ScrollTrigger), and the dive-and-morph transition into a real repository.
 */
export class Landing implements Router {
  private phase: Phase = 'landing';
  private heroView: View = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private root = document.getElementById('landing')!;
  private veil = document.querySelector<HTMLElement>('.veil')!;
  // scroll-driven look of the shared 3D scene
  private look = { dim: 1, veil: 1, shiftX: 0, shiftY: 0, zoom: 1, mode: 0, hot: 0.4 };
  private triggers: ScrollTrigger[] = [];
  private mm = window.matchMedia('(max-width: 900px)');

  constructor(private app: App) {}

  init(): void {
    const { app } = this;
    app.router = this;
    app.setChrome(false);
    document.body.classList.remove('in-app');
    const hero = generateHeroRepo();
    app.city.setData(hero, { tweakHome: (home) => this.placeHero(home) });
    this.heroView = { position: app.city.home.position.clone(), target: app.city.home.target.clone() };
    this.enterOrbit();
    this.apply();

    this.bindForms();
    if (!reducedMotion()) this.scroll();
    else document.getElementById('hotspots')?.classList.remove('is-pinned');
    this.mm.addEventListener('change', () => this.apply());

    const q = new URLSearchParams(location.search);
    const repo = q.get('repo');
    if (repo) window.setTimeout(() => this.go(repo), 900);
    else if (q.has('demo')) window.setTimeout(() => this.go(null), 900);
  }

  // ------------------------------------------------------------------ hero look

  /** A lower, wider angle than the in-app default, so the skyline reads behind the headline. */
  private placeHero(home: App['city']['home']): void {
    const mobile = this.mm.matches;
    home.position.y *= mobile ? 0.8 : 0.55;
    home.position.multiplyScalar(mobile ? 0.95 : 0.84);
  }

  private enterOrbit(): void {
    const { controls, camera } = this.app.world;
    controls.enabled = false;
    controls.autoRotate = !reducedMotion();
    controls.autoRotateSpeed = 0.5;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
  }

  /** Pushes `look` into the renderer. Cheap enough to call on every scroll tick. */
  private apply(): void {
    const { app, look } = this;
    const { world, city } = app;
    const w = innerWidth;
    const h = innerHeight;
    const mobile = this.mm.matches;
    world.canvas.style.opacity = String(look.dim);
    this.veil.style.opacity = String(look.veil);
    world.shift.x = mobile ? 0 : look.shiftX * w;
    world.shift.y = mobile ? look.shiftY * h : 0;
    // the hero city sits right of the headline on desktop, above it on phones
    if (this.phase === 'landing') {
      world.shift.x += mobile ? 0 : -0.17 * w;
      world.shift.y += mobile ? 0.16 * h : 0;
    }
    if (world.camera.zoom !== look.zoom) {
      world.camera.zoom = look.zoom;
      world.camera.updateProjectionMatrix();
    }
    city.buildings.uniforms.uMode.value = look.mode;
    city.buildings.uniforms.uHot.value = look.hot;
  }

  // ----------------------------------------------------------------- scrolling

  private scroll(): void {
    const set = (vars: Partial<Landing['look']>, trigger: string, start: string, end: string) => {
      const t = gsap.to(this.look, {
        ...vars,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger, start, end, scrub: 0.6 },
        onUpdate: () => this.apply(),
      });
      this.triggers.push(t.scrollTrigger!);
    };
    // hero -> how/features: the city recedes so text stays legible
    set({ dim: 0.2 }, '#how', 'top bottom', 'top 30%');
    // hotspot section: bring it back, slide it right, push in
    set({ dim: 1, veil: 0.15, shiftX: -0.17, shiftY: 0.2, zoom: 1.18 }, '#hotspots', 'top 85%', 'top top');
    // after it: fade away again for the call to action
    set({ dim: 0.28, veil: 1, shiftX: 0, shiftY: 0, zoom: 1, mode: 0, hot: 0.4 }, '.cta', 'top bottom', 'top 35%');

    const caps = [...document.querySelectorAll<HTMLElement>('.cap')];
    const dots = [...document.querySelectorAll<HTMLElement>('.dots i')];
    const hot = document.getElementById('hotspots')!;
    hot.classList.add('is-pinned');
    const pin = ScrollTrigger.create({
      trigger: hot,
      start: 'top top',
      end: '+=240%',
      pin: '.hot-stage',
      scrub: true,
      onUpdate: (self) => {
        const p = self.progress;
        // 0-.2 overview, .2-.4 -> churn, .4-.6 churn, .6-.8 -> hotspots, .8-1 hold
        this.look.mode = smooth(0.2, 0.4, p) + smooth(0.6, 0.8, p);
        this.look.hot = 0.4 + 0.6 * smooth(0.6, 0.8, p);
        const weight = [1 - smooth(0.25, 0.4, p), smooth(0.25, 0.4, p) * (1 - smooth(0.6, 0.75, p)), smooth(0.6, 0.75, p)];
        caps.forEach((el, i) => {
          el.style.opacity = String(weight[i]);
          el.style.transform = `translateY(${(1 - weight[i]) * 14}px)`;
          el.style.pointerEvents = weight[i] > 0.5 ? 'auto' : 'none';
        });
        const active = weight.indexOf(Math.max(...weight));
        dots.forEach((d, i) => d.classList.toggle('on', i === active));
        this.apply();
      },
    });
    this.triggers.push(pin);

    // reveal-on-scroll for cards
    gsap.utils.toArray<HTMLElement>('.step, .card').forEach((el, i) => {
      gsap.from(el, { opacity: 0, y: 28, duration: 0.8, ease: 'power3.out', delay: (i % 3) * 0.08, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    gsap.from('.hero-copy > *', { opacity: 0, y: 22, duration: 1, ease: 'power3.out', stagger: 0.09, delay: 0.25 });
  }

  private killScroll(): void {
    this.triggers.forEach((t) => t.kill());
    this.triggers = [];
    document.getElementById('hotspots')?.classList.remove('is-pinned');
    document.querySelectorAll<HTMLElement>('.cap').forEach((el) => el.removeAttribute('style'));
  }

  // --------------------------------------------------------------------- forms

  private bindForms(): void {
    document.querySelectorAll<HTMLFormElement>('[data-repo-form]').forEach((form) => {
      const input = form.querySelector<HTMLInputElement>('input')!;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.go(input.value, form);
      });
      form.querySelector('[data-demo]')?.addEventListener('click', () => this.go(null));
      input.addEventListener('input', () => this.formError(form, ''));
    });
    document.querySelector('[data-settings]')?.addEventListener('click', () => this.app.settings.open());
    document.querySelectorAll<HTMLElement>('[data-repo]').forEach((b) =>
      b.addEventListener('click', () => this.go(b.dataset.repo!)),
    );
  }

  private formError(form: HTMLFormElement | null, msg: string): void {
    const el = form?.nextElementSibling as HTMLElement | null;
    if (!el?.matches('[data-form-error]')) return;
    el.textContent = msg;
    el.hidden = !msg;
    if (msg) gsap.fromTo(form!.querySelector('input'), { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.35)' });
  }

  // ------------------------------------------------------------------ transition

  /** Router: start a visit. `null` opens the bundled sample. */
  go(input: string | RepoRef | null, form: HTMLFormElement | null = null): void {
    if (this.phase === 'diving') return;
    let ref: RepoRef | null = null;
    if (input !== null) {
      try {
        ref = typeof input === 'string' ? parseRepo(input) : input;
      } catch (e) {
        this.formError(form, e instanceof FetchError ? e.message : 'Enter a GitHub repository.');
        if (!form) document.querySelector<HTMLInputElement>('#repo-input')?.focus();
        return;
      }
    }
    void this.dive(ref);
  }

  private async dive(ref: RepoRef | null): Promise<void> {
    const { app } = this;
    const { world } = app;
    this.phase = 'diving';
    document.body.classList.add('diving');
    app.errors.hide();
    this.killScroll();

    // landing copy out, scene fully visible
    await gsap.to(this.root, { opacity: 0, duration: dur(0.45), ease: 'power2.out' }).then();
    this.root.style.visibility = 'hidden';
    window.scrollTo(0, 0);
    Object.assign(this.look, { dim: 1, shiftX: 0, shiftY: 0, zoom: 1, mode: 0 });
    gsap.to(this.look, { veil: 0, hot: 0.4, duration: dur(0.6), onUpdate: () => this.apply() });
    this.phase = 'diving';
    this.apply();
    gsap.to(world.shift, { x: 0, y: 0, duration: dur(0.8), ease: 'power3.out' });
    world.controls.autoRotate = false;

    // dive: plunge toward the tallest tower near the middle of the hero city
    const dive = this.plunge();
    const opts = { morph: true, loader: 'clear' as const, beforePresent: () => dive };
    const ok = ref ? await app.open(ref, opts) : await app.openDemo(opts);

    if (ok) {
      this.phase = 'app';
      document.body.classList.remove('diving');
      document.body.classList.add('in-app');
      this.root.style.visibility = '';
      this.root.style.opacity = '';
      const url = new URL(location.href);
      url.search = ref ? `?repo=${ref.owner}/${ref.repo}${ref.ref ? `/tree/${ref.ref}` : ''}` : '?demo';
      history.replaceState(null, '', url);
      gsap.to(world.camera, { fov: BASE_FOV, duration: dur(1.8), ease: 'power2.inOut', onUpdate: () => world.camera.updateProjectionMatrix() });
    } else {
      await this.retreat();
    }
  }

  /** Camera plunge into the hero city; resolves when it arrives. */
  private plunge(): Promise<void> {
    const { world, city, rig } = this.app;
    const L = city.layout!;
    const reach = Math.max(L.width, L.depth) * 0.2;
    let best = L.buildings[0];
    for (const b of L.buildings) if (Math.hypot(b.x, b.z) < reach && b.h > best.h) best = b;
    const target = new THREE.Vector3(best.x, best.y + best.h * 0.45, best.z);
    const cur = new THREE.Spherical().setFromVector3(world.camera.position.clone().sub(world.controls.target));
    const pos = target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(Math.max(14, best.h * 1.6), 1.32, cur.theta + 0.7)));
    gsap.to(world.camera, { fov: 62, duration: dur(1.3), ease: 'power2.in', onUpdate: () => world.camera.updateProjectionMatrix() });
    return rig.fly({ target, position: pos }, 1.9).then(() => {
      // circle at street level while the data loads
      world.controls.autoRotate = !reducedMotion();
      world.controls.autoRotateSpeed = 2.4;
    });
  }

  private async retreat(): Promise<void> {
    const { world, rig } = this.app;
    this.phase = 'landing';
    world.controls.autoRotate = false;
    gsap.to(world.camera, { fov: BASE_FOV, duration: dur(1.2), onUpdate: () => world.camera.updateProjectionMatrix() });
    this.root.style.visibility = '';
    document.body.classList.remove('diving');
    await rig.fly(this.heroView, 1.6);
    this.restoreLanding();
  }

  private restoreLanding(): void {
    this.phase = 'landing';
    Object.assign(this.look, { dim: 1, veil: 1, shiftX: 0, shiftY: 0, zoom: 1, mode: 0, hot: 0.4 });
    this.enterOrbit();
    this.apply();
    gsap.fromTo(this.root, { opacity: 0 }, { opacity: 1, duration: dur(0.6), clearProps: 'opacity' });
    if (!reducedMotion()) this.scroll();
    ScrollTrigger.refresh();
  }

  /** Router: leave the app and return to the landing page. */
  home(): void {
    if (this.phase !== 'app') return;
    const { app } = this;
    const { world, city, rig } = app;
    app.setChrome(false);
    app.closePanel(false);
    city.focusDir(null);
    rig.forgetSaved();
    document.body.classList.remove('in-app');
    this.root.style.visibility = 'hidden';
    window.scrollTo(0, 0);
    history.replaceState(null, '', location.pathname);
    city.setData(generateHeroRepo(), { morph: true, camera: false, tweakHome: (h) => this.placeHero(h) });
    this.heroView = { position: city.home.position.clone(), target: city.home.target.clone() };
    world.controls.enabled = false;
    this.phase = 'diving';
    void rig.fly(this.heroView, 2.0).then(() => {
      this.root.style.visibility = '';
      this.restoreLanding();
    });
  }
}
