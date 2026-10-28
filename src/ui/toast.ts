import { dur, gsap } from '../motion.ts';
import { h } from './dom.ts';

let host: HTMLElement | null = null;

export function toast(message: string, ms = 3600): void {
  host ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: 'toast', text: message });
  host.append(el);
  gsap.fromTo(el, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: dur(0.4), ease: 'power3.out' });
  gsap.to(el, {
    opacity: 0,
    y: -6,
    duration: dur(0.35),
    delay: ms / 1000,
    ease: 'power2.in',
    onComplete: () => el.remove(),
  });
}
