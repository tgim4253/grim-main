import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CroquisRecordDetail, RecordExportGridLayoutConfig } from '@/shared/types';
import { buildFinalExportLayout, buildRecordPairBlock } from '../model/layout';
import type { RecordExportPairLayoutDraftConfig } from '../model/types';

const PAIR_PREVIEW_WIDTH = 560;
const PAIR_PREVIEW_HEIGHT = 300;
const PAIR_PREVIEW_INSET = 16;
const PAIR_PREVIEW_LABEL_GAP = 8;
const PAIR_PREVIEW_LABEL_HEIGHT = 16;
const PAIR_PREVIEW_LABEL_STACK_HEIGHT = PAIR_PREVIEW_LABEL_GAP + PAIR_PREVIEW_LABEL_HEIGHT;

const getScale = (width: number, height: number, maxWidth: number, maxHeight: number) =>
  Math.min(1, maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1));

function scaled(value: number, scale: number) {
  return Math.max(1, Math.round(value * scale));
}

function scaledPosition(value: number, scale: number) {
  return Math.round(value * scale);
}

function useElementWidth<TElement extends HTMLElement>() {
  const ref = useRef<TElement | null>(null);
  const [width, setWidth] = useState(PAIR_PREVIEW_WIDTH);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(1, Math.round(element.getBoundingClientRect().width));
      setWidth(currentWidth => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, width] as const;
}

type RecordExportPairPreviewProps = {
  record?: CroquisRecordDetail;
  pairLayout: RecordExportPairLayoutDraftConfig;
  sourceLabel: string;
  resultLabel: string;
  emptyLabel: string;
};

export function RecordExportPairPreview({
  record,
  pairLayout,
  sourceLabel,
  resultLabel,
  emptyLabel,
}: RecordExportPairPreviewProps) {
  const [previewRef, previewWidth] = useElementWidth<HTMLDivElement>();
  const block = useMemo(
    () => (record ? buildRecordPairBlock(record, pairLayout) : null),
    [pairLayout, record],
  );

  if (!block) {
    return (
      <div ref={previewRef} className="record-export-pair-preview" aria-hidden="true">
        <div className="record-export-pair-preview__empty">{emptyLabel}</div>
      </div>
    );
  }

  const availableWidth = Math.max(1, previewWidth - PAIR_PREVIEW_INSET * 2);
  const availableHeight = Math.max(
    1,
    PAIR_PREVIEW_HEIGHT - PAIR_PREVIEW_INSET * 2 - PAIR_PREVIEW_LABEL_STACK_HEIGHT,
  );
  const scale = getScale(block.width, block.height, availableWidth, availableHeight);
  const blockWidth = scaled(block.width, scale);
  const blockHeight = scaled(block.height, scale);
  const visualHeight = blockHeight + PAIR_PREVIEW_LABEL_STACK_HEIGHT;
  const blockLeft = Math.max(0, Math.round((previewWidth - blockWidth) / 2));
  const blockTop = Math.max(0, Math.round((PAIR_PREVIEW_HEIGHT - visualHeight) / 2));

  return (
    <div ref={previewRef} className="record-export-pair-preview" aria-hidden="true">
      <div
        className="record-export-pair-preview__block"
        style={{
          left: blockLeft,
          top: blockTop,
          width: blockWidth,
          height: blockHeight,
        }}
      >
        <span
          className="record-export-pair-preview__image record-export-pair-preview__image--source"
          style={{
            left: scaledPosition(block.source.x, scale),
            top: scaledPosition(block.source.y, scale),
            width: scaled(block.source.width, scale),
            height: scaled(block.source.height, scale),
          }}
        />
        <span
          className="record-export-pair-preview__image record-export-pair-preview__image--result"
          style={{
            left: scaledPosition(block.result.x, scale),
            top: scaledPosition(block.result.y, scale),
            width: scaled(block.result.width, scale),
            height: scaled(block.result.height, scale),
          }}
        />
        <span
          className="record-export-pair-preview__label"
          style={{
            left: Math.round((block.source.x + block.source.width / 2) * scale),
            top:
              scaledPosition(block.source.y + block.source.height, scale) + PAIR_PREVIEW_LABEL_GAP,
          }}
        >
          {sourceLabel}
        </span>
        <span
          className="record-export-pair-preview__label"
          style={{
            left: Math.round((block.result.x + block.result.width / 2) * scale),
            top:
              scaledPosition(block.result.y + block.result.height, scale) + PAIR_PREVIEW_LABEL_GAP,
          }}
        >
          {resultLabel}
        </span>
      </div>
    </div>
  );
}

type RecordExportMasonryPreviewProps = {
  records: readonly CroquisRecordDetail[];
  pairLayout: RecordExportPairLayoutDraftConfig;
  gridLayout: RecordExportGridLayoutConfig;
};

export function RecordExportMasonryPreview({
  records,
  pairLayout,
  gridLayout,
}: RecordExportMasonryPreviewProps) {
  const layout = useMemo(
    () => buildFinalExportLayout(records, pairLayout, gridLayout),
    [gridLayout, pairLayout, records],
  );
  const previewWidth = scaled(layout.width, layout.scale);
  const previewHeight = scaled(layout.height, layout.scale);

  return (
    <div className="record-export-masonry-preview" aria-hidden="true">
      <div
        className="record-export-masonry-preview__stage"
        style={{ width: previewWidth, height: previewHeight }}
      >
        {layout.blocks.map((block, index) => (
          <div
            key={`${block.recordId}-${String(index)}`}
            className="record-export-masonry-preview__block"
            style={{
              left: scaledPosition(block.x, layout.scale),
              top: scaledPosition(block.y, layout.scale),
              width: scaled(block.width, layout.scale),
              height: scaled(block.height, layout.scale),
            }}
          >
            <span
              className="record-export-masonry-preview__image record-export-masonry-preview__image--source"
              style={{
                left: scaledPosition(block.source.x, layout.scale),
                top: scaledPosition(block.source.y, layout.scale),
                width: scaled(block.source.width, layout.scale),
                height: scaled(block.source.height, layout.scale),
              }}
            />
            <span
              className="record-export-masonry-preview__image record-export-masonry-preview__image--result"
              style={{
                left: scaledPosition(block.result.x, layout.scale),
                top: scaledPosition(block.result.y, layout.scale),
                width: scaled(block.result.width, layout.scale),
                height: scaled(block.result.height, layout.scale),
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
