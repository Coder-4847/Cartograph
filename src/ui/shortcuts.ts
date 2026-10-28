import { dur, gsap } from '../motion.ts';
import { h } from './dom.ts';

const mac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const MOD = mac ? '⌘' : 'Ctrl';

const ROWS: [string[], string][] = [
  [[MOD, 'K'], 'Search files and folders'],
  [['1', '2', '3'], 'Overview · Churn · Hotspots'],
  [['Esc'], 'Close panel or search, camera eases back'],
  [['H'], 'Reset the camera'],
  [['↵'], 'Open details for the selected building'],
  [['O'], 'Open selection on GitHub'],
  [['←', '↑', '→', '↓'], 'Pan the camera'],
  [['?'], 'Toggle this overlay'],
];
const GESTURES: [string, string][] = [
  ['Drag', 'Orbit'],
  ['Scroll / pinch', 'Zoom'],
  ['Right-drag / two fingers', 'Pan'],
  ['Hover / tap', 'Lift building + tooltip'],
  ['Double-click / double-tap', 'Fly into a district'],
  ['Hold 0.6s', 'Open a building or folder'],
];

export class Shortcuts {
  private el = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts', hidden: true });
  private openState = false;

  constructor() {
    const kbd = (keys: string[]) => h('span', { class: 'keys' }, ...keys.map((k) => h('kbd', { text: k })));
    const card = h(
      'div',
      { class: 'overlay-card' },
      h('h2', { text: 'Keyboard & gestures' }),
      h('div', { class: 'sc-grid' },
        h('div', {}, h('h3', { text: 'Keyboard' }), ...ROWS.map(([k, t]) => h('div', { class: 'sc-row' }, kbd(k), h('span', { text: t })))),
        h('div', {}, h('h3', { text: 'Mouse & touch' }), ...GESTURES.map(([k, t]) => h('div', { class: 'sc-row' }, h('span', { class: 'sc-k', text: k }), h('span', { text: t })))),
      ),
      h('button', { class: 'btn', text: 'Close', onClick: () => this.close() }),
    );
    this.el.append(card);
    this.el.addEventListener('pointerdown', (e) => e.target === this.el && this.close());
    document.body.append(this.el);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  toggle(): void {
    this.openState ? this.close() : this.open();
  }

  open(): void {
    this.openState = true;
    this.el.hidden = false;
    gsap.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: dur(0.2) });
    gsap.fromTo(this.el.firstElementChild, { y: 10 }, { y: 0, duration: dur(0.4), ease: 'power3.out' });
    (this.el.querySelector('button') as HTMLElement).focus();
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    gsap.to(this.el, { opacity: 0, duration: dur(0.15), onComplete: () => { if (!this.openState) this.el.hidden = true; } });
  }
}
