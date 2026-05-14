import { forwardRef, useContext } from 'react';
import { cx } from '../../lib/cx';
import { Icon } from '../icon/Icon';
import { AccordionItemContext } from './accordionContext';
import type { AccordionDisclosureProps } from './types';

export const AccordionDisclosure = forwardRef<HTMLSpanElement, AccordionDisclosureProps>(
  function AccordionDisclosure({ expanded, className, children, ...props }, ref) {
    const itemContext = useContext(AccordionItemContext);
    const resolvedExpanded = expanded ?? itemContext?.expanded ?? false;

    return (
      <span
        {...props}
        ref={ref}
        data-expanded={resolvedExpanded ? 'true' : 'false'}
        className={cx('c-accordion-disclosure', className)}
      >
        {children ? <span className="c-accordion-disclosure__value">{children}</span> : null}
        <Icon
          name={resolvedExpanded ? 'chevron-up' : 'chevron-down'}
          size="xs"
          color={resolvedExpanded ? 'brand' : 'text'}
          hierarchy={resolvedExpanded ? 'primary' : 'tertiary'}
          aria-hidden
        />
      </span>
    );
  },
);
