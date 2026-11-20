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

/** The first valid drop key under the point, searching from the innermost element outwards. */
export function keyAt(x: number, y: number, targets: Map<string, PlannedAction>): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    let node: Element | null = el;
    while (node) {
      const key = node.getAttribute('data-drop');
      if (key && targets.has(key)) return key;
      node = node.parentElement;
    }
  }
  return null;
}

/** CSS class for a drop zone while a card is being dragged. */
export function dropClass(drag: DragState | null, key: string): string {
  if (!drag || !drag.moved) return '';
  if (drag.hover === key) return ' drop--hover';
  return drag.targets.has(key) ? ' drop--valid' : ' drop--dim';
}
