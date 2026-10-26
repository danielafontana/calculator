import type { ApiError } from '../../services/api';
import { errorMessage } from '../../utils/errors';
import styles from './ResultDisplay.module.css';

export interface ResultDisplayProps {
  /** Main number (already formatted). */
  value: string;
  /** Secondary line, e.g. "12 ×" or "12 × 3 =". */
  expression: string;
  error: ApiError | null;
  loading: boolean;
}

/** Shrinks long numbers so they fit the display. */
function sizeOf(value: string): 'large' | 'medium' | 'small' {
  if (value.length > 14) return 'small';
  if (value.length > 10) return 'medium';
  return 'large';
}

/** Calculator display: expression, value, loading indicator and errors. */
export function ResultDisplay({ value, expression, error, loading }: ResultDisplayProps) {
  return (
    <section className={styles.display} aria-label="Result" aria-busy={loading}>
      {loading && (
        <span role="status" className={styles.loading}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.visuallyHidden}>Calculating…</span>
        </span>
      )}
      <p className={styles.expression} data-testid="expression">
        {expression}
      </p>
      {error ? (
        <div role="alert" className={styles.error}>
          <strong className={styles.errorTitle}>Could not calculate</strong>
          <span>{errorMessage(error.code)}</span>
        </div>
      ) : (
        <div
          className={styles.value}
          data-size={sizeOf(value)}
          data-testid="result-value"
          aria-live="polite"
        >
          {value}
        </div>
      )}
    </section>
  );
}
