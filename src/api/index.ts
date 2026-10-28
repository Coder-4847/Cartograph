import { getToken } from './cache.ts';
import { fetchTree, type FetchOpts } from './github.ts';
import type { RepoData, RepoRef } from '../types.ts';

export { parseRepo, repoName, githubUrl } from './repo.ts';
export { cacheClear, getToken, setToken } from './cache.ts';

/**
 * Loads everything the city needs for a repository. Stages are reported through
 * `opts.onProgress` so the skeleton loader can narrate them.
 */
export async function loadRepo(ref: RepoRef, opts: FetchOpts = {}): Promise<RepoData> {
  const o: FetchOpts = { token: getToken() || undefined, ...opts };
  const tree = await fetchTree(ref, o);
  return {
    ref,
    ...tree,
    churn: {},
    commitsAnalyzed: 0,
    deps: [],
    depsAnalyzed: 0,
    fetchedAt: Date.now(),
  };
}

/** Bundled dataset: lets the demo run with zero API calls. */
export async function loadSample(): Promise<RepoData> {
  const mod = await import('../data/sample.json');
  return { ...(mod.default as unknown as RepoData), sample: true };
}
