import type { ApiError } from '../../services/api';
import type { CalculateSuccess } from '../../types/calculator';
import { errorMessage } from '../../utils/errors';
import { formatNumber } from '../../utils/format';
import { formatExpression } from '../../utils/operations';
import styles from './ResultDisplay.module.css';

export interface ResultDisplayProps {
  result: CalculateSuccess | null;
  error: ApiError | null;
  loading: boolean;
}

/** LCD-style panel showing the result, a loading indicator or an error. */
export function ResultDisplay({ result, error, loading }: ResultDisplayProps) {
  return (
    <section className={styles.display} aria-label="Result" aria-busy={loading}>
      {loading ? (
        <div role="status" className={styles.loading}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>Calculating…</span>
        </div>
      ) : error ? (
        <div role="alert" className={styles.error}>
          <strong className={styles.errorTitle}>Could not calculate</strong>
          <span>{errorMessage(error.code)}</span>
        </div>
      ) : result ? (
        <div className={styles.result}>
          <p className={styles.expression}>
            {formatExpression(result.operation, result.operands.a, result.operands.b)} =
          </p>
          <output className={styles.value} data-testid="result-value">
            {formatNumber(result.result)}
          </output>
        </div>
      ) : (
        <div className={styles.result}>
          <p className={styles.expression}>Choose an operation and enter the numbers</p>
          <span className={`${styles.value ?? ''} ${styles.idle ?? ''}`}>0</span>
        </div>
      )}
    </section>
  );
}
