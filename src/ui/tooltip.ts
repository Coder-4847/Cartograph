import type { Building } from '../layout/treemap.ts';
import type { ChurnInfo } from '../types.ts';
import { fmtAgo, fmtBytes, h, tailPath } from './dom.ts';

/** Callout anchored to the top of a building. Follows it as the camera moves. */
export class Tooltip {
  readonly el = h('div', { class: 'tip', role: 'tooltip', 'aria-hidden': 'true' });
  private dir = h('span', { class: 'tip-dir' });
  private name = h('b', { class: 'tip-name' });
  private meta = h('span', { class: 'tip-meta' });
  private change = h('span', { class: 'tip-change' });
  private shown: Building | null = null;

  constructor() {
    this.el.append(this.name, this.dir, this.meta, this.change);
    document.body.append(this.el);
  }

  show(b: Building, churn: ChurnInfo | undefined, commitsAnalyzed: number): void {
    if (this.shown !== b) {
      const i = b.path.lastIndexOf('/');
      this.dir.textContent = i >= 0 ? tailPath(b.path.slice(0, i), 52) : '/';
      this.name.textContent = b.name;
      this.meta.textContent = fmtBytes(b.size);
      this.shown = b;
    }
    this.change.textContent = churn
      ? `Changed ${fmtAgo(churn.last)} · ${churn.count} of last ${commitsAnalyzed} commits`
      : commitsAnalyzed
        ? `No change in last ${commitsAnalyzed} commits`
        : '';
    this.el.classList.add('on');
  }

  hide(): void {
    this.shown = null;
    this.el.classList.remove('on');
  }

  /** Position in CSS px; (x, y) is the anchor point above the building. */
  place(x: number, y: number): void {
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const px = Math.min(innerWidth - w / 2 - 8, Math.max(w / 2 + 8, x));
    const py = Math.max(hgt + 70, y);
    this.el.style.transform = `translate3d(${px.toFixed(1)}px, ${(py - 12).toFixed(1)}px, 0) translate(-50%, -100%)`;
  }
}
