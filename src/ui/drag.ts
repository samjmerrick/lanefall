import { create } from 'zustand';
import type { PlannedAction } from '../engine';

export interface DragState {
  uid: number;
  cardId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  /** Drop key → the planned action it would make. */
  targets: Map<string, PlannedAction>;
  hover: string | null;
  /** Centre of the hovered zone, where a spell's target arrow snaps to. */
  hoverAt: { x: number; y: number } | null;
  /** True when dragging a unit already on the board (a Shift), not a hand card. */
  shift?: boolean;
}

export const useDrag = create<{ drag: DragState | null; set(d: DragState | null): void }>((set) => ({
  drag: null,
  set: (drag) => set({ drag }),
}));

export function dropKey(a: PlannedAction): string {
  if (a.type === 'playSpell') {
    if (a.target.kind === 'unit') return `unit:${a.target.uid}`;
    if (a.target.kind === 'lane') return `lane:${a.target.lane}`;
    return 'board';
  }
  return `slot:${a.lane}:${a.slot}`;
}

/** A drop zone's key and its screen rectangle. */
export interface DropRect {
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far (px) outside a drop zone the drag point still snaps to it. */
export const SNAP = 44;

function gap(x: number, y: number, r: DropRect): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

/**
 * The drop key for a drag point: the smallest zone containing it, otherwise the nearest zone within
 * `radius` (so gaps between slots and near misses on small unit tokens still land).
 */
export function pickTarget(x: number, y: number, rects: DropRect[], radius = SNAP): string | null {
  let best: { key: string; gap: number; area: number } | null = null;
  for (const r of rects) {
    const g = gap(x, y, r);
    if (g > radius) continue;
    const area = (r.right - r.left) * (r.bottom - r.top);
    if (!best || g < best.gap || (g === best.gap && area < best.area)) best = { key: r.key, gap: g, area };
  }
  return best?.key ?? null;
}

/** Screen rectangles of the drop zones that are valid targets for this drag. */
export function dropRects(targets: Map<string, PlannedAction>): DropRect[] {
  const out: DropRect[] = [];
  for (const el of document.querySelectorAll('[data-drop]')) {
    const key = el.getAttribute('data-drop')!;
    if (!targets.has(key)) continue;
    const b = el.getBoundingClientRect();
    out.push({ key, left: b.left, top: b.top, right: b.right, bottom: b.bottom });
  }
  return out;
}

/** Centre of the drop zone with this key (for snapping the target arrow), if it is on screen. */
export function rectCentre(rects: DropRect[], key: string | null): { x: number; y: number } | null {
  const hits = rects.filter((r) => r.key === key);
  if (hits.length === 0) return null;
  // Lane keys match several zones; prefer the smallest (a unit token or the lane strip cell).
  const r = hits.reduce((a, b) =>
    (b.right - b.left) * (b.bottom - b.top) < (a.right - a.left) * (a.bottom - a.top) ? b : a,
  );
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

/** CSS class for a drop zone while a card is being dragged. */
export function dropClass(drag: DragState | null, key: string): string {
  if (!drag || !drag.moved) return '';
  if (drag.hover === key) return ' drop--hover';
  return drag.targets.has(key) ? ' drop--valid' : ' drop--dim';
}
