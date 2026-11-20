import type { ReactNode } from 'react';
import { useApp, type Screen } from '../app';

export function ScreenFrame({
  title,
  back = 'menu',
  children,
  footer,
  label,
}: {
  title: string;
  back?: Screen | null;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
}) {
  const go = useApp((s) => s.go);
  return (
    <main className="screen" aria-label={label ?? title}>
      <header className="screen__header">
        {back && (
          <button type="button" className="icon-button" aria-label="Back" onClick={() => go(back)}>
            ‹
          </button>
        )}
        <h1>{title}</h1>
      </header>
      <div className="screen__body">{children}</div>
      {footer && <footer className="screen__footer">{footer}</footer>}
    </main>
  );
}
