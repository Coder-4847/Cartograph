import { cacheGet, cacheSet } from './cache.ts';
import { ghJson, type FetchOpts } from './github.ts';
import { pool } from './pool.ts';
import { repoKey } from './repo.ts';
import { FetchError, type ChurnInfo, type RepoRef } from '../types.ts';

export const CHURN_COMMITS = 30;

interface CommitListItem {
  sha: string;
  commit: { message: string; committer?: { date: string }; author?: { date: string } };
}
interface CommitDetail {
  files?: { filename: string; previous_filename?: string }[];
}

export interface ChurnResult {
  churn: Record<string, ChurnInfo>;
  commitsAnalyzed: number;
  note?: string;
}

/**
 * Approximates "how often does this file change" from the details of the last 30 commits:
 * 1 list call + up to 30 detail calls. Rate limits degrade to partial data instead of failing.
 */
export async function fetchChurn(ref: RepoRef, known: Set<string>, opts: FetchOpts): Promise<ChurnResult> {
  const key = `churn:${repoKey(ref)}`;
  const hit = cacheGet<ChurnResult>(key);
  if (hit) return hit;

  const report = (done: number, total: number) =>
    opts.onProgress?.({
      stage: 'churn',
      message: total ? `Reading recent commits (${done}/${total})…` : 'Listing recent commits…',
      fraction: total ? done / total : 0,
    });
  report(0, 0);

  let list: CommitListItem[];
  try {
    const q = ref.ref ? `&sha=${encodeURIComponent(ref.ref)}` : '';
    list = await ghJson<CommitListItem[]>(`/repos/${ref.owner}/${ref.repo}/commits?per_page=${CHURN_COMMITS}${q}`, opts);
  } catch (e) {
    if (e instanceof FetchError && (e.kind === 'rate-limit' || e.kind === 'network')) {
      return { churn: {}, commitsAnalyzed: 0, note: 'Change activity unavailable: GitHub rate limit reached. Add a token in Settings.' };
    }
    throw e;
  }

  const churn: Record<string, ChurnInfo> = {};
  let done = 0;
  let limited = false;
  const dates = list.map((c) => Date.parse(c.commit.committer?.date ?? c.commit.author?.date ?? '') || 0);

  await pool(
    list,
    6,
    async (c, i) => {
      try {
        const detail = await ghJson<CommitDetail>(`/repos/${ref.owner}/${ref.repo}/commits/${c.sha}`, opts);
        for (const f of detail.files ?? []) {
          if (!known.has(f.filename)) continue;
          const cur = churn[f.filename] ?? (churn[f.filename] = { count: 0, last: 0 });
          cur.count++;
          if (dates[i] >= cur.last) {
            cur.last = dates[i];
            cur.sha = c.sha;
            cur.message = c.commit.message.split('\n')[0].slice(0, 120);
          }
        }
        done++;
      } catch (e) {
        if (e instanceof FetchError && e.kind === 'rate-limit') limited = true;
      }
      report(done, list.length);
    },
    () => limited,
  );

  const result: ChurnResult = {
    churn,
    commitsAnalyzed: done,
    note: limited
      ? `Change activity is partial (${done} of ${list.length} commits) because GitHub’s rate limit was reached.`
      : undefined,
  };
  if (!limited) cacheSet(key, result);
  return result;
}
