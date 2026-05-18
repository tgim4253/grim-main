import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GrimCommandHandlerMap, GrimKeybinding } from '@/shared/lib/keybindings';
import { useKeybindings } from './useKeybindings';

const sidebarBinding: GrimKeybinding = {
  command: 'grim.sidebar.toggle',
  key: { win: 'ctrl+b', linux: 'ctrl+b', mac: 'meta+b' },
  scope: 'library',
  when: 'libraryPage',
};

type HarnessProps = {
  handlers: GrimCommandHandlerMap;
};

function Harness({ handlers }: HarnessProps) {
  useKeybindings({
    context: { libraryPage: true },
    handlers,
    keybindings: [sidebarBinding],
    platform: 'linux',
  });

  return null;
}

describe('useKeybindings', () => {
  it('prevents default and calls the resolved command handler', () => {
    const handler = vi.fn();
    render(<Harness handlers={{ 'grim.sidebar.toggle': handler }} />);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'b',
    });

    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent default when no handler is registered for a resolved command', () => {
    render(<Harness handlers={{}} />);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'b',
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores keyboard events that were already prevented by inner components', () => {
    const handler = vi.fn();
    render(<Harness handlers={{ 'grim.sidebar.toggle': handler }} />);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'b',
    });

    event.preventDefault();
    window.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });
});
