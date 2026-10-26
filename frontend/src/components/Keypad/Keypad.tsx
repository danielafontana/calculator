import type { BinaryOperation, KeyId } from '../../utils/keypad';
import styles from './Keypad.module.css';
import { KEYS } from './keys';

export interface KeypadProps {
  onKey: (key: KeyId) => void;
  isAvailable: (key: KeyId) => boolean;
  /** Pending binary operator, highlighted on its key. */
  activeOperator: BinaryOperation | null;
}

/** Calculator keys; purely presentational, every press goes to onKey. */
export function Keypad({ onKey, isAvailable, activeOperator }: KeypadProps) {
  return (
    <div className={styles.keypad} role="group" aria-label="Keypad">
      {KEYS.map((key) => (
        <button
          key={key.id}
          type="button"
          className={styles.key}
          data-kind={key.kind}
          aria-label={key.label}
          aria-pressed={key.toggles ? key.id === activeOperator : undefined}
          disabled={!isAvailable(key.id)}
          onClick={() => {
            onKey(key.id);
          }}
        >
          <span aria-hidden="true">{key.icon}</span>
        </button>
      ))}
    </div>
  );
}
