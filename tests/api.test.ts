import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resolver, parseImports, pickSourceFiles } from '../src/api/deps.ts';
import { githubUrl, parseRepo } from '../src/api/repo.ts';

test('parseRepo accepts the usual spellings', () => {
  for (const s of ['vitejs/vite', 'github.com/vitejs/vite', 'https://github.com/vitejs/vite/', 'https://www.github.com/vitejs/vite.git', 'git@github.com:vitejs/vite.git']) {
    assert.deepEqual(parseRepo(s), { owner: 'vitejs', repo: 'vite', ref: undefined }, s);
  }
  assert.equal(parseRepo('https://github.com/a/b/tree/feat/x-y').ref, 'feat/x-y');
});

test('parseRepo rejects non-repos with a friendly error', () => {
  for (const s of ['', 'hello', 'https://example.com/a/b/c', 'a b/c']) assert.throws(() => parseRepo(s), /repo|GitHub|owner/i, s);
});

test('githubUrl deep-links files and folders', () => {
  const r = { owner: 'o', repo: 'r' };
  assert.equal(githubUrl(r, 'src/a b.ts', false), 'https://github.com/o/r/blob/HEAD/src/a%20b.ts');
  assert.equal(githubUrl(r, 'src', true), 'https://github.com/o/r/tree/HEAD/src');
  assert.equal(githubUrl({ ...r, ref: 'dev' }, '', true), 'https://github.com/o/r/tree/dev');
});

test('parseImports finds ES, dynamic and CommonJS imports but ignores comments', () => {
  const src = `
    import a from './a';
    import { b,
      c } from "../b.js";
    export * from './re';
    // import nope from './commented';
    /* import nope2 from './block' */
    const d = await import('./d');
    const e = require('./e');
    import type { T } from './types';
    import './side-effect';
  `;
  const specs = parseImports('src/x.ts', src).map((i) => i.spec).sort();
  assert.deepEqual(specs, ['../b.js', './a', './d', './e', './re', './side-effect', './types']);
});

test('parseImports handles Python imports', () => {
  const src = 'import os, sys\nfrom . import util, helpers\nfrom ..core.models import User\nimport pkg.mod as m\n';
  const imps = parseImports('app/views.py', src);
  assert.deepEqual(imps.map((i) => i.spec), ['.', '..core.models', 'os', 'sys', 'pkg.mod']);
  assert.deepEqual(imps[0].names, ['util', 'helpers']);
});

test('Resolver maps specifiers to repo files', () => {
  const r = new Resolver(['src/a.ts', 'src/b/index.ts', 'src/c.tsx', 'src/data.json', 'lib/x.ts']);
  assert.deepEqual(r.resolve('src/a.ts', { spec: './b' }), ['src/b/index.ts']);
  assert.deepEqual(r.resolve('src/a.ts', { spec: './c.js' }), ['src/c.tsx']);
  assert.deepEqual(r.resolve('src/b/index.ts', { spec: '../a' }), ['src/a.ts']);
  assert.deepEqual(r.resolve('src/a.ts', { spec: '@/c' }), ['src/c.tsx']);
  assert.deepEqual(r.resolve('src/a.ts', { spec: 'react' }), []);
  assert.deepEqual(r.resolve('src/a.ts', { spec: '../../../escape' }), []);
});

test('Resolver maps Python modules, relative and absolute', () => {
  const r = new Resolver(['app/__init__.py', 'app/util.py', 'app/core/models.py', 'app/core/__init__.py']);
  assert.deepEqual(r.resolve('app/views.py', { spec: '.', names: ['util'] }), ['app/util.py', 'app/__init__.py']);
  assert.deepEqual(r.resolve('app/core/x.py', { spec: '.models', names: ['User'] }), ['app/core/models.py']);
  assert.deepEqual(r.resolve('main.py', { spec: 'app.core.models' }), ['app/core/models.py']);
});

test('pickSourceFiles prefers real source over tests and respects the cap', () => {
  const files = [
    { path: 'src/a.ts', size: 10 },
    { path: 'test/a.test.ts', size: 9999 },
    { path: 'node_modules/x/index.js', size: 100 },
    { path: 'dist/a.min.js', size: 100 },
    { path: 'types/a.d.ts', size: 100 },
    { path: 'README.md', size: 100 },
    { path: 'src/big.ts', size: 500 },
  ];
  assert.deepEqual(pickSourceFiles(files).map((f) => f.path), ['src/big.ts', 'src/a.ts', 'test/a.test.ts']);
  assert.equal(pickSourceFiles(files, 1).length, 1);
});
