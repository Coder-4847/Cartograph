import type { FileEntry } from '../types.ts';
import { heightFor, tallestFor } from './scale.ts';

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface DirNode extends Rect {
  kind: 'dir';
  id: number;
  name: string;
  path: string;
  depth: number;
  parent: DirNode | null;
  dirs: DirNode[];
  files: Building[];
  fileCount: number;
  totalSize: number;
  weight: number;
}

/** A file, rendered as one instance. Coordinates are the footprint centre. */
export interface Building {
  kind: 'file';
  index: number;
  path: string;
  name: string;
  ext: string;
  size: number;
  h: number;
  /** Base elevation: sits on its district's plate. */
  y: number;
  x: number;
  z: number;
  w: number;
  d: number;
  dir: DirNode;
}

export interface CityLayout {
  root: DirNode;
  buildings: Building[];
  dirs: DirNode[];
  width: number;
  depth: number;
  maxDepth: number;
  maxH: number;
  maxSize: number;
  buildingByPath: Map<string, Building>;
  dirByPath: Map<string, DirNode>;
}

const padFor = (depth: number) => (depth <= 0 ? 0 : Math.max(0.4, 1.0 - depth * 0.15));
/** Nested districts step up slightly so plates never z-fight. */
export const plateTop = (depth: number, maxDepth: number) => -0.05 * (maxDepth - depth);
const fileWeight = (size: number) => 7 + Math.sqrt(size) * 0.4;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

// ---------------------------------------------------------------- tree build

interface Raw {
  name: string;
  path: string;
  dirs: Map<string, Raw>;
  files: FileEntry[];
}

function buildRaw(files: FileEntry[]): Raw {
  const root: Raw = { name: '', path: '', dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = node.dirs.get(parts[i]);
      if (!next) {
        next = { name: parts[i], path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] };
        node.dirs.set(parts[i], next);
      }
      node = next;
    }
    node.files.push(f);
  }
  return root;
}

/** Folds `a/b/c` chains of single-child folders into one district so depth isn't wasted. */
function collapse(node: Raw, isRoot: boolean): Raw {
  while (!isRoot && node.files.length === 0 && node.dirs.size === 1) {
    const only = [...node.dirs.values()][0];
    node = { ...only, name: `${node.name}/${only.name}` };
  }
  const dirs = new Map<string, Raw>();
  for (const child of node.dirs.values()) {
    const c = collapse(child, false);
    dirs.set(c.path, c);
  }
  return { ...node, dirs };
}

function toNode(raw: Raw, depth: number, parent: DirNode | null, all: DirNode[], out: Building[]): DirNode {
  const node: DirNode = {
    kind: 'dir',
    id: all.length,
    name: raw.name,
    path: raw.path,
    depth,
    parent,
    dirs: [],
    files: [],
    fileCount: 0,
    totalSize: 0,
    weight: 0,
    x: 0,
    z: 0,
    w: 0,
    d: 0,
  };
  all.push(node);
  for (const child of raw.dirs.values()) node.dirs.push(toNode(child, depth + 1, node, all, out));
  for (const f of raw.files) {
    const name = f.path.slice(f.path.lastIndexOf('/') + 1);
    const b: Building = {
      kind: 'file',
      index: -1,
      path: f.path,
      name,
      ext: extOf(name),
      size: f.size,
      h: 0,
      y: 0,
      x: 0,
      z: 0,
      w: 0,
      d: 0,
      dir: node,
    };
    node.files.push(b);
    out.push(b);
  }
  // Weight = area the district needs: its content plus the padding ring carved out of it.
  let inner = 0;
  for (const d of node.dirs) {
    inner += d.weight;
    node.fileCount += d.fileCount;
    node.totalSize += d.totalSize;
  }
  for (const b of node.files) {
    inner += fileWeight(b.size);
    node.fileCount += 1;
    node.totalSize += b.size;
  }
  const side = Math.sqrt(inner) + 2 * padFor(depth);
  node.weight = side * side;
  return node;
}

// ---------------------------------------------------------------- squarify

interface Item {
  weight: number;
  node: DirNode | Building;
}

function worst(row: number[], sum: number, side: number): number {
  const s2 = side * side;
  let max = 0;
  let min = Infinity;
  for (const r of row) {
    if (r > max) max = r;
    if (r < min) min = r;
  }
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

/** Bruls/Huizing/van Wijk squarified treemap. Places `items` (desc by weight) inside `rect`. */
function squarify(items: Item[], rect: Rect, place: (item: Item, r: Rect) => void): void {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (!items.length || total <= 0) return;
  const k = (rect.w * rect.d) / total; // weight -> area
  const scaled = items.map((i) => ({ item: i, area: i.weight * k }));
  let { x, z, w, d } = rect;
  let i = 0;
  while (i < scaled.length) {
    const side = Math.min(w, d);
    const row: number[] = [];
    let sum = 0;
    let j = i;
    while (j < scaled.length) {
      const a = scaled[j].area;
      if (row.length === 0 || worst([...row, a], sum + a, side) <= worst(row, sum, side)) {
        row.push(a);
        sum += a;
        j++;
      } else break;
    }
    const thick = sum / side;
    if (w >= d) {
      // vertical strip on the left, stacked along z
      let cz = z;
      for (let n = 0; n < row.length; n++) {
        const len = row[n] / thick;
        place(scaled[i + n].item, { x, z: cz, w: thick, d: len });
        cz += len;
      }
      x += thick;
      w -= thick;
    } else {
      let cx = x;
      for (let n = 0; n < row.length; n++) {
        const len = row[n] / thick;
        place(scaled[i + n].item, { x: cx, z, w: len, d: thick });
        cx += len;
      }
      z += thick;
      d -= thick;
    }
    i = j;
  }
}

function layoutDir(node: DirNode, rect: Rect): void {
  node.x = rect.x;
  node.z = rect.z;
  node.w = rect.w;
  node.d = rect.d;
  const p = Math.min(padFor(node.depth), rect.w * 0.2, rect.d * 0.2);
  const inner: Rect = { x: rect.x + p, z: rect.z + p, w: Math.max(0.1, rect.w - 2 * p), d: Math.max(0.1, rect.d - 2 * p) };
  const items: Item[] = [
    ...node.dirs.map((d) => ({ weight: d.weight, node: d })),
    ...node.files.map((f) => ({ weight: fileWeight(f.size), node: f })),
  ].sort((a, b) => b.weight - a.weight);
  squarify(items, inner, (item, r) => {
    if (item.node.kind === 'dir') {
      layoutDir(item.node, r);
    } else {
      const b = item.node;
      const gap = Math.min(0.22, Math.min(r.w, r.d) * 0.14);
      b.w = Math.max(0.05, r.w - 2 * gap);
      b.d = Math.max(0.05, r.d - 2 * gap);
      b.x = r.x + r.w / 2;
      b.z = r.z + r.d / 2;
    }
  });
}

// ---------------------------------------------------------------- ordering

function part1by1(n: number): number {
  n &= 0xffff;
  n = (n | (n << 8)) & 0x00ff00ff;
  n = (n | (n << 4)) & 0x0f0f0f0f;
  n = (n | (n << 2)) & 0x33333333;
  n = (n | (n << 1)) & 0x55555555;
  return n;
}

export function buildLayout(files: FileEntry[]): CityLayout {
  const raw = collapse(buildRaw(files), true);
  const dirs: DirNode[] = [];
  const buildings: Building[] = [];
  const root = toNode(raw, 0, null, dirs, buildings);

  const aspect = 1.55;
  const area = root.weight;
  const width = Math.sqrt(area * aspect);
  const depth = area / width;
  layoutDir(root, { x: -width / 2, z: -depth / 2, w: width, d: depth });

  const maxSize = buildings.reduce((m, b) => Math.max(m, b.size), 0);
  const tallest = tallestFor(width);
  for (const b of buildings) b.h = heightFor(b.size, maxSize, tallest);
  const maxDepth = dirs.reduce((m, d) => Math.max(m, d.depth), 0);
  for (const b of buildings) b.y = plateTop(b.dir.depth, maxDepth);

  // Morton order keeps neighbours adjacent in the array, so morphing building i -> i between two
  // cities moves things roughly in place instead of across the whole map.
  const code = (b: Building) =>
    part1by1(Math.floor(((b.x + width / 2) / width) * 65535)) | (part1by1(Math.floor(((b.z + depth / 2) / depth) * 65535)) << 1);
  const keyed = buildings.map((b) => ({ b, c: code(b) >>> 0 }));
  keyed.sort((a, b) => a.c - b.c);
  const ordered = keyed.map((k, i) => {
    k.b.index = i;
    return k.b;
  });

  const buildingByPath = new Map(ordered.map((b) => [b.path, b]));
  const dirByPath = new Map(dirs.map((d) => [d.path, d]));
  return {
    root,
    buildings: ordered,
    dirs,
    width,
    depth,
    maxDepth,
    maxH: ordered.reduce((m, b) => Math.max(m, b.h), 0),
    maxSize,
    buildingByPath,
    dirByPath,
  };
}
