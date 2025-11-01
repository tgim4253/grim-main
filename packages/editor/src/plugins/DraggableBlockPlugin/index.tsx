/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';

import './index.css';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin';
import { $createParagraphNode, $getNearestNodeFromDOMNode, $isElementNode } from 'lexical';
import { useRef, useState } from 'react';

const DRAGGABLE_BLOCK_MENU_CLASSNAME = 'draggable-block-menu';

function isOnMenu(element: HTMLElement): boolean {
  return !!element.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`);
}

export default function DraggableBlockPlugin({
  anchorElem = document.body,
}: {
  anchorElem?: HTMLElement;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);
  const [draggableElement, setDraggableElement] = useState<HTMLElement | null>(null);

  const moveBlock = (direction: 'up' | 'down') => {
    if (!draggableElement) {
      return;
    }

    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableElement);
      if (!$isElementNode(node)) {
        return;
      }

      const sibling = direction === 'up' ? node.getPreviousSibling() : node.getNextSibling();

      if (!sibling) {
        return;
      }

      if (direction === 'up') {
        sibling.insertBefore(node);
      } else {
        sibling.insertAfter(node);
      }

      node.select();
    });
  };

  const insertBlockBelow = () => {
    if (!draggableElement) {
      return;
    }

    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableElement);
      if (!node) {
        return;
      }

      const paragraph = $createParagraphNode();
      node.insertAfter(paragraph);
      paragraph.selectStart();
    });
  };

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={
        <div ref={menuRef} className="draggable-block-menu" draggable={false}>
          <button
            type="button"
            className="draggable-block-button"
            title="Move block up"
            aria-label="Move block up"
            onMouseDown={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              moveBlock('up');
            }}
          >
            ↑
          </button>
          <button
            type="button"
            className="draggable-block-button"
            title="Move block down"
            aria-label="Move block down"
            onMouseDown={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              moveBlock('down');
            }}
          >
            ↓
          </button>
          <button
            type="button"
            className="draggable-block-button"
            title="Insert block below"
            aria-label="Insert block below"
            onMouseDown={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={insertBlockBelow}
          >
            +
          </button>
        </div>
      }
      targetLineComponent={<div ref={targetLineRef} className="draggable-block-target-line" />}
      isOnMenu={isOnMenu}
      onElementChanged={setDraggableElement}
    />
  );
}
