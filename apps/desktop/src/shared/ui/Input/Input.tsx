import { useId, type InputHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Input.css';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'className' | 'aria-describedby' | 'aria-invalid'
>;

export type InputProps = NativeInputProps & {
  label?: string;
  hint?: string;
  destructive?: boolean;
  className?: string;
  inputClassName?: string;
};

export function Input({
  id,
  label,
  hint,
  destructive = false,
  className,
  inputClassName,
  type = 'text',
  disabled = false,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div
      className={cx(
        'c-input-field',
        destructive && 'c-input-field--destructive',
        disabled && 'c-input-field--disabled',
        className,
      )}
    >
      {label ? (
        <label className="c-input-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        type={type}
        className={cx('c-input-field__control', inputClassName)}
        disabled={disabled}
        aria-describedby={hintId}
        aria-invalid={destructive || undefined}
        {...props}
      />

      {hint ? (
        <p id={hintId} className="c-input-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
