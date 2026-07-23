// Generate next sequential code like PREFIX001 from existing codes.
export function nextCode(prefix: string, existing: (string | null | undefined)[], pad = 3): string {
  const re = new RegExp(`^${prefix}(\\d+)$`, "i");
  let max = 0;
  for (const c of existing) {
    const m = c?.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}
