const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 10 });

const EXPONENTIAL_UPPER = 1e15;
const EXPONENTIAL_LOWER = 1e-6;

/**
 * Formats a number for display using en-US conventions. Very large or very
 * small magnitudes use scientific notation (e.g. "1.5e+20").
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const abs = Math.abs(value);
  if (abs >= EXPONENTIAL_UPPER || (abs !== 0 && abs < EXPONENTIAL_LOWER)) {
    const [mantissa = '', exponent = ''] = value.toExponential(8).split('e');
    const trimmed = mantissa.replace(/\.?0+$/, '');
    return `${trimmed}e${exponent}`;
  }
  return decimalFormatter.format(value);
}
