// Detecting iOS Safari in a browser tab, where the home-screen tip applies. Pure, so it can be tested.
export interface IosEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** `navigator.standalone` (Safari only). */
  standalone?: boolean;
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone?: boolean;
}

/** iPhone, iPad, or an iPad that reports itself as a Mac (iPadOS 13+ desktop-class Safari). */
export function isIosDevice(env: Pick<IosEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

/** Safari itself, not Chrome, Firefox, Edge or Opera on iOS. */
export function isIosSafari(env: Pick<IosEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
  return isIosDevice(env) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(env.userAgent);
}

/** True when the Install tip should be offered: iOS Safari, not running from the home screen. */
export function shouldShowIosTip(env: IosEnv, seen: boolean): boolean {
  if (seen) return false;
  if (!isIosSafari(env)) return false;
  return env.standalone !== true && env.displayModeStandalone !== true;
}

export function currentIosEnv(): IosEnv {
  if (typeof navigator === 'undefined') return { userAgent: '', maxTouchPoints: 0 };
  let displayModeStandalone = false;
  try {
    displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    // no matchMedia
  }
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayModeStandalone,
  };
}
