export type RandomInt = (maxExclusive: number) => number;

/** Unbiased random integer in [0, maxExclusive) from the crypto RNG. */
export const randomInt: RandomInt = (maxExclusive) => {
  if (maxExclusive <= 1) return 0;
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % maxExclusive;
};

/** Fisher–Yates shuffle; returns a new array. */
export function shuffled<T>(items: readonly T[], rand: RandomInt = randomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
