// Package models defines the data structures exchanged by the API.
package models

import "slices"

// Operation identifies an arithmetic operation supported by the calculator.
type Operation string

// Supported operations.
const (
	OpAdd        Operation = "add"
	OpSubtract   Operation = "subtract"
	OpMultiply   Operation = "multiply"
	OpDivide     Operation = "divide"
	OpPower      Operation = "power"
	OpSqrt       Operation = "sqrt"
	OpPercentage Operation = "percentage"
)

var operations = []Operation{
	OpAdd, OpSubtract, OpMultiply, OpDivide, OpPower, OpSqrt, OpPercentage,
}

// Operations returns every supported operation in display order.
func Operations() []Operation {
	return slices.Clone(operations)
}

// IsValid reports whether o is a supported operation.
func (o Operation) IsValid() bool {
	return slices.Contains(operations, o)
}

// IsUnary reports whether o uses only the first operand.
func (o Operation) IsUnary() bool {
	return o == OpSqrt
}
