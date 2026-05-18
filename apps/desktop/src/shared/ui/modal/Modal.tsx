import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useKeybindings } from '../../hooks';
import { cx } from '../../lib/cx';
import { useShortcutFocusStore } from '../../lib/keybindings';
import { IconButton } from '../icon-button/IconButton';
import './modal.css';

export const MODAL_SIZES = ['sm', 'md', 'lg'] as const;
export const MODAL_FOOTER_DIRECTIONS = ['horizontal', 'vertical'] as const;
export const MODAL_FOOTER_ALIGNMENTS = ['fill', 'end'] as const;

export type ModalSize = (typeof MODAL_SIZES)[number];
export type ModalFooterDirection = (typeof MODAL_FOOTER_DIRECTIONS)[number];
export type ModalFooterAlignment = (typeof MODAL_FOOTER_ALIGNMENTS)[number];

export type ModalHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title?: ReactNode;
  onClose?: () => void;
  closeButtonLabel?: string;
  hideCloseButton?: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
};

export type ModalBodyProps = HTMLAttributes<HTMLDivElement>;

export type ModalFooterProps = HTMLAttributes<HTMLDivElement> & {
  direction?: ModalFooterDirection;
  alignment?: ModalFooterAlignment;
  leading?: ReactNode;
};

export type ModalProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  open?: boolean;
  size?: ModalSize;
  title?: ReactNode;
  header?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  dialogClassName?: string;
  bodyClassName?: string;
  closeButtonLabel?: string;
  hideCloseButton?: boolean;
  children?: ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const getFocusableElements = (element: HTMLElement) =>
  Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    candidate =>
      !candidate.hasAttribute('hidden') && candidate.getAttribute('aria-hidden') !== 'true',
  );

const INACTIVE_MODAL_FORM_STATE = {
  formFocus: false,
  multilineInputFocus: false,
};

type ModalFormFocusState = typeof INACTIVE_MODAL_FORM_STATE;

function getActiveElementInDialog(dialogElement: HTMLElement | null) {
  const activeElement =
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  if (!dialogElement || !activeElement || !dialogElement.contains(activeElement)) {
    return null;
  }

  return activeElement;
}

function getFormForElement(element: HTMLElement | null) {
  const formElement = element?.closest('form');
  return formElement instanceof HTMLFormElement ? formElement : null;
}

function isMultilineEditableElement(element: HTMLElement | null) {
  if (!element) {
    return false;
  }

  return (
    element instanceof HTMLTextAreaElement ||
    element.getAttribute('contenteditable') === 'true' ||
    element.getAttribute('contenteditable') === 'plaintext-only'
  );
}

function moveDialogFocus(dialogElement: HTMLElement | null, direction: 1 | -1) {
  if (!dialogElement) {
    return;
  }

  const focusableElements = getFocusableElements(dialogElement);
  if (focusableElements.length === 0) {
    dialogElement.focus();
    return;
  }

  const activeElement = getActiveElementInDialog(dialogElement);
  const currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1;
  const fallbackIndex = direction > 0 ? 0 : focusableElements.length - 1;
  const nextIndex =
    currentIndex === -1
      ? fallbackIndex
      : (currentIndex + direction + focusableElements.length) % focusableElements.length;

  focusableElements[nextIndex]?.focus();
}

export const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(function ModalHeader(
  {
    title,
    onClose,
    closeButtonLabel,
    hideCloseButton = false,
    trailing,
    className,
    children,
    ...props
  },
  ref,
) {
  const { t } = useTranslation('common');
  const resolvedTitle = title ?? children;
  const resolvedCloseButtonLabel =
    closeButtonLabel ?? t('common.close_modal', { defaultValue: 'Close modal' });
  const resolvedTrailing =
    trailing ??
    (!hideCloseButton && onClose ? (
      <IconButton icon="close" size="md" aria-label={resolvedCloseButtonLabel} onClick={onClose} />
    ) : null);

  return (
    <div {...props} ref={ref} className={cx('c-modal-header', className)}>
      <div className="c-modal-header__title">{resolvedTitle}</div>
      {resolvedTrailing}
    </div>
  );
});

export const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(function ModalBody(
  { className, children, ...props },
  ref,
) {
  return (
    <div {...props} ref={ref} className={cx('c-modal-body', className)}>
      {children}
    </div>
  );
});

export const ModalFooter = forwardRef<HTMLDivElement, ModalFooterProps>(function ModalFooter(
  { direction = 'horizontal', alignment = 'end', leading, className, children, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cx(
        'c-modal-footer',
        `c-modal-footer--direction-${direction}`,
        `c-modal-footer--alignment-${alignment}`,
        leading !== null && leading !== undefined && 'c-modal-footer--with-leading',
        className,
      )}
    >
      {leading ? <div className="c-modal-footer__leading">{leading}</div> : null}
      <div className="c-modal-footer__actions">{children}</div>
    </div>
  );
});

export const Modal = forwardRef<HTMLDivElement, ModalProps>(function Modal(
  {
    open = true,
    size = 'sm',
    title,
    header,
    body,
    footer,
    onClose,
    closeOnEscape = true,
    closeOnOverlayClick = true,
    dialogClassName,
    bodyClassName,
    closeButtonLabel,
    hideCloseButton = false,
    className,
    children,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    onBlurCapture,
    onFocusCapture,
    onKeyDown,
    ...props
  },
  ref,
) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pushShortcutModal = useShortcutFocusStore(state => state.pushModal);
  const popShortcutModal = useShortcutFocusStore(state => state.popModal);
  const [formFocusState, setFormFocusState] =
    useState<ModalFormFocusState>(INACTIVE_MODAL_FORM_STATE);
  const hasGeneratedHeader = header === undefined && title !== undefined;
  const resolvedAriaLabelledBy =
    ariaLabelledBy ?? (hasGeneratedHeader && title ? titleId : undefined);
  const refreshFormFocusState = useCallback((target?: EventTarget | null) => {
    const dialogElement = dialogRef.current;
    const focusTarget =
      target instanceof HTMLElement ? target : getActiveElementInDialog(dialogElement);
    const formElement =
      dialogElement && focusTarget && dialogElement.contains(focusTarget)
        ? getFormForElement(focusTarget)
        : null;
    const nextState = {
      formFocus: Boolean(formElement),
      multilineInputFocus: isMultilineEditableElement(focusTarget),
    };

    setFormFocusState(current =>
      current.formFocus === nextState.formFocus &&
      current.multilineInputFocus === nextState.multilineInputFocus
        ? current
        : nextState,
    );
  }, []);
  const submitActiveForm = useCallback(() => {
    const formElement = getFormForElement(getActiveElementInDialog(dialogRef.current));
    if (!formElement) {
      return;
    }

    formElement.requestSubmit();
  }, []);
  const cancelActiveForm = useCallback(() => {
    const formElement = getFormForElement(getActiveElementInDialog(dialogRef.current));
    formElement?.reset();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    pushShortcutModal();
    return () => {
      popShortcutModal();
    };
  }, [open, popShortcutModal, pushShortcutModal]);

  useEffect(() => {
    if (!open) {
      setFormFocusState(INACTIVE_MODAL_FORM_STATE);
      return;
    }

    const dialogElement = dialogRef.current;
    if (!dialogElement) {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => {
      const focusableElements = getFocusableElements(dialogElement);
      const initialFocusTarget = focusableElements[0] ?? dialogElement;
      initialFocusTarget.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      previousActiveElement?.focus();
    };
  }, [open]);

  useKeybindings({
    context: {
      canSubmit: formFocusState.formFocus,
      closeable: closeOnEscape && Boolean(onClose),
      dirty: formFocusState.formFocus,
      formFocus: formFocusState.formFocus,
      modalOpen: open,
      multilineInputFocus: formFocusState.multilineInputFocus,
    },
    enabled: open,
    handlers: {
      'grim.focus.next': () => {
        moveDialogFocus(dialogRef.current, 1);
      },
      'grim.focus.previous': () => {
        moveDialogFocus(dialogRef.current, -1);
      },
      'grim.form.cancel': cancelActiveForm,
      'grim.form.save': submitActiveForm,
      'grim.form.submit': submitActiveForm,
      'grim.modal.close': () => {
        onClose?.();
      },
    },
  });

  if (!open) {
    return null;
  }

  const handleOverlayClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!closeOnOverlayClick || !onClose) {
      return;
    }

    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleDialogFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    onFocusCapture?.(event);
    refreshFormFocusState(event.target);
  };

  const handleDialogBlurCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    onBlurCapture?.(event);
    window.requestAnimationFrame(() => {
      refreshFormFocusState();
    });
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Tab') {
      return;
    }

    const dialogElement = dialogRef.current;
    if (!dialogElement) {
      return;
    }

    const focusableElements = getFocusableElements(dialogElement);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogElement.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!activeElement || !dialogElement.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
      return;
    }

    if (event.shiftKey) {
      if (activeElement === firstElement || activeElement === dialogElement) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const resolvedHeader =
    header ??
    (title !== undefined ? (
      <ModalHeader
        title={title}
        onClose={onClose}
        closeButtonLabel={closeButtonLabel}
        hideCloseButton={hideCloseButton}
        id={resolvedAriaLabelledBy}
      />
    ) : null);

  const resolvedBody =
    body ?? (children ? <ModalBody className={bodyClassName}>{children}</ModalBody> : null);
  const hasHeader = resolvedHeader !== null;
  const hasBody = resolvedBody !== null;
  const hasFooter = footer !== null && footer !== undefined;

  return (
    <div className="c-modal-overlay" onClick={handleOverlayClick}>
      <div
        {...props}
        ref={node => {
          dialogRef.current = node;

          if (typeof ref === 'function') {
            ref(node);
            return;
          }

          if (ref) {
            ref.current = node;
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={resolvedAriaLabelledBy}
        onBlurCapture={handleDialogBlurCapture}
        onFocusCapture={handleDialogFocusCapture}
        onKeyDown={handleDialogKeyDown}
        tabIndex={-1}
        className={cx(
          'c-modal',
          `c-modal--size-${size}`,
          hasHeader && 'c-modal--has-header',
          hasBody && 'c-modal--has-body',
          hasFooter && 'c-modal--has-footer',
          className,
          dialogClassName,
        )}
      >
        {resolvedHeader ? <div className="c-modal__header-slot">{resolvedHeader}</div> : null}
        {resolvedBody ? <div className="c-modal__body-slot">{resolvedBody}</div> : null}
        {footer ? <div className="c-modal__footer-slot">{footer}</div> : null}
      </div>
    </div>
  );
});
