import type { JSX } from 'react';

import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { defineExtension } from 'lexical';
import { useMemo } from 'react';

import { buildHTMLConfig } from './buildHTMLConfig';
import { FlashMessageContext } from './context/FlashMessageContext';
import { SettingsContext } from './context/SettingsContext';
import { SharedHistoryContext } from './context/SharedHistoryContext';
import { ToolbarContext } from './context/ToolbarContext';
import Editor from './Editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { TableContext } from './plugins/TablePlugin';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
import './index.css';

/**
 * Minimal wrapper that wires the Lexical playground editor with the smallest
 * amount of surrounding context so we can embed it in stories, demos, or tests.
 */
export default function TestEditor(): JSX.Element {
  const extension = useMemo(
    () =>
      defineExtension({
        $initialEditorState: undefined,
        html: buildHTMLConfig(),
        name: 'TestEditor',
        namespace: 'Playground',
        nodes: PlaygroundNodes,
        theme: PlaygroundEditorTheme,
      }),
    [],
  );

  return (
    <SettingsContext>
      <FlashMessageContext>
        <LexicalCollaboration>
          <LexicalExtensionComposer extension={extension} contentEditable={null}>
            <SharedHistoryContext>
              <TableContext>
                <ToolbarContext>
                  <div
                    className="grim-editor"
                    onPointerDownCapture={event => {
                      event.stopPropagation();
                      const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
                        dndKit?: unknown;
                      };
                      nativeEvent.dndKit = { capturedBy: 'grim-editor' };
                    }}
                    onMouseDownCapture={event => {
                      event.stopPropagation();
                      const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
                        dndKit?: unknown;
                      };
                      nativeEvent.dndKit = { capturedBy: 'grim-editor' };
                    }}
                    onTouchStartCapture={event => {
                      event.stopPropagation();
                      const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
                        dndKit?: unknown;
                      };
                      nativeEvent.dndKit = { capturedBy: 'grim-editor' };
                    }}
                  >
                    <div className="editor-shell">
                      <Editor />
                    </div>
                  </div>
                </ToolbarContext>
              </TableContext>
            </SharedHistoryContext>
          </LexicalExtensionComposer>
        </LexicalCollaboration>
      </FlashMessageContext>
    </SettingsContext>
  );
}
