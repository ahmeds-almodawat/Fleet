/**
 * Convert HEX color (#RGB, #RRGGBB) to rgba(r,g,b,a).
 * - opacity0to1 is clamped to [0,1]
 * - invalid input falls back to transparent black
 */
export function hexToRgba(hex: string, opacity0to1: number): string {
  const a = Math.max(0, Math.min(1, Number.isFinite(opacity0to1) ? opacity0to1 : 0));
  const raw = (hex || '').trim().replace('#', '');

  const isShort = raw.length === 3;
  const isLong = raw.length === 6;
  if (!isShort && !isLong) return `rgba(0,0,0,${a})`;

  const full = isShort
    ? raw
        .split('')
        .map((c) => c + c)
        .join('')
    : raw;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  if ([r, g, b].some((v) => Number.isNaN(v))) return `rgba(0,0,0,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}
