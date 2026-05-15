import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionPreset } from '@/shared/types';
import {
  ACTIVE_SESSION_PRESET_STORAGE_KEY,
  findFallbackPreset,
  getStoredActiveSessionPresetId,
  setStoredActiveSessionPresetId,
} from './activePreset';

const now = '2026-01-01T00:00:00.000Z';

function preset(id: string, isDefault = false): SessionPreset {
  return {
    id,
    name: id,
    isDefault,
    isShuffle: false,
    autoTags: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('active session preset storage', () => {
  it('sets, reads, and removes the active preset id', () => {
    setStoredActiveSessionPresetId('preset-1');
    expect(getStoredActiveSessionPresetId()).toBe('preset-1');
    expect(localStorage.getItem(ACTIVE_SESSION_PRESET_STORAGE_KEY)).toBe('preset-1');

    setStoredActiveSessionPresetId(null);
    expect(getStoredActiveSessionPresetId()).toBeNull();
  });
});

describe('findFallbackPreset', () => {
  it('prefers stored active preset, then default, then first preset, then null', () => {
    const presets = [preset('first'), preset('default', true), preset('active')];

    expect(findFallbackPreset(presets, 'active')?.id).toBe('active');
    expect(findFallbackPreset(presets, 'missing')?.id).toBe('default');
    expect(findFallbackPreset([preset('first'), preset('second')], null)?.id).toBe('first');
    expect(findFallbackPreset([], null)).toBeNull();
  });

  it('uses localStorage when active id is omitted', () => {
    setStoredActiveSessionPresetId('active');

    expect(findFallbackPreset([preset('first'), preset('active')])?.id).toBe('active');
  });
});
