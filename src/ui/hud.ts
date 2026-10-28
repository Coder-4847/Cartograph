import { githubUrl, repoName } from '../api/index.ts';
import type { RepoData } from '../types.ts';
import { h } from './dom.ts';

const GEAR =
  '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>';

/** Top bar: repo identity + live stats, dependency progress, and the settings/help buttons. */
export class Hud {
  readonly el: HTMLElement;
  readonly info: HTMLElement;
  private title = h('a', { class: 'repo-title', target: '_blank', rel: 'noopener noreferrer' });
  private stats = h('span', { class: 'repo-stats' });
  private note = h('span', { class: 'repo-note' });
  private pill = h('div', { class: 'deps-pill', hidden: true });
  private bar = h('i');
  private pillText = h('span');
  readonly actions = h('div', { class: 'hud-actions' });

  constructor(handlers: { settings: () => void; help: () => void; home?: () => void }) {
    this.pill.append(this.pillText, h('div', { class: 'deps-bar' }, this.bar));
    const info = (this.info = h('div', { class: 'repo-info' }, this.title, this.stats, this.note, this.pill));
    if (handlers.home) {
      const back = h('button', { class: 'icon-btn', 'aria-label': 'Back to start', title: 'Back to start', onClick: handlers.home });
      back.append(h('span', { text: '←', 'aria-hidden': 'true' }));
      this.el = h('header', { class: 'hud' }, back, info, this.actions);
    } else {
      this.el = h('header', { class: 'hud' }, info, this.actions);
    }
    const gear = h('button', { class: 'icon-btn', 'aria-label': 'Settings', title: 'Settings', onClick: handlers.settings });
    gear.innerHTML = GEAR;
    const help = h('button', { class: 'icon-btn', 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts (?)', onClick: handlers.help, text: '?' });
    this.actions.append(help, gear);
    this.el.hidden = true;
    document.body.append(this.el);
  }

  setRepo(data: RepoData): void {
    this.title.textContent = repoName(data.ref);
    this.title.setAttribute('href', githubUrl(data.ref, '', true));
    const parts = [`${data.files.length.toLocaleString()} files`];
    if (data.commitsAnalyzed) parts.push(`${data.commitsAnalyzed} recent commits`);
    if (data.deps.length) parts.push(`${data.deps.length.toLocaleString()} imports`);
    if (data.sample) parts.push('bundled sample');
    this.stats.textContent = parts.join(' · ');
    this.note.textContent = data.notes.join(' ');
    this.note.hidden = !data.notes.length;
  }

  setDepsProgress(done: number, total: number): void {
    this.pill.hidden = false;
    this.pillText.textContent = `Mapping imports ${done}/${total}`;
    this.bar.style.transform = `scaleX(${total ? done / total : 0})`;
  }

  endDeps(): void {
    this.pill.hidden = true;
  }
}
