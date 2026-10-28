// Builds src/data/sample.json from a local git checkout so the landing demo needs no network.
//   git clone --depth 32 https://github.com/vitejs/vite ../vitejs/vite
//   npm run sample -- ../vitejs/vite
// Uses the same dependency parser as the app (src/api/deps.ts).
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeDeps } from '../src/api/deps.ts';

const dir = resolve(process.argv[2] ?? '../vitejs/vite');
const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

const files = git('ls-tree', '-r', '-l', 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [meta, path] = line.split('\t');
    const size = Number(meta.trim().split(/\s+/)[3]);
    return { path, size: Number.isFinite(size) ? size : 0 };
  })
  .sort((a, b) => (a.path < b.path ? -1 : 1));
const known = new Set(files.map((f) => f.path));

// churn: the last 30 commits, like the live app
const churn = {};
const log = git('log', '-n', '30', '--name-only', '--format=@@%H%x09%ct%x09%s').split('@@').filter(Boolean);
for (const entry of log) {
  const [head, ...paths] = entry.split('\n');
  const [sha, ct, ...msg] = head.split('\t');
  for (const p of paths.map((s) => s.trim()).filter(Boolean)) {
    if (!known.has(p)) continue;
    const c = (churn[p] ??= { count: 0, last: 0 });
    c.count++;
    const t = Number(ct) * 1000;
    if (t >= c.last) Object.assign(c, { last: t, sha, message: msg.join('\t').slice(0, 120) });
  }
}

const { deps, analyzed } = await analyzeDeps(files, async (p) => readFile(resolve(dir, p), 'utf8').catch(() => null));

const data = {
  ref: { owner: 'vitejs', repo: 'vite' },
  files,
  truncated: false,
  capped: 0,
  churn,
  commitsAnalyzed: log.length,
  deps,
  depsAnalyzed: analyzed,
  notes: [],
  fetchedAt: Date.now(),
};
await writeFile(new URL('../src/data/sample.json', import.meta.url), JSON.stringify(data));
console.log(`sample.json: ${files.length} files, ${Object.keys(churn).length} changed, ${deps.length} imports from ${analyzed} files`);
