import { getToken } from './cache.ts';
import { fetchChurn } from './churn.ts';
import { fetchDeps } from './deps.ts';
import { fetchTree, type FetchOpts } from './github.ts';
import type { RepoData, RepoRef } from '../types.ts';

export { parseRepo, repoName, githubUrl } from './repo.ts';
export { cacheClear, getToken, setToken } from './cache.ts';

/**
 * Loads what the city needs to appear: structure and recent activity. Dependencies are slower
 * (hundreds of raw file downloads), so they are fetched separately by `loadDeps` and the city
 * shows up first.
 */
export async function loadRepo(ref: RepoRef, opts: FetchOpts = {}): Promise<RepoData> {
  const o: FetchOpts = { token: getToken() || undefined, ...opts };
  const tree = await fetchTree(ref, o);
  const known = new Set(tree.files.map((f) => f.path));
  const churn = await fetchChurn(ref, known, o);
  const notes: string[] = [];
  if (tree.truncated) notes.push('GitHub truncated this very large tree; the city shows part of the repository.');
  if (tree.capped) notes.push(`Showing the ${tree.files.length.toLocaleString()} largest files (${tree.capped.toLocaleString()} more omitted).`);
  if (churn.note) notes.push(churn.note);
  return {
    ref,
    ...tree,
    churn: churn.churn,
    commitsAnalyzed: churn.commitsAnalyzed,
    deps: [],
    depsAnalyzed: 0,
    notes,
    fetchedAt: Date.now(),
  };
}

/** Import graph for an already loaded repo. */
export async function loadDeps(data: RepoData, opts: Pick<FetchOpts, 'onProgress' | 'signal'> = {}) {
  return fetchDeps(data.ref, data.files, opts);
}

/** Bundled dataset: lets the demo run with zero API calls. */
export async function loadSample(): Promise<RepoData> {
  const mod = await import('../data/sample.json');
  return { ...(mod.default as unknown as RepoData), sample: true };
}
