import type { EquityPoint } from './types';

/**
 * Largest-Triangle-Three-Buckets downsampling.
 *
 * Reference: Steinarsson, "Downsampling Time Series for Visual
 * Representation" (2013). The algorithm preserves visual shape — peaks
 * and troughs survive even at extreme reduction ratios — making a
 * 4 000-point equity curve indistinguishable from a 500-point downsample
 * at chart resolution.
 *
 * The first and last points are always retained verbatim so the curve
 * starts and ends in the right place.
 */
export interface XYPoint {
  /** Numeric x-axis (timestamp ms or sample index). */
  x: number;
  /** Numeric y-axis. */
  y: number;
}

/** Pure LTTB on a flat XY series. Returns a new array. */
export function lttbDownsample<T extends XYPoint>(
  data: readonly T[],
  threshold: number,
): T[] {
  if (threshold <= 2) {
    if (data.length === 0) return [];
    if (data.length === 1) return [data[0]!];
    return [data[0]!, data[data.length - 1]!];
  }
  if (threshold >= data.length) return data.slice();

  const sampled: T[] = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always keep the first point.
  sampled.push(data[0]!);
  let aIdx = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Range [bucketStart, bucketEnd) = the bucket we'll pick a point from.
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(
      Math.floor((i + 2) * bucketSize) + 1,
      data.length,
    );

    // Range [nextStart, nextEnd) = the bucket *after* the current one.
    // We use its average as the third triangle vertex.
    const nextStart = bucketEnd;
    const nextEnd = Math.min(
      Math.floor((i + 3) * bucketSize) + 1,
      data.length,
    );
    const nextLen = Math.max(nextEnd - nextStart, 1);

    let avgX = 0;
    let avgY = 0;
    if (nextStart < data.length) {
      for (let j = nextStart; j < nextEnd; j++) {
        avgX += data[j]!.x;
        avgY += data[j]!.y;
      }
      avgX /= nextLen;
      avgY /= nextLen;
    } else {
      // Last bucket — use the final point as the "next" vertex.
      const last = data[data.length - 1]!;
      avgX = last.x;
      avgY = last.y;
    }

    const a = data[aIdx]!;
    let maxArea = -1;
    let maxAreaIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const p = data[j]!;
      // Area of triangle (a, p, avg) — the larger, the more "important"
      // p is for preserving the curve's shape.
      const area =
        Math.abs(
          (a.x - avgX) * (p.y - a.y) - (a.x - p.x) * (avgY - a.y),
        ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaIdx = j;
      }
    }

    sampled.push(data[maxAreaIdx]!);
    aIdx = maxAreaIdx;
  }

  // Always keep the last point.
  sampled.push(data[data.length - 1]!);
  return sampled;
}

/**
 * LTTB wrapper for an `EquityPoint[]` series. Converts the ISO `t` to
 * an epoch-ms x and runs LTTB, then returns the original `EquityPoint`
 * objects so we don't lose timestamp formatting.
 */
export function downsampleEquityCurve(
  points: readonly EquityPoint[],
  threshold = 500,
): EquityPoint[] {
  if (points.length <= threshold) return points.slice();

  const xy = points.map((p) => ({
    x: Date.parse(p.t),
    y: p.b,
    src: p,
  }));
  const sampled = lttbDownsample(xy, threshold);
  return sampled.map((s) => s.src);
}
