import { cacheGet, cacheSet } from './cache.ts';
import { pool } from './pool.ts';
import { rawUrl, repoKey } from './repo.ts';
import type { FileEntry, ProgressFn, RepoRef } from '../types.ts';

export const MAX_DEP_FILES = 300;
export const DEP_CONCURRENCY = 8;
const MAX_FILE_BYTES = 250_000;

const JS_EXT = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'];
const RESOLVE_EXT = [...JS_EXT, 'json', 'vue', 'svelte'];
const SKIP_DIR = /(^|\/)(node_modules|dist|build|vendor|third[-_]?party|\.git|__pycache__|coverage)\//;
const LOW_PRIORITY = /(^|\/)(tests?|__tests__|spec|fixtures?|examples?|playground|docs?|e2e|benchmarks?)\//i;

const isJs = (p: string) => JS_EXT.includes(p.slice(p.lastIndexOf('.') + 1));
const isPy = (p: string) => p.endsWith('.py');

/** Which files are worth downloading: JS/TS/Python source, important-looking ones first. */
export function pickSourceFiles(files: FileEntry[], cap = MAX_DEP_FILES): FileEntry[] {
  return files
    .filter((f) => (isJs(f.path) || isPy(f.path)) && f.size > 0 && f.size <= MAX_FILE_BYTES)
    .filter((f) => !SKIP_DIR.test(f.path) && !/\.d\.ts$|\.min\.[cm]?js$/.test(f.path))
    .sort((a, b) => {
      const la = LOW_PRIORITY.test(a.path) ? 1 : 0;
      const lb = LOW_PRIORITY.test(b.path) ? 1 : 0;
      return la - lb || b.size - a.size;
    })
    .slice(0, cap);
}

// ------------------------------------------------------------------ parsing

const JS_RE = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];
const PY_FROM = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm;
const PY_IMPORT = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm;

export interface RawImport {
  spec: string;
  /** Python: names after `from x import a, b` (could be sub-modules). */
  names?: string[];
}

export function parseImports(path: string, source: string): RawImport[] {
  const out: RawImport[] = [];
  if (isPy(path)) {
    for (const m of source.matchAll(PY_FROM)) {
      const names = m[3].replace(/[()]/g, '').split(',').map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
      out.push({ spec: m[1] + m[2], names });
    }
    for (const m of source.matchAll(PY_IMPORT)) {
      for (const part of m[1].split(',')) out.push({ spec: part.trim().split(/\s+/)[0] });
    }
    return out;
  }
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const re of JS_RE) for (const m of clean.matchAll(re)) out.push({ spec: m[1] });
  return out;
}

// --------------------------------------------------------------- resolution

const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function normalize(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

export class Resolver {
  private paths: Set<string>;
  private pySuffix = new Map<string, string>();

  constructor(files: FileEntry[] | string[]) {
    this.paths = new Set(files.map((f) => (typeof f === 'string' ? f : f.path)));
    for (const p of this.paths) {
      if (!isPy(p)) continue;
      const mod = p.replace(/(\/__init__)?\.py$/, '');
      const segs = mod.split('/');
      for (let i = 0; i < segs.length; i++) {
        const k = segs.slice(i).join('/');
        const cur = this.pySuffix.get(k);
        if (!cur || p.length < cur.length) this.pySuffix.set(k, p);
      }
    }
  }

  private probeJs(target: string): string | null {
    if (this.paths.has(target) && !/\.(js|jsx|mjs|cjs)$/.test(target)) return target;
    const m = target.match(/^(.*)\.(js|jsx|mjs|cjs)$/);
    if (m) {
      // TS projects import "./x.js" meaning ./x.ts
      const swap: Record<string, string[]> = { js: ['ts', 'tsx'], jsx: ['tsx'], mjs: ['mts'], cjs: ['cts'] };
      for (const e of swap[m[2]]) if (this.paths.has(`${m[1]}.${e}`)) return `${m[1]}.${e}`;
      if (this.paths.has(target)) return target;
    }
    for (const e of RESOLVE_EXT) if (this.paths.has(`${target}.${e}`)) return `${target}.${e}`;
    for (const e of RESOLVE_EXT) if (this.paths.has(`${target}/index.${e}`)) return `${target}/index.${e}`;
    return null;
  }

  resolve(from: string, imp: RawImport): string[] {
    if (isPy(from)) return this.resolvePy(from, imp);
    const spec = imp.spec;
    const base = dirname(from);
    let hit: string | null = null;
    if (spec.startsWith('.')) {
      const t = normalize(`${base}/${spec}`);
      hit = t === null ? null : this.probeJs(t);
    } else if (/^(@|~|#)\//.test(spec)) {
      const rest = spec.slice(2);
      for (const root of ['src', '']) {
        const t = normalize(`${root}/${rest}`);
        if (t && (hit = this.probeJs(t))) break;
      }
    } else if (spec.startsWith('/')) {
      const t = normalize(spec);
      hit = t ? this.probeJs(t) : null;
    } else if (spec.includes('/') && !spec.startsWith('@')) {
      // bare path that happens to be repo-rooted ("src/utils/x") or relative to this package's src
      const t = normalize(spec);
      hit = t ? this.probeJs(t) : null;
    }
    return hit && hit !== from ? [hit] : [];
  }

  private probePy(mod: string): string | null {
    if (!mod) return null;
    if (this.paths.has(`${mod}.py`)) return `${mod}.py`;
    if (this.paths.has(`${mod}/__init__.py`)) return `${mod}/__init__.py`;
    return null;
  }

  private resolvePy(from: string, imp: RawImport): string[] {
    const dots = imp.spec.match(/^\.*/)![0].length;
    const mod = imp.spec.slice(dots).replace(/\./g, '/');
    const found = new Set<string>();
    const add = (p: string | null) => p && p !== from && found.add(p);
    if (dots > 0) {
      let base = dirname(from);
      for (let i = 1; i < dots; i++) base = dirname(base);
      const root = mod ? `${base}/${mod}` : base;
      const norm = (s: string) => s.replace(/^\//, '');
      for (const n of imp.names ?? []) add(this.probePy(norm(`${root}/${n}`)));
      add(this.probePy(norm(root)));
      return [...found];
    }
    for (const n of imp.names ?? []) add(this.pySuffix.get(`${mod}/${n}`.replace(/^\//, '')) ?? null);
    add(this.pySuffix.get(mod) ?? null);
    return [...found];
  }
}

// ------------------------------------------------------------------- driver

export type SourceReader = (path: string) => Promise<string | null>;

export interface DepsResult {
  deps: [string, string][];
  analyzed: number;
}

/** Parses up to `MAX_DEP_FILES` source files and returns resolved file->file import edges. */
export async function analyzeDeps(
  files: FileEntry[],
  read: SourceReader,
  onProgress?: ProgressFn,
  isCancelled: () => boolean = () => false,
): Promise<DepsResult> {
  const picked = pickSourceFiles(files);
  const resolver = new Resolver(files);
  const edges = new Set<string>();
  let done = 0;
  await pool(
    picked,
    DEP_CONCURRENCY,
    async (f) => {
      const src = await read(f.path);
      if (src) {
        for (const imp of parseImports(f.path, src)) {
          for (const to of resolver.resolve(f.path, imp)) edges.add(`${f.path}\0${to}`);
        }
      }
      done++;
      if (done % 5 === 0 || done === picked.length) {
        onProgress?.({
          stage: 'deps',
          message: `Mapping imports (${done}/${picked.length})…`,
          fraction: done / picked.length,
        });
      }
    },
    isCancelled,
  );
  return { deps: [...edges].map((e) => e.split('\0') as [string, string]), analyzed: done };
}

export async function fetchDeps(
  ref: RepoRef,
  files: FileEntry[],
  opts: { onProgress?: ProgressFn; signal?: AbortSignal },
): Promise<DepsResult> {
  const key = `deps:${repoKey(ref)}`;
  const hit = cacheGet<DepsResult>(key);
  if (hit) return hit;
  const read: SourceReader = async (path) => {
    try {
      const res = await fetch(rawUrl(ref, path), { signal: opts.signal });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };
  const result = await analyzeDeps(files, read, opts.onProgress, () => !!opts.signal?.aborted);
  if (!opts.signal?.aborted) cacheSet(key, result);
  return result;
}
