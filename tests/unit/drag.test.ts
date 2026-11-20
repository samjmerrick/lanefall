import { describe, expect, it } from 'vitest';
import { pickTarget, rectCentre, type DropRect } from '../../src/ui/drag';

const r = (key: string, left: number, top: number, w: number, h: number): DropRect => ({
  key,
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe('pickTarget', () => {
  const slots = [r('slot:0:0', 0, 0, 50, 50), r('slot:0:1', 60, 0, 50, 50)];

  it('picks the zone under the point', () => {
    expect(pickTarget(70, 10, slots)).toBe('slot:0:1');
  });

  it('snaps across the gap between slots to the nearer one', () => {
    expect(pickTarget(53, 20, slots)).toBe('slot:0:0');
    expect(pickTarget(58, 20, slots)).toBe('slot:0:1');
  });

  it('snaps to a near miss but not to a far one', () => {
    expect(pickTarget(25, 80, slots)).toBe('slot:0:0');
    expect(pickTarget(25, 200, slots)).toBeNull();
  });

  it('prefers the smallest zone containing the point', () => {
    const rects = [r('lane:1', 0, 0, 200, 200), r('unit:7', 50, 50, 40, 40)];
    expect(pickTarget(60, 60, rects)).toBe('unit:7');
    expect(pickTarget(10, 10, rects)).toBe('lane:1');
  });

  it('finds the centre of the smallest matching zone', () => {
    const rects = [r('lane:1', 0, 0, 200, 200), r('lane:1', 0, 300, 100, 20)];
    expect(rectCentre(rects, 'lane:1')).toEqual({ x: 50, y: 310 });
    expect(rectCentre(rects, null)).toBeNull();
  });
});
