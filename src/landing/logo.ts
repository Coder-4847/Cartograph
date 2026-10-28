// Pure geometry + markup (no DOM, no imports) so scripts/make-logo.mjs can reuse it for the favicon.

/** Cells of the "C": a 4x5 wall of isometric cubes (col, row). */
export const C_CELLS: [number, number][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, r] as [number, number]),
  ...[1, 2, 3].map((c) => [c, 4] as [number, number]),
  ...[1, 2, 3].map((c) => [c, 0] as [number, number]),
];

const COS = Math.cos(Math.PI / 6);
const SHADE = { top: '#c4c8ff', left: '#7b83ff', right: '#4a52d4' } as const;

type P = [number, number, number];

function project([x, y, z]: P, s: number): string {
  return `${((x - y) * COS * s).toFixed(2)} ${((x + y) * 0.5 * s - z * s).toFixed(2)}`;
}

const poly = (pts: P[], s: number) => `M${pts.map((p) => project(p, s)).join('L')}Z`;

/** Three visible faces of the unit cube at (i, row k), wall one cube deep. */
export function cubeFaces(i: number, k: number, s: number) {
  return {
    top: poly([[i, 0, k + 1], [i + 1, 0, k + 1], [i + 1, 1, k + 1], [i, 1, k + 1]], s),
    left: poly([[i, 1, k], [i + 1, 1, k], [i + 1, 1, k + 1], [i, 1, k + 1]], s),
    right: poly([[i + 1, 0, k], [i + 1, 1, k], [i + 1, 1, k + 1], [i + 1, 0, k + 1]], s),
  };
}

/** Back-to-front order for the isometric painter's algorithm. */
const ORDER = [...C_CELLS].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

export interface LogoOpts {
  size?: number;
  /** Rounded dark tile behind the mark (favicon). */
  tile?: boolean;
  /** Start undrawn: faces get class "lf" and stroke-dash attributes for the draw-on animation. */
  animate?: boolean;
}

export function logoMarkup({ size = 32, tile = false, animate = false }: LogoOpts = {}): string {
  const s = 10;
  // wall spans x: 0..4, rows 0..5 -> screen bounds
  const w = (4 + 1) * COS * s;
  const minX = -1 * COS * s;
  const maxY = 5 * 0.5 * s; // bottom (y=1 side)
  const minY = -5 * s; // top of the tallest column
  const pad = tile ? 11 : 2;
  const vbW = w + pad * 2;
  const vbH = maxY - minY + pad * 2;
  const faces = ORDER.map(([i, k]) => {
    const f = cubeFaces(i, k, s);
    const attrs = (shade: keyof typeof SHADE) =>
      animate
        ? ` class="lf" pathLength="1" stroke="${SHADE[shade]}" fill="${SHADE[shade]}" fill-opacity="0" stroke-width="1" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1"`
        : ` fill="${SHADE[shade]}" stroke="${SHADE[shade]}" stroke-width="0.6" stroke-linejoin="round"`;
    return `<g><path d="${f.left}"${attrs('left')}/><path d="${f.right}"${attrs('right')}/><path d="${f.top}"${attrs('top')}/></g>`;
  }).join('');
  const vb = `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}`;
  const side = Math.max(vbW, vbH);
  const [vx, vy] = vb.split(' ').map(Number);
  // square viewBox, centred
  const sq = `${(vx - (side - vbW) / 2).toFixed(1)} ${(vy - (side - vbH) / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
  const bg = tile ? `<rect x="${(vx - (side - vbW) / 2).toFixed(1)}" y="${(vy - (side - vbH) / 2).toFixed(1)}" width="${side.toFixed(1)}" height="${side.toFixed(1)}" rx="${(side * 0.22).toFixed(1)}" fill="#0b0c10"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sq}" width="${size}" height="${size}" role="img" aria-label="Cartograph">${bg}${faces}</svg>`;
}
