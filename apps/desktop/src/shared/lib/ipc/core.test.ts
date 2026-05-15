import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeCamel, invokeRaw } from './core';

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

describe('IPC core wrappers', () => {
  it('converts snake_case response keys to camelCase for invokeCamel', async () => {
    invokeMock.mockResolvedValueOnce({
      outer_key: {
        nested_key: 'value',
        nested_items: [{ item_id: 'a' }],
      },
    });

    await expect(invokeCamel('load_library_snapshot')).resolves.toEqual({
      outerKey: {
        nestedKey: 'value',
        nestedItems: [{ itemId: 'a' }],
      },
    });
    expect(invokeMock).toHaveBeenCalledWith('load_library_snapshot', undefined);
  });

  it('passes payloads through and leaves invokeRaw responses untouched', async () => {
    const response = { raw_key: 'kept' };
    invokeMock.mockResolvedValueOnce(response);

    await expect(invokeRaw('get_record_detail', { recordId: 'record-1' })).resolves.toBe(response);
    expect(invokeMock).toHaveBeenCalledWith('get_record_detail', { recordId: 'record-1' });
  });
});
