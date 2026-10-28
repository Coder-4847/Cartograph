import { h } from './dom.ts';
import { dur, gsap } from '../motion.ts';

export type Mode = 'overview' | 'churn' | 'hotspots';

const MODES: { id: Mode; label: string; legend: string; key: string }[] = [
  { id: 'overview', label: 'Overview', legend: 'Height is file size · tint is recent change', key: '1' },
  { id: 'churn', label: 'Churn heatmap', legend: 'Brighter = touched by more of the last 30 commits', key: '2' },
  { id: 'hotspots', label: 'Hotspots', legend: 'Pulsing = large and frequently changed', key: '3' },
];

/** Segmented control (radiogroup) with a sliding thumb, plus a one-line legend. */
export class ModeControl {
  readonly el: HTMLElement;
  private thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  private btns: HTMLButtonElement[] = [];
  private legend = h('p', { class: 'legend' });
  private mode: Mode = 'overview';

  constructor(private onChange: (m: Mode) => void) {
    const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Visualization mode' }, this.thumb);
    for (const m of MODES) {
      const b = h('button', {
        type: 'button',
        role: 'radio',
        class: 'seg-btn',
        'data-mode': m.id,
        title: `${m.label} (${m.key})`,
        onClick: () => this.set(m.id),
        onKeydown: (e) => {
          const k = (e as KeyboardEvent).key;
          if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
          const i = MODES.findIndex((x) => x.id === this.mode) + (k === 'ArrowRight' ? 1 : -1);
          this.set(MODES[(i + MODES.length) % MODES.length].id);
          this.btns[(i + MODES.length) % MODES.length].focus();
        },
      }, m.label);
      this.btns.push(b);
      group.append(b);
    }
    this.el = h('div', { class: 'modes' }, group, this.legend);
    this.render(false);
    window.addEventListener('resize', () => this.render(false));
  }

  get current(): Mode {
    return this.mode;
  }

  set(mode: Mode, silent = false): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.render(true);
    if (!silent) this.onChange(mode);
  }

  /** Re-measure the thumb; call after the control becomes visible. */
  layout(): void {
    this.render(false);
  }

  cycle(): void {
    this.set(MODES[(MODES.findIndex((m) => m.id === this.mode) + 1) % MODES.length].id);
  }

  setKey(k: string): boolean {
    const m = MODES.find((x) => x.key === k);
    if (m) this.set(m.id);
    return !!m;
  }

  private render(animate: boolean): void {
    const i = MODES.findIndex((m) => m.id === this.mode);
    this.btns.forEach((b, j) => {
      b.setAttribute('aria-checked', String(i === j));
      b.tabIndex = i === j ? 0 : -1;
    });
    const b = this.btns[i];
    if (b.offsetWidth) {
      gsap.to(this.thumb, { x: b.offsetLeft, width: b.offsetWidth, duration: animate ? dur(0.45) : 0, ease: 'power3.out' });
    }
    if (this.legend.textContent !== MODES[i].legend) {
      if (animate) {
        gsap.to(this.legend, {
          opacity: 0, y: 4, duration: dur(0.12), onComplete: () => {
            this.legend.textContent = MODES[i].legend;
            gsap.to(this.legend, { opacity: 1, y: 0, duration: dur(0.25), ease: 'power2.out' });
          },
        });
      } else this.legend.textContent = MODES[i].legend;
    }
  }
}
