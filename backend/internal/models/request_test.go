package models_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/models"
)

//nolint:modernize // new(1) would yield *int for untyped constants; ptr keeps operands float64
func ptr(f float64) *float64 { return &f }

func TestCalculateRequest_Validate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		req     models.CalculateRequest
		wantErr error
		wantMsg string
	}{
		{name: "valid binary", req: models.CalculateRequest{Operation: models.OpAdd, A: ptr(1), B: ptr(2)}},
		{name: "valid zero operands", req: models.CalculateRequest{Operation: models.OpDivide, A: ptr(0), B: ptr(0)}},
		{name: "valid sqrt without b", req: models.CalculateRequest{Operation: models.OpSqrt, A: ptr(4)}},
		{name: "valid sqrt with b", req: models.CalculateRequest{Operation: models.OpSqrt, A: ptr(4), B: ptr(1)}},
		{
			name:    "missing operation",
			req:     models.CalculateRequest{A: ptr(1), B: ptr(2)},
			wantErr: models.ErrInvalidOperation,
			wantMsg: "operation is required",
		},
		{
			name:    "unknown operation",
			req:     models.CalculateRequest{Operation: "modulo", A: ptr(1), B: ptr(2)},
			wantErr: models.ErrInvalidOperation,
			wantMsg: `"modulo" is not supported`,
		},
		{
			name:    "operation is case sensitive",
			req:     models.CalculateRequest{Operation: "ADD", A: ptr(1), B: ptr(2)},
			wantErr: models.ErrInvalidOperation,
		},
		{
			name:    "missing a",
			req:     models.CalculateRequest{Operation: models.OpAdd, B: ptr(2)},
			wantErr: models.ErrMissingOperand,
			wantMsg: `"a" is required`,
		},
		{
			name:    "missing a for sqrt",
			req:     models.CalculateRequest{Operation: models.OpSqrt},
			wantErr: models.ErrMissingOperand,
			wantMsg: `"a" is required`,
		},
		{
			name:    "missing b",
			req:     models.CalculateRequest{Operation: models.OpMultiply, A: ptr(2)},
			wantErr: models.ErrMissingOperand,
			wantMsg: `"b" is required`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := tt.req.Validate()
			if tt.wantErr == nil {
				require.NoError(t, err)

				return
			}

			require.ErrorIs(t, err, tt.wantErr)

			if tt.wantMsg != "" {
				assert.ErrorContains(t, err, tt.wantMsg)
			}
		})
	}
}

func TestOperation(t *testing.T) {
	t.Parallel()

	is := assert.New(t)

	for _, op := range models.Operations() {
		is.True(op.IsValid(), op)
		is.Equal(op == models.OpSqrt, op.IsUnary(), op)
	}

	is.False(models.Operation("").IsValid())
	is.False(models.Operation("modulo").IsValid())

	ops := models.Operations()
	ops[0] = "mutated"

	is.Equal(models.OpAdd, models.Operations()[0], "Operations must return a copy")
}

func TestNewCalculateResponse(t *testing.T) {
	t.Parallel()

	is := assert.New(t)

	binary := models.NewCalculateResponse(models.CalculateRequest{Operation: models.OpAdd, A: ptr(10), B: ptr(5)}, 15)
	is.Equal(models.CalculateResponse{
		Result:    15,
		Operation: models.OpAdd,
		Operands:  models.Operands{A: 10, B: ptr(5)},
	}, binary)

	unary := models.NewCalculateResponse(models.CalculateRequest{Operation: models.OpSqrt, A: ptr(16), B: ptr(3)}, 4)
	is.Nil(unary.Operands.B, "b must be omitted for unary operations")
}
