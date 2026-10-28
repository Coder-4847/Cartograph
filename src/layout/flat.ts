import type { FileEntry } from '../types.ts';
import { heightFor } from './scale.ts';

export interface Block {
  index: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

/** Stage-1 layout: files on a plain grid, height = size. */
export function flatLayout(files: FileEntry[]): { blocks: Block[]; width: number; depth: number } {
  const cell = 2;
  const cols = Math.max(1, Math.ceil(Math.sqrt(files.length * 1.5)));
  const rows = Math.ceil(files.length / cols);
  const maxSize = files.reduce((m, f) => Math.max(m, f.size), 0);
  const width = cols * cell;
  const depth = rows * cell;
  const blocks = files.map((f, i) => ({
    index: i,
    x: (i % cols) * cell + cell / 2 - width / 2,
    z: Math.floor(i / cols) * cell + cell / 2 - depth / 2,
    w: cell * 0.78,
    d: cell * 0.78,
    h: heightFor(f.size, maxSize),
  }));
  return { blocks, width, depth };
}
