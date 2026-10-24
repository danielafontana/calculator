import { useState, type FormEvent } from 'react';

import { useCalculator } from '../../hooks/useCalculator';
import { useOperations } from '../../hooks/useOperations';
import type { Operation } from '../../types/calculator';
import { OPERATION_META, isUnary } from '../../utils/operations';
import { FIELD_ERROR_MESSAGES, validateForm, type FieldErrors } from '../../utils/validation';
import { NumberField } from '../NumberField/NumberField';
import { OperationSelector } from '../OperationSelector/OperationSelector';
import { ResultDisplay } from '../ResultDisplay/ResultDisplay';
import styles from './Calculator.module.css';

type Touched = Record<'a' | 'b', boolean>;

function visibleError(errors: FieldErrors, touched: Touched, field: 'a' | 'b') {
  const error = errors[field];
  return touched[field] && error ? FIELD_ERROR_MESSAGES[error] : undefined;
}

/** Container: owns form state and delegates validation and API calls. */
export function Calculator() {
  const operations = useOperations();
  const { calculate, result, error, loading, reset } = useCalculator();

  const [operation, setOperation] = useState<Operation>('add');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [touched, setTouched] = useState<Touched>({ a: false, b: false });

  const validation = validateForm({ operation, a, b });
  const meta = OPERATION_META[operation];
  const unary = isUnary(operation);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validation.valid || loading) return;
    void calculate(validation.request);
  };

  const handleClear = () => {
    setA('');
    setB('');
    setTouched({ a: false, b: false });
    reset();
  };

  return (
    <main className={styles.page}>
      <div className={styles.instrument}>
        <header className={styles.header}>
          <h1 className={styles.title}>Calculator</h1>
        </header>

        <div className={styles.display}>
          <ResultDisplay result={result} error={error} loading={loading} />
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.keys}>
            <OperationSelector value={operation} onChange={setOperation} operations={operations} />
            <p className={styles.hint}>{meta.description}</p>
          </div>

          <div className={styles.fields}>
            <NumberField
              label={meta.operandLabels[0]}
              value={a}
              onChange={setA}
              onBlur={() => {
                setTouched((t) => ({ ...t, a: true }));
              }}
              error={visibleError(validation.errors, touched, 'a')}
            />
            {!unary && (
              <NumberField
                label={meta.operandLabels[1] ?? ''}
                value={b}
                onChange={setB}
                onBlur={() => {
                  setTouched((t) => ({ ...t, b: true }));
                }}
                error={visibleError(validation.errors, touched, 'b')}
              />
            )}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.clear} onClick={handleClear}>
              Clear
            </button>
            <button type="submit" className={styles.equals} disabled={!validation.valid || loading}>
              <span aria-hidden="true">=</span> Calculate
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
