import { FetchError, type RepoRef } from '../types.ts';

const SEG = /^[A-Za-z0-9._-]+$/;

/** Accepts `owner/repo`, github.com URLs (incl. /tree/<branch>) and git URLs. */
export function parseRepo(input: string): RepoRef {
  let s = input.trim();
  if (!s) throw new FetchError('invalid-url', 'Paste a GitHub repository URL, like github.com/vitejs/vite.');
  s = s.replace(/^git@github\.com:/i, 'github.com/').replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/^github\.com\//i, '').replace(/[?#].*$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const [owner, repo, kind, ...rest] = s.split('/');
  if (!owner || !repo || !SEG.test(owner) || !SEG.test(repo)) {
    throw new FetchError('invalid-url', `“${input.trim()}” doesn’t look like a GitHub repository. Try owner/repo.`);
  }
  const ref = kind === 'tree' && rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  return { owner, repo: repo.replace(/\.git$/i, ''), ref };
}

export const repoKey = (r: RepoRef) => `${r.owner}/${r.repo}@${r.ref ?? 'HEAD'}`.toLowerCase();
export const repoName = (r: RepoRef) => `${r.owner}/${r.repo}`;

/** Deep link to a file or folder on github.com. */
export function githubUrl(r: RepoRef, path: string, isDir: boolean): string {
  const base = `https://github.com/${r.owner}/${r.repo}`;
  if (!path) return r.ref ? `${base}/tree/${encodeURI(r.ref)}` : base;
  return `${base}/${isDir ? 'tree' : 'blob'}/${encodeURI(r.ref ?? 'HEAD')}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function rawUrl(r: RepoRef, path: string): string {
  return `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${encodeURI(r.ref ?? 'HEAD')}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
