export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or sha. Undefined means the default branch (HEAD). */
  ref?: string;
}

export interface FileEntry {
  path: string;
  size: number;
}

export interface ChurnInfo {
  /** Number of the analysed commits that touched this file. */
  count: number;
  /** Timestamp (ms) of the newest analysed commit touching this file. */
  last: number;
  message?: string;
  sha?: string;
}

export interface RepoData {
  ref: RepoRef;
  files: FileEntry[];
  /** GitHub truncated the tree (huge repo). */
  truncated: boolean;
  /** Files dropped to keep the city renderable. */
  capped: number;
  churn: Record<string, ChurnInfo>;
  commitsAnalyzed: number;
  /** [from, to] pairs of repo-relative file paths. */
  deps: [string, string][];
  depsAnalyzed: number;
  sample?: boolean;
  fetchedAt: number;
}

export type Stage = 'tree' | 'churn' | 'deps' | 'layout';

export interface Progress {
  stage: Stage;
  message: string;
  /** 0..1 within the stage, when known. */
  fraction?: number;
}

export type ProgressFn = (p: Progress) => void;

export type FetchErrorKind =
  | 'invalid-url'
  | 'not-found'
  | 'rate-limit'
  | 'auth'
  | 'network'
  | 'empty'
  | 'unknown';

export class FetchError extends Error {
  constructor(
    public kind: FetchErrorKind,
    message: string,
    public resetAt?: number,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}
