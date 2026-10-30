// A wrong laptop clock must not finish a phase early. The offset is
// `serverNow - Date.now()` at the moment the response arrives. A slow response
// is a bad sample, so it is left out of the median unless the caller forces it.

const MAX_RTT_MS = 1_000;
const MAX_SAMPLES = 5;

export function pushClockSample(
  samples: readonly number[],
  offset: number,
  rttMs: number,
  force = false,
): number[] {
  if (!force && rttMs > MAX_RTT_MS) return [...samples];
  return [...samples, offset].slice(-MAX_SAMPLES);
}

export function medianOffset(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
