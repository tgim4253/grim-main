import { describe, expect, it } from 'vitest';
import { evaluateKeybindingWhen } from './context';
import { resolveKeybinding } from './resolveKeybinding';
import { grimKeybindings, type GrimKeybinding } from './keybindings';

function keyboardEvent(
  key: string,
  init: KeyboardEventInit = {},
  target?: EventTarget,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    key,
    ...init,
  });

  if (target) {
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: target,
    });
  }

  return event;
}

const baseBinding: GrimKeybinding = {
  command: 'grim.currentView.refresh',
  key: { win: 'r', linux: 'r', mac: 'r' },
  scope: 'library',
  when: 'libraryPage && gridFocus && !inputFocus',
};

describe('evaluateKeybindingWhen', () => {
  it('evaluates boolean expressions without eval', () => {
    expect(
      evaluateKeybindingWhen('libraryPage && gridFocus && !inputFocus', {
        gridFocus: true,
        inputFocus: false,
        libraryPage: true,
      }),
    ).toBe(true);
    expect(evaluateKeybindingWhen('missingFlag', {})).toBe(false);
  });

  it('supports numeric context comparisons for count-style contexts', () => {
    expect(
      evaluateKeybindingWhen('selectedReferenceCount > 0', { selectedReferenceCount: 2 }),
    ).toBe(true);
    expect(
      evaluateKeybindingWhen('selectedReferenceCount > 0', { selectedReferenceCount: 0 }),
    ).toBe(false);
  });
});

describe('resolveKeybinding', () => {
  it('resolves a matching keybinding for the active platform and context', () => {
    const resolved = resolveKeybinding(keyboardEvent('r'), {
      context: {
        gridFocus: true,
        inputFocus: false,
        libraryPage: true,
      },
      keybindings: [baseBinding],
      platform: 'linux',
    });

    expect(resolved?.command).toBe('grim.currentView.refresh');
    expect(resolved?.preventDefault).toBe(true);
  });

  it('ignores composing keyboard events', () => {
    const resolved = resolveKeybinding(keyboardEvent('r', { isComposing: true }), {
      context: {
        gridFocus: true,
        inputFocus: false,
        libraryPage: true,
      },
      keybindings: [baseBinding],
      platform: 'linux',
    });

    expect(resolved).toBeNull();
  });

  it('ignores editable targets unless a binding explicitly allows them', () => {
    const input = document.createElement('input');

    expect(
      resolveKeybinding(keyboardEvent('m', {}, input), {
        context: {
          gridFocus: true,
          inputFocus: false,
          referencesView: true,
        },
        keybindings: [
          {
            command: 'grim.references.selection.toggleMode',
            key: { win: 'm', linux: 'm', mac: 'm' },
            scope: 'library',
            when: 'referencesView && gridFocus && !inputFocus',
          },
        ],
        platform: 'linux',
      }),
    ).toBeNull();

    expect(
      resolveKeybinding(keyboardEvent('Escape', {}, input), {
        context: {
          closeable: true,
          modalOpen: true,
        },
        keybindings: [
          {
            allowInEditable: true,
            command: 'grim.modal.close',
            key: { win: 'escape', linux: 'escape', mac: 'escape' },
            scope: 'modal',
            when: 'modalOpen && closeable',
          },
        ],
        platform: 'linux',
      })?.command,
    ).toBe('grim.modal.close');
  });

  it('uses scope priority when multiple commands share a key', () => {
    const resolved = resolveKeybinding(keyboardEvent('Escape'), {
      context: {
        closeable: true,
        modalOpen: true,
        referencesView: true,
        selectionMode: true,
      },
      keybindings: [
        {
          allowInEditable: true,
          command: 'grim.references.selection.clear',
          key: { win: 'escape', linux: 'escape', mac: 'escape' },
          scope: 'library',
          when: 'referencesView && selectionMode',
        },
        {
          allowInEditable: true,
          command: 'grim.modal.close',
          key: { win: 'escape', linux: 'escape', mac: 'escape' },
          scope: 'modal',
          when: 'modalOpen && closeable',
        },
      ],
      platform: 'linux',
    });

    expect(resolved?.command).toBe('grim.modal.close');
  });

  it('selects the platform-specific key only', () => {
    const keybindings: GrimKeybinding[] = [
      {
        command: 'grim.sidebar.toggle',
        key: { win: 'ctrl+b', linux: 'ctrl+b', mac: 'meta+b' },
        scope: 'library',
        when: 'libraryPage',
      },
    ];

    expect(
      resolveKeybinding(keyboardEvent('b', { metaKey: true }), {
        context: { libraryPage: true },
        keybindings,
        platform: 'mac',
      })?.command,
    ).toBe('grim.sidebar.toggle');
    expect(
      resolveKeybinding(keyboardEvent('b', { metaKey: true }), {
        context: { libraryPage: true },
        keybindings,
        platform: 'linux',
      }),
    ).toBeNull();
  });

  it('preserves preventDefault opt-out on the resolved binding', () => {
    const resolved = resolveKeybinding(keyboardEvent('r'), {
      context: {
        gridFocus: true,
        inputFocus: false,
        libraryPage: true,
      },
      keybindings: [
        {
          ...baseBinding,
          preventDefault: false,
        },
      ],
      platform: 'linux',
    });

    expect(resolved?.preventDefault).toBe(false);
  });

  it('resolves default reference bindings with selectedReferenceCount contexts', () => {
    expect(
      resolveKeybinding(keyboardEvent('Enter', { altKey: true }), {
        context: {
          referencesView: true,
          selectedReferenceCount: 1,
        },
        keybindings: grimKeybindings,
        platform: 'linux',
      })?.command,
    ).toBe('grim.references.croquis.start');
  });

  it('resolves the default reference clipboard paste binding', () => {
    expect(
      resolveKeybinding(keyboardEvent('v', { ctrlKey: true }), {
        context: {
          inputFocus: false,
          modalOpen: false,
          referencesView: true,
        },
        keybindings: grimKeybindings,
        platform: 'linux',
      })?.command,
    ).toBe('grim.references.clipboard.paste');

    expect(
      resolveKeybinding(keyboardEvent('v', { metaKey: true }), {
        context: {
          inputFocus: false,
          modalOpen: false,
          referencesView: true,
        },
        keybindings: grimKeybindings,
        platform: 'mac',
      })?.command,
    ).toBe('grim.references.clipboard.paste');
  });

  it('resolves default record bindings with selectedRecordCount contexts', () => {
    expect(
      resolveKeybinding(keyboardEvent('Delete'), {
        context: {
          recordsView: true,
          selectedRecordCount: 1,
          selectionMode: true,
        },
        keybindings: grimKeybindings,
        platform: 'linux',
      })?.command,
    ).toBe('grim.records.deleteSelected');
  });
});
