import { githubUrl } from '../api/index.ts';
import { kindOf, type FileKind } from '../city/palette.ts';
import type { Building, DirNode } from '../layout/treemap.ts';
import type { ChurnInfo, RepoRef } from '../types.ts';
import { dur, gsap } from '../motion.ts';
import { fill, fmtAgo, fmtBytes, h, tailPath } from './dom.ts';

export interface FileInfo {
  ref: RepoRef;
  churn?: ChurnInfo;
  commitsAnalyzed: number;
  imports: Building[];
  importedBy: Building[];
}

export interface DirInfo {
  ref: RepoRef;
  files: Building[];
  churn: Record<string, ChurnInfo>;
  commitsAnalyzed: number;
}

export interface PanelHandlers {
  close: () => void;
  openFile: (b: Building) => void;
  openDir: (d: DirNode) => void;
}

const KIND_LABEL: Record<FileKind, string> = {
  code: 'Code',
  markup: 'Markup',
  docs: 'Docs',
  data: 'Data',
  asset: 'Assets',
  other: 'Other',
};

const isMobile = () => matchMedia('(max-width: 720px)').matches;

/** Side panel on desktop, bottom sheet on mobile (swipe the handle down to dismiss). */
export class Panel {
  readonly el = h('aside', { class: 'panel', role: 'complementary', 'aria-label': 'Details', hidden: true });
  private body = h('div', { class: 'panel-body' });
  private open = false;

  constructor(private handlers: PanelHandlers) {
    const grab = h('div', { class: 'panel-grab', 'aria-hidden': 'true' }, h('i'));
    const close = h('button', { class: 'icon-btn panel-close', 'aria-label': 'Close details', title: 'Close (Esc)', onClick: () => handlers.close(), text: '✕' });
    this.el.append(grab, close, this.body);
    this.swipe(grab);
    document.body.append(this.el);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Pixels of the viewport the panel covers, so the camera can re-centre the scene. */
  get inset(): { x: number; y: number } {
    if (!this.open) return { x: 0, y: 0 };
    return isMobile() ? { x: 0, y: this.el.offsetHeight } : { x: this.el.offsetWidth + 16, y: 0 };
  }

  private reveal(): void {
    if (this.open) {
      gsap.fromTo(this.body, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: dur(0.35), ease: 'power2.out' });
      return;
    }
    this.open = true;
    document.body.classList.add('panel-open');
    this.el.hidden = false;
    const mobile = isMobile();
    gsap.killTweensOf(this.el);
    gsap.fromTo(
      this.el,
      mobile ? { yPercent: 105, x: 0 } : { x: 40, opacity: 0, yPercent: 0 },
      { yPercent: 0, x: 0, opacity: 1, duration: dur(0.6), ease: 'power3.out' },
    );
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    document.body.classList.remove('panel-open');
    gsap.killTweensOf(this.el);
    gsap.to(this.el, {
      ...(isMobile() ? { yPercent: 110 } : { x: 40, opacity: 0 }),
      duration: dur(0.4),
      ease: 'power3.in',
      onComplete: () => {
        if (!this.open) this.el.hidden = true;
      },
    });
  }

  showFile(b: Building, info: FileInfo): void {
    const i = b.path.lastIndexOf('/');
    const list = (title: string, items: Building[]) =>
      items.length
        ? h(
            'section',
            { class: 'p-sec' },
            h('h3', {}, title, h('span', { class: 'count', text: String(items.length) })),
            h(
              'ul',
              { class: 'p-list' },
              ...items.slice(0, 8).map((x) =>
                h('li', {}, h('button', { class: 'p-link', onClick: () => this.handlers.openFile(x), title: x.path }, h('span', { text: x.name }), h('em', { text: tailPath(x.dir.path || '/', 26) }))),
              ),
              items.length > 8 ? h('li', { class: 'p-more', text: `+${items.length - 8} more` }) : null,
            ),
          )
        : null;

    fill(this.body,
      h('div', { class: 'p-kicker' }, h('span', { class: 'chip', text: b.ext || 'file' }), h('span', { text: 'File' })),
      h('h2', { class: 'p-title', text: b.name }),
      h(
        'button',
        { class: 'p-path', title: 'Open this folder', onClick: () => b.dir.parent && this.handlers.openDir(b.dir) },
        i >= 0 ? b.path.slice(0, i) : '/',
      ),
      h(
        'dl',
        { class: 'p-meta' },
        h('div', {}, h('dt', { text: 'Size' }), h('dd', { text: fmtBytes(b.size) })),
        h(
          'div',
          {},
          h('dt', { text: 'Last change' }),
          h('dd', { text: info.churn ? fmtAgo(info.churn.last) : info.commitsAnalyzed ? `Before last ${info.commitsAnalyzed} commits` : 'unknown' }),
        ),
        h('div', {}, h('dt', { text: 'Recent churn' }), h('dd', { text: info.commitsAnalyzed ? `${info.churn?.count ?? 0} of ${info.commitsAnalyzed}` : '—' })),
      ),
      info.churn?.message ? h('p', { class: 'p-commit', text: `“${info.churn.message}”` }) : null,
      h('a', { class: 'btn btn-primary p-cta', href: githubUrl(info.ref, b.path, false), target: '_blank', rel: 'noopener noreferrer' }, 'Open on GitHub ↗'),
      list('Imports', info.imports),
      list('Imported by', info.importedBy),
    );
    this.reveal();
  }

  showDir(d: DirNode, info: DirInfo): void {
    const kinds = new Map<FileKind, number>();
    for (const f of info.files) kinds.set(kindOf(f.ext), (kinds.get(kindOf(f.ext)) ?? 0) + f.size);
    const total = [...kinds.values()].reduce((a, b) => a + b, 0) || 1;
    const segs = [...kinds.entries()].sort((a, b) => b[1] - a[1]);
    const largest = [...info.files].sort((a, b) => b.size - a.size).slice(0, 5);
    const hottest = info.files.filter((f) => info.churn[f.path]).sort((a, b) => info.churn[b.path].count - info.churn[a.path].count).slice(0, 5);
    const fileList = (title: string, items: Building[], meta: (b: Building) => string) =>
      items.length
        ? h(
            'section',
            { class: 'p-sec' },
            h('h3', { text: title }),
            h('ul', { class: 'p-list' }, ...items.map((x) => h('li', {}, h('button', { class: 'p-link', onClick: () => this.handlers.openFile(x), title: x.path }, h('span', { text: x.name }), h('em', { text: meta(x) }))))),
          )
        : null;

    fill(this.body,
      h('div', { class: 'p-kicker' }, h('span', { class: 'chip', text: 'dir' }), h('span', { text: 'Folder' })),
      h('h2', { class: 'p-title', text: d.name || info.ref.repo }),
      h('button', { class: 'p-path', onClick: () => d.parent && this.handlers.openDir(d.parent), title: d.parent ? 'Open parent folder' : '' }, d.path || '/'),
      h(
        'dl',
        { class: 'p-meta' },
        h('div', {}, h('dt', { text: 'Files' }), h('dd', { text: d.fileCount.toLocaleString() })),
        h('div', {}, h('dt', { text: 'Total size' }), h('dd', { text: fmtBytes(d.totalSize) })),
        h('div', {}, h('dt', { text: 'Subfolders' }), h('dd', { text: d.dirs.length.toLocaleString() })),
      ),
      h(
        'div',
        { class: 'p-bar', role: 'img', 'aria-label': 'Composition by file type' },
        ...segs.map(([k, v]) => h('i', { class: `k-${k}`, style: `flex:${v / total}`, title: `${KIND_LABEL[k]} ${Math.round((v / total) * 100)}%` })),
      ),
      h('div', { class: 'p-legend' }, ...segs.slice(0, 4).map(([k, v]) => h('span', {}, h('i', { class: `k-${k}` }), `${KIND_LABEL[k]} ${Math.round((v / total) * 100)}%`))),
      h('a', { class: 'btn btn-primary p-cta', href: githubUrl(info.ref, d.path, true), target: '_blank', rel: 'noopener noreferrer' }, 'Open on GitHub ↗'),
      fileList('Largest files', largest, (b) => fmtBytes(b.size)),
      fileList('Most changed', hottest, (b) => `${info.churn[b.path].count}×`),
    );
    this.reveal();
  }

  /** Mobile: drag the grab handle downward to dismiss, with rubber-band feedback. */
  private swipe(grab: HTMLElement): void {
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let vy = 0;
    let dragging = false;
    grab.addEventListener('pointerdown', (e) => {
      if (!isMobile()) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = performance.now();
      grab.setPointerCapture(e.pointerId);
      gsap.killTweensOf(this.el);
    });
    grab.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = Math.max(0, e.clientY - startY);
      const now = performance.now();
      vy = (e.clientY - lastY) / Math.max(1, now - lastT);
      lastY = e.clientY;
      lastT = now;
      gsap.set(this.el, { y: dy });
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const dy = Math.max(0, lastY - startY);
      if (dy > 90 || vy > 0.6) {
        gsap.set(this.el, { y: 0 });
        this.handlers.close();
      } else gsap.to(this.el, { y: 0, duration: dur(0.35), ease: 'power3.out' });
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }
}
