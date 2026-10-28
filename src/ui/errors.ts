import { FetchError } from '../types.ts';
import { h } from './dom.ts';

export interface ErrorActions {
  retry?: () => void;
  demo: () => void;
  settings: () => void;
}

const TITLES: Record<string, string> = {
  'invalid-url': 'That doesn’t look like a repo',
  'not-found': 'Repository not found',
  'rate-limit': 'GitHub’s rate limit is used up',
  auth: 'GitHub rejected your token',
  network: 'Can’t reach GitHub',
  empty: 'Nothing to map here',
  unknown: 'Something went sideways',
};

function resetText(at?: number): string {
  if (!at) return 'It resets within the hour.';
  const mins = Math.max(1, Math.ceil((at - Date.now()) / 60000));
  return `It resets in about ${mins} minute${mins === 1 ? '' : 's'}.`;
}

/** Centered, friendly error card with the next sensible actions. */
export class ErrorCard {
  private el = h('div', { class: 'error-card', role: 'alertdialog', 'aria-live': 'assertive', hidden: true });

  constructor(host: HTMLElement) {
    host.append(this.el);
  }

  show(err: unknown, actions: ErrorActions): void {
    const fe = err instanceof FetchError ? err : new FetchError('unknown', 'Something went wrong. Please try again.');
    const body = fe.kind === 'rate-limit' ? `${fe.message} ${resetText(fe.resetAt)} A free token lifts the limit to 5,000 per hour.` : fe.message;
    const buttons: HTMLElement[] = [];
    if (fe.kind === 'rate-limit' || fe.kind === 'auth') {
      buttons.push(h('button', { class: 'btn btn-primary', text: 'Add a token', onClick: () => (this.hide(), actions.settings()) }));
    } else if (actions.retry && fe.kind !== 'invalid-url') {
      buttons.push(h('button', { class: 'btn btn-primary', text: 'Try again', onClick: () => (this.hide(), actions.retry!()) }));
    }
    buttons.push(h('button', { class: 'btn', text: 'Explore the demo', onClick: () => (this.hide(), actions.demo()) }));
    buttons.push(h('button', { class: 'btn btn-ghost', text: 'Dismiss', onClick: () => this.hide() }));
    this.el.replaceChildren(
      h('h2', { text: TITLES[fe.kind] ?? TITLES.unknown }),
      h('p', { text: body }),
      h('div', { class: 'row' }, ...buttons),
    );
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('on'));
    (this.el.querySelector('button') as HTMLElement | null)?.focus();
  }

  hide(): void {
    this.el.classList.remove('on');
    this.el.hidden = true;
  }
}
