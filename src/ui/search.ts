import type { CityLayout, Building, DirNode } from '../layout/treemap.ts';
import type { ChurnInfo } from '../types.ts';
import { dur, gsap } from '../motion.ts';
import { fmtBytes, h, tailPath } from './dom.ts';

type Hit = { kind: 'file'; b: Building; score: number } | { kind: 'dir'; d: DirNode; score: number };

export interface SearchHandlers {
  pickFile: (b: Building) => void;
  pickDir: (d: DirNode) => void;
}

/** Score a path against a query: filename hits beat path hits beat loose subsequences. */
export function score(path: string, name: string, q: string[]): number {
  const lp = path.toLowerCase();
  const ln = name.toLowerCase();
  let total = 0;
  for (const t of q) {
    const inName = ln.indexOf(t);
    if (inName >= 0) total += 100 - Math.min(40, inName) + (ln.startsWith(t) ? 30 : 0) - Math.min(20, ln.length - t.length);
    else if (lp.includes(t)) total += 50 - Math.min(30, lp.indexOf(t) / 4);
    else {
      let i = 0;
      for (const c of lp) if (c === t[i]) i++;
      if (i < t.length) return 0;
      total += 10;
    }
  }
  return total;
}

/** Cmd/Ctrl+K palette. Picking a file flies the camera to it. */
export class Search {
  private dlg = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search files', hidden: true });
  private input = h('input', { class: 'palette-input', type: 'text', placeholder: 'Search files and folders…', 'aria-label': 'Search', autocomplete: 'off', spellcheck: false, role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list' });
  private list = h('ul', { class: 'palette-list', id: 'palette-list', role: 'listbox' });
  private hits: Hit[] = [];
  private active = 0;
  private layout: CityLayout | null = null;
  private churn: Record<string, ChurnInfo> = {};
  private openState = false;

  constructor(private handlers: SearchHandlers) {
    const card = h('div', { class: 'palette-card' }, this.input, this.list, h('div', { class: 'palette-foot' }, h('span', { text: '↑↓ navigate' }), h('span', { text: '↵ fly to' }), h('span', { text: 'esc close' })));
    this.dlg.append(card);
    this.dlg.addEventListener('pointerdown', (e) => {
      if (e.target === this.dlg) this.close();
    });
    this.input.addEventListener('input', () => this.run());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.choose(this.active);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
    document.body.append(this.dlg);
  }

  setData(layout: CityLayout, churn: Record<string, ChurnInfo>): void {
    this.layout = layout;
    this.churn = churn;
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    if (!this.layout || this.openState) return;
    this.openState = true;
    this.dlg.hidden = false;
    this.input.value = '';
    this.run();
    gsap.fromTo(this.dlg, { opacity: 0 }, { opacity: 1, duration: dur(0.18) });
    gsap.fromTo(this.dlg.firstElementChild, { y: -12, scale: 0.98 }, { y: 0, scale: 1, duration: dur(0.35), ease: 'power3.out' });
    this.input.focus();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    gsap.to(this.dlg, { opacity: 0, duration: dur(0.15), onComplete: () => { if (!this.openState) this.dlg.hidden = true; } });
  }

  private run(): void {
    const L = this.layout;
    if (!L) return;
    const q = this.input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let hits: Hit[];
    if (!q.length) {
      // suggestions: what changed most, then the biggest files
      const changed = L.buildings.filter((b) => this.churn[b.path]).sort((a, b) => this.churn[b.path].count - this.churn[a.path].count || b.size - a.size);
      const big = [...L.buildings].sort((a, b) => b.size - a.size);
      const seen = new Set<Building>();
      hits = [];
      for (const b of [...changed.slice(0, 6), ...big.slice(0, 6)]) if (!seen.has(b)) (seen.add(b), hits.push({ kind: 'file', b, score: 0 }));
    } else {
      const found: Hit[] = [];
      for (const b of L.buildings) {
        const s = score(b.path, b.name, q);
        if (s > 0) found.push({ kind: 'file', b, score: s });
      }
      for (const d of L.dirs) {
        if (!d.path) continue;
        const s = score(d.path, d.name.slice(d.name.lastIndexOf('/') + 1), q) * 0.8;
        if (s > 0) found.push({ kind: 'dir', d, score: s });
      }
      hits = found.sort((a, b) => b.score - a.score).slice(0, 40);
    }
    this.hits = hits;
    this.active = 0;
    this.render(q);
  }

  private render(q: string[]): void {
    const mark = (text: string) => {
      const frag = document.createDocumentFragment();
      const t = q.find((x) => text.toLowerCase().includes(x));
      if (!t) return text;
      const i = text.toLowerCase().indexOf(t);
      frag.append(text.slice(0, i), h('mark', { text: text.slice(i, i + t.length) }), text.slice(i + t.length));
      return frag;
    };
    this.list.replaceChildren(
      ...(this.hits.length
        ? this.hits.map((hit, i) => {
            const isFile = hit.kind === 'file';
            const path = isFile ? hit.b.path : hit.d.path;
            const slash = path.lastIndexOf('/');
            const li = h(
              'li',
              { class: 'palette-item', role: 'option', 'aria-selected': String(i === this.active), id: `pal-${i}`, onPointerenter: () => this.setActive(i), onClick: () => this.choose(i) },
              h('span', { class: 'chip', text: isFile ? hit.b.ext || 'file' : 'dir' }),
              h('span', { class: 'pi-name' }, mark(isFile ? hit.b.name : path.slice(slash + 1))),
              h('span', { class: 'pi-path' }, slash >= 0 ? tailPath(path.slice(0, slash), 48) : ''),
              h('span', { class: 'pi-meta', text: isFile ? fmtBytes(hit.b.size) : `${hit.d.fileCount} files` }),
            );
            return li;
          })
        : [h('li', { class: 'palette-empty', text: 'No matching files' })]),
    );
    this.input.setAttribute('aria-activedescendant', `pal-${this.active}`);
  }

  private setActive(i: number): void {
    this.active = i;
    this.list.querySelectorAll('.palette-item').forEach((el, j) => el.setAttribute('aria-selected', String(i === j)));
    this.input.setAttribute('aria-activedescendant', `pal-${i}`);
  }

  private move(delta: number): void {
    if (!this.hits.length) return;
    this.setActive((this.active + delta + this.hits.length) % this.hits.length);
    this.list.children[this.active]?.scrollIntoView({ block: 'nearest' });
  }

  private choose(i: number): void {
    const hit = this.hits[i];
    if (!hit) return;
    this.close();
    if (hit.kind === 'file') this.handlers.pickFile(hit.b);
    else this.handlers.pickDir(hit.d);
  }
}
