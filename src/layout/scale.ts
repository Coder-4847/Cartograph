export const MIN_HEIGHT = 0.5;

/**
 * Maps file size to building height. Sub-linear so one huge file doesn't flatten the rest,
 * and scaled by `tallest` (derived from the city's footprint) so skylines look right at any size.
 */
export function heightFor(size: number, maxSize: number, tallest: number): number {
  if (maxSize <= 0) return MIN_HEIGHT;
  return MIN_HEIGHT + (tallest - MIN_HEIGHT) * Math.pow(Math.min(1, size / maxSize), 0.5);
}

export const tallestFor = (cityWidth: number) => Math.min(80, Math.max(10, cityWidth * 0.14));
