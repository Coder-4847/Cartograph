import * as THREE from 'three';
import type { ChurnInfo } from '../types.ts';
import type { CityLayout } from '../layout/treemap.ts';

export const ACCENT = new THREE.Color('#7b83ff');
const C = (hex: string) => new THREE.Color(hex);

const CODE = C('#5a6285');
const MARKUP = C('#5b6a80');
const DOCS = C('#767b87');
const DATA = C('#4d596c');
const ASSET = C('#43474f');
const OTHER = C('#555b67');
const DIM = C('#171a22');

const CODE_EXT = new Set('ts tsx js jsx mjs cjs mts cts py go rs java kt c cc cpp h hpp cs rb php swift vue svelte sh'.split(' '));
const MARKUP_EXT = new Set('html css scss sass less htm'.split(' '));
const DOC_EXT = new Set('md mdx txt rst'.split(' '));
const DATA_EXT = new Set('json yml yaml toml ini lock xml env'.split(' '));
const ASSET_EXT = new Set('png jpg jpeg gif svg webp ico woff woff2 ttf eot mp4 mp3 pdf zip'.split(' '));

export type FileKind = 'code' | 'markup' | 'docs' | 'data' | 'asset' | 'other';

export function kindOf(ext: string): FileKind {
  if (CODE_EXT.has(ext)) return 'code';
  if (MARKUP_EXT.has(ext)) return 'markup';
  if (DOC_EXT.has(ext)) return 'docs';
  if (DATA_EXT.has(ext)) return 'data';
  if (ASSET_EXT.has(ext)) return 'asset';
  return 'other';
}

const KIND_COLOR: Record<FileKind, THREE.Color> = {
  code: CODE,
  markup: MARKUP,
  docs: DOCS,
  data: DATA,
  asset: ASSET,
  other: OTHER,
};

/** Single-hue heat ramp: cold slate -> accent -> near white. */
const RAMP: [number, THREE.Color][] = [
  [0, C('#1b2030')],
  [0.35, C('#3a43a8')],
  [0.7, ACCENT],
  [1, C('#f2f3ff')],
];

export function heat(t: number, out = new THREE.Color()): THREE.Color {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export interface ColorSets {
  /** Overview, Churn heatmap, Hotspots; 3 floats per building (linear RGB). */
  c0: Float32Array;
  c1: Float32Array;
  c2: Float32Array;
  /** Hotspot intensity 0..1 per building. */
  hot: Float32Array;
  /** Normalised churn 0..1 per building. */
  churnN: Float32Array;
  maxChurn: number;
}

export function colorize(layout: CityLayout, churn: Record<string, ChurnInfo>): ColorSets {
  const n = layout.buildings.length;
  const c0 = new Float32Array(n * 3);
  const c1 = new Float32Array(n * 3);
  const c2 = new Float32Array(n * 3);
  const hot = new Float32Array(n);
  const churnN = new Float32Array(n);

  let maxChurn = 0;
  for (const b of layout.buildings) maxChurn = Math.max(maxChurn, churn[b.path]?.count ?? 0);

  // Hotspot score = large AND frequently changed.
  const scores = new Float32Array(n);
  let maxScore = 0;
  layout.buildings.forEach((b, i) => {
    const cn = maxChurn ? (churn[b.path]?.count ?? 0) / maxChurn : 0;
    churnN[i] = cn;
    scores[i] = Math.sqrt(layout.maxSize ? b.size / layout.maxSize : 0) * cn;
    maxScore = Math.max(maxScore, scores[i]);
  });
  const sorted = [...scores].filter((s) => s > 0).sort((a, b) => b - a);
  const cutoff = sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(8, Math.floor(n * 0.06)))] ?? 0 : Infinity;

  const col = new THREE.Color();
  layout.buildings.forEach((b, i) => {
    const jitter = 0.93 + hash(b.path) * 0.14;
    const cn = Math.sqrt(churnN[i]);
    // Overview: file type in neutral tones, nudged toward the accent by recent change.
    col.copy(KIND_COLOR[kindOf(b.ext)]).multiplyScalar(jitter).lerp(ACCENT, cn * 0.75);
    c0.set([col.r, col.g, col.b], i * 3);
    // Churn heatmap.
    heat(cn > 0 ? 0.12 + cn * 0.88 : 0.02 + hash(b.path) * 0.04, col);
    c1.set([col.r, col.g, col.b], i * 3);
    // Hotspots: everything recedes except the hot set.
    const hs = scores[i] > 0 && scores[i] >= cutoff ? Math.pow(scores[i] / maxScore, 0.6) : 0;
    hot[i] = hs;
    col.copy(DIM).multiplyScalar(jitter);
    if (hs > 0) col.lerp(heat(0.45 + hs * 0.55), 0.35 + hs * 0.65);
    c2.set([col.r, col.g, col.b], i * 3);
  });
  return { c0, c1, c2, hot, churnN, maxChurn };
}
