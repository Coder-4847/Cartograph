import type { Progress } from '../types.ts';

const STAGES: Progress['stage'][] = ['tree', 'churn', 'deps', 'layout'];
const LABELS: Record<Progress['stage'], string> = {
  tree: 'Structure',
  churn: 'Activity',
  deps: 'Dependencies',
  layout: 'City',
};

/** Skeleton overlay: shimmering blocks plus one line of progress per stage. */
export class Loader {
  private el = document.createElement('div');
  private msg = document.createElement('p');
  private steps: HTMLElement[] = [];
  private bar = document.createElement('i');

  constructor(host: HTMLElement) {
    this.el.className = 'loader';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
    const sky = document.createElement('div');
    sky.className = 'loader-sky';
    sky.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 14; i++) {
      const b = document.createElement('span');
      b.style.setProperty('--h', `${22 + ((i * 37) % 70)}%`);
      b.style.setProperty('--d', `${i * 70}ms`);
      sky.append(b);
    }
    const steps = document.createElement('ol');
    steps.className = 'loader-steps';
    for (const s of STAGES) {
      const li = document.createElement('li');
      li.textContent = LABELS[s];
      steps.append(li);
      this.steps.push(li);
    }
    const track = document.createElement('div');
    track.className = 'loader-track';
    track.append(this.bar);
    this.msg.className = 'loader-msg';
    this.el.append(sky, this.msg, track, steps);
    host.append(this.el);
  }

  show(message = 'Starting…'): void {
    this.el.hidden = false;
    this.el.classList.add('on');
    this.msg.textContent = message;
    this.bar.style.transform = 'scaleX(0)';
    this.steps.forEach((s) => s.removeAttribute('data-state'));
  }

  update(p: Progress): void {
    const idx = STAGES.indexOf(p.stage);
    this.msg.textContent = p.message;
    this.steps.forEach((s, i) => s.setAttribute('data-state', i < idx ? 'done' : i === idx ? 'active' : ''));
    const frac = (idx + (p.fraction ?? 0.35)) / STAGES.length;
    this.bar.style.transform = `scaleX(${Math.min(1, frac)})`;
  }

  hide(): void {
    this.el.classList.remove('on');
    window.setTimeout(() => {
      if (!this.el.classList.contains('on')) this.el.hidden = true;
    }, 400);
  }
}
