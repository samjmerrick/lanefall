import { xpProgress } from '../../run';

/** Account level and progress to the next one: "Level 7 · 320/450 XP", or "Max level" at the cap. */
export function XpBar({ xp, className = '' }: { xp: number; className?: string }) {
  const { level, into, needed } = xpProgress(xp);
  const label = needed === 0 ? `Level ${level} · Max level` : `Level ${level} · ${into}/${needed} XP`;
  return (
    <div className={`xpbar ${className}`}>
      <p className="xpbar__label">{label}</p>
      <div
        className="xpbar__track"
        role="progressbar"
        aria-label="Progress to next level"
        aria-valuemin={0}
        aria-valuemax={needed || 1}
        aria-valuenow={needed === 0 ? 1 : into}
        aria-valuetext={label}
      >
        <span className="xpbar__fill" style={{ width: `${needed === 0 ? 100 : (into / needed) * 100}%` }} />
      </div>
    </div>
  );
}
