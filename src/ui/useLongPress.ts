import { useRef } from 'react';

/**
 * Tap and long-press on the same element. A long press (450 ms without moving) fires `onLong`
 * and suppresses the tap that would follow.
 */
export function useLongPress(onTap: () => void, onLong: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<[number, number]>([0, 0]);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = [e.clientX, e.clientY];
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLong();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      if (!fired.current) onTap();
      fired.current = false;
    },
  };
}
