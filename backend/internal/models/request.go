package models

import (
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
)

// Validation sentinel errors.
var (
	ErrInvalidOperation = errors.New("invalid operation")
	ErrMissingOperand   = errors.New("missing operand")
)

// CalculateRequest is the body of POST /api/v1/calculate.
//
// Operands are pointers so that an omitted field can be told apart from zero.
type CalculateRequest struct {
	Operation Operation `json:"operation" validate:"required,operation"`
	A         *float64  `json:"a" validate:"required"`
	B         *float64  `json:"b" validate:"required_unless=Operation sqrt"`
}

var validate = newValidator()

func newValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		return name
	})

	if err := v.RegisterValidation("operation", func(fl validator.FieldLevel) bool {
		return Operation(fl.Field().String()).IsValid()
	}); err != nil {
		panic(err)
	}

	return v
}

// Validate checks the struct tags and returns ErrInvalidOperation or
// ErrMissingOperand (wrapped with details) when the request is invalid.
func (r CalculateRequest) Validate() error {
	err := validate.Struct(r)
	if err == nil {
		return nil
	}

	var verrs validator.ValidationErrors
	if !errors.As(err, &verrs) {
		return err
	}

	fe := verrs[0]
	if fe.Field() == "operation" {
		if fe.Tag() == "required" {
			return fmt.Errorf("%w: operation is required", ErrInvalidOperation)
		}

		return fmt.Errorf("%w: %q is not supported", ErrInvalidOperation, r.Operation)
	}

	return fmt.Errorf("%w: %q is required", ErrMissingOperand, fe.Field())
}
