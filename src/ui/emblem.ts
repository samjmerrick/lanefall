// Deterministic geometric emblem derived from a card id: same id, same emblem.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Emblem {
  sides: number;
  rotation: number;
  rings: number;
  inner: number;
}

export function emblemFor(id: string): Emblem {
  const h = hash(id);
  return {
    sides: 3 + (h % 5),
    rotation: (h >>> 3) % 360,
    rings: 1 + ((h >>> 11) % 3),
    inner: 3 + ((h >>> 17) % 4),
  };
}

export function polygonPoints(sides: number, radius: number, rotationDeg: number, cx = 50, cy = 50): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotationDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
