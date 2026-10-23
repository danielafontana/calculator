package services_test

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/danielafontana/calculator/backend/internal/models"
	"github.com/danielafontana/calculator/backend/internal/services"
)

func TestBasicCalculator_Calculate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		op      models.Operation
		a, b    float64
		want    float64
		wantErr error
	}{
		// add
		{name: "add integers", op: models.OpAdd, a: 10, b: 5, want: 15},
		{name: "add negatives", op: models.OpAdd, a: -2.5, b: -7.5, want: -10},
		{name: "add decimals", op: models.OpAdd, a: 0.1, b: 0.2, want: 0.30000000000000004},
		{name: "add overflow", op: models.OpAdd, a: math.MaxFloat64, b: math.MaxFloat64, wantErr: services.ErrOverflow},
		{name: "add negative overflow", op: models.OpAdd, a: -math.MaxFloat64, b: -math.MaxFloat64, wantErr: services.ErrOverflow},

		// subtract
		{name: "subtract", op: models.OpSubtract, a: 10, b: 5, want: 5},
		{name: "subtract to negative", op: models.OpSubtract, a: 5, b: 10, want: -5},
		{name: "subtract to zero normalizes sign", op: models.OpSubtract, a: math.Copysign(0, -1), b: 0, want: 0},
		{name: "subtract overflow", op: models.OpSubtract, a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: services.ErrOverflow},

		// multiply
		{name: "multiply", op: models.OpMultiply, a: 10, b: 5, want: 50},
		{name: "multiply by zero", op: models.OpMultiply, a: -10, b: 0, want: 0},
		{name: "multiply overflow", op: models.OpMultiply, a: 1e200, b: 1e200, wantErr: services.ErrOverflow},

		// divide
		{name: "divide", op: models.OpDivide, a: 10, b: 4, want: 2.5},
		{name: "divide negative", op: models.OpDivide, a: -9, b: 3, want: -3},
		{name: "divide by zero", op: models.OpDivide, a: 10, b: 0, wantErr: services.ErrDivisionByZero},
		{name: "divide zero by zero", op: models.OpDivide, a: 0, b: 0, wantErr: services.ErrDivisionByZero},
		{name: "divide overflow", op: models.OpDivide, a: math.MaxFloat64, b: 1e-10, wantErr: services.ErrOverflow},

		// power
		{name: "power", op: models.OpPower, a: 2, b: 10, want: 1024},
		{name: "power zero exponent", op: models.OpPower, a: 123, b: 0, want: 1},
		{name: "power negative exponent", op: models.OpPower, a: 2, b: -2, want: 0.25},
		{name: "power fractional exponent", op: models.OpPower, a: 9, b: 0.5, want: 3},
		{name: "power infinite result", op: models.OpPower, a: 10, b: 400, wantErr: services.ErrOverflow},
		{name: "power zero to negative", op: models.OpPower, a: 0, b: -1, wantErr: services.ErrDivisionByZero},
		{name: "power negative base fractional exponent", op: models.OpPower, a: -8, b: 0.5, wantErr: services.ErrUndefinedResult},

		// sqrt
		{name: "sqrt", op: models.OpSqrt, a: 16, want: 4},
		{name: "sqrt ignores b", op: models.OpSqrt, a: 2.25, b: 999, want: 1.5},
		{name: "sqrt ignores non-finite b", op: models.OpSqrt, a: 4, b: math.NaN(), want: 2},
		{name: "sqrt of zero", op: models.OpSqrt, a: 0, want: 0},
		{name: "sqrt negative", op: models.OpSqrt, a: -1, wantErr: services.ErrNegativeSqrt},

		// percentage
		{name: "percentage", op: models.OpPercentage, a: 200, b: 15, want: 30},
		{name: "percentage negative", op: models.OpPercentage, a: 50, b: -10, want: -5},
		{name: "percentage zero", op: models.OpPercentage, a: 0, b: 50, want: 0},
		{name: "percentage with large intermediate", op: models.OpPercentage, a: 1e308, b: 50, want: 5e307},
		{name: "percentage overflow", op: models.OpPercentage, a: math.MaxFloat64, b: 1e10, wantErr: services.ErrOverflow},

		// invalid input
		{name: "unsupported operation", op: "modulo", a: 1, b: 2, wantErr: services.ErrUnsupportedOperation},
		{name: "NaN operand", op: models.OpAdd, a: math.NaN(), b: 1, wantErr: services.ErrInvalidOperand},
		{name: "infinite operand", op: models.OpMultiply, a: 1, b: math.Inf(1), wantErr: services.ErrInvalidOperand},
	}

	calc := services.NewCalculator()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := calc.Calculate(tt.op, tt.a, tt.b)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Zero(t, got)

				return
			}

			require.NoError(t, err)
			assert.InDelta(t, tt.want, got, 1e-12*math.Max(1, math.Abs(tt.want)))
			assert.False(t, math.Signbit(got) && got == 0, "result must not be negative zero")
		})
	}
}

func TestBasicCalculator_Operations(t *testing.T) {
	t.Parallel()

	is := assert.New(t)

	ops := services.NewCalculator().Operations()

	names := make([]models.Operation, 0, len(ops))
	for _, op := range ops {
		names = append(names, op.Name)
		is.NotEmpty(op.Symbol, op.Name)
		is.NotEmpty(op.Description, op.Name)

		if op.Name.IsUnary() {
			is.Equal(1, op.Operands, op.Name)
		} else {
			is.Equal(2, op.Operands, op.Name)
		}
	}

	is.Equal(models.Operations(), names)
}
