import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
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

export const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(function ModalHeader(
  {
    title,
    onClose,
    closeButtonLabel = 'Close modal',
    hideCloseButton = false,
    trailing,
    className,
    children,
    ...props
  },
  ref,
) {
  const resolvedTitle = title ?? children;
  const resolvedTrailing =
    trailing ??
    (!hideCloseButton && onClose ? (
      <IconButton icon="close" size="md" aria-label={closeButtonLabel} onClick={onClose} />
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
    onKeyDown,
    ...props
  },
  ref,
) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const hasGeneratedHeader = header === undefined && title !== undefined;
  const resolvedAriaLabelledBy =
    ariaLabelledBy ?? (hasGeneratedHeader && title ? titleId : undefined);

  useEffect(() => {
    if (!open) {
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

  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeOnEscape, onClose, open]);

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
