package handlers_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/handlers"
	"github.com/danielafontana/calculator/backend/internal/models"
	"github.com/danielafontana/calculator/backend/internal/services"
)

type mockCalculator struct {
	mock.Mock
}

func (m *mockCalculator) Calculate(op models.Operation, a, b float64) (float64, error) {
	args := m.Called(op, a, b)

	return args.Get(0).(float64), args.Error(1) //nolint:errcheck,forcetypeassert // mock returns are set by the test
}

func (m *mockCalculator) Operations() []models.OperationInfo {
	args := m.Called()

	return args.Get(0).([]models.OperationInfo) //nolint:errcheck,forcetypeassert // mock returns are set by the test
}

func postCalculate(h *handlers.Handler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calculate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	h.Calculate(rec, req)

	return rec
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) models.ErrorResponse {
	t.Helper()

	var resp models.ErrorResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))

	return resp
}

func TestHandler_Calculate_Success(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		body     string
		op       models.Operation
		a, b     float64
		result   float64
		wantJSON string
	}{
		{
			name:     "binary operation",
			body:     `{"operation":"add","a":10,"b":5}`,
			op:       models.OpAdd,
			a:        10,
			b:        5,
			result:   15,
			wantJSON: `{"result":15,"operation":"add","operands":{"a":10,"b":5}}`,
		},
		{
			name:     "sqrt without b",
			body:     `{"operation":"sqrt","a":16}`,
			op:       models.OpSqrt,
			a:        16,
			result:   4,
			wantJSON: `{"result":4,"operation":"sqrt","operands":{"a":16}}`,
		},
		{
			name:     "sqrt ignores b in response",
			body:     `{"operation":"sqrt","a":9,"b":7}`,
			op:       models.OpSqrt,
			a:        9,
			b:        7,
			result:   3,
			wantJSON: `{"result":3,"operation":"sqrt","operands":{"a":9}}`,
		},
		{
			name:     "zero operands are present",
			body:     `{"operation":"multiply","a":0,"b":0}`,
			op:       models.OpMultiply,
			result:   0,
			wantJSON: `{"result":0,"operation":"multiply","operands":{"a":0,"b":0}}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			calc := new(mockCalculator)
			calc.On("Calculate", tt.op, tt.a, tt.b).Return(tt.result, nil).Once()

			rec := postCalculate(handlers.New(calc, "test"), tt.body)

			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
			assert.JSONEq(t, tt.wantJSON, rec.Body.String())
			calc.AssertExpectations(t)
		})
	}
}

func TestHandler_Calculate_InvalidRequest(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		body     string
		wantCode models.ErrorCode
	}{
		{name: "malformed JSON", body: `{"operation":`, wantCode: models.CodeInvalidPayload},
		{name: "not JSON", body: `hello`, wantCode: models.CodeInvalidPayload},
		{name: "empty body", body: ``, wantCode: models.CodeInvalidPayload},
		{name: "multiple JSON values", body: `{"operation":"add","a":1,"b":2}{}`, wantCode: models.CodeInvalidPayload},
		{name: "operand as string", body: `{"operation":"add","a":"1","b":2}`, wantCode: models.CodeInvalidPayload},
		{name: "operand out of float64 range", body: `{"operation":"add","a":1e400,"b":2}`, wantCode: models.CodeInvalidPayload},
		{name: "missing operation", body: `{"a":1,"b":2}`, wantCode: models.CodeInvalidOperation},
		{name: "unknown operation", body: `{"operation":"modulo","a":1,"b":2}`, wantCode: models.CodeInvalidOperation},
		{name: "missing a", body: `{"operation":"add","b":2}`, wantCode: models.CodeMissingOperand},
		{name: "null a", body: `{"operation":"add","a":null,"b":2}`, wantCode: models.CodeMissingOperand},
		{name: "missing b", body: `{"operation":"divide","a":2}`, wantCode: models.CodeMissingOperand},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			calc := new(mockCalculator)
			rec := postCalculate(handlers.New(calc, "test"), tt.body)

			assert.Equal(t, http.StatusBadRequest, rec.Code)

			resp := decodeError(t, rec)
			assert.Equal(t, tt.wantCode, resp.Code)
			assert.NotEmpty(t, resp.Error)
			calc.AssertNotCalled(t, "Calculate", mock.Anything, mock.Anything, mock.Anything)
		})
	}
}

func TestHandler_Calculate_ServiceErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   models.ErrorCode
		wantMsg    string
	}{
		{"division by zero", services.ErrDivisionByZero, http.StatusBadRequest, models.CodeDivisionByZero, "division by zero"},
		{"negative sqrt", services.ErrNegativeSqrt, http.StatusBadRequest, models.CodeNegativeSqrt, services.ErrNegativeSqrt.Error()},
		{"overflow", services.ErrOverflow, http.StatusBadRequest, models.CodeOverflow, services.ErrOverflow.Error()},
		{"undefined", services.ErrUndefinedResult, http.StatusBadRequest, models.CodeUndefinedResult, services.ErrUndefinedResult.Error()},
		{"invalid operand", services.ErrInvalidOperand, http.StatusBadRequest, models.CodeInvalidOperand, services.ErrInvalidOperand.Error()},
		{"unsupported", services.ErrUnsupportedOperation, http.StatusBadRequest, models.CodeInvalidOperation, services.ErrUnsupportedOperation.Error()},
		{"unknown error is hidden", errors.New("boom: secret detail"), http.StatusInternalServerError, models.CodeInternal, "internal server error"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			calc := new(mockCalculator)
			calc.On("Calculate", models.OpDivide, 10.0, 0.0).Return(0.0, tt.err).Once()

			rec := postCalculate(handlers.New(calc, "test"), `{"operation":"divide","a":10,"b":0}`)

			assert.Equal(t, tt.wantStatus, rec.Code)
			assert.Equal(t, models.ErrorResponse{Error: tt.wantMsg, Code: tt.wantCode}, decodeError(t, rec))
			calc.AssertExpectations(t)
		})
	}
}

func TestHandler_Health(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	handlers.New(new(mockCalculator), "1.2.3").Health(rec, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, `{"status":"ok","version":"1.2.3"}`, rec.Body.String())
}

func TestHandler_Operations(t *testing.T) {
	t.Parallel()

	calc := new(mockCalculator)
	calc.On("Operations").Return([]models.OperationInfo{
		{Name: models.OpAdd, Symbol: "+", Description: "Sum", Operands: 2},
	}).Once()

	rec := httptest.NewRecorder()
	handlers.New(calc, "test").Operations(rec, httptest.NewRequest(http.MethodGet, "/api/v1/operations", nil))

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t,
		`{"operations":[{"name":"add","symbol":"+","description":"Sum","operands":2}]}`,
		rec.Body.String())
	calc.AssertExpectations(t)
}
