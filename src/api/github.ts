import { cacheGet, cacheSet } from './cache.ts';
import { repoKey } from './repo.ts';
import {
  FetchError,
  type FileEntry,
  type ProgressFn,
  type RepoData,
  type RepoRef,
} from '../types.ts';

const API = 'https://api.github.com';
/** Above this many files the city stops being legible; the biggest files win. */
export const MAX_FILES = 12000;

export interface FetchOpts {
  token?: string;
  signal?: AbortSignal;
  onProgress?: ProgressFn;
}

export async function ghJson<T>(path: string, opts: FetchOpts): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(API + path, { headers, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new FetchError('network', 'Couldn’t reach GitHub. Check your connection and try again.');
  }
  if (res.ok) return (await res.json()) as T;

  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000 || undefined;
  if (res.status === 429 || (res.status === 403 && remaining === '0')) {
    throw new FetchError('rate-limit', 'GitHub’s unauthenticated rate limit is used up.', reset);
  }
  if (res.status === 401) throw new FetchError('auth', 'GitHub rejected the access token in Settings.');
  if (res.status === 404 || res.status === 403) {
    throw new FetchError('not-found', 'Repository not found. It may be private, renamed, or the URL has a typo.');
  }
  if (res.status === 409) throw new FetchError('empty', 'This repository is empty.');
  throw new FetchError('unknown', `GitHub answered ${res.status}. Please try again in a moment.`);
}

interface TreeResponse {
  truncated: boolean;
  tree: { path: string; type: string; size?: number }[];
}

/** One recursive git-trees call: the whole folder/file structure with sizes. */
export async function fetchTree(
  ref: RepoRef,
  opts: FetchOpts,
): Promise<Pick<RepoData, 'files' | 'truncated' | 'capped'>> {
  const key = `tree:${repoKey(ref)}`;
  const hit = cacheGet<{ f: [string, number][]; t: boolean; c: number }>(key);
  if (hit) {
    return { files: hit.f.map(([path, size]) => ({ path, size })), truncated: hit.t, capped: hit.c };
  }
  opts.onProgress?.({ stage: 'tree', message: 'Reading repository structure…' });
  const res = await ghJson<TreeResponse>(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(ref.ref ?? 'HEAD')}?recursive=1`,
    opts,
  );
  let files: FileEntry[] = res.tree
    .filter((n) => n.type === 'blob')
    .map((n) => ({ path: n.path, size: n.size ?? 0 }));
  if (!files.length) throw new FetchError('empty', 'This repository has no files to map.');
  let capped = 0;
  if (files.length > MAX_FILES) {
    capped = files.length - MAX_FILES;
    files = files.sort((a, b) => b.size - a.size).slice(0, MAX_FILES);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  cacheSet(key, { f: files.map((f) => [f.path, f.size]), t: res.truncated, c: capped });
  return { files, truncated: res.truncated, capped };
}
