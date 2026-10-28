import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLayout } from '../src/layout/treemap.ts';

function sampleFiles(n: number) {
  const dirs = ['src/ui', 'src/api', 'src/city/deep/er', 'docs', 'tests', 'scripts', ''];
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const d = dirs[Math.floor(rnd() * dirs.length)];
    return { path: `${d ? d + '/' : ''}f${i}.ts`, size: Math.floor(Math.exp(rnd() * 10)) };
  });
}

test('every file becomes exactly one building inside the city bounds', () => {
  const files = sampleFiles(800);
  const L = buildLayout(files);
  assert.equal(L.buildings.length, files.length);
  assert.equal(new Set(L.buildings.map((b) => b.path)).size, files.length);
  for (const b of L.buildings) {
    assert.ok(b.x - b.w / 2 >= -L.width / 2 - 1e-6 && b.x + b.w / 2 <= L.width / 2 + 1e-6, 'x in bounds');
    assert.ok(b.z - b.d / 2 >= -L.depth / 2 - 1e-6 && b.z + b.d / 2 <= L.depth / 2 + 1e-6, 'z in bounds');
    assert.ok(b.w > 0 && b.d > 0 && b.h > 0);
  }
});

test('buildings never overlap in plan view', () => {
  const L = buildLayout(sampleFiles(400));
  const bs = L.buildings;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      const overlap = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2) > 1e-6 && Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2) > 1e-6;
      assert.ok(!overlap, `${a.path} overlaps ${b.path}`);
    }
  }
});

test('buildings sit inside their district and bigger files are taller', () => {
  const L = buildLayout(sampleFiles(300));
  for (const b of L.buildings) {
    const d = b.dir;
    assert.ok(b.x >= d.x && b.x <= d.x + d.w && b.z >= d.z && b.z <= d.z + d.d, b.path);
  }
  const sorted = [...L.buildings].sort((a, b) => a.size - b.size);
  assert.ok(sorted.at(-1)!.h >= sorted[0].h);
});

test('single-child folder chains collapse into one district', () => {
  const L = buildLayout([{ path: 'a/b/c/x.ts', size: 10 }, { path: 'a/b/c/y.ts', size: 10 }, { path: 'z.ts', size: 5 }]);
  assert.ok(L.dirByPath.has('a/b/c'));
  assert.equal(L.dirByPath.get('a/b/c')!.name, 'a/b/c');
  assert.ok(!L.dirByPath.has('a'));
});

test('buildings are Morton-ordered with stable, dense indices', () => {
  const L = buildLayout(sampleFiles(200));
  L.buildings.forEach((b, i) => assert.equal(b.index, i));
});
