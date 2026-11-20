import type { ReactNode } from 'react';
import { artUrl } from './art';

/** Line icon for run content (hero, enemy, relic, lane, event), or `fallback` when no SVG exists. */
export function Icon({
  id,
  fallback,
  size,
  className = '',
}: {
  id: string;
  fallback?: ReactNode;
  size?: number;
  className?: string;
}) {
  const url = artUrl(id);
  if (!url) return <>{fallback}</>;
  return (
    <img
      className={`icon ${className}`.trim()}
      src={url}
      alt=""
      draggable={false}
      width={size}
      height={size}
    />
  );
}
