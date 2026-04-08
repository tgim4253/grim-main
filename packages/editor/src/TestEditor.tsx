import { type JSX, useEffect, useMemo, useRef, type MutableRefObject } from 'react';

import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { defineExtension, $createParagraphNode, $getRoot } from 'lexical';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';

import { buildHTMLConfig } from './buildHTMLConfig';
import { FlashMessageContext } from './context/FlashMessageContext';
import { SettingsContext } from './context/SettingsContext';
import { SharedHistoryContext } from './context/SharedHistoryContext';
import { ToolbarContext } from './context/ToolbarContext';
import Editor from './Editor';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { TableContext } from './plugins/TablePlugin';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
import { PLAYGROUND_TRANSFORMERS } from './plugins/MarkdownTransformers';
import './index.css';

import joinClasses from './utils/joinClasses';
import type { EditorState, LexicalCommand } from 'lexical';

export type EditorBridge = {
  focus: () => void;
  getEditorState: () => EditorState;
  dispatchCommand: <T>(type: LexicalCommand<T>, payload: T) => void;
  getRootElement?: () => HTMLElement | null;
};

interface TestEditorProps {
  docKey?: string;
  initialMarkdown?: string;
  onMarkdownChange?: (markdown: string) => void;
  className?: string;
  editorRef?: MutableRefObject<EditorBridge | null>;
}

type MarkdownBridgeProps = {
  docKey: string;
  initialMarkdown?: string;
  onMarkdownChange?: (markdown: string) => void;
};

type EditorRefBridgeProps = {
  editorRef?: MutableRefObject<EditorBridge | null>;
};

const EditorRefBridgePlugin = ({ editorRef }: EditorRefBridgeProps) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      focus: () => {
        editor.focus();
      },
      getEditorState: () => editor.getEditorState(),
      dispatchCommand: (type, payload) => editor.dispatchCommand(type, payload),
      getRootElement: () => editor.getRootElement(),
    };
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  return null;
};

const MarkdownBridgePlugin = ({
  docKey,
  initialMarkdown,
  onMarkdownChange,
}: MarkdownBridgeProps) => {
  const [editor] = useLexicalComposerContext();
  const lastEmittedRef = useRef<string>('');

  useEffect(() => {
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const markdown = initialMarkdown ?? '';
      if (markdown.trim().length > 0) {
        $convertFromMarkdownString(markdown, PLAYGROUND_TRANSFORMERS);
      } else {
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select();
      }
    });
    lastEmittedRef.current = initialMarkdown ?? '';
  }, [docKey, editor, initialMarkdown]);

  useEffect(() => {
    if (!onMarkdownChange) {
      return editor.registerUpdateListener(() => {});
    }

    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const markdown = $convertToMarkdownString(PLAYGROUND_TRANSFORMERS);
        if (markdown === lastEmittedRef.current) {
          return;
        }
        lastEmittedRef.current = markdown;
        onMarkdownChange(markdown);
      });
    });
  }, [editor, onMarkdownChange]);

  return null;
};

/**
 * Minimal wrapper that wires the Lexical playground editor with the smallest
 * amount of surrounding context so we can embed it in stories, demos, or tests.
 */
export default function TestEditor({
  docKey = 'default',
  initialMarkdown,
  onMarkdownChange,
  className,
  editorRef,
}: TestEditorProps): JSX.Element {
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
    [docKey],
  );

  return (
    <SettingsContext>
      <FlashMessageContext>
        <LexicalCollaboration>
          <LexicalExtensionComposer key={docKey} extension={extension} contentEditable={null}>
            <SharedHistoryContext>
              <TableContext>
                <ToolbarContext>
                  <MarkdownBridgePlugin
                    docKey={docKey}
                    initialMarkdown={initialMarkdown}
                    onMarkdownChange={onMarkdownChange}
                  />
                  <EditorRefBridgePlugin editorRef={editorRef} />
                  <div
                    className={joinClasses('grim-editor', className)}
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
