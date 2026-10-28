import { dur, gsap } from '../motion.ts';
import { svg } from './dom.ts';

const R = 22;
const C = 2 * Math.PI * R;
export const LONG_PRESS_MS = 600;
const RING_DELAY_MS = 140;

/** The progress ring that fills around the cursor/finger during a long-press. */
export class Ring {
  private el = svg(
    `<svg class="ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle class="ring-bg" cx="32" cy="32" r="${R}"/>
      <circle class="ring-fg" cx="32" cy="32" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 32 32)"/>
    </svg>`,
  );
  private fg = this.el.querySelector('.ring-fg') as SVGCircleElement;
  private tween: gsap.core.Tween | null = null;
  private delay = 0;

  constructor() {
    document.body.append(this.el);
  }

  /** Begin tracking a press at (x, y). Fills over the remainder of LONG_PRESS_MS. */
  start(x: number, y: number): void {
    this.cancel(true);
    this.el.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
    this.delay = window.setTimeout(() => {
      this.el.classList.add('on');
      const p = { v: 0 };
      this.tween = gsap.to(p, {
        v: 1,
        duration: (LONG_PRESS_MS - RING_DELAY_MS) / 1000,
        ease: 'none',
        onUpdate: () => this.fg.setAttribute('stroke-dashoffset', String(C * (1 - p.v))),
      });
    }, RING_DELAY_MS);
  }

  move(x: number, y: number): void {
    this.el.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
  }

  complete(): void {
    window.clearTimeout(this.delay);
    this.tween?.kill();
    this.fg.setAttribute('stroke-dashoffset', '0');
    gsap.fromTo(this.el, { scale: 1 }, { scale: 1.45, opacity: 0, duration: dur(0.4), ease: 'power2.out', onComplete: () => this.reset() });
  }

  cancel(immediate = false): void {
    window.clearTimeout(this.delay);
    this.tween?.kill();
    this.tween = null;
    if (immediate || !this.el.classList.contains('on')) return this.reset();
    gsap.to(this.el, { opacity: 0, duration: dur(0.15), onComplete: () => this.reset() });
  }

  private reset(): void {
    gsap.killTweensOf(this.el);
    gsap.set(this.el, { scale: 1, opacity: '' });
    this.el.classList.remove('on');
    this.fg.setAttribute('stroke-dashoffset', String(C));
  }
}
