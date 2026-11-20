import { describe, expect, it } from 'vitest';
import { isIosDevice, isIosSafari, shouldShowIosTip } from '../../src/ui/ios';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MAC = IPAD_AS_MAC;
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36';

describe('iOS home-screen tip detection', () => {
  it('detects iPhone Safari in a tab', () => {
    expect(shouldShowIosTip({ userAgent: IPHONE, maxTouchPoints: 5 }, false)).toBe(true);
  });

  it('detects iPadOS reporting a Macintosh user agent, but not a real Mac', () => {
    expect(isIosDevice({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })).toBe(true);
    expect(isIosDevice({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
  });

  it('is not shown when installed, already seen, or on other platforms and browsers', () => {
    expect(shouldShowIosTip({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }, false)).toBe(false);
    expect(
      shouldShowIosTip({ userAgent: IPHONE, maxTouchPoints: 5, displayModeStandalone: true }, false),
    ).toBe(false);
    expect(shouldShowIosTip({ userAgent: IPHONE, maxTouchPoints: 5 }, true)).toBe(false);
    expect(shouldShowIosTip({ userAgent: ANDROID, maxTouchPoints: 5 }, false)).toBe(false);
    expect(isIosSafari({ userAgent: CHROME_IOS, maxTouchPoints: 5 })).toBe(false);
  });
});
