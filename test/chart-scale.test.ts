// The trend chart's top must be at or above its highest point, or the line runs out of the chart, and a round
// number, so that its middle tick reads as one. The chart around it is checked by hand in a browser.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { separateLabels, topOf } from '../viewer/chart-scale.ts';

for (const [max, top] of [
  [487, 600],
  [200, 200],
  [5, 6],
  [0, 2],
] as const) {
  test(`a chart whose highest point is ${max} tops out at ${top}`, () => {
    assert.equal(topOf(max), top);
  });
}

test('separateLabels spaces colliding end labels apart while keeping them inside the chart bounds', () => {
  assert.deepEqual(separateLabels([18, 22, 182], 15, 18, 182), [18, 33, 182]);
  assert.deepEqual(separateLabels([180, 182], 15, 18, 182), [167, 182]);
});
