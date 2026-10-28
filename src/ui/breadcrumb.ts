import type { DirNode } from '../layout/treemap.ts';
import { dur, gsap } from '../motion.ts';
import { h } from './dom.ts';

/** `repo › packages › vite › src` with crumbs that slide in and out as the district changes. */
export class Breadcrumb {
  readonly el = h('nav', { class: 'crumbs', 'aria-label': 'Current district' });
  private items = new Map<string, HTMLElement>();
  private key = '';

  constructor(private onPick: (d: DirNode) => void) {}

  update(chain: DirNode[], repoName: string): void {
    const key = chain.map((d) => d.path).join('|') + '#' + repoName;
    if (key === this.key) return;
    this.key = key;
    const wanted = new Set(chain.map((d) => d.path));

    for (const [path, el] of this.items) {
      if (wanted.has(path)) continue;
      this.items.delete(path);
      gsap.to(el, { opacity: 0, x: -6, duration: dur(0.2), ease: 'power2.in', onComplete: () => el.remove() });
    }
    chain.forEach((d, i) => {
      let el = this.items.get(d.path);
      const label = i === 0 ? repoName.split('/').pop()! : d.name.split('/').join(' / ');
      const last = i === chain.length - 1;
      if (!el) {
        el = h('span', { class: 'crumb' });
        this.items.set(d.path, el);
        el.append(h('button', { class: 'crumb-btn', type: 'button', onClick: () => this.onPick(d), text: label }));
        gsap.fromTo(el, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: dur(0.45), ease: 'power3.out' });
      }
      (el.firstElementChild as HTMLElement).textContent = label;
      el.firstElementChild!.setAttribute('aria-current', last ? 'location' : 'false');
      this.el.append(el); // re-appending keeps DOM order equal to chain order
    });
  }
}
