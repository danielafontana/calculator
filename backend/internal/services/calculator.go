// Package services contains the calculator business logic. It has no
// knowledge of HTTP.
package services

import (
	"errors"
	"math"

	"github.com/danielafontana/calculator/backend/internal/models"
)

// Calculation sentinel errors.
var (
	ErrDivisionByZero       = errors.New("division by zero")
	ErrNegativeSqrt         = errors.New("square root of a negative number")
	ErrOverflow             = errors.New("result overflows the float64 range")
	ErrUndefinedResult      = errors.New("result is undefined")
	ErrInvalidOperand       = errors.New("operands must be finite numbers")
	ErrUnsupportedOperation = errors.New("unsupported operation")
)

// Calculator performs arithmetic operations.
type Calculator interface {
	Calculate(op models.Operation, a, b float64) (float64, error)
	Operations() []models.OperationInfo
}

type operationFunc func(a, b float64) (float64, error)

type operationDef struct {
	info models.OperationInfo
	fn   operationFunc
}

// BasicCalculator is a stateless float64 Calculator.
type BasicCalculator struct {
	defs  map[models.Operation]operationDef
	order []models.Operation
}

var _ Calculator = (*BasicCalculator)(nil)

// NewCalculator returns a Calculator supporting every models.Operation.
func NewCalculator() *BasicCalculator {
	defs := []operationDef{
		{info(models.OpAdd, "+", "Sum of a and b", 2), add},
		{info(models.OpSubtract, "−", "Difference of a and b", 2), subtract},
		{info(models.OpMultiply, "×", "Product of a and b", 2), multiply},
		{info(models.OpDivide, "÷", "Quotient of a divided by b", 2), divide},
		{info(models.OpPower, "^", "a raised to the power of b", 2), power},
		{info(models.OpSqrt, "√", "Square root of a (b is ignored)", 1), sqrt},
		{info(models.OpPercentage, "%", "b percent of a: (a × b) / 100", 2), percentage},
	}

	c := &BasicCalculator{defs: make(map[models.Operation]operationDef, len(defs))}
	for _, d := range defs {
		c.defs[d.info.Name] = d
		c.order = append(c.order, d.info.Name)
	}

	return c
}

func info(op models.Operation, symbol, description string, operands int) models.OperationInfo {
	return models.OperationInfo{Name: op, Symbol: symbol, Description: description, Operands: operands}
}

// Calculate applies op to a and b. For unary operations b is ignored.
// The result is guaranteed to be a finite number when err is nil.
func (c *BasicCalculator) Calculate(op models.Operation, a, b float64) (float64, error) {
	def, ok := c.defs[op]
	if !ok {
		return 0, ErrUnsupportedOperation
	}

	if !isFinite(a) || (!op.IsUnary() && !isFinite(b)) {
		return 0, ErrInvalidOperand
	}

	result, err := def.fn(a, b)
	if err != nil {
		return 0, err
	}

	switch {
	case math.IsNaN(result):
		return 0, ErrUndefinedResult
	case math.IsInf(result, 0):
		return 0, ErrOverflow
	case result == 0:
		return 0, nil // normalize -0 to 0
	}

	return result, nil
}

// Operations lists the supported operations in display order.
func (c *BasicCalculator) Operations() []models.OperationInfo {
	out := make([]models.OperationInfo, 0, len(c.order))
	for _, op := range c.order {
		out = append(out, c.defs[op].info)
	}

	return out
}

func add(a, b float64) (float64, error)      { return a + b, nil }
func subtract(a, b float64) (float64, error) { return a - b, nil }
func multiply(a, b float64) (float64, error) { return a * b, nil }

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}

	return a / b, nil
}

func power(a, b float64) (float64, error) {
	if a == 0 && b < 0 {
		return 0, ErrDivisionByZero
	}

	return math.Pow(a, b), nil
}

func sqrt(a, _ float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}

	return math.Sqrt(a), nil
}

func percentage(a, b float64) (float64, error) {
	p := a * b
	if math.IsInf(p, 0) {
		// a*b overflowed but the final value may still fit: scale b first.
		return a * (b / 100), nil
	}

	return p / 100, nil
}

func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}
