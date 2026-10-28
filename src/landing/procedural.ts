import type { ChurnInfo, FileEntry, RepoData } from '../types.ts';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = 'core router store cache queue parser lexer render scene layout worker auth session theme config schema client server plugin hooks events stream codec bundle loader format utils types state sync index graph tree diff patch task timer logger metrics search filter sort paginate upload export import resolve compile transform emit'.split(' ');
const TREE: Record<string, { dirs: string[]; ext: string[]; hot: number }> = {
  'src/components': { dirs: ['ui', 'forms', 'charts', 'layout', 'modals'], ext: ['tsx', 'tsx', 'css'], hot: 0.28 },
  'src/store': { dirs: ['slices', 'selectors', 'middleware'], ext: ['ts'], hot: 0.65 },
  'src/api': { dirs: ['routes', 'clients', 'schemas'], ext: ['ts'], hot: 0.5 },
  'src/lib': { dirs: ['parse', 'format', 'math', 'net'], ext: ['ts', 'ts', 'js'], hot: 0.22 },
  'packages/core': { dirs: ['src', 'src/internal', 'src/plugins', 'tests'], ext: ['ts'], hot: 0.55 },
  'packages/cli': { dirs: ['src', 'src/commands', 'templates'], ext: ['ts', 'json'], hot: 0.1 },
  'packages/worker': { dirs: ['src', 'src/pool'], ext: ['ts'], hot: 0.3 },
  docs: { dirs: ['guide', 'api', 'recipes'], ext: ['md', 'md', 'png'], hot: 0.04 },
  tests: { dirs: ['unit', 'e2e', 'fixtures'], ext: ['ts', 'json'], hot: 0.18 },
  scripts: { dirs: ['build', 'release'], ext: ['mjs', 'sh'], hot: 0.06 },
  examples: { dirs: ['basic', 'ssr', 'dashboard', 'worker'], ext: ['tsx', 'ts', 'json', 'html'], hot: 0.05 },
};

/**
 * A believable but invented repository, used for the hero city and as the starting
 * point for the dive/morph transition. Deterministic for a given seed.
 */
export function generateHeroRepo(seed = 11): RepoData {
  const rand = rng(seed);
  const files: FileEntry[] = [];
  const churn: Record<string, ChurnInfo> = {};
  const now = Date.now();
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const seen = new Set<string>();

  for (const [root, spec] of Object.entries(TREE)) {
    const count = Math.round(40 + rand() * 90);
    for (let n = 0; n < count; n++) {
      const dir = `${root}/${pick(spec.dirs)}`;
      const ext = pick(spec.ext);
      const path = `${dir}/${pick(WORDS)}${rand() < 0.35 ? '-' + pick(WORDS) : ''}.${ext}`;
      if (seen.has(path)) continue;
      seen.add(path);
      // heavy-tailed sizes: mostly small, a few towers
      const size = Math.min(260_000, Math.round(Math.exp(6.2 + rand() * 2.6 + (rand() < 0.04 ? 2.6 : 0))));
      files.push({ path, size });
      if (rand() < spec.hot) {
        churn[path] = { count: 1 + Math.floor(Math.pow(rand(), 2) * 9), last: now - rand() * 6 * 86_400_000, message: 'Refactor and fix edge cases' };
      }
    }
  }
  for (const f of ['package.json', 'README.md', 'tsconfig.json', 'vite.config.ts', 'LICENSE', 'pnpm-lock.yaml']) {
    files.push({ path: f, size: f.endsWith('lock.yaml') ? 180_000 : 600 + Math.round(rand() * 5000) });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    ref: { owner: 'cartograph', repo: 'hero' },
    files,
    truncated: false,
    capped: 0,
    churn,
    commitsAnalyzed: 30,
    deps: [],
    depsAnalyzed: 0,
    notes: [],
    sample: true,
    fetchedAt: now,
  };
}
