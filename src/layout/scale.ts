/** Maps file size to building height. Sub-linear so one huge file doesn't flatten the rest. */
export const MAX_HEIGHT = 16;
export const MIN_HEIGHT = 0.35;

export function heightFor(size: number, maxSize: number): number {
  if (maxSize <= 0) return MIN_HEIGHT;
  return MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.pow(Math.min(1, size / maxSize), 0.42);
}
