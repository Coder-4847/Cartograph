import { cacheClear, getToken, setToken } from '../api/index.ts';
import { h } from './dom.ts';
import { toast } from './toast.ts';

/** Modal with the optional GitHub token and cache controls. */
export class Settings {
  private dlg = document.createElement('dialog');
  private input: HTMLInputElement;

  constructor() {
    this.dlg.className = 'modal';
    this.dlg.setAttribute('aria-label', 'Settings');
    this.input = h('input', {
      type: 'password',
      id: 'token-input',
      placeholder: 'github_pat_… or ghp_…',
      autocomplete: 'off',
      spellcheck: false,
    });
    const form = h(
      'form',
      {
        method: 'dialog',
        class: 'modal-body',
        onSubmit: () => {
          setToken(this.input.value);
          toast(this.input.value ? 'Token saved in this browser.' : 'Token removed.');
        },
      },
      h('h2', { text: 'Settings' }),
      h('label', { for: 'token-input', class: 'field-label', text: 'GitHub token (optional)' }),
      this.input,
      h(
        'p',
        { class: 'hint' },
        'Raises GitHub’s API limit from 60 to 5,000 requests per hour. It stays in this browser’s localStorage and is only ever sent to api.github.com. A fine-grained token with no permissions is enough for public repos.',
      ),
      h(
        'div',
        { class: 'row' },
        h('button', {
          type: 'button',
          class: 'btn',
          text: 'Clear cached data',
          onClick: () => toast(`Cleared ${cacheClear()} cached entries.`),
        }),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn', text: 'Cancel', onClick: () => this.dlg.close() }),
        h('button', { type: 'submit', class: 'btn btn-primary', text: 'Save' }),
      ),
    );
    this.dlg.append(form);
    this.dlg.addEventListener('click', (e) => {
      if (e.target === this.dlg) this.dlg.close();
    });
    document.body.append(this.dlg);
  }

  open(): void {
    this.input.value = getToken();
    this.dlg.showModal();
    this.input.focus();
  }
}
