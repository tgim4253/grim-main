import { describe, expect, it } from 'vitest';
import {
  getGrimPlatformFromUserAgent,
  isLinuxPlatform,
  isMacPlatform,
  isWindowsPlatform,
} from './platform';

describe('platform utilities', () => {
  it('detects mac-like user agents', () => {
    expect(getGrimPlatformFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(
      'mac',
    );
    expect(getGrimPlatformFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(
      'mac',
    );
    expect(getGrimPlatformFromUserAgent('Darwin')).toBe('mac');
  });

  it('detects windows user agents', () => {
    expect(getGrimPlatformFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('win');
  });

  it('falls back to linux for unknown user agents', () => {
    expect(getGrimPlatformFromUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(getGrimPlatformFromUserAgent('unknown')).toBe('linux');
  });

  it('checks explicit platform values', () => {
    expect(isMacPlatform('mac')).toBe(true);
    expect(isWindowsPlatform('win')).toBe(true);
    expect(isLinuxPlatform('linux')).toBe(true);
  });
});
