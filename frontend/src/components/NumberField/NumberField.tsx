import { useId } from 'react';

import styles from './NumberField.module.css';

export interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  autoFocus?: boolean;
}

/** Text input for numbers; accepts comma or dot as decimal separator. */
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  error,
  autoFocus,
}: NumberFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={styles.input}
        value={value}
        placeholder="0"
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={onBlur}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
