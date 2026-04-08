import { useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';
import { IconButton } from '../IconButton';
import './Modal.css';

let bodyScrollLockCount = 0;
let bodyOverflowBeforeLock: string | null = null;

export type ModalSize = 'sm' | 'md' | 'lg';
export type ModalFooterLayout = 'horizontal-fill' | 'horizontal-right' | 'vertical-fill';

type NativeDivProps = Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'>;

export type ModalProps = NativeDivProps & {
  open?: boolean;
  size?: ModalSize;
  title?: ReactNode;
  ariaLabel?: string;
  showHeader?: boolean;
  showCloseButton?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  closeAriaLabel?: string;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  portal?: boolean;
  inline?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
};

type ModalFooterNativeDivProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

export type ModalFooterProps = ModalFooterNativeDivProps & {
  layout?: ModalFooterLayout;
  leading?: ReactNode;
  actionsClassName?: string;
  children: ReactNode;
};

export function ModalFooter({
  layout = 'horizontal-fill',
  leading,
  className,
  actionsClassName,
  children,
  ...props
}: ModalFooterProps) {
  const hasLeading = leading !== undefined && leading !== null;

  return (
    <div
      className={cx(
        'c-modal-footer',
        `c-modal-footer--layout-${layout}`,
        hasLeading && 'c-modal-footer--with-leading',
        className,
      )}
      {...props}
    >
      {hasLeading ? <div className="c-modal-footer__leading">{leading}</div> : null}
      <div className={cx('c-modal-footer__actions', actionsClassName)}>{children}</div>
    </div>
  );
}

export function Modal({
  open = true,
  size = 'md',
  title,
  ariaLabel = 'Modal dialog',
  showHeader = true,
  showCloseButton = true,
  header,
  footer,
  children,
  closeAriaLabel = 'Close modal',
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  lockScroll = true,
  portal = true,
  inline = false,
  className,
  overlayClassName,
  panelClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  ...props
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hasTitle = title !== undefined && title !== null;
  const canClose = Boolean(onClose);
  const titleLabel = typeof title === 'string' ? title : null;

  const shouldRenderHeader = showHeader && (header !== undefined || hasTitle || showCloseButton);
  const labelledById = hasTitle && shouldRenderHeader ? titleId : undefined;
  const accessibleLabel = labelledById ? undefined : (titleLabel ?? ariaLabel);

  useEffect(() => {
    if (!open || !closeOnEscape || !canClose) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      onClose?.();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closeOnEscape, canClose, onClose]);

  useEffect(() => {
    if (!open || !lockScroll || inline) {
      return undefined;
    }

    if (bodyScrollLockCount === 0) {
      bodyOverflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    bodyScrollLockCount += 1;
    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyOverflowBeforeLock ?? '';
        bodyOverflowBeforeLock = null;
      }
    };
  }, [open, lockScroll, inline]);

  useEffect(() => {
    if (!open) {
      return;
    }

    panelRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  const modalNode = (
    <div
      className={cx(
        'c-modal-overlay',
        inline && 'c-modal-overlay--inline',
        overlayClassName,
        className,
      )}
      onMouseDown={event => {
        if (!closeOnOverlayClick || !canClose || event.target !== event.currentTarget) {
          return;
        }
        onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={labelledById}
        aria-label={accessibleLabel}
        className={cx('c-modal', `c-modal--size-${size}`, panelClassName)}
        onMouseDown={event => {
          event.stopPropagation();
        }}
        {...props}
      >
        {shouldRenderHeader ? (
          <div className={cx('c-modal__header', headerClassName)}>
            {header !== undefined ? (
              header
            ) : (
              <>
                {hasTitle ? (
                  <h2 id={titleId} className="c-modal__title">
                    {title}
                  </h2>
                ) : (
                  <span className="c-modal__title-spacer" />
                )}

                {showCloseButton && canClose ? (
                  <IconButton
                    icon="close"
                    size="md"
                    variant="button"
                    className="c-modal__close"
                    aria-label={closeAriaLabel}
                    onClick={() => {
                      onClose?.();
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        ) : null}

        <div className={cx('c-modal__body', bodyClassName)}>{children}</div>

        {footer !== undefined && footer !== null ? (
          <div className={cx('c-modal__footer', footerClassName)}>{footer}</div>
        ) : null}
      </div>
    </div>
  );

  if (!portal || inline || typeof document === 'undefined') {
    return modalNode;
  }

  return createPortal(modalNode, document.body);
}
