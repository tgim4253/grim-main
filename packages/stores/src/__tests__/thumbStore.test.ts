import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SpyInstance } from 'vitest';

import { useThumbStore } from '../thumbStore';
import type { ThumbEntry } from '@tgim/types/file';

describe('thumbStore', () => {
  let nowSpy: SpyInstance;
  let revokeSpy: SpyInstance;

  beforeEach(() => {
    const timestamps = [1000, 2000, 3000, 4000, 5000];
    let last = timestamps[0];

    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      if (timestamps.length > 0) {
        last = timestamps.shift()!;
      }
      return last;
    });

    revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    useThumbStore.setState({
      byKey: {},
      byHash: {},
      lru: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useThumbStore.setState({
      byKey: {},
      byHash: {},
      lru: [],
    });
  });

  test('upsert transitions entries to ready and appends to the LRU once', () => {
    const { upsert } = useThumbStore.getState();

    upsert('thumb-1', { status: 'pending' });

    let state = useThumbStore.getState();
    expect(state.byKey['thumb-1']).toMatchObject({ status: 'pending', updatedAt: 1000 });
    expect(state.lru).toEqual([]);

    upsert('thumb-1', { status: 'ready', url: 'blob:thumb-1' });

    state = useThumbStore.getState();
    expect(state.byKey['thumb-1']).toMatchObject({ status: 'ready', url: 'blob:thumb-1', updatedAt: 2000 });
    expect(state.lru).toEqual(['thumb-1']);

    upsert('thumb-1', { status: 'ready', url: 'blob:thumb-1' });

    state = useThumbStore.getState();
    expect(state.byKey['thumb-1']).toMatchObject({ status: 'ready', url: 'blob:thumb-1', updatedAt: 3000 });
    expect(state.lru).toEqual(['thumb-1']);
    expect(revokeSpy).not.toHaveBeenCalled();
    expect(nowSpy).toHaveBeenCalledTimes(3);
  });

  test('touch moves existing keys to the most recently used position', () => {
    useThumbStore.setState({
      lru: ['first', 'second', 'third'],
    });

    const { touch } = useThumbStore.getState();

    touch('second');
    expect(useThumbStore.getState().lru).toEqual(['first', 'third', 'second']);

    touch('first');
    expect(useThumbStore.getState().lru).toEqual(['third', 'second', 'first']);
  });

  test('evictLRU trims the cache, clears blob URLs, and keeps other entries intact', () => {
    const entries: Record<string, ThumbEntry> = {
      first: { status: 'ready', url: 'blob:first', updatedAt: 1 },
      second: { status: 'ready', url: 'blob:second', updatedAt: 2 },
      third: { status: 'ready', url: 'https://example.com/third', updatedAt: 3 },
      fourth: { status: 'pending', updatedAt: 4 },
    };

    useThumbStore.setState({
      byKey: entries,
      lru: ['first', 'second', 'third', 'fourth'],
    });

    const { evictLRU } = useThumbStore.getState();

    evictLRU(2);

    const state = useThumbStore.getState();
    expect(state.lru).toEqual(['third', 'fourth']);
    expect(state.byKey.first?.url).toBeUndefined();
    expect(state.byKey.second?.url).toBe('blob:second');
    expect(state.byKey.third?.url).toBe('https://example.com/third');
    expect(state.byKey.fourth?.status).toBe('pending');
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
  });

  test('getThumbPathByKey returns URLs for ready entries and touches the key', () => {
    const readyEntry: ThumbEntry = { status: 'ready', url: 'blob:ready', updatedAt: 10 };
    const pendingEntry: ThumbEntry = { status: 'pending', url: 'blob:pending', updatedAt: 20 };

    useThumbStore.setState({
      byKey: {
        ready: readyEntry,
        pending: pendingEntry,
      },
      lru: ['ready', 'pending'],
    });

    const readyUrl = useThumbStore.getState().getThumbPathByKey('ready');
    expect(readyUrl).toBe('blob:ready');
    expect(useThumbStore.getState().lru).toEqual(['pending', 'ready']);

    const pendingUrl = useThumbStore.getState().getThumbPathByKey('pending');
    expect(pendingUrl).toBeUndefined();
    expect(useThumbStore.getState().lru).toEqual(['pending', 'ready']);
  });
});
