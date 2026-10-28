// Tiny localStorage cache with TTL and oldest-first eviction. Every access is
// wrapped: storage can be missing (Node, private windows) or full.

const PREFIX = 'cartograph:v1:';
export const DEFAULT_TTL = 60 * 60 * 1000;

interface Entry<T> {
  t: number;
  v: T;
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function cacheGet<T>(key: string, ttl = DEFAULT_TTL): T | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (Date.now() - e.t > ttl) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return e.v;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  const s = store();
  if (!s) return;
  const raw = JSON.stringify({ t: Date.now(), v: value } satisfies Entry<T>);
  if (raw.length > 2_500_000) return; // would crowd out everything else
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      s.setItem(PREFIX + key, raw);
      return;
    } catch {
      if (!evictOldest(s)) return;
    }
  }
}

function evictOldest(s: Storage): boolean {
  let oldestKey: string | null = null;
  let oldest = Infinity;
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || !k.startsWith(PREFIX) || k === PREFIX + 'token') continue;
    try {
      const t = (JSON.parse(s.getItem(k) ?? '{}') as Entry<unknown>).t ?? 0;
      if (t < oldest) {
        oldest = t;
        oldestKey = k;
      }
    } catch {
      oldestKey = k;
      break;
    }
  }
  if (!oldestKey) return false;
  s.removeItem(oldestKey);
  return true;
}

export function cacheClear(): number {
  const s = store();
  if (!s) return 0;
  const doomed: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(PREFIX) && k !== PREFIX + 'token') doomed.push(k);
  }
  doomed.forEach((k) => s.removeItem(k));
  return doomed.length;
}

// The token is deliberately kept outside the TTL/eviction logic.
export function getToken(): string {
  try {
    return store()?.getItem(PREFIX + 'token') ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  const s = store();
  if (!s) return;
  try {
    if (token) s.setItem(PREFIX + 'token', token.trim());
    else s.removeItem(PREFIX + 'token');
  } catch {
    /* ignore */
  }
}
