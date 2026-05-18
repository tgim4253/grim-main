export type GrimPlatform = 'win' | 'linux' | 'mac';

const MAC_PLATFORM_PATTERN = /mac|darwin|iphone|ipad|ipod/i;
const WINDOWS_PLATFORM_PATTERN = /windows|win32|win64|wow64/i;

export function getGrimPlatformFromUserAgent(userAgent: string): GrimPlatform {
  if (MAC_PLATFORM_PATTERN.test(userAgent)) {
    return 'mac';
  }

  if (WINDOWS_PLATFORM_PATTERN.test(userAgent)) {
    return 'win';
  }

  return 'linux';
}

export function getCurrentGrimPlatform(): GrimPlatform {
  if (typeof navigator === 'undefined') {
    return 'linux';
  }

  return getGrimPlatformFromUserAgent(navigator.userAgent);
}

export function isMacPlatform(platform: GrimPlatform = getCurrentGrimPlatform()): boolean {
  return platform === 'mac';
}

export function isWindowsPlatform(platform: GrimPlatform = getCurrentGrimPlatform()): boolean {
  return platform === 'win';
}

export function isLinuxPlatform(platform: GrimPlatform = getCurrentGrimPlatform()): boolean {
  return platform === 'linux';
}
