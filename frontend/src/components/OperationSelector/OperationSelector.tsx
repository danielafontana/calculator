import type { Operation } from '../../types/calculator';
import { OPERATION_META } from '../../utils/operations';
import styles from './OperationSelector.module.css';

export interface OperationSelectorProps {
  value: Operation;
  onChange: (operation: Operation) => void;
  operations: readonly Operation[];
  disabled?: boolean;
}

/** Radio group rendered as calculator keys. */
export function OperationSelector({
  value,
  onChange,
  operations,
  disabled,
}: OperationSelectorProps) {
  return (
    <fieldset className={styles.selector} disabled={disabled}>
      <legend className={styles.legend}>Operation</legend>
      {operations.map((operation) => {
        const meta = OPERATION_META[operation];
        return (
          <label key={operation} className={styles.key} data-selected={operation === value}>
            <input
              type="radio"
              name="operation"
              value={operation}
              checked={operation === value}
              onChange={() => {
                onChange(operation);
              }}
              className={styles.input}
            />
            <span className={styles.symbol} aria-hidden="true">
              {meta.symbol}
            </span>
            <span className={styles.label}>{meta.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
