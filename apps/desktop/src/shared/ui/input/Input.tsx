import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import './input.css';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  destructive?: boolean;
  controlClassName?: string;
  inputClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    destructive = false,
    className,
    controlClassName,
    inputClassName,
    disabled,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const generatedHintId = useId();
  const inputId = id ?? generatedId;
  const supportingText = error ?? hint;
  const hasSemanticInvalid =
    ariaInvalid !== undefined && ariaInvalid !== false && ariaInvalid !== 'false';
  const isDestructive = destructive || error !== undefined || hasSemanticInvalid;
  const resolvedDescribedBy = [ariaDescribedBy, supportingText ? generatedHintId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cx('c-input', className)} data-disabled={disabled ? 'true' : undefined}>
      {label ? (
        <label className="c-input__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <div
        className={cx(
          'c-input__control',
          isDestructive && 'c-input__control--destructive',
          disabled && 'c-input__control--disabled',
          controlClassName,
        )}
      >
        <input
          {...props}
          id={inputId}
          ref={ref}
          disabled={disabled}
          className={cx('c-input__field', inputClassName)}
          aria-invalid={ariaInvalid ?? (isDestructive ? true : undefined)}
          aria-describedby={resolvedDescribedBy || undefined}
        />
      </div>

      {supportingText ? (
        <div
          id={generatedHintId}
          className={cx('c-input__hint', isDestructive && 'c-input__hint--error')}
        >
          {supportingText}
        </div>
      ) : null}
    </div>
  );
});
