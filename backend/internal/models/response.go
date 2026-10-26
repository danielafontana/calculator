package models

// ErrorCode is a machine-readable error identifier returned to clients.
type ErrorCode string

// Error codes returned by the API.
const (
	CodeInvalidPayload       ErrorCode = "INVALID_PAYLOAD"
	CodeInvalidOperation     ErrorCode = "INVALID_OPERATION"
	CodeMissingOperand       ErrorCode = "MISSING_OPERAND"
	CodeInvalidOperand       ErrorCode = "INVALID_OPERAND"
	CodeDivisionByZero       ErrorCode = "DIVISION_BY_ZERO"
	CodeNegativeSqrt         ErrorCode = "NEGATIVE_SQRT"
	CodeOverflow             ErrorCode = "OVERFLOW"
	CodeUndefinedResult      ErrorCode = "UNDEFINED_RESULT"
	CodeUnsupportedMediaType ErrorCode = "UNSUPPORTED_MEDIA_TYPE"
	CodeRateLimited          ErrorCode = "RATE_LIMITED"
	CodeInternal             ErrorCode = "INTERNAL_ERROR"
)

// Operands echoes the operands used in a calculation.
type Operands struct {
	A float64  `json:"a"`
	B *float64 `json:"b,omitempty"`
}

// CalculateResponse is the success body of POST /api/v1/calculate.
type CalculateResponse struct {
	Result    float64   `json:"result"`
	Operation Operation `json:"operation"`
	Operands  Operands  `json:"operands"`
}

// NewCalculateResponse builds the response for a validated request.
// The second operand is omitted for unary operations.
func NewCalculateResponse(req CalculateRequest, result float64) CalculateResponse {
	operands := Operands{A: *req.A}
	if !req.Operation.IsUnary() {
		operands.B = req.B
	}

	return CalculateResponse{Result: result, Operation: req.Operation, Operands: operands}
}

// ErrorResponse is the body returned for every error.
type ErrorResponse struct {
	Error string    `json:"error"`
	Code  ErrorCode `json:"code"`
}

// HealthResponse is the body of GET /api/v1/health.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// OperationInfo describes a supported operation.
type OperationInfo struct {
	Name        Operation `json:"name"`
	Symbol      string    `json:"symbol"`
	Description string    `json:"description"`
	Operands    int       `json:"operands"`
}

// OperationsResponse is the body of GET /api/v1/operations.
type OperationsResponse struct {
	Operations []OperationInfo `json:"operations"`
}
