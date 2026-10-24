import { ApiError } from '../services/api';
import type { ApiErrorCode } from '../types/calculator';

const MESSAGES: Record<ApiErrorCode, string> = {
  DIVISION_BY_ZERO: 'Não é possível dividir por zero. Use um divisor diferente de zero.',
  NEGATIVE_SQRT:
    'Não existe raiz quadrada real de número negativo. Use um número maior ou igual a zero.',
  OVERFLOW: 'O resultado é grande demais para ser representado. Tente números menores.',
  UNDEFINED_RESULT: 'O resultado não é um número real. Revise a base e o expoente.',
  INVALID_OPERAND: 'Os números informados não são válidos.',
  MISSING_OPERAND: 'Preencha todos os números da operação.',
  INVALID_OPERATION: 'Operação não suportada pelo servidor.',
  INVALID_PAYLOAD: 'O servidor não entendeu a requisição.',
  UNSUPPORTED_MEDIA_TYPE: 'O servidor não entendeu a requisição.',
  RATE_LIMITED: 'Muitos cálculos em pouco tempo. Aguarde alguns segundos e tente novamente.',
  INTERNAL_ERROR: 'O servidor encontrou um erro. Tente novamente em instantes.',
  NETWORK_ERROR: 'Sem conexão com o servidor. Verifique se a API está em execução.',
  TIMEOUT: 'O servidor demorou demais para responder. Tente novamente.',
  UNEXPECTED_RESPONSE: 'O servidor respondeu em um formato inesperado.',
};

/** User-facing message for an API error code. */
export function errorMessage(code: ApiErrorCode): string {
  return MESSAGES[code];
}

/** Normalizes any thrown value into an ApiError. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : 'Erro desconhecido.';
  return new ApiError(message, 'UNEXPECTED_RESPONSE');
}
