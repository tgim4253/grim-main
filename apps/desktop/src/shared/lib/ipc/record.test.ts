import { describe, expect, it, vi } from 'vitest';
import { recordIpc } from './record';
import { invokeCamel, invokeRaw } from './core';

vi.mock('./core', () => ({
  invokeCamel: vi.fn(),
  invokeRaw: vi.fn(),
}));

const invokeCamelMock = vi.mocked(invokeCamel);
const invokeRawMock = vi.mocked(invokeRaw);

describe('recordIpc', () => {
  it('calls list/detail/tag wrappers with the expected commands and payload shape', () => {
    void recordIpc.listResults(12);
    void recordIpc.getDetail('record-1');
    void recordIpc.updateTags({ recordId: 'record-2', tagIds: ['tag-a'] });

    expect(invokeCamelMock).toHaveBeenNthCalledWith(1, 'list_recent_record_results', { limit: 12 });
    expect(invokeCamelMock).toHaveBeenNthCalledWith(2, 'get_record_detail', {
      recordId: 'record-1',
    });
    expect(invokeCamelMock).toHaveBeenNthCalledWith(3, 'update_croquis_record_tags', {
      payload: { recordId: 'record-2', tagIds: ['tag-a'] },
    });
  });

  it('calls export_croquis_records with the exact export payload wrapper', () => {
    const payload = {
      recordIds: ['r1', 'r2'],
      outputDirectory: '/tmp/export',
      fileName: 'croquis.png',
      skipIncomplete: true,
      pairLayout: {
        source: { width: 100, height: 200, useRatio: true, ratio: 0.5 },
        result: { width: 100, height: 50, useRatio: true, ratio: 2 },
        gap: 10,
        padding: 5,
        horizontal: true,
      },
      gridLayout: {
        hGap: 20,
        vGap: 30,
        padding: 40,
        limitPerLine: 2,
      },
    };

    void recordIpc.exportRecords(payload);

    expect(invokeCamelMock).toHaveBeenCalledWith('export_croquis_records', { payload });
  });

  it('uses raw invoke for delete commands', () => {
    void recordIpc.delete({ recordId: 'record-1' });

    expect(invokeRawMock).toHaveBeenCalledWith('delete_croquis_record', {
      payload: { recordId: 'record-1' },
    });
  });
});
