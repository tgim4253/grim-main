import { forwardRef, useContext, useEffect } from 'react';
import { cx } from '../../lib/cx';
import { AccordionItemContext } from './accordionContext';
import type { AccordionItemBodyProps } from './types';

export const AccordionItemBody = forwardRef<HTMLDivElement, AccordionItemBodyProps>(
  function AccordionItemBody(
    { expanded, labelledBy, keepMounted = true, className, children, id, ...props },
    ref,
  ) {
    const itemContext = useContext(AccordionItemContext);
    const resolvedExpanded = expanded ?? itemContext?.expanded ?? true;
    const resolvedId = id ?? itemContext?.bodyId;
    const resolvedLabelledBy = labelledBy ?? itemContext?.triggerId;
    const isRendered = keepMounted || resolvedExpanded;
    const registerBody = itemContext?.setHasBody;

    useEffect(() => {
      if (!registerBody) {
        return;
      }

      registerBody(isRendered);

      return () => {
        registerBody(false);
      };
    }, [isRendered, registerBody]);

    if (!isRendered) {
      return null;
    }

    return (
      <div
        {...props}
        ref={ref}
        id={resolvedId}
        role={resolvedLabelledBy ? 'region' : undefined}
        aria-labelledby={resolvedLabelledBy}
        aria-hidden={!resolvedExpanded}
        data-expanded={resolvedExpanded ? 'true' : 'false'}
        className={cx('c-accordion-item__body', className)}
      >
        {children}
      </div>
    );
  },
);
