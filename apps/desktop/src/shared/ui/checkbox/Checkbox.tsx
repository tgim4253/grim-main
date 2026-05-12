import {
  forwardRef,
  type ChangeEventHandler,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useState,
} from 'react';
import { cx } from '../../lib/cx';
import './checkbox.css';

export const CHECKBOX_SIZES = ['sm', 'md', 'lg'] as const;
export const CHECKBOX_ROW_WIDTHS = ['hug', 'full'] as const;

export type CheckboxSize = (typeof CHECKBOX_SIZES)[number];
export type CheckboxRowWidth = (typeof CHECKBOX_ROW_WIDTHS)[number];

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & {
  size?: CheckboxSize;
  onCheckedChange?: (checked: boolean) => void;
};

export type CheckboxRowProps = Omit<CheckboxProps, 'className' | 'style'> & {
  label: ReactNode;
  width?: CheckboxRowWidth;
  className?: string;
  style?: CSSProperties;
  checkboxClassName?: string;
  labelClassName?: string;
};

export type CheckboxConditionalRowProps = Omit<CheckboxRowProps, 'className' | 'style'> & {
  className?: string;
  style?: CSSProperties;
  rowClassName?: string;
  children?: ReactNode;
  childrenClassName?: string;
  expanded?: boolean;
};

export type CheckboxProgressConditionalRowProps = Omit<
  CheckboxRowProps,
  'className' | 'style' | 'value'
> & {
  className?: string;
  style?: CSSProperties;
  rowClassName?: string;
  childrenClassName?: string;
  rangeClassName?: string;
  valueClassName?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  expanded?: boolean;
  valueFormatter?: (value: number) => ReactNode;
  rangeAriaLabel?: string;
  onValueChange?: (value: number) => void;
};

const SIZE_CLASS_NAMES: Record<CheckboxSize, string> = {
  sm: 'c-checkbox--sm',
  md: 'c-checkbox--md',
  lg: 'c-checkbox--lg',
};

const ROW_SIZE_CLASS_NAMES: Record<CheckboxSize, string> = {
  sm: 'c-checkbox-row--sm',
  md: 'c-checkbox-row--md',
  lg: 'c-checkbox-row--lg',
};

const ROW_WIDTH_CLASS_NAMES: Record<CheckboxRowWidth, string> = {
  hug: 'c-checkbox-row--width-hug',
  full: 'c-checkbox-row--width-full',
};

const clampProgressValue = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
};

const formatProgressPercent = (value: number) => `${String(value)}%`;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { size = 'md', className, style, onChange, onCheckedChange, disabled, ...props },
  ref,
) {
  const handleChange: ChangeEventHandler<HTMLInputElement> = event => {
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  };

  return (
    <span className={cx('c-checkbox', SIZE_CLASS_NAMES[size], className)} style={style}>
      <input
        {...props}
        ref={ref}
        type="checkbox"
        disabled={disabled}
        onChange={handleChange}
        className="c-checkbox__input"
      />
      <span className="c-checkbox__control" aria-hidden="true" />
    </span>
  );
});

export function CheckboxRow({
  label,
  size = 'md',
  width = 'hug',
  className,
  style,
  checkboxClassName,
  labelClassName,
  disabled,
  ...props
}: CheckboxRowProps) {
  return (
    <label
      className={cx(
        'c-checkbox-row',
        ROW_SIZE_CLASS_NAMES[size],
        ROW_WIDTH_CLASS_NAMES[width],
        disabled && 'c-checkbox-row--disabled',
        className,
      )}
      style={style}
    >
      <Checkbox {...props} size={size} disabled={disabled} className={checkboxClassName} />
      <span className={cx('c-checkbox-row__label', labelClassName)}>{label}</span>
    </label>
  );
}

export function CheckboxConditionalRow({
  children,
  childrenClassName,
  className,
  rowClassName,
  expanded,
  style,
  width = 'hug',
  checked,
  defaultChecked,
  onCheckedChange,
  ...props
}: CheckboxConditionalRowProps) {
  const isControlled = checked !== undefined;
  const [internalChecked, setInternalChecked] = useState(Boolean(defaultChecked));
  const resolvedChecked = checked ?? internalChecked;
  const resolvedExpanded = expanded ?? resolvedChecked;

  const handleCheckedChange = (nextChecked: boolean) => {
    if (!isControlled) {
      setInternalChecked(nextChecked);
    }

    onCheckedChange?.(nextChecked);
  };

  return (
    <div
      className={cx(
        'c-checkbox-conditional-row',
        width === 'full' && 'c-checkbox-conditional-row--width-full',
        className,
      )}
      style={style}
    >
      <CheckboxRow
        {...props}
        width={width}
        checked={isControlled ? checked : undefined}
        defaultChecked={isControlled ? undefined : defaultChecked}
        onCheckedChange={handleCheckedChange}
        className={cx('c-checkbox-conditional-row__trigger', rowClassName)}
      />
      {children ? (
        <div
          className={cx('c-checkbox-conditional-row__children', childrenClassName)}
          data-expanded={resolvedExpanded ? 'true' : 'false'}
          aria-hidden={!resolvedExpanded}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function CheckboxProgressConditionalRow({
  childrenClassName,
  className,
  rowClassName,
  rangeClassName,
  valueClassName,
  style,
  width = 'hug',
  checked,
  defaultChecked,
  onCheckedChange,
  value,
  min = 0,
  max = 100,
  step = 1,
  expanded,
  valueFormatter = formatProgressPercent,
  rangeAriaLabel,
  label,
  disabled,
  onValueChange,
  ...props
}: CheckboxProgressConditionalRowProps) {
  const isControlled = checked !== undefined;
  const [internalChecked, setInternalChecked] = useState(Boolean(defaultChecked));
  const resolvedChecked = checked ?? internalChecked;
  const resolvedExpanded = expanded ?? resolvedChecked;
  const resolvedValue = clampProgressValue(value, min, max);

  const handleCheckedChange = (nextChecked: boolean) => {
    if (!isControlled) {
      setInternalChecked(nextChecked);
    }

    onCheckedChange?.(nextChecked);
  };

  const handleValueChange: ChangeEventHandler<HTMLInputElement> = event => {
    onValueChange?.(clampProgressValue(Number(event.target.value), min, max));
  };

  return (
    <div
      className={cx(
        'c-checkbox-progress-conditional-row',
        width === 'full' && 'c-checkbox-progress-conditional-row--width-full',
        className,
      )}
      style={style}
    >
      <div className="c-checkbox-progress-conditional-row__header">
        <CheckboxRow
          {...props}
          label={label}
          width="hug"
          checked={isControlled ? checked : undefined}
          defaultChecked={isControlled ? undefined : defaultChecked}
          disabled={disabled}
          onCheckedChange={handleCheckedChange}
          className={cx('c-checkbox-progress-conditional-row__trigger', rowClassName)}
        />
        {resolvedExpanded ? (
          <span className={cx('c-checkbox-progress-conditional-row__value', valueClassName)}>
            {valueFormatter(resolvedValue)}
          </span>
        ) : null}
      </div>
      {resolvedExpanded ? (
        <div className={cx('c-checkbox-progress-conditional-row__children', childrenClassName)}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={resolvedValue}
            disabled={disabled}
            aria-label={
              rangeAriaLabel ?? (typeof label === 'string' ? `${label} amount` : 'Filter amount')
            }
            className={cx('c-checkbox-progress-conditional-row__range', rangeClassName)}
            onChange={handleValueChange}
          />
        </div>
      ) : null}
    </div>
  );
}
