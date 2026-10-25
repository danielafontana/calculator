import { useKeypad } from '../../hooks/useKeypad';
import { Keypad } from '../Keypad/Keypad';
import { ResultDisplay } from '../ResultDisplay/ResultDisplay';
import styles from './Calculator.module.css';

/** Container: wires the keypad state (useKeypad) to the display and keys. */
export function Calculator() {
  const { value, expression, error, loading, operator, isAvailable, press } = useKeypad();

  return (
    <main className={styles.page}>
      <div className={styles.calculator}>
        <h1 className={styles.title}>Calculator</h1>
        <ResultDisplay value={value} expression={expression} error={error} loading={loading} />
        <Keypad onKey={press} isAvailable={isAvailable} activeOperator={operator} />
      </div>
    </main>
  );
}
