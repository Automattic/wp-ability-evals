// The scale and label placement of the Overview's trend chart. Pure code without a browser, so tests prove
// the chart's top never clips a line and colliding right-hand end labels separate cleanly within the plot.

/** The top of a chart's scale: a round number at or above `max`, whose half is a whole number too. */
export function topOf(max: number): number {
  const step = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  return Math.ceil(max / step / 2) * 2 * step || 2;
}

/** Adjusts vertical label positions so adjacent labels sit at least `minGap` apart while staying within `[min, max]`. */
export function separateLabels(targets: number[], minGap: number, min: number, max: number): number[] {
  if (targets.length === 0) return [];
  const order = targets.map((value, index) => ({ value, index })).sort((one, other) => one.value - other.value || one.index - other.index);
  const placed = order.map(({ value }) => Math.min(Math.max(value, min), max));
  for (let i = 1; i < placed.length; i++) {
    placed[i] = Math.max(placed[i] as number, (placed[i - 1] as number) + minGap);
  }
  const last = placed.length - 1;
  placed[last] = Math.min(placed[last] as number, max);
  for (let i = last - 1; i >= 0; i--) {
    placed[i] = Math.max(min, Math.min(placed[i] as number, (placed[i + 1] as number) - minGap));
  }
  const result = new Array<number>(targets.length);
  order.forEach(({ index }, sortedIndex) => {
    result[index] = placed[sortedIndex] as number;
  });
  return result;
}
