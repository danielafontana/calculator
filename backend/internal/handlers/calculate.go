// Package handlers adapts HTTP requests to the calculator service.
// Handlers only parse input, delegate and serialize output.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/danielafontana/calculator/backend/internal/httpjson"
	"github.com/danielafontana/calculator/backend/internal/models"
	"github.com/danielafontana/calculator/backend/internal/services"
)

const maxBodyBytes = 1 << 20

// Handler serves the calculator API.
type Handler struct {
	calc    services.Calculator
	version string
}

// New returns a Handler backed by calc.
func New(calc services.Calculator, version string) *Handler {
	return &Handler{calc: calc, version: version}
}

// Calculate handles POST /api/v1/calculate.
func (h *Handler) Calculate(w http.ResponseWriter, r *http.Request) {
	var req models.CalculateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		httpjson.Error(w, http.StatusBadRequest, models.CodeInvalidPayload, err.Error())
		return
	}

	if err := req.Validate(); err != nil {
		writeError(w, err)
		return
	}

	var b float64
	if req.B != nil {
		b = *req.B
	}

	result, err := h.calc.Calculate(req.Operation, *req.A, b)
	if err != nil {
		writeError(w, err)
		return
	}

	httpjson.Write(w, http.StatusOK, models.NewCalculateResponse(req, result))
}

// Health handles GET /api/v1/health.
func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	httpjson.Write(w, http.StatusOK, models.HealthResponse{Status: "ok", Version: h.version})
}

// Operations handles GET /api/v1/operations.
func (h *Handler) Operations(w http.ResponseWriter, _ *http.Request) {
	httpjson.Write(w, http.StatusOK, models.OperationsResponse{Operations: h.calc.Operations()})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := dec.Decode(dst); err != nil {
		return payloadError(err)
	}

	if dec.More() {
		return errors.New("request body must contain a single JSON object")
	}

	return nil
}

// payloadError turns a decoding error into a message that is safe to return
// to clients: it describes the problem without exposing Go types or parser
// internals.
func payloadError(err error) error {
	var (
		typeErr *json.UnmarshalTypeError
		sizeErr *http.MaxBytesError
	)

	switch {
	case errors.Is(err, io.EOF):
		return errors.New("request body is empty")
	case errors.As(err, &sizeErr):
		return errors.New("request body is too large")
	case errors.As(err, &typeErr) && typeErr.Field != "":
		return fmt.Errorf("field %q has an invalid value", typeErr.Field)
	case errors.As(err, &typeErr):
		return errors.New("request body must be a JSON object")
	default:
		return errors.New("request body must be valid JSON")
	}
}

// errorMappings translates sentinel errors into HTTP status and error code.
var errorMappings = []struct {
	err    error
	status int
	code   models.ErrorCode
}{
	{models.ErrInvalidOperation, http.StatusBadRequest, models.CodeInvalidOperation},
	{models.ErrMissingOperand, http.StatusBadRequest, models.CodeMissingOperand},
	{services.ErrUnsupportedOperation, http.StatusBadRequest, models.CodeInvalidOperation},
	{services.ErrInvalidOperand, http.StatusBadRequest, models.CodeInvalidOperand},
	{services.ErrDivisionByZero, http.StatusBadRequest, models.CodeDivisionByZero},
	{services.ErrNegativeSqrt, http.StatusBadRequest, models.CodeNegativeSqrt},
	{services.ErrOverflow, http.StatusBadRequest, models.CodeOverflow},
	{services.ErrUndefinedResult, http.StatusBadRequest, models.CodeUndefinedResult},
}

func writeError(w http.ResponseWriter, err error) {
	for _, m := range errorMappings {
		if errors.Is(err, m.err) {
			httpjson.Error(w, m.status, m.code, err.Error())
			return
		}
	}

	httpjson.Error(w, http.StatusInternalServerError, models.CodeInternal, "internal server error")
}
