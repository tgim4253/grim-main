import { describe, expect, it } from 'vitest';
import { normalizeKeyEvent } from './normalizeKeyEvent';

describe('normalizeKeyEvent', () => {
  it('normalizes macOS command palette shortcuts', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'P',
      metaKey: true,
      shiftKey: true,
    });

    expect(normalizeKeyEvent(event)).toBe('meta+shift+p');
  });

  it('normalizes control shortcuts with punctuation', () => {
    const event = new KeyboardEvent('keydown', {
      key: ',',
      ctrlKey: true,
    });

    expect(normalizeKeyEvent(event)).toBe('ctrl+,');
  });

  it('normalizes space aliases', () => {
    expect(normalizeKeyEvent(new KeyboardEvent('keydown', { key: ' ' }))).toBe('space');
    expect(normalizeKeyEvent(new KeyboardEvent('keydown', { key: 'Spacebar' }))).toBe('space');
  });

  it('prefers physical key codes for layout-independent single-letter shortcuts', () => {
    expect(
      normalizeKeyEvent(
        new KeyboardEvent('keydown', {
          code: 'KeyM',
          key: 'ㅡ',
        }),
      ),
    ).toBe('m');
  });

  it('prefers physical digit codes for layout-independent numeric shortcuts', () => {
    expect(
      normalizeKeyEvent(
        new KeyboardEvent('keydown', {
          code: 'Digit1',
          key: '!',
          shiftKey: true,
        }),
      ),
    ).toBe('shift+1');
  });

  it('normalizes destructive macOS delete shortcuts', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      metaKey: true,
    });

    expect(normalizeKeyEvent(event)).toBe('meta+backspace');
  });

  it('keeps modifier order stable and avoids duplicate modifier keys', () => {
    expect(
      normalizeKeyEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
        }),
      ),
    ).toBe('shift+tab');
    expect(
      normalizeKeyEvent(
        new KeyboardEvent('keydown', {
          key: 'Shift',
          shiftKey: true,
        }),
      ),
    ).toBe('shift');
  });
});
