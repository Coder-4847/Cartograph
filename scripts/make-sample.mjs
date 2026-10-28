// Builds src/data/sample.json from a local checkout (default: ../vitejs/vite) so
// the landing-page demo needs no network. Run: npm run sample -- /path/to/clone
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const data = {
  ref: { owner: 'vitejs', repo: 'vite' },
  files,
  truncated: false,
  capped: 0,
  churn: {},
  commitsAnalyzed: 0,
  deps: [],
  depsAnalyzed: 0,
  fetchedAt: Date.now(),
};
writeFileSync(new URL('../src/data/sample.json', import.meta.url), JSON.stringify(data));
console.log(`sample.json: ${files.length} files`);
